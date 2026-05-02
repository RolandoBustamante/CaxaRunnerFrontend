import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  formatTime,
  getCategory,
  groupByDistance,
  sortedCategories,
  getAbsoluteByGender,
  applyCompetitionRanking,
  DEFAULT_CATEGORIES,
} from "../utils/categories";
import CategoryResults from "./CategoryResults";
import AbsoluteWinners from "./AbsoluteWinners";
import TimeInput from "./TimeInput";

function generateCSV(finishers, participants, categories) {
  const participantMap = {};
  for (const participant of participants) {
    if (participant.dorsal) {
      participantMap[String(participant.dorsal).trim()] = participant;
    }
  }

  const active = finishers.filter((finisher) => !finisher.disqualified && !finisher.noTime);
  const noTime = finishers.filter((finisher) => finisher.noTime);
  const dqd = finishers.filter((finisher) => finisher.disqualified && !finisher.noTime);
  const all = [...active, ...noTime, ...dqd];

  const headers = [
    "Posicion",
    "Dorsal",
    "Nombre",
    "Edad",
    "Genero",
    "Distancia",
    "Categoria",
    "Tiempo",
    "Estado",
    "Motivo DQ",
  ];

  const rows = all.map((finisher, index) => {
    const participant = participantMap[String(finisher.dorsal).trim()];
    const category = participant
      ? getCategory(participant.edad, participant.genero, participant.distancia, categories)
      : "-";

    return [
      finisher.noTime ? "ST" : finisher.disqualified ? "DQ" : finisher.position ?? index + 1,
      finisher.dorsal,
      participant ? participant.nombre : "-",
      participant ? participant.edad : "-",
      participant ? participant.genero : "-",
      participant ? participant.distancia : "-",
      category,
      formatTime(finisher.elapsedMs),
      finisher.noTime ? "ST" : finisher.disqualified ? "DQ" : "OK",
      finisher.noTime ? "Sin tiempo" : finisher.dqReason || "",
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
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

function normalizeHeader(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getRowValue(row, keys) {
  const normalized = {};
  for (const key in row) {
    normalized[normalizeHeader(key)] = row[key];
  }
  for (const key of keys) {
    const value = normalized[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function parseTimeToMs(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = text.replace(",", ".");
  const parts = normalized.split(":").map((part) => part.trim());
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;

  if (parts.length === 1) return Math.round(Number(parts[0]) * 1000);
  if (parts.length === 2) {
    const [minutes, seconds] = parts.map(Number);
    return Math.round(((minutes * 60) + seconds) * 1000);
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
  }
  return null;
}

export default function Results({
  participants,
  finishers,
  raceStartTime,
  categories = DEFAULT_CATEGORIES,
  race,
  onReorder,
  onFinisherAdd,
  onFinishersImport,
  onFinisherDisqualify,
  onFinisherNoTime,
  onFinisherTimeUpdate,
  onFinisherPositionUpdate,
  onResetResults,
  onResetAll,
}) {
  const [view, setView] = useState("general");
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [distanceTab, setDistanceTab] = useState("TODAS");

  const [missedDorsal, setMissedDorsal] = useState("");
  const [missedTimeMs, setMissedTimeMs] = useState(null);
  const [missedError, setMissedError] = useState("");
  const [missedBusy, setMissedBusy] = useState(false);

  const [dqPanel, setDqPanel] = useState(null);
  const [dqReason, setDqReason] = useState("");
  const [dqBusy, setDqBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [editingTime, setEditingTime] = useState(null);
  const [editingPosition, setEditingPosition] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importReplace, setImportReplace] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const importInputRef = useRef(null);

  const participantMap = {};
  for (const participant of participants) {
    if (participant.dorsal) {
      participantMap[String(participant.dorsal).trim()] = participant;
    }
  }

  const availableDistances = [
    "TODAS",
    ...Array.from(new Set(
      participants
        .map((participant) => String(participant.distancia || "").trim().toUpperCase())
        .filter(Boolean)
    )).sort(),
  ];

  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = useCallback((finisher) => {
    if (!normalizedSearch) return true;

    const dorsal = String(finisher.dorsal || "").trim().toLowerCase();
    const participant = participantMap[String(finisher.dorsal).trim()];
    const nombre = String(participant?.nombre || "").toLowerCase();
    const documento = String(participant?.documento || "").toLowerCase();

    return (
      dorsal.includes(normalizedSearch) ||
      nombre.includes(normalizedSearch) ||
      documento.includes(normalizedSearch)
    );
  }, [normalizedSearch, participantMap]);

  const activeFinishers = finishers.filter((finisher) => !finisher.disqualified && !finisher.noTime);
  const noTimeFinishers = finishers.filter((finisher) => finisher.noTime);
  const dqFinishers = finishers.filter((finisher) => finisher.disqualified && !finisher.noTime);
  const matchesDistance = useCallback((finisher) => {
    if (distanceTab === "TODAS") return true;
    const participant = participantMap[String(finisher.dorsal).trim()];
    return String(participant?.distancia || "").trim().toUpperCase() === distanceTab;
  }, [distanceTab, participantMap]);

  const filteredActiveFinishers = activeFinishers.filter((finisher) => matchesDistance(finisher) && matchesSearch(finisher));
  const filteredNoTimeFinishers = noTimeFinishers.filter((finisher) => matchesDistance(finisher) && matchesSearch(finisher));
  const filteredDqFinishers = dqFinishers.filter((finisher) => matchesDistance(finisher) && matchesSearch(finisher));
  const filteredFinishers = finishers.filter((finisher) => matchesDistance(finisher) && matchesSearch(finisher));
  const finisherDorsals = new Set(finishers.map((finisher) => String(finisher.dorsal).trim()));

  const handleMoveUp = useCallback((index) => {
    if (index === 0) return;
    const next = [...filteredActiveFinishers];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];

    const filteredSet = new Set(filteredActiveFinishers.map((finisher) => String(finisher.dorsal).trim()));
    const untouched = activeFinishers.filter((finisher) => {
      const dorsal = String(finisher.dorsal).trim();
      return !filteredSet.has(dorsal) || !matchesDistance(finisher);
    });
    onReorder([...next, ...untouched, ...noTimeFinishers, ...dqFinishers]);
  }, [activeFinishers, dqFinishers, filteredActiveFinishers, matchesDistance, noTimeFinishers, onReorder]);

  const handleMoveDown = useCallback((index) => {
    if (index === filteredActiveFinishers.length - 1) return;
    const next = [...filteredActiveFinishers];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];

    const filteredSet = new Set(filteredActiveFinishers.map((finisher) => String(finisher.dorsal).trim()));
    const untouched = activeFinishers.filter((finisher) => {
      const dorsal = String(finisher.dorsal).trim();
      return !filteredSet.has(dorsal) || !matchesDistance(finisher);
    });
    onReorder([...next, ...untouched, ...noTimeFinishers, ...dqFinishers]);
  }, [activeFinishers, dqFinishers, filteredActiveFinishers, matchesDistance, noTimeFinishers, onReorder]);

  const handleDisqualify = useCallback(async (dorsal, reason) => {
    setDqBusy(true);
    try {
      await onFinisherDisqualify(dorsal, true, reason);
      setDqPanel(null);
      setDqReason("");
    } finally {
      setDqBusy(false);
    }
  }, [onFinisherDisqualify]);

  const handleUndoDQ = useCallback(async (dorsal) => {
    await onFinisherDisqualify(dorsal, false, null);
  }, [onFinisherDisqualify]);

  const handleTimeEditStart = useCallback((finisher) => {
    setEditingTime({ dorsal: String(finisher.dorsal).trim(), ms: finisher.elapsedMs, error: "" });
  }, []);

  const handleTimeEditConfirm = useCallback(async () => {
    if (!editingTime) return;
    if (editingTime.ms == null) {
      setEditingTime((prev) => ({ ...prev, error: "Tiempo invalido." }));
      return;
    }

    try {
      await onFinisherTimeUpdate(editingTime.dorsal, editingTime.ms);
      setEditingTime(null);
    } catch {
      setEditingTime((prev) => ({ ...prev, error: "No se pudo guardar. Intenta de nuevo." }));
    }
  }, [editingTime, onFinisherTimeUpdate]);

  const handlePositionEditStart = useCallback((finisher) => {
    setEditingPosition({
      dorsal: String(finisher.dorsal).trim(),
      value: String(finisher.position ?? ""),
      error: "",
    });
  }, []);

  const handlePositionEditConfirm = useCallback(async () => {
    if (!editingPosition) return;
    const parsed = Number.parseInt(editingPosition.value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setEditingPosition((prev) => ({ ...prev, error: "Puesto inválido." }));
      return;
    }

    try {
      await onFinisherPositionUpdate(editingPosition.dorsal, parsed);
      setEditingPosition(null);
    } catch {
      setEditingPosition((prev) => ({ ...prev, error: "No se pudo guardar el puesto." }));
    }
  }, [editingPosition, onFinisherPositionUpdate]);

  const findParticipantByDorsal = useCallback((raw) => {
    if (participantMap[raw]) return participantMap[raw];
    const num = parseInt(raw, 10);
    if (!Number.isNaN(num)) {
      return participants.find((participant) => (
        participant.dorsal && parseInt(participant.dorsal, 10) === num
      )) || null;
    }
    return null;
  }, [participantMap, participants]);

  const handleAddMissed = useCallback(async () => {
    const raw = missedDorsal.trim();

    if (!raw) {
      setMissedError("Ingresa el numero de dorsal.");
      return;
    }

    const participant = findParticipantByDorsal(raw);
    if (!participant) {
      setMissedError(`El dorsal #${raw} no existe en la lista.`);
      return;
    }

    const canonicalDorsal = String(participant.dorsal).trim();
    if (finisherDorsals.has(canonicalDorsal)) {
      const existingFinisher = finishers.find((finisher) => String(finisher.dorsal).trim() === canonicalDorsal);
      const pos = existingFinisher?.position ?? finishers.findIndex((finisher) => String(finisher.dorsal).trim() === canonicalDorsal) + 1;
      setMissedError(`El dorsal #${canonicalDorsal} ya esta registrado en el puesto #${pos}.`);
      return;
    }

    if (missedTimeMs == null) {
      setMissedError("Ingresa un tiempo valido.");
      return;
    }

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
    } catch {
      setMissedError("No se pudo agregar. Intenta de nuevo.");
    } finally {
      setMissedBusy(false);
    }
  }, [missedDorsal, missedTimeMs, findParticipantByDorsal, finisherDorsals, finishers, onFinisherAdd, raceStartTime]);

  const handleExport = () => {
    const csv = generateCSV(filteredFinishers, participants, categories);
    const suffix = distanceTab === "TODAS" ? "todas" : distanceTab.toLowerCase();
    downloadCSV(csv, `resultados-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleCopyPublicResults = useCallback(async () => {
    if (!race?.slug || !race?.isOfficial) return;
    const publicUrl = `${window.location.origin}/resultados/${encodeURIComponent(race.slug)}`;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [race]);

  const handleResultsFile = useCallback((file) => {
    if (!file || !onFinishersImport) return;
    setImportBusy(true);
    setImportErrors([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const workbook = XLSX.read(new Uint8Array(event.target.result), { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
        if (rawRows.length === 0) {
          setImportErrors([{ row: 0, errors: ["El archivo esta vacio o no tiene datos en la primera hoja"] }]);
          return;
        }

        const seen = new Set();
        const errors = [];
        const mapped = rawRows.map((row, index) => {
          const dorsal = String(getRowValue(row, ["dorsal", "numero", "nro", "bib"])).trim().replace(/\.0$/, "");
          const elapsedMs = parseTimeToMs(getRowValue(row, ["tiempo", "time", "marca"]));
          const positionValue = String(getRowValue(row, ["puesto", "posicion", "position", "pos"])).trim();
          const position = Number.parseInt(positionValue, 10);
          const rowErrors = [];

          if (!dorsal) rowErrors.push("Dorsal vacio");
          if (elapsedMs == null || elapsedMs < 0) rowErrors.push("Tiempo invalido");
          if (positionValue && (!Number.isInteger(position) || position <= 0)) rowErrors.push("Puesto invalido");
          if (dorsal && seen.has(dorsal)) rowErrors.push("Dorsal repetido en el archivo");
          if (dorsal) seen.add(dorsal);
          if (rowErrors.length > 0) errors.push({ row: index + 2, errors: rowErrors });

          return {
            dorsal,
            elapsedMs,
            ...(Number.isInteger(position) && position > 0 ? { position } : {}),
          };
        });

        if (errors.length > 0) {
          setImportErrors(errors);
          return;
        }

        const result = await onFinishersImport(mapped, importReplace);
        setImportResult(result);
        if (importInputRef.current) importInputRef.current.value = "";
      } catch (err) {
        setImportErrors([{ row: 0, errors: [err.message || "No se pudo importar el archivo"] }]);
      } finally {
        setImportBusy(false);
      }
    };
    reader.onerror = () => {
      setImportBusy(false);
      setImportErrors([{ row: 0, errors: ["No se pudo leer el archivo"] }]);
    };
    reader.readAsArrayBuffer(file);
  }, [importReplace, onFinishersImport]);

  const distanceGroups = groupByDistance(filteredFinishers, participants, categories);
  const distances = Object.keys(distanceGroups).sort();

  return (
    <div className="results-container">
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
            Por categoria
          </button>
        </div>
        <div className="results-actions">
          {view === "general" && (
            <button
              className={`btn ${editMode ? "btn-warning" : "btn-secondary"}`}
              onClick={() => {
                setEditMode((value) => !value);
                setMissedError("");
              }}
            >
              {editMode ? "Finalizar edicion" : "Editar"}
            </button>
          )}
          <button className="btn btn-export" onClick={handleExport}>
            Exportar CSV
          </button>
          <button className="btn btn-secondary" onClick={() => setImportOpen((value) => !value)}>
            Importar resultados
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleCopyPublicResults}
            disabled={!race?.isOfficial}
            title={race?.isOfficial ? "Copiar enlace de resultados" : "Disponible cuando la carrera sea oficial"}
          >
            Copiar enlace de resultados
          </button>
          <button className="btn btn-warning-outline" onClick={onResetResults}>
            Limpiar resultados
          </button>
          <button className="btn btn-danger" onClick={onResetAll}>
            Resetear todo
          </button>
        </div>
      </div>

      {copied && <div className="results-copy-ok">Enlace de resultados copiado</div>}

      {importOpen && (
        <div className="missed-finisher-panel">
          <h4 className="missed-finisher-title">Importar resultados desde Excel</h4>
          <div className="missed-finisher-form">
            <div className="missed-field" style={{ flex: 1 }}>
              <label className="missed-label">Archivo .xlsx o .xls</label>
              <input
                ref={importInputRef}
                className="missed-input"
                type="file"
                accept=".xlsx,.xls"
                disabled={importBusy}
                onChange={(event) => handleResultsFile(event.target.files?.[0])}
              />
            </div>
            <label className="config-checkbox-field">
              <input
                type="checkbox"
                checked={importReplace}
                onChange={(event) => setImportReplace(event.target.checked)}
                disabled={importBusy}
              />
              <span>Reemplazar resultados actuales</span>
            </label>
          </div>
          <p className="drop-hint">Columnas esperadas: Puesto, Dorsal, Tiempo. Nombre puede estar, pero se toma desde participantes.</p>
          {importBusy && <div className="results-copy-ok">Importando resultados...</div>}
          {importResult && (
            <div className="results-copy-ok">
              Resultados importados: {importResult.importedCount}. Actualizados: {importResult.updatedCount}. Nuevos: {importResult.createdCount}.
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="error-panel">
              <h3 className="error-title">Errores de importacion ({importErrors.length})</h3>
              <ul className="error-list">
                {importErrors.map((item, index) => (
                  <li key={index}>
                    <span className="error-row">Fila {item.row}:</span> {item.errors.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="results-searchbar">
        <input
          className="results-search-input"
          type="text"
          placeholder="Buscar por nombre, dorsal o documento..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && (
          <button
            type="button"
            className="results-search-clear"
            onClick={() => setSearch("")}
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="view-toggle">
        {availableDistances.map((distance) => (
          <button
            key={distance}
            className={`btn btn-tab ${distanceTab === distance ? "btn-tab-active" : ""}`}
            onClick={() => setDistanceTab(distance)}
          >
            {distance === "TODAS" ? "Todas" : distance}
          </button>
        ))}
      </div>

      {finishers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">T</div>
          <h2>Sin resultados aun</h2>
          <p className="text-muted">Los resultados apareceran aqui una vez que registres atletas en la Meta.</p>
        </div>
      ) : (
        <>
          {editMode && view === "general" && (
            <>
              <div className="edit-mode-banner">
                Modo edicion: puedes reordenar, descalificar o agregar un finisher omitido.
              </div>

              {dqPanel && (
                <div className="missed-finisher-panel dq-panel">
                  <h4 className="missed-finisher-title">
                    Descalificar dorsal #{dqPanel}
                    {participantMap[dqPanel] && ` - ${participantMap[dqPanel].nombre}`}
                  </h4>
                  <div className="missed-finisher-form">
                    <div className="missed-field" style={{ flex: 1 }}>
                      <label className="missed-label">Motivo</label>
                      <input
                        className="missed-input"
                        style={{ width: "100%" }}
                        type="text"
                        placeholder="Ej: No completo la distancia"
                        value={dqReason}
                        onChange={(event) => setDqReason(event.target.value)}
                        disabled={dqBusy}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleDisqualify(dqPanel, dqReason);
                        }}
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
                      onClick={() => {
                        setDqPanel(null);
                        setDqReason("");
                      }}
                      disabled={dqBusy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

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
                      onChange={(event) => {
                        setMissedDorsal(event.target.value);
                        setMissedError("");
                      }}
                      disabled={missedBusy}
                    />
                  </div>
                  <div className="missed-field">
                    <label className="missed-label">Tiempo</label>
                    <TimeInput
                      value={missedTimeMs}
                      onChange={(ms) => {
                        setMissedTimeMs(ms);
                        setMissedError("");
                      }}
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
                  const preview = missedDorsal ? findParticipantByDorsal(missedDorsal.trim()) : null;
                  if (!preview || finisherDorsals.has(String(preview.dorsal).trim())) return null;
                  return (
                    <div className="missed-preview">
                      {preview.nombre} - {preview.distancia} - {getCategory(preview.edad, preview.genero, preview.distancia, categories)}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

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
                    <th>Categoria</th>
                    <th>Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActiveFinishers.map((finisher, index) => {
                    const participant = participantMap[String(finisher.dorsal).trim()];
                    const category = participant
                      ? getCategory(participant.edad, participant.genero, participant.distancia, categories)
                      : "-";

                    return (
                      <tr
                        key={finisher.dorsal + finisher.timestamp}
                        className={finisher.position >= 1 && finisher.position <= 3 ? `row-top-${finisher.position}` : ""}
                      >
                        {editMode && (
                          <td className="reorder-cell">
                            <button className="reorder-btn" onClick={() => handleMoveUp(index)} disabled={index === 0} title="Subir">^</button>
                            <button className="reorder-btn" onClick={() => handleMoveDown(index)} disabled={index === filteredActiveFinishers.length - 1} title="Bajar">v</button>
                            <button
                              className="reorder-btn dq-btn"
                              onClick={() => {
                                setDqPanel(String(finisher.dorsal).trim());
                                setDqReason("");
                              }}
                              title="Descalificar"
                            >
                              DQ
                            </button>
                            <button
                              className="reorder-btn"
                              onClick={() => onFinisherNoTime(String(finisher.dorsal).trim(), true)}
                              title="Marcar sin tiempo"
                            >
                              ST
                            </button>
                          </td>
                        )}
                        <td>
                          {editMode && editingPosition?.dorsal === String(finisher.dorsal).trim() ? (
                            <div className="position-edit-cell">
                              <input
                                className="missed-input position-edit-input"
                                type="number"
                                min="1"
                                value={editingPosition.value}
                                onChange={(event) => setEditingPosition((prev) => ({ ...prev, value: event.target.value, error: "" }))}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") handlePositionEditConfirm();
                                }}
                                autoFocus
                              />
                              <button className="reorder-btn time-confirm-btn" onClick={handlePositionEditConfirm} title="Confirmar">OK</button>
                              <button className="reorder-btn" onClick={() => setEditingPosition(null)} title="Cancelar">X</button>
                              {editingPosition.error && <span className="time-edit-error">{editingPosition.error}</span>}
                            </div>
                          ) : (
                            <span
                              className={`position-badge pos-${finisher.position} ${editMode ? "position-badge-editable" : ""}`}
                              onClick={editMode ? () => handlePositionEditStart(finisher) : undefined}
                              title={editMode ? "Editar puesto oficial" : undefined}
                            >
                              {finisher.position}
                            </span>
                          )}
                        </td>
                        <td><span className="dorsal-badge">{finisher.dorsal}</span></td>
                        <td className="name-cell">{participant ? participant.nombre : "-"}</td>
                        <td><span className="category-tag">{participant ? participant.distancia : "-"}</span></td>
                        <td><span className="category-tag">{category}</span></td>
                        <td className="time-cell">
                          {editMode && editingTime?.dorsal === String(finisher.dorsal).trim() ? (
                            <div className="time-edit-cell">
                              <TimeInput
                                value={editingTime.ms}
                                onChange={(ms) => setEditingTime((prev) => ({ ...prev, ms, error: "" }))}
                                autoFocus
                                onEnter={handleTimeEditConfirm}
                              />
                              <button className="reorder-btn time-confirm-btn" onClick={handleTimeEditConfirm} title="Confirmar">OK</button>
                              <button className="reorder-btn" onClick={() => setEditingTime(null)} title="Cancelar">X</button>
                              {editingTime.error && <span className="time-edit-error">{editingTime.error}</span>}
                            </div>
                          ) : (
                            <span
                              className={editMode ? "time-cell-editable" : ""}
                              onClick={editMode ? () => handleTimeEditStart(finisher) : undefined}
                              title={editMode ? "Editar tiempo" : undefined}
                            >
                              {formatTime(finisher.elapsedMs)}
                              {editMode && <span className="time-edit-icon"> E</span>}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredNoTimeFinishers.map((finisher) => {
                    const participant = participantMap[String(finisher.dorsal).trim()];
                    const category = participant
                      ? getCategory(participant.edad, participant.genero, participant.distancia, categories)
                      : "-";

                    return (
                      <tr key={finisher.dorsal + "-st"} className="row-dq">
                        {editMode && (
                          <td className="reorder-cell">
                            <button
                              className="reorder-btn undo-dq-btn"
                              onClick={() => onFinisherNoTime(String(finisher.dorsal).trim(), false)}
                              title="Quitar sin tiempo"
                            >
                              Undo ST
                            </button>
                          </td>
                        )}
                        <td><span className="position-badge dq-badge">ST</span></td>
                        <td><span className="dorsal-badge">{finisher.dorsal}</span></td>
                        <td className="name-cell">{participant ? participant.nombre : "-"}</td>
                        <td><span className="category-tag">{participant ? participant.distancia : "-"}</span></td>
                        <td><span className="category-tag">{category}</span></td>
                        <td className="time-cell">Sin tiempo</td>
                      </tr>
                    );
                  })}

                  {filteredDqFinishers.map((finisher) => {
                    const participant = participantMap[String(finisher.dorsal).trim()];
                    const category = participant
                      ? getCategory(participant.edad, participant.genero, participant.distancia, categories)
                      : "-";

                    return (
                      <tr key={finisher.dorsal + "-dq"} className="row-dq">
                        {editMode && (
                          <td className="reorder-cell">
                            <button
                              className="reorder-btn undo-dq-btn"
                              onClick={() => handleUndoDQ(String(finisher.dorsal).trim())}
                              title="Quitar descalificacion"
                            >
                              Undo DQ
                            </button>
                          </td>
                        )}
                        <td><span className="position-badge dq-badge">DQ</span></td>
                        <td><span className="dorsal-badge">{finisher.dorsal}</span></td>
                        <td className="name-cell">
                          {participant ? participant.nombre : "-"}
                          {finisher.dqReason && <span className="dq-reason-inline"> - {finisher.dqReason}</span>}
                        </td>
                        <td><span className="category-tag">{participant ? participant.distancia : "-"}</span></td>
                        <td><span className="category-tag">{category}</span></td>
                        <td className="time-cell">{formatTime(finisher.elapsedMs)}</td>
                      </tr>
                    );
                  })}

                  {filteredActiveFinishers.length === 0 && filteredNoTimeFinishers.length === 0 && filteredDqFinishers.length === 0 && (
                    <tr>
                      <td colSpan={editMode ? 7 : 6} className="results-empty-filter">
                        No hay resultados que coincidan con la busqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {view === "category" && (
            <div className="category-view">
              {distances.length === 0 ? (
                <p className="text-muted">No hay categorias con finishers para este filtro.</p>
              ) : (
                distances.map((distance) => {
                  const byGender = getAbsoluteByGender(filteredFinishers, participants, distance);
                  const absoluteDorsals = new Set([
                    ...byGender.M.map((finisher) => String(finisher.dorsal).trim()),
                    ...byGender.F.map((finisher) => String(finisher.dorsal).trim()),
                  ]);

                  return (
                    <div key={distance} className="distance-section">
                      <div className="distance-section-header">
                        <span className="distance-badge">{distance}</span>
                      </div>

                      <AbsoluteWinners distance={distance} byGender={byGender} />

                      <div className="category-section-divider">Por categoria</div>

                      {sortedCategories(distanceGroups[distance], distance, categories).map((categoryName) => {
                        const filtered = applyCompetitionRanking(
                          distanceGroups[distance][categoryName]
                            .filter((finisher) => !absoluteDorsals.has(String(finisher.dorsal).trim())),
                          "position",
                          "categoryPosition"
                        );

                        return (
                          <CategoryResults
                            key={categoryName}
                            categoryName={categoryName}
                            finishers={filtered}
                            participants={participants}
                            categories={categories}
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
