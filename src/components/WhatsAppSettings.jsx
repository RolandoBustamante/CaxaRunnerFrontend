import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../api";

export default function WhatsAppSettings() {
  const [status, setStatus] = useState({ loggedIn: false, qr: null, state: null });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [testNumber, setTestNumber] = useState("");

  async function loadStatus() {
    setLoading(true);
    setMessage("");
    try {
      const data = await api.getWhatsAppStatus();
      setStatus(data);
    } catch (err) {
      setMessage(err.message || "No se pudo obtener el estado de WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  async function restart() {
    setLoading(true);
    setMessage("");
    try {
      await api.restartWhatsApp();
      setMessage("Cliente reiniciado. Si no esta conectado, carga el QR en unos segundos.");
      await loadStatus();
    } catch (err) {
      setMessage(err.message || "No se pudo reiniciar WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    setMessage("");
    try {
      await api.logoutWhatsApp();
      setMessage("Sesion cerrada.");
      await loadStatus();
    } catch (err) {
      setMessage(err.message || "No se pudo cerrar la sesion.");
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    if (!testNumber.trim()) {
      setMessage("Ingresa un numero.");
      return;
    }
    setSending(true);
    setMessage("");
    try {
      const result = await api.sendWhatsAppTest(testNumber, "Mensaje de prueba desde CaxaRunner.");
      setMessage(result.success ? "Mensaje enviado." : result.error || result.message || "No se pudo enviar.");
    } catch (err) {
      setMessage(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <div className="whatsapp-settings">
      <div className="section-header">
        <div>
          <h2>WhatsApp</h2>
          <p className="text-muted">Conecta el numero que enviara alertas de pago y confirmaciones de inscripcion.</p>
        </div>
        <button className="btn btn-secondary" onClick={loadStatus} disabled={loading}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      <section className="whatsapp-panel">
        <div className="whatsapp-status-card">
          <span className={`whatsapp-status-dot ${status.loggedIn ? "whatsapp-status-dot-ok" : ""}`}></span>
          <div>
            <h3>{status.loggedIn ? "WhatsApp conectado" : "WhatsApp no conectado"}</h3>
            <p>Estado: {status.state || (status.loggedIn ? "CONNECTED" : "QR pendiente")}</p>
          </div>
        </div>

        <div className="whatsapp-qr-card">
          {status.loggedIn ? (
            <p className="text-muted">La sesion esta activa. Las inscripciones pueden enviar mensajes automaticamente.</p>
          ) : status.qr ? (
            <QRCodeCanvas value={status.qr} size={240} />
          ) : (
            <p className="text-muted">QR no disponible todavia. Usa reiniciar o actualizar.</p>
          )}
        </div>

        <div className="whatsapp-actions">
          <button className="btn btn-primary" onClick={restart} disabled={loading}>
            Reiniciar cliente
          </button>
          <button className="btn btn-danger" onClick={logout} disabled={loading}>
            Cerrar sesion
          </button>
        </div>
      </section>

      <section className="whatsapp-panel">
        <h3>Prueba de envio</h3>
        <div className="whatsapp-test-row">
          <input
            className="login-input"
            value={testNumber}
            onChange={(event) => setTestNumber(event.target.value)}
            placeholder="Ej: 999888777"
          />
          <button className="btn btn-secondary" onClick={sendTest} disabled={sending || !status.loggedIn}>
            {sending ? "Enviando..." : "Enviar prueba"}
          </button>
        </div>
      </section>

      {message && <div className="results-copy-ok">{message}</div>}
    </div>
  );
}
