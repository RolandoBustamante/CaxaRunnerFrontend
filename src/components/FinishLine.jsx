import { useState, useEffect, useRef, useCallback } from "react";
import { formatTime, getCategory } from "../utils/categories";

const PAD_KEYS = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];

function NumPad({ onKey }) {
  return (
    <div className="numpad">
      {PAD_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className={`numpad-key ${k === "✓" ? "numpad-enter" : k === "⌫" ? "numpad-del" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault(); // evita que el input pierda foco
            onKey(k);
          }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

export default function FinishLine({
  participants,
  finishers,
  raceStarted,
  raceClosed,
  raceStartTime,
  raceEndTime,
  elapsed,
  onStartRace,
  onCloseRace,
  onFinisherAdd,
  onFinisherRemove,
}) {
  const [dorsalInput, setDorsalInput] = useState("");
  const [error, setError] = useState("");
  const [successFlash, setSuccessFlash] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (raceStarted) inputRef.current?.focus();
  }, [raceStarted]);

  // Índice por dorsal exacto Y por valor numérico (7 encuentra "007")
  const participantMap = {};
  for (const p of participants) {
    if (p.dorsal) {
      const key = String(p.dorsal).trim();
      participantMap[key] = p;
      const numKey = String(parseInt(key, 10));
      if (numKey !== key) participantMap[numKey] = p;
    }
  }
  const finisherDorsals = new Set(finishers.map((f) => String(f.dorsal).trim()));

  const submit = useCallback(
    (input) => {
      input = input.trim();
      if (!input) { setError("Escribí el número de dorsal."); return; }
      const p = participantMap[input];
      if (!p) {
        setError(`El dorsal #${input} no existe en la lista. Verificá el número.`);
        return;
      }
      // Usar el dorsal real del participante (con ceros si los tiene)
      const dorsal = String(p.dorsal).trim();
      if (finisherDorsals.has(dorsal)) {
        const existing = finishers.find((f) => String(f.dorsal).trim() === dorsal);
        const pos = existing ? finishers.indexOf(existing) + 1 : "?";
        setError(`${p.nombre} (dorsal #${dorsal}) ya está registrado — puesto #${pos}.`);
        return;
      }
      const now = Date.now();
      const elapsedMs = Math.max(0, elapsed ?? 0);
      onFinisherAdd({
        dorsal,
        position: finishers.length + 1,
        timestamp: now,
        elapsedMs,
      });
      setSuccessFlash(input);
      setTimeout(() => setSuccessFlash(null), 1200);
      setError("");
      setDorsalInput("");
      inputRef.current?.focus();
    },
    [participantMap, finisherDorsals, finishers, onFinisherAdd, elapsed]
  );

  const handleFormSubmit = (e) => {
    e.preventDefault();
    submit(dorsalInput);
  };

  const handlePadKey = useCallback((key) => {
    if (key === "⌫") {
      setDorsalInput((v) => v.slice(0, -1));
      setError("");
    } else if (key === "✓") {
      submit(dorsalInput);
    } else {
      setDorsalInput((v) => v + key);
      setError("");
    }
  }, [dorsalInput, submit]);

  const recentFinishers = [...finishers].reverse().slice(0, 10);

  if (!raceStarted) {
    return (
      <div className="finish-container">
        <div className="pre-race">
          <div className="pre-race-icon">🏁</div>
          <h2 className="pre-race-title">Línea de Meta</h2>
          {participants.length === 0 ? (
            <div className="warning-box">
              <p>⚠️ Primero cargá los participantes en la pestaña <strong>Participantes</strong>.</p>
            </div>
          ) : (
            <>
              <p className="pre-race-subtitle">
                {participants.length} participantes cargados. Listo para iniciar.
              </p>
              <button className="btn btn-start" onClick={onStartRace}>
                INICIAR CARRERA
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="finish-container finish-active">

      {/* ── Cronómetro ──────────────────────────────────────────── */}
      <div className="race-clock-wrapper">
        <div className="race-clock-label">
          {raceClosed ? "CARRERA CERRADA" : "CARRERA EN CURSO"}
        </div>
        <div className={`race-clock ${raceClosed ? "race-clock-closed" : ""}`}>
          {formatTime(elapsed, true, true)}
        </div>
        <div className="race-clock-meta">
          <span className="race-clock-count">{finishers.length}</span>
          <span className="race-clock-count-label">en meta</span>
          {!raceClosed && (
            <button className="btn-close-race" onClick={onCloseRace}>
              Cerrar carrera
            </button>
          )}
        </div>
      </div>

      {/* ── Carrera cerrada ─────────────────────────────────────── */}
      {raceClosed && (
        <div className="race-closed-banner">
          🏁 Carrera cerrada — no se aceptan más registros
        </div>
      )}

      {/* ── Input + Numpad ──────────────────────────────────────── */}
      {!raceClosed &&
      <div className={`dorsal-input-section ${successFlash ? "flash-success" : ""}`}>
        <form onSubmit={handleFormSubmit} className="dorsal-form">
          <label className="dorsal-label">NÚMERO DE DORSAL</label>
          <div className="dorsal-input-row">
            <input
              ref={inputRef}
              type="number"
              inputMode="none"        /* bloquea teclado nativo en móvil */
              className={`dorsal-input ${error ? "input-error" : ""}`}
              value={dorsalInput}
              onChange={(e) => { setDorsalInput(e.target.value); setError(""); }}
              placeholder="000"
              autoComplete="off"
            />
            <button type="submit" className="btn btn-register">
              REGISTRAR
            </button>
          </div>
          {error && <div className="input-error-msg">{error}</div>}
        </form>

        {/* Numpad custom */}
        <NumPad onKey={handlePadKey} />

        {successFlash && participantMap[successFlash] && (
          <div className="success-flash">
            ✅ Puesto #{finishers.length} — <strong>{participantMap[successFlash].nombre}</strong>
            {" "}<span className="category-tag">{participantMap[successFlash].distancia}</span>
          </div>
        )}
      </div>}

      {/* ── Últimos registros ───────────────────────────────────── */}
      <div className="recent-finishers">
        <h3 className="recent-title">Últimos registros</h3>
        {recentFinishers.length === 0 ? (
          <p className="text-muted">Aún no hay atletas registrados.</p>
        ) : (
          <ul className="finisher-list">
            {recentFinishers.map((f, idx) => {
              const position = finishers.indexOf(f) + 1;
              const p = participantMap[String(f.dorsal).trim()];
              const category = p ? getCategory(p.edad, p.genero, p.distancia) : "—";
              return (
                <li key={f.dorsal + f.timestamp} className={`finisher-item ${idx === 0 ? "finisher-item-latest" : ""}`}>
                  <span className="finisher-pos">#{position}</span>
                  <span className="finisher-dorsal">{f.dorsal}</span>
                  <span className="finisher-name">{p ? p.nombre : "Desconocido"}</span>
                  <span className="finisher-category">{category}</span>
                  <span className="finisher-time">{formatTime(f.elapsedMs)}</span>
                  <button
                    className="btn-remove"
                    onClick={() => onFinisherRemove(f.dorsal)}
                    title="Eliminar registro"
                  >✕</button>
                </li>
              );
            })}
          </ul>
        )}
        {finishers.length > 10 && (
          <p className="text-muted text-center" style={{ marginTop: "0.5rem" }}>
            Mostrando los últimos 10 de {finishers.length} registros
          </p>
        )}
      </div>
    </div>
  );
}
