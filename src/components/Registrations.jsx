import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { confirmDialog, errorDialog } from "../utils/dialog";
import MediaViewerModal from "./MediaViewerModal";

const STATUS_LABELS = {
  PENDING: "Pendientes",
  APPROVED: "Aprobadas",
  REJECTED: "Rechazadas",
};

function formatMoney(value) {
  if (value == null) return "-";
  return `S/ ${Number(value).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatBirthDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-PE", { timeZone: "UTC" });
}

export default function Registrations({ race, raceId, currentUser, onApproved }) {
  const [status, setStatus] = useState("PENDING");
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [mediaViewer, setMediaViewer] = useState(null);
  const canDeleteRegistrations = currentUser?.role === "MASTER";

  const publicLink = useMemo(() => {
    if (!race?.slug) return "";
    return `${window.location.origin}/inscripciones/${encodeURIComponent(race.slug)}`;
  }, [race?.slug]);

  const load = useCallback(async () => {
    if (!raceId) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await api.getRegistrations(raceId, status);
      setRegistrations(data.registrations || []);
    } catch (err) {
      setMessage(err.message || "No se pudieron cargar las inscripciones.");
    } finally {
      setLoading(false);
    }
  }, [raceId, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyLink() {
    if (!publicLink) return;
    await navigator.clipboard.writeText(publicLink);
    setMessage("Link de inscripción copiado.");
  }

  async function copyReviewAlert(registration) {
    const reviewLink = `${window.location.origin}/validar-pago/${encodeURIComponent(registration.reviewToken)}`;
    const names = registration.participants.map((participant) => participant.nombre).join(", ");
    const text = [
      `Nueva inscripción: ${registration.code}`,
      `Carrera: ${race?.name || "-"}`,
      `Contacto: ${registration.contactName} (${registration.contactPhone || registration.contactEmail || "-"})`,
      `Participantes: ${names}`,
      `Total referencial: ${formatMoney(registration.totalAmount)}`,
      `Validar pago: ${reviewLink}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setMessage("Alerta de validación copiada.");
  }

  async function copyRunnerConfirmation(registration) {
    const names = registration.participants.map((participant) => `${participant.nombre} - ${participant.distancia}`).join(", ");
    const text = [
      `Hola ${registration.contactName}, tu inscripción fue confirmada.`,
      `Código: ${registration.code}`,
      `Carrera: ${race?.name || "-"}`,
      `Corredor(es): ${names}`,
      "Nos vemos en la carrera. Guarda este mensaje como constancia.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setMessage("Confirmación para corredor copiada.");
  }

  async function openVoucher(registrationId, voucherId, index = 0) {
    const result = await api.downloadRegistrationVoucher(registrationId, voucherId, raceId);
    const fallback = `voucher-${index + 1}`;
    setMediaViewer({ blob: result.blob, title: result.fileName || `Voucher ${index + 1}`, fileName: result.fileName || fallback });
  }

  async function resendPaymentAlert(registration) {
    setBusyId(registration.id);
    setMessage("");
    try {
      const result = await api.notifyRegistrationPayment(registration.id, raceId);
      setMessage(result.message || "Alerta reenviada.");
    } catch (err) {
      setMessage(err.message || "No se pudo reenviar la alerta.");
    } finally {
      setBusyId(null);
    }
  }

  async function sendRunnerConfirmation(registration) {
    setBusyId(registration.id);
    setMessage("");
    try {
      const result = await api.notifyRegistrationConfirmation(registration.id, raceId);
      setMessage(result.message || "Confirmacion enviada.");
    } catch (err) {
      setMessage(err.message || "No se pudo enviar la confirmacion.");
    } finally {
      setBusyId(null);
    }
  }

  async function openParticipantPhoto(registrationId, participantId) {
    const result = await api.downloadRegistrationParticipantPhoto(registrationId, participantId, raceId);
    setMediaViewer({ blob: result.blob, title: "Foto del participante", fileName: "foto-participante" });
  }

  async function approve(id) {
    setBusyId(id);
    setMessage("");
    try {
      await api.approveRegistration(id, raceId);
      setMessage("Inscripción aprobada y participantes creados.");
      await load();
      await onApproved?.();
    } catch (err) {
      setMessage(err.message || "No se pudo aprobar.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id) {
    const notes = window.prompt("Motivo o nota interna de rechazo:", "");
    if (notes === null) return;
    setBusyId(id);
    setMessage("");
    try {
      await api.rejectRegistration(id, notes, raceId);
      setMessage("Inscripción rechazada.");
      await load();
    } catch (err) {
      setMessage(err.message || "No se pudo rechazar.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRegistration(registration) {
    if (!canDeleteRegistrations) return;
    const ok = await confirmDialog({
      title: "Eliminar solicitud",
      text:
        registration.status === "APPROVED"
          ? "Se eliminara la solicitud aprobada y tambien los participantes/resultados creados desde esta inscripcion."
          : "Se eliminara la solicitud y sus archivos adjuntos.",
      confirmText: "Eliminar",
    });
    if (!ok) return;

    setBusyId(registration.id);
    setMessage("");
    try {
      const result = await api.deleteRegistration(registration.id, raceId);
      const details =
        result.deletedParticipants || result.deletedFinishers
          ? ` Participantes eliminados: ${result.deletedParticipants || 0}. Resultados eliminados: ${result.deletedFinishers || 0}.`
          : "";
      setMessage(`Solicitud eliminada.${details}`);
      await load();
      await onApproved?.();
    } catch (err) {
      await errorDialog({
        title: "No se pudo eliminar",
        text: err.message || "No se pudo eliminar la solicitud.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="registrations-admin">
      <div className="section-header">
        <div>
          <h2>Inscripciones</h2>
          <p className="text-muted">Recibe solicitudes públicas, revisa vouchers y aprueba participantes.</p>
        </div>
        <button className="btn btn-secondary" onClick={copyLink} disabled={!publicLink}>
          Copiar link
        </button>
      </div>

      <div className="registration-admin-link">
        <span>Formulario público</span>
        <strong>{publicLink || "Configura el slug de la carrera"}</strong>
      </div>

      {!race?.registrationsEnabled && (
        <div className="edit-mode-banner">
          Las inscripciones están desactivadas. Actívalas en Configuración para que el formulario acepte envíos.
        </div>
      )}

      <div className="view-toggle">
        {Object.entries(STATUS_LABELS).map(([id, label]) => (
          <button
            key={id}
            className={`btn btn-tab ${status === id ? "btn-tab-active" : ""}`}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <div className="results-copy-ok">{message}</div>}
      {loading && <div className="results-copy-ok">Cargando inscripciones...</div>}

      {!loading && registrations.length === 0 ? (
        <div className="empty-state">
          <h2>Sin inscripciones</h2>
          <p className="text-muted">Cuando compartas el link, las solicitudes aparecerán aquí.</p>
        </div>
      ) : (
        <div className="registration-admin-list">
          {registrations.map((registration) => (
            <article key={registration.id} className="registration-admin-card">
              <div className="registration-admin-head">
                <div>
                  <span className={`registration-status registration-status-${registration.status.toLowerCase()}`}>{registration.status}</span>
                  <h3>{registration.code}</h3>
                  {registration.discountCode && (
                    <p>Descuento {registration.discountCode}: -{formatMoney(registration.discountAmount)} ({Number(registration.discountPercent).toFixed(2)}%)</p>
                  )}
                  <p>{registration.contactName} · {registration.contactPhone || registration.contactEmail || "Sin contacto"} · {formatDate(registration.createdAt)}</p>
                </div>
                <div className="registration-admin-total">{formatMoney(registration.totalAmount)}</div>
              </div>

              <div className="registration-admin-participants">
                {registration.participants.map((participant) => (
                  <div key={participant.id} className="registration-admin-runner">
                    <strong>{participant.nombre}</strong>
                    <span>DNI {participant.documento}</span>
                    <span>{participant.distancia} · Nac. {formatBirthDate(participant.birthDate)} · {participant.bloodType}</span>
                    <span>{participant.garmentType === "BIVIDI" ? "Bividi" : "Polo"} · Talla {participant.garmentSize}</span>
                    <span>{participant.procedencia}{participant.club ? ` · ${participant.club}` : ""}</span>
                    {participant.photo && (
                      <button className="btn btn-secondary btn-sm registration-photo-link" onClick={() => openParticipantPhoto(registration.id, participant.id)}>
                        Ver foto
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="registration-admin-vouchers">
                <button className="btn btn-secondary btn-sm" onClick={() => copyReviewAlert(registration)}>
                  Copiar alerta
                </button>
                {registration.status === "PENDING" && (
                  <button className="btn btn-secondary btn-sm" onClick={() => resendPaymentAlert(registration)} disabled={busyId === registration.id}>
                    Reenviar WhatsApp
                  </button>
                )}
                {registration.status === "APPROVED" && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => copyRunnerConfirmation(registration)}>
                      Copiar confirmacion
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => sendRunnerConfirmation(registration)} disabled={busyId === registration.id}>
                      {busyId === registration.id ? "Enviando..." : "Enviar confirmacion"}
                    </button>
                  </>
                )}
                {registration.vouchers.map((voucher, index) => (
                  <button key={voucher.id} className="btn btn-secondary btn-sm" onClick={() => openVoucher(registration.id, voucher.id, index)}>
                    Voucher {index + 1}
                  </button>
                ))}
                {canDeleteRegistrations && (
                  <button className="btn btn-danger btn-sm" onClick={() => deleteRegistration(registration)} disabled={busyId === registration.id}>
                    {busyId === registration.id ? "Eliminando..." : "Eliminar solicitud"}
                  </button>
                )}
              </div>

              {registration.status === "PENDING" && (
                <div className="registration-admin-actions">
                  <button className="btn btn-primary" onClick={() => approve(registration.id)} disabled={busyId === registration.id}>
                    {busyId === registration.id ? "Aprobando..." : "Aprobar y crear participantes"}
                  </button>
                  <button className="btn btn-danger" onClick={() => reject(registration.id)} disabled={busyId === registration.id}>
                    Rechazar
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <MediaViewerModal file={mediaViewer} onClose={() => setMediaViewer(null)} />
    </div>
  );
}
