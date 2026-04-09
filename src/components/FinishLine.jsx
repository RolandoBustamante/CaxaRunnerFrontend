import { useState, useEffect, useRef, useCallback } from "react";
import { formatTime, getCategory } from "../utils/categories";

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

  const participantMap = {};
  for (const participant of participants) {
    if (participant.dorsal) {
      const key = String(participant.dorsal).trim();
      participantMap[key] = participant;
      const numKey = String(parseInt(key, 10));
      if (numKey !== key) participantMap[numKey] = participant;
    }
  }

  const finisherDorsals = new Set(finishers.map((finisher) => String(finisher.dorsal).trim()));

  const submit = useCallback(
    (input) => {
      const normalizedInput = input.trim();
      if (!normalizedInput) {
        setError("Escribi el numero de dorsal.");
        return;
      }

      const participant = participantMap[normalizedInput];
      if (!participant) {
        setError(`El dorsal #${normalizedInput} no existe en la lista. Verifica el numero.`);
        return;
      }

      const dorsal = String(participant.dorsal).trim();
      if (finisherDorsals.has(dorsal)) {
        const existing = finishers.find((finisher) => String(finisher.dorsal).trim() === dorsal);
        const pos = existing ? finishers.indexOf(existing) + 1 : "?";
        setError(`${participant.nombre} (dorsal #${dorsal}) ya esta registrado, puesto #${pos}.`);
        return;
      }

      onFinisherAdd({
        dorsal,
        position: finishers.length + 1,
        timestamp: Date.now(),
        elapsedMs: Math.max(0, elapsed ?? 0),
      });

      setSuccessFlash(normalizedInput);
      setTimeout(() => setSuccessFlash(null), 1200);
      setError("");
      setDorsalInput("");
      inputRef.current?.focus();
    },
    [participantMap, finisherDorsals, finishers, onFinisherAdd, elapsed]
  );

  const handleFormSubmit = (event) => {
    event.preventDefault();
    submit(dorsalInput);
  };

  const recentFinishers = [...finishers].reverse().slice(0, 10);

  if (!raceStarted) {
    return (
      <div className="finish-container">
        <div className="pre-race">
          <div className="pre-race-icon">🏁</div>
          <h2 className="pre-race-title">Linea de Meta</h2>
          {participants.length === 0 ? (
            <div className="warning-box">
              <p>Primero carga los participantes en la pestana <strong>Participantes</strong>.</p>
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

      {raceClosed && (
        <div className="race-closed-banner">
          Carrera cerrada, no se aceptan mas registros
        </div>
      )}

      <div className="finish-main-grid">
        {!raceClosed && (
          <div className={`dorsal-input-section ${successFlash ? "flash-success" : ""}`}>
            <form onSubmit={handleFormSubmit} className="dorsal-form">
              <label className="dorsal-label">NUMERO DE DORSAL</label>
              <div className="dorsal-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`dorsal-input ${error ? "input-error" : ""}`}
                  value={dorsalInput}
                  onChange={(event) => {
                    setDorsalInput(event.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  placeholder="000"
                  autoComplete="off"
                />
                <button type="submit" className="btn btn-register">
                  REGISTRAR
                </button>
              </div>
              {error && <div className="input-error-msg">{error}</div>}
            </form>

            {successFlash && participantMap[successFlash] && (
              <div className="success-flash">
                Puesto #{finishers.length} <strong>{participantMap[successFlash].nombre}</strong>{" "}
                <span className="category-tag">{participantMap[successFlash].distancia}</span>
              </div>
            )}
          </div>
        )}

        <div className="recent-finishers">
          <div className="recent-header">
            <h3 className="recent-title">Ultimos registros</h3>
            <div className="recent-total">
              <span className="recent-total-number">{finishers.length}</span>
              <span className="recent-total-label">total</span>
            </div>
          </div>
          {recentFinishers.length === 0 ? (
            <p className="text-muted">Aun no hay atletas registrados.</p>
          ) : (
            <ul className="finisher-list">
              {recentFinishers.map((finisher, idx) => {
                const position = finishers.indexOf(finisher) + 1;
                const participant = participantMap[String(finisher.dorsal).trim()];
                const category = participant
                  ? getCategory(participant.edad, participant.genero, participant.distancia)
                  : "-";

                return (
                  <li
                    key={finisher.dorsal + finisher.timestamp}
                    className={`finisher-item ${idx === 0 ? "finisher-item-latest" : ""}`}
                  >
                    <span className="finisher-pos">#{position}</span>
                    <span className="finisher-dorsal">{finisher.dorsal}</span>
                    <span className="finisher-name">{participant ? participant.nombre : "Desconocido"}</span>
                    <span className="finisher-category">{category}</span>
                    <span className="finisher-time">{formatTime(finisher.elapsedMs)}</span>
                    <button
                      className="btn-remove"
                      onClick={() => onFinisherRemove(finisher.dorsal)}
                      title="Eliminar registro"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {finishers.length > 10 && (
            <p className="text-muted text-center" style={{ marginTop: "0.5rem" }}>
              Mostrando los ultimos 10 de {finishers.length} registros
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
