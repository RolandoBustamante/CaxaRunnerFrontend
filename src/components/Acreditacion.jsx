import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { getCategory, DEFAULT_CATEGORIES } from "../utils/categories";

// ── Extraer nombre del response RENIEC ────────────────────────────────────
function extractReniecName(data) {
  if (!data) return null;
  return data.datos || null;
}

const EMPTY_FORM = { documento: "", nombre: "", edad: "", genero: "M", distancia: "10K", dorsal: "" };

// ── Debounce hook ─────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Search result card ────────────────────────────────────────────────────
function ParticipantCard({ participant, onUpdate, categories = DEFAULT_CATEGORIES, raceId }) {
  const [dorsalInput, setDorsalInput] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [busy, setBusy] = useState(false);

  const p = participant;
  const category = getCategory(p.edad, p.genero, p.distancia, categories);

  const handleAssignDorsal = async () => {
    const d = dorsalInput.trim();
    if (!d) {
      setAssignError("Escribí el número de dorsal antes de asignar.");
      return;
    }
    setAssignError("");
    setBusy(true);
    try {
      await api.assignDorsal(p.id, d, raceId);
      setDorsalInput("");
      setAssigning(false);
      onUpdate();
    } catch (err) {
      if (err.message.includes("ya está asignado")) {
        setAssignError(`El dorsal #${d} ya le pertenece a otro atleta. Verificá el número.`);
      } else if (err.message.includes("no encontrado")) {
        setAssignError("No se encontró el participante. Recargá la página e intentá de nuevo.");
      } else {
        setAssignError("No se pudo asignar el dorsal. Verificá la conexión e intentá de nuevo.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleKit = async () => {
    setBusy(true);
    try {
      await api.toggleKit(p.id, raceId);
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCarta = async () => {
    setBusy(true);
    try {
      await api.toggleCarta(p.id, raceId);
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`acred-card ${busy ? "acred-card-busy" : ""}`}>
      {/* Top row: identity */}
      <div className="acred-card-identity">
        <div className="acred-card-info">
          <span className="acred-documento">{p.documento}</span>
          <span className="acred-nombre">{p.nombre}</span>
          <div className="acred-meta">
            <span className={`gender-badge gender-${p.genero.toLowerCase()}`}>{p.genero}</span>
            <span className="category-tag">{category}</span>
          </div>
        </div>

        {/* Dorsal */}
        <div className="acred-dorsal-section">
          {p.dorsal ? (
            <div className="acred-dorsal-assigned">
              <span className="acred-dorsal-label">Dorsal</span>
              <span className="dorsal-badge acred-dorsal-num">#{p.dorsal}</span>
            </div>
          ) : assigning ? (
            <div className="acred-dorsal-assign">
              <input
                className="acred-dorsal-input"
                type="text"
                placeholder="Ej: 042"
                value={dorsalInput}
                onChange={(e) => {
                  setDorsalInput(e.target.value);
                  setAssignError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAssignDorsal()}
                autoFocus
                disabled={busy}
              />
              <button
                className="btn btn-primary btn-sm acred-btn-touch"
                onClick={handleAssignDorsal}
                disabled={busy}
              >
                Asignar
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setAssigning(false);
                  setAssignError("");
                  setDorsalInput("");
                }}
                disabled={busy}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary acred-btn-touch acred-no-dorsal"
              onClick={() => setAssigning(true)}
              disabled={busy}
            >
              + Asignar dorsal
            </button>
          )}
          {assignError && <div className="acred-assign-error">{assignError}</div>}
        </div>
      </div>

      {/* Bottom row: kit & carta toggles */}
      <div className="acred-toggles">
        <button
          className={`acred-toggle-btn ${p.kitEntregado ? "acred-toggle-on" : "acred-toggle-off"}`}
          onClick={handleToggleKit}
          disabled={busy || p.kitEntregado}
          title={p.kitEntregado ? "Kit ya entregado" : "Marcar kit entregado"}
        >
          <span className="acred-toggle-icon">{p.kitEntregado ? "✓" : "—"}</span>
          <span className="acred-toggle-label">Kit</span>
        </button>
        <button
          className={`acred-toggle-btn ${p.cartaFirmada ? "acred-toggle-on" : "acred-toggle-off"}`}
          onClick={handleToggleCarta}
          disabled={busy || p.cartaFirmada}
          title={p.cartaFirmada ? "Carta ya firmada" : "Marcar carta firmada"}
        >
          <span className="acred-toggle-icon">{p.cartaFirmada ? "✓" : "—"}</span>
          <span className="acred-toggle-label">Carta</span>
        </button>
      </div>
    </div>
  );
}

// ── Main Acreditacion component ────────────────────────────────────────────
export default function Acreditacion({ participants, categories = DEFAULT_CATEGORIES, onUpdate, raceId }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tableFilter, setTableFilter] = useState("todos");
  const [editingDorsalId, setEditingDorsalId] = useState(null);
  const [editingDorsalValue, setEditingDorsalValue] = useState("");
  const [editingDorsalError, setEditingDorsalError] = useState("");
  const [editingDorsalBusy, setEditingDorsalBusy] = useState(false);
  const searchInputRef = useRef(null);

  // Manual add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [dniLookupStatus, setDniLookupStatus] = useState("idle"); // idle | loading | found | not-found | error

  const debouncedQuery = useDebounce(query, 300);

  // Auto-focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Run search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api.searchParticipant(debouncedQuery, raceId)
      .then((results) => {
        if (!cancelled) setSearchResults(results);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, raceId]);

  // Refresh search results + parent state after any update
  const handleUpdate = useCallback(async () => {
    await onUpdate();
    // Re-run search to reflect latest data
    if (debouncedQuery.trim()) {
      try {
        const results = await api.searchParticipant(debouncedQuery, raceId);
        setSearchResults(results);
      } catch (_) {}
    }
  }, [onUpdate, debouncedQuery, raceId]);

  // Lookup DNI from RENIEC and fill nombre
  const lookupDni = useCallback(async (dni) => {
    if (!/^\d{8}$/.test(dni)) return;
    setDniLookupStatus("loading");
    const result = await api.getDni(dni);
    if (!result.success) { setDniLookupStatus("error"); return; }
    const nombre = extractReniecName(result.data);
    if (nombre) {
      setAddForm((prev) => ({ ...prev, nombre }));
      setDniLookupStatus("found");
    } else {
      setDniLookupStatus("not-found");
    }
  }, []);

  const openAddForm = useCallback((documento = "") => {
    const doc = documento.trim();
    setAddForm({ ...EMPTY_FORM, documento: doc });
    setAddError("");
    setDniLookupStatus("idle");
    setShowAddForm(true);
    if (/^\d{8}$/.test(doc)) lookupDni(doc);
  }, [lookupDni]);

  const handleAddFormDocChange = useCallback((val) => {
    setAddForm((prev) => ({ ...prev, documento: val, nombre: "" }));
    setDniLookupStatus("idle");
    setAddError("");
    if (/^\d{8}$/.test(val.trim())) lookupDni(val.trim());
  }, [lookupDni]);

  const handleAddSubmit = useCallback(async () => {
    const { documento, nombre, edad, genero, distancia, dorsal } = addForm;
    if (!documento.trim()) { setAddError("Ingresá el número de documento."); return; }
    if (!nombre.trim()) { setAddError("Ingresá el nombre."); return; }
    if (!edad || isNaN(Number(edad)) || Number(edad) <= 0) { setAddError("Ingresá una edad válida."); return; }
    if (!distancia) { setAddError("Seleccioná la distancia."); return; }

    setAddBusy(true);
    setAddError("");
    try {
      await api.uploadParticipants([{
        documento: documento.trim(),
        nombre: nombre.trim(),
        edad: Number(edad),
        genero,
        distancia,
        dorsal: dorsal.trim() || null,
      }], raceId);
      await onUpdate();
      setShowAddForm(false);
      setAddForm(EMPTY_FORM);
      // Search the newly added participant
      setQuery(documento.trim());
    } catch (err) {
      setAddError(err.message || "No se pudo agregar el participante.");
    } finally {
      setAddBusy(false);
    }
  }, [addForm, onUpdate, raceId]);

  // Stats
  const total = participants.length;
  const conDorsal = participants.filter((p) => p.dorsal).length;
  const sinDorsal = total - conDorsal;
  const kitEntregado = participants.filter((p) => p.kitEntregado).length;
  const cartaFirmada = participants.filter((p) => p.cartaFirmada).length;

  // Filtered table rows
  const filteredParticipants = participants.filter((p) => {
    if (tableFilter === "sin-dorsal") return !p.dorsal;
    if (tableFilter === "sin-kit") return !p.kitEntregado;
    if (tableFilter === "sin-carta") return !p.cartaFirmada;
    return true;
  });

  const startEditDorsal = (p) => {
    setEditingDorsalId(p.id);
    setEditingDorsalValue(p.dorsal || "");
    setEditingDorsalError("");
  };

  const cancelEditDorsal = () => {
    setEditingDorsalId(null);
    setEditingDorsalValue("");
    setEditingDorsalError("");
  };

  const commitEditDorsal = async (id) => {
    const dorsal = editingDorsalValue.trim();
    if (!dorsal) { setEditingDorsalError("El dorsal no puede estar vacío."); return; }
    setEditingDorsalBusy(true);
    try {
      await api.assignDorsal(id, dorsal, raceId);
      await onUpdate();
      cancelEditDorsal();
    } catch (err) {
      setEditingDorsalError(err.message || "Dorsal ya en uso.");
    } finally {
      setEditingDorsalBusy(false);
    }
  };

  const handleToggleKitTable = async (id) => {
    try {
      await api.toggleKit(id, raceId);
      await onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleCartaTable = async (id) => {
    try {
      await api.toggleCarta(id, raceId);
      await onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="acred-container">
      {/* ── Section A: Ventanilla ─────────────────────────────────────────── */}
      <div className="acred-section">
        <div className="section-header">
          <h2>Ventanilla de Acreditación</h2>
        </div>

        {/* Search input */}
        <div className="acred-search-wrapper">
          <input
            ref={searchInputRef}
            className="acred-search-input"
            type="text"
            placeholder="Buscar por documento o nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button
              className="acred-search-clear"
              onClick={() => {
                setQuery("");
                setSearchResults([]);
                searchInputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Search results */}
        <div className="acred-search-results">
          {searching && (
            <div className="acred-searching">Buscando...</div>
          )}
          {!searching && query.trim() && searchResults.length === 0 && (
            <div className="acred-no-results">
              No se encontró ningún participante para "<strong>{query}</strong>"
            </div>
          )}
          {searchResults.map((p) => (
            <ParticipantCard
              key={p.id}
              participant={p}
              onUpdate={handleUpdate}
              categories={categories}
              raceId={raceId}
            />
          ))}
        </div>

        {/* Add participant button */}
        {!showAddForm && (
          <button
            className="btn btn-secondary acred-add-btn"
            onClick={() => openAddForm(query)}
          >
            + Agregar participante
          </button>
        )}

        {/* Manual add form */}
        {showAddForm && (
          <div className="acred-add-form">
            <div className="acred-add-form-header">
              <span className="acred-add-form-title">Agregar participante</span>
              <button className="acred-add-close" onClick={() => setShowAddForm(false)}>✕</button>
            </div>

            <div className="acred-add-fields">
              {/* DNI */}
              <div className="acred-add-field">
                <label className="acred-add-label">DNI</label>
                <input
                  className="acred-add-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="12345678"
                  value={addForm.documento}
                  onChange={(e) => handleAddFormDocChange(e.target.value)}
                  disabled={addBusy}
                  maxLength={8}
                />
              </div>

              {/* Nombre */}
              <div className="acred-add-field acred-add-field-nombre">
                <label className="acred-add-label">
                  Nombre
                  {dniLookupStatus === "loading" && <span className="dni-lookup-status"> consultando RENIEC...</span>}
                  {dniLookupStatus === "found" && <span className="dni-lookup-status dni-lookup-ok"> ✓ RENIEC</span>}
                  {dniLookupStatus === "not-found" && <span className="dni-lookup-status dni-lookup-warn"> no encontrado, ingresalo manualmente</span>}
                  {dniLookupStatus === "error" && <span className="dni-lookup-status dni-lookup-warn"> sin conexión a RENIEC</span>}
                </label>
                <input
                  className="acred-add-input"
                  type="text"
                  placeholder="Apellidos y nombres"
                  value={addForm.nombre}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  disabled={addBusy || dniLookupStatus === "loading"}
                />
              </div>

              {/* Edad */}
              <div className="acred-add-field acred-add-field-sm">
                <label className="acred-add-label">Edad</label>
                <input
                  className="acred-add-input"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="25"
                  value={addForm.edad}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, edad: e.target.value }))}
                  disabled={addBusy}
                />
              </div>

              {/* Género */}
              <div className="acred-add-field acred-add-field-sm">
                <label className="acred-add-label">Género</label>
                <select
                  className="acred-add-input"
                  value={addForm.genero}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, genero: e.target.value }))}
                  disabled={addBusy}
                >
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>

              {/* Distancia */}
              <div className="acred-add-field acred-add-field-sm">
                <label className="acred-add-label">Distancia</label>
                <select
                  className="acred-add-input"
                  value={addForm.distancia}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, distancia: e.target.value }))}
                  disabled={addBusy}
                >
                  <option value="5K">5K</option>
                  <option value="10K">10K</option>
                </select>
              </div>

              {/* Dorsal */}
              <div className="acred-add-field acred-add-field-sm">
                <label className="acred-add-label">Dorsal (opc.)</label>
                <input
                  className="acred-add-input"
                  type="text"
                  placeholder="042"
                  value={addForm.dorsal}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, dorsal: e.target.value }))}
                  disabled={addBusy}
                />
              </div>
            </div>

            {addError && <div className="input-error-msg">{addError}</div>}

            <div className="acred-add-actions">
              <button className="btn btn-primary" onClick={handleAddSubmit} disabled={addBusy}>
                {addBusy ? "Guardando..." : "Guardar"}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddForm(false)} disabled={addBusy}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Section B: Estado general ─────────────────────────────────────── */}
      <div className="acred-section">
        <div className="section-header">
          <h2>Estado General</h2>
        </div>

        {/* Stats bar */}
        <div className="acred-stats-bar">
          <div className="acred-stat">
            <span className="acred-stat-num">{total}</span>
            <span className="acred-stat-label">Total</span>
          </div>
          <div className="acred-stat-divider" />
          <div className="acred-stat">
            <span className="acred-stat-num acred-stat-green">{conDorsal}</span>
            <span className="acred-stat-label">Con dorsal</span>
          </div>
          <div className="acred-stat-divider" />
          <div className="acred-stat">
            <span className="acred-stat-num acred-stat-blue">{kitEntregado}</span>
            <span className="acred-stat-label">Kit entregado</span>
          </div>
          <div className="acred-stat-divider" />
          <div className="acred-stat">
            <span className="acred-stat-num acred-stat-yellow">{cartaFirmada}</span>
            <span className="acred-stat-label">Carta firmada</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="acred-filter-tabs">
          {[
            { id: "todos", label: `Todos (${total})` },
            { id: "sin-dorsal", label: `Sin dorsal (${sinDorsal})` },
            { id: "sin-kit", label: `Sin kit (${total - kitEntregado})` },
            { id: "sin-carta", label: `Sin carta (${total - cartaFirmada})` },
          ].map((f) => (
            <button
              key={f.id}
              className={`btn btn-tab ${tableFilter === f.id ? "btn-tab-active" : ""}`}
              onClick={() => setTableFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Participants table */}
        {total === 0 ? (
          <div className="acred-empty">
            <p>No hay participantes cargados. Ve a la pestaña <strong>Participantes</strong> para cargar el Excel.</p>
          </div>
        ) : filteredParticipants.length === 0 ? (
          <div className="acred-empty">
            <p>No hay participantes que coincidan con este filtro.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table acred-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Nombre</th>
                  <th>Categoria</th>
                  <th>Dorsal</th>
                  <th>Kit</th>
                  <th>Carta</th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((p) => {
                  const category = getCategory(p.edad, p.genero, p.distancia, categories);
                  return (
                    <tr key={p.id}>
                      <td className="acred-table-doc">{p.documento}</td>
                      <td className="name-cell">{p.nombre}</td>
                      <td><span className="category-tag">{category}</span></td>
                      <td className="acred-dorsal-cell">
                        {editingDorsalId === p.id ? (
                          <div className="acred-dorsal-edit">
                            <input
                              className="acred-dorsal-input"
                              type="text"
                              value={editingDorsalValue}
                              onChange={(e) => { setEditingDorsalValue(e.target.value); setEditingDorsalError(""); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEditDorsal(p.id);
                                if (e.key === "Escape") cancelEditDorsal();
                              }}
                              disabled={editingDorsalBusy}
                              autoFocus
                              placeholder="Dorsal"
                            />
                            <button className="acred-dorsal-confirm" onClick={() => commitEditDorsal(p.id)} disabled={editingDorsalBusy} title="Confirmar">✓</button>
                            <button className="acred-dorsal-cancel" onClick={cancelEditDorsal} disabled={editingDorsalBusy} title="Cancelar">✕</button>
                            {editingDorsalError && <span className="acred-dorsal-err">{editingDorsalError}</span>}
                          </div>
                        ) : (
                          <button className="acred-dorsal-edit-trigger" onClick={() => startEditDorsal(p)} title="Editar dorsal">
                            {p.dorsal
                              ? <span className="dorsal-badge">{p.dorsal}</span>
                              : <span className="acred-dorsal-empty">+ Asignar</span>
                            }
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          className={`acred-table-toggle ${p.kitEntregado ? "acred-table-toggle-on" : "acred-table-toggle-off"}`}
                          onClick={() => handleToggleKitTable(p.id)}
                          disabled={p.kitEntregado}
                          title={p.kitEntregado ? "Kit ya entregado" : "Marcar kit entregado"}
                        >
                          {p.kitEntregado ? "✓" : "—"}
                        </button>
                      </td>
                      <td>
                        <button
                          className={`acred-table-toggle ${p.cartaFirmada ? "acred-table-toggle-on" : "acred-table-toggle-off"}`}
                          onClick={() => handleToggleCartaTable(p.id)}
                          disabled={p.cartaFirmada}
                          title={p.cartaFirmada ? "Carta ya firmada" : "Marcar carta firmada"}
                        >
                          {p.cartaFirmada ? "✓" : "—"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
