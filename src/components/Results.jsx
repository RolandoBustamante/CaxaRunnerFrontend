import { useState, useCallback } from "react";
import { formatTime, getCategory, groupByDistance, sortedCategories, getAbsoluteByGender, DEFAULT_CATEGORIES } from "../utils/categories";
import CategoryResults from "./CategoryResults";
import AbsoluteWinners from "./AbsoluteWinners";
import TimeInput from "./TimeInput";

// Converts "MM:SS", "HH:MM:SS", "MM:SS.cc" or "HH:MM:SS.cc" to milliseconds (float)
function parseTimeInput(str) {
  str = str.trim();
  // Split off centiseconds if present (MM:SS.cc)
  let centis = 0;
  const dotIdx = str.lastIndexOf(".");
  if (dotIdx !== -1) {
    const centisStr = str.slice(dotIdx + 1).padEnd(2, "0").slice(0, 2);
    centis = parseInt(centisStr, 10);
    if (isNaN(centis) || centis < 0) return null;
    str = str.slice(0, dotIdx);
  }
  const parts = str.split(":").map(Number);
  if (parts.some((n) => isNaN(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [mm, ss] = parts;
    if (ss >= 60) return null;
    return (mm * 60 + ss) * 1000 + centis * 10;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    if (mm >= 60 || ss >= 60) return null;
    return (hh * 3600 + mm * 60 + ss) * 1000 + centis * 10;
  }
  return null;
}

function generateCSV(finishers, participants, categories) {
  const participantMap = {};
  for (const p of participants) {
    if (p.dorsal) participantMap[String(p.dorsal).trim()] = p;
  }

  const active = finishers.filter((f) => !f.disqualified);
  const dqd = finishers.filter((f) => f.disqualified);
  const all = [...active, ...dqd];

  const headers = ["Posicion", "Dorsal", "Nombre", "Edad", "Genero", "Distancia", "Categoria", "Tiempo", "Estado", "Motivo DQ"];
  const rows = all.map((f, idx) => {
    const p = participantMap[String(f.dorsal).trim()];
    const category = p ? getCategory(p.edad, p.genero, p.distancia, categories) : "—";
    return [
      f.disqualified ? "DQ" : idx + 1,
      f.dorsal,
      p ? p.nombre : "—",
      p ? p.edad : "—",
      p ? p.genero : "—",
      p ? p.distancia : "—",
      category,
      formatTime(f.elapsedMs),
      f.disqualified ? "DQ" : "OK",
      f.dqReason || "",
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function downloadCSV(content, filename) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Results({ participants, finishers, raceStartTime, categories = DEFAULT_CATEGORIES, onReorder, onFinisherAdd, onFinisherDisqualify, onFinisherTimeUpdate, onResetResults, onResetAll }) {
  const [view, setView] = useState("general");
  const [editMode, setEditMode] = useState(false);

  // Missed finisher form state
  const [missedDorsal, setMissedDorsal] = useState("");
  const [missedTimeMs, setMissedTimeMs] = useState(null);
  const [missedError, setMissedError] = useState("");
  const [missedBusy, setMissedBusy] = useState(false);

  // DQ panel state
  const [dqPanel, setDqPanel] = useState(null); // dorsal | null
  const [dqReason, setDqReason] = useState("");
  const [dqBusy, setDqBusy] = useState(false);

  // Inline time editing state
  const [editingTime, setEditingTime] = useState(null); // { dorsal, value, error } | null

  const participantMap = {};
  for (const p of participants) {
    if (p.dorsal) participantMap[String(p.dorsal).trim()] = p;
  }

  const activeFinishers = finishers.filter((f) => !f.disqualified);
  const dqFinishers = finishers.filter((f) => f.disqualified);
  const finisherDorsals = new Set(finishers.map((f) => String(f.dorsal).trim()));

  const handleMoveUp = useCallback(
    (index) => {
      if (index === 0) return;
      const next = [...activeFinishers];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      onReorder([...next, ...dqFinishers]);
    },
    [activeFinishers, dqFinishers, onReorder]
  );

  const handleMoveDown = useCallback(
    (index) => {
      if (index === activeFinishers.length - 1) return;
      const next = [...activeFinishers];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      onReorder([...next, ...dqFinishers]);
    },
    [activeFinishers, dqFinishers, onReorder]
  );

  const handleDisqualify = useCallback(
    async (dorsal, reason) => {
      setDqBusy(true);
      try {
        await onFinisherDisqualify(dorsal, true, reason);
        setDqPanel(null);
        setDqReason("");
      } finally {
        setDqBusy(false);
      }
    },
    [onFinisherDisqualify]
  );

  const handleUndoDQ = useCallback(
    async (dorsal) => {
      await onFinisherDisqualify(dorsal, false, null);
    },
    [onFinisherDisqualify]
  );

  const handleTimeEditStart = useCallback((f) => {
    setEditingTime({ dorsal: String(f.dorsal).trim(), ms: f.elapsedMs, error: "" });
  }, []);

  const handleTimeEditConfirm = useCallback(async () => {
    if (!editingTime) return;
    if (editingTime.ms == null) {
      setEditingTime((prev) => ({ ...prev, error: "Tiempo inválido." }));
      return;
    }
    try {
      await onFinisherTimeUpdate(editingTime.dorsal, editingTime.ms);
      setEditingTime(null);
    } catch {
      setEditingTime((prev) => ({ ...prev, error: "No se pudo guardar. Intentá de nuevo." }));
    }
  }, [editingTime, onFinisherTimeUpdate]);

  // Find participant by dorsal — accepts "3", "03" or "003" for the same entry
  const findParticipantByDorsal = useCallback((raw) => {
    if (participantMap[raw]) return participantMap[raw];
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      return participants.find((p) => p.dorsal && parseInt(p.dorsal, 10) === num) || null;
    }
    return null;
  }, [participantMap, participants]);

  const handleAddMissed = useCallback(async () => {
    const raw = missedDorsal.trim();

    if (!raw) { setMissedError("Ingresá el número de dorsal."); return; }
    const p = findParticipantByDorsal(raw);
    if (!p) { setMissedError(`El dorsal #${raw} no existe en la lista.`); return; }
    const canonicalDorsal = String(p.dorsal).trim();
    if (finisherDorsals.has(canonicalDorsal)) {
      const pos = finishers.findIndex((f) => String(f.dorsal).trim() === canonicalDorsal) + 1;
      setMissedError(`El dorsal #${canonicalDorsal} ya está registrado en el puesto #${pos}.`);
      return;
    }
    if (missedTimeMs == null) { setMissedError("Ingresá un tiempo válido."); return; }

    setMissedError("");
    setMissedBusy(true);
    try {
      const now = Date.now();
      await onFinisherAdd({
        dorsal: canonicalDorsal,
        position: finishers.length + 1,
        timestamp: raceStartTime ? raceStartTime + missedTimeMs : now,
        elapsedMs: missedTimeMs,
      });
      setMissedDorsal("");
      setMissedTimeMs(null);
    } catch (err) {
      setMissedError("No se pudo agregar. Intentá de nuevo.");
    } finally {
      setMissedBusy(false);
    }
  }, [missedDorsal, missedTimeMs, findParticipantByDorsal, finisherDorsals, finishers, onFinisherAdd, raceStartTime]);

  const handleExport = () => {
    const csv = generateCSV(finishers, participants, categories);
    downloadCSV(csv, `resultados-carrera-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const distanceGroups = groupByDistance(finishers, participants, categories);
  const distances = Object.keys(distanceGroups).sort();

  return (
    <div className="results-container">
      {/* Toolbar */}
      <div className="results-toolbar">
        <div className="view-toggle">
          <button
            className={`btn btn-tab ${view === "general" ? "btn-tab-active" : ""}`}
            onClick={() => setView("general")}
          >
            General
          </button>
          <button
            className={`btn btn-tab ${view === "category" ? "btn-tab-active" : ""}`}
            onClick={() => setView("category")}
          >
            Por Categoría
          </button>
        </div>
        <div className="results-actions">
          {view === "general" && (
            <button
              className={`btn ${editMode ? "btn-warning" : "btn-secondary"}`}
              onClick={() => { setEditMode((v) => !v); setMissedError(""); }}
            >
              {editMode ? "✓ Finalizar edición" : "✏️ Editar"}
            </button>
          )}
          <button className="btn btn-export" onClick={handleExport}>
            ⬇ Exportar CSV
          </button>
          <button className="btn btn-warning-outline" onClick={onResetResults}>
            Limpiar resultados
          </button>
          <button className="btn btn-danger" onClick={onResetAll}>
            Resetear todo
          </button>
        </div>
      </div>

      {finishers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <h2>Sin resultados aún</h2>
          <p className="text-muted">Los resultados aparecerán aquí una vez que registres atletas en la Meta.</p>
        </div>
      ) : (
        <>
      {/* Edit mode panels */}
      {editMode && view === "general" && (
        <>
          <div className="edit-mode-banner">
            Modo edición — reordenás con ▲ ▼, descalificás con DQ, o agregás un finisher omitido abajo
          </div>

          {/* DQ panel */}
          {dqPanel && (
            <div className="missed-finisher-panel dq-panel">
              <h4 className="missed-finisher-title">
                Descalificar dorsal #{dqPanel}
                {participantMap[dqPanel] && ` — ${participantMap[dqPanel].nombre}`}
              </h4>
              <div className="missed-finisher-form">
                <div className="missed-field" style={{ flex: 1 }}>
                  <label className="missed-label">Motivo (opcional)</label>
                  <input
                    className="missed-input"
                    style={{ width: "100%" }}
                    type="text"
                    placeholder="ej: No completó la distancia"
                    value={dqReason}
                    onChange={(e) => setDqReason(e.target.value)}
                    disabled={dqBusy}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleDisqualify(dqPanel, dqReason); }}
                  />
                </div>
                <button
                  className="btn btn-danger missed-btn"
                  onClick={() => handleDisqualify(dqPanel, dqReason)}
                  disabled={dqBusy}
                >
                  {dqBusy ? "..." : "Confirmar DQ"}
                </button>
                <button
                  className="btn btn-secondary missed-btn"
                  onClick={() => { setDqPanel(null); setDqReason(""); }}
                  disabled={dqBusy}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Missed finisher form */}
          <div className="missed-finisher-panel">
            <h4 className="missed-finisher-title">Agregar finisher omitido</h4>
            <div className="missed-finisher-form">
              <div className="missed-field">
                <label className="missed-label">Dorsal</label>
                <input
                  className="missed-input missed-input-dorsal"
                  type="text"
                  placeholder="042"
                  value={missedDorsal}
                  onChange={(e) => { setMissedDorsal(e.target.value); setMissedError(""); }}
                  disabled={missedBusy}
                />
              </div>
              <div className="missed-field">
                <label className="missed-label">Tiempo</label>
                <TimeInput
                  value={missedTimeMs}
                  onChange={(ms) => { setMissedTimeMs(ms); setMissedError(""); }}
                  disabled={missedBusy}
                  onEnter={handleAddMissed}
                  showCentis={false}
                />
              </div>
              <button
                className="btn btn-primary missed-btn"
                onClick={handleAddMissed}
                disabled={missedBusy}
              >
                {missedBusy ? "Agregando..." : "+ Agregar"}
              </button>
            </div>
            {missedError && <div className="input-error-msg">{missedError}</div>}
            {(() => {
              const prev = missedDorsal ? findParticipantByDorsal(missedDorsal.trim()) : null;
              if (!prev || finisherDorsals.has(String(prev.dorsal).trim())) return null;
              return (
                <div className="missed-preview">
                  {prev.nombre}
                  {" · "}{prev.distancia}
                  {" · "}{getCategory(prev.edad, prev.genero, prev.distancia, categories)}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* General view */}
      {view === "general" && (
        <div className="table-wrapper">
          <table className="data-table results-table">
            <thead>
              <tr>
                {editMode && <th></th>}
                <th>Pos.</th>
                <th>Dorsal</th>
                <th>Nombre</th>
                <th>Dist.</th>
                <th>Categoría</th>
                <th>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {activeFinishers.map((f, idx) => {
                const p = participantMap[String(f.dorsal).trim()];
                const category = p ? getCategory(p.edad, p.genero, p.distancia, categories) : "—";
                return (
                  <tr key={f.dorsal + f.timestamp} className={idx < 3 ? `row-top-${idx + 1}` : ""}>
                    {editMode && (
                      <td className="reorder-cell">
                        <button className="reorder-btn" onClick={() => handleMoveUp(idx)} disabled={idx === 0} title="Subir">▲</button>
                        <button className="reorder-btn" onClick={() => handleMoveDown(idx)} disabled={idx === activeFinishers.length - 1} title="Bajar">▼</button>
                        <button
                          className="reorder-btn dq-btn"
                          onClick={() => { setDqPanel(String(f.dorsal).trim()); setDqReason(""); }}
                          title="Descalificar"
                        >DQ</button>
                      </td>
                    )}
                    <td><span className={`position-badge pos-${idx + 1}`}>{idx + 1}</span></td>
                    <td><span className="dorsal-badge">{f.dorsal}</span></td>
                    <td className="name-cell">{p ? p.nombre : "—"}</td>
                    <td><span className="category-tag">{p ? p.distancia : "—"}</span></td>
                    <td><span className="category-tag">{category}</span></td>
                    <td className="time-cell">
                      {editMode && editingTime?.dorsal === String(f.dorsal).trim() ? (
                        <div className="time-edit-cell">
                          <TimeInput
                            value={editingTime.ms}
                            onChange={(ms) => setEditingTime((prev) => ({ ...prev, ms, error: "" }))}
                            autoFocus
                            onEnter={handleTimeEditConfirm}
                          />
                          <button className="reorder-btn time-confirm-btn" onClick={handleTimeEditConfirm} title="Confirmar">✓</button>
                          <button className="reorder-btn" onClick={() => setEditingTime(null)} title="Cancelar">✗</button>
                          {editingTime.error && <span className="time-edit-error">{editingTime.error}</span>}
                        </div>
                      ) : (
                        <span
                          className={editMode ? "time-cell-editable" : ""}
                          onClick={editMode ? () => handleTimeEditStart(f) : undefined}
                          title={editMode ? "Editar tiempo" : undefined}
                        >
                          {formatTime(f.elapsedMs)}
                          {editMode && <span className="time-edit-icon">✏</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {dqFinishers.map((f) => {
                const p = participantMap[String(f.dorsal).trim()];
                const category = p ? getCategory(p.edad, p.genero, p.distancia, categories) : "—";
                return (
                  <tr key={f.dorsal + "dq"} className="row-dq">
                    {editMode && (
                      <td className="reorder-cell">
                        <button
                          className="reorder-btn undo-dq-btn"
                          onClick={() => handleUndoDQ(String(f.dorsal).trim())}
                          title="Quitar descalificación"
                        >↩ DQ</button>
                      </td>
                    )}
                    <td><span className="position-badge dq-badge">DQ</span></td>
                    <td><span className="dorsal-badge">{f.dorsal}</span></td>
                    <td className="name-cell">
                      {p ? p.nombre : "—"}
                      {f.dqReason && <span className="dq-reason-inline"> · {f.dqReason}</span>}
                    </td>
                    <td><span className="category-tag">{p ? p.distancia : "—"}</span></td>
                    <td><span className="category-tag">{category}</span></td>
                    <td className="time-cell">{formatTime(f.elapsedMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Category view */}
      {view === "category" && (
        <div className="category-view">
          {distances.length === 0 ? (
            <p className="text-muted">No hay categorías con finishers.</p>
          ) : (
            distances.map((dist) => {
              const byGender = getAbsoluteByGender(finishers, participants, dist);
              const absoluteDorsals = new Set([
                ...byGender.M.map((f) => String(f.dorsal).trim()),
                ...byGender.F.map((f) => String(f.dorsal).trim()),
              ]);
              return (
                <div key={dist} className="distance-section">
                  <div className="distance-section-header">
                    <span className="distance-badge">{dist}</span>
                  </div>

                  {/* Ganadores absolutos por género */}
                  <AbsoluteWinners distance={dist} byGender={byGender} />

                  {/* Divisor */}
                  <div className="category-section-divider">Por Categoría</div>

                  {sortedCategories(distanceGroups[dist], dist, categories).map((cat) => {
                    const filtered = distanceGroups[dist][cat]
                      .filter((f) => !absoluteDorsals.has(String(f.dorsal).trim()))
                      .map((f, i) => ({ ...f, categoryPosition: i + 1 }));
                    return (
                      <CategoryResults
                        key={cat}
                        categoryName={cat}
                        finishers={filtered}
                        participants={participants}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
