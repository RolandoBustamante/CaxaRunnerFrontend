import { useEffect, useState } from "react";
import { api } from "../api";
import { formatRaceDate } from "../utils/dates";

function getTokenFromPath() {
  const match = window.location.pathname.match(/^\/validar-pago\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function money(value) {
  if (value == null) return "-";
  return `S/ ${Number(value).toFixed(2)}`;
}

function formatBirthDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-PE", { timeZone: "UTC" });
}

export default function PaymentReviewView() {
  const token = getTokenFromPath();
  const [race, setRace] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.getRegistrationReview(token);
      document.title = `Validar pago - ${data.registration.code}`;
      setRace(data.race);
      setRegistration(data.registration);
    } catch (err) {
      setError(err.message || "No se pudo cargar la revisión.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await api.approveRegistrationReview(token);
      setRegistration(data.registration);
      setMessage("Pago aprobado. Los participantes ya fueron enviados a la lista de la carrera.");
    } catch (err) {
      setError(err.message || "No se pudo aprobar.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const notes = window.prompt("Motivo o nota del rechazo:", "");
    if (notes === null) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await api.rejectRegistrationReview(token, notes);
      setRegistration(data.registration);
      setMessage("Inscripción rechazada.");
    } catch (err) {
      setError(err.message || "No se pudo rechazar.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="payment-review-page"><div className="registration-loading">Cargando revisión...</div></div>;
  }

  if (error && !registration) {
    return <div className="payment-review-page"><div className="registration-error-card">{error}</div></div>;
  }

  return (
    <div className="payment-review-page">
      <section className="payment-review-card">
        <header className="payment-review-header">
          <img src="/crlogo-horizontal.svg" alt="Cajamarca Runners" />
          <div>
            <span>Validación de pago</span>
            <h1>{registration.code}</h1>
            <p>{race?.name}{race?.eventDate ? ` · ${formatRaceDate(race.eventDate)}` : ""}</p>
          </div>
          <strong className={`registration-status registration-status-${registration.status.toLowerCase()}`}>{registration.status}</strong>
        </header>

        <div className="payment-review-summary">
          <div><span>Contacto</span><strong>{registration.contactName}</strong><small>{registration.contactPhone || registration.contactEmail || "-"}</small></div>
          <div><span>Participantes</span><strong>{registration.participants.length}</strong><small>{registration.paymentMode === "MULTIPLE_VOUCHERS" ? "Vouchers separados" : "Un solo pago"}</small></div>
          <div><span>Total</span><strong>{money(registration.totalAmount)}</strong><small>{registration.discountCode ? `Con descuento ${registration.discountCode}` : "Monto referencial"}</small></div>
        </div>

        <div className="payment-review-grid">
          <section>
            <h2>Corredores</h2>
            <div className="registration-admin-participants">
              {registration.participants.map((participant) => (
                <div key={participant.id} className="registration-admin-runner">
                  <strong>{participant.nombre}</strong>
                  <span>DNI {participant.documento}</span>
                  <span>{participant.distancia} · Nac. {formatBirthDate(participant.birthDate)} · {participant.bloodType}</span>
                  <span>{participant.garmentType === "BIVIDI" ? "Bividi" : "Polo"} · Talla {participant.garmentSize}</span>
                  <span>{participant.procedencia}{participant.club ? ` · ${participant.club}` : ""}</span>
                  {participant.photo && (
                    <a className="payment-photo-link" href={api.getRegistrationReviewPhotoUrl(token, participant.id)} target="_blank" rel="noreferrer">
                      Ver foto
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Vouchers</h2>
            <div className="payment-voucher-list">
              {registration.vouchers.map((voucher, index) => (
                <a key={voucher.id} href={api.getRegistrationReviewVoucherUrl(token, voucher.id)} target="_blank" rel="noreferrer">
                  Ver voucher {index + 1}
                </a>
              ))}
            </div>
          </section>
        </div>

        {message && <div className="results-copy-ok">{message}</div>}
        {error && <div className="registration-error-card">{error}</div>}

        {registration.status === "PENDING" && (
          <div className="payment-review-actions">
            <button className="btn btn-primary" onClick={approve} disabled={busy}>
              {busy ? "Procesando..." : "Aceptar pago e inscripción"}
            </button>
            <button className="btn btn-danger" onClick={reject} disabled={busy}>
              Rechazar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
