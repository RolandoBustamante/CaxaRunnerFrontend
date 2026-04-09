import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";

function extractReniecName(data) {
  if (!data) return null;
  return data.datos || null;
}

const REQUIRED_FIELDS = ["documento", "nombre", "edad", "genero", "distancia"];

function normalizeKey(key) {
  return String(key).trim().toLowerCase();
}

function mapRow(row) {
  const normalized = {};
  for (const key in row) {
    normalized[normalizeKey(key)] = row[key];
  }
  const dorsal = String(normalized.dorsal ?? "").trim();
  return {
    documento: String(normalized.documento ?? "").trim(),
    nombre: String(normalized.nombre ?? "").trim(),
    edad: parseInt(normalized.edad, 10),
    genero: String(normalized.genero ?? "").trim().toUpperCase(),
    distancia: String(normalized.distancia ?? "").trim().toUpperCase(),
    ...(dorsal ? { dorsal } : {}),
  };
}

function validateParticipant(p) {
  const errors = [];
  if (!p.documento) errors.push("Documento vacío");
  if (!p.nombre) errors.push("Nombre vacío");
  if (isNaN(p.edad) || p.edad <= 0) errors.push("Edad inválida");
  if (!["M", "F"].includes(p.genero)) errors.push(`Género inválido: "${p.genero}" (M o F)`);
  if (!p.distancia) errors.push("Distancia vacía");
  return errors;
}

const EMPTY_FORM = { documento: "", nombre: "", edad: "", genero: "M", distancia: "", dorsal: "" };

export default function ParticipantUpload({ participants, onParticipantsLoad }) {
  const [mode, setMode] = useState("excel"); // "excel" | "manual"

  // Excel upload state
  const [isDragging, setIsDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);

  // Manual entry state
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState([]);
  const [formBusy, setFormBusy] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [dniLookupStatus, setDniLookupStatus] = useState("idle"); // idle | loading | found | not-found | error

  // ── Excel processing ───────────────────────────────────────────────────────

  const processFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setParseErrors([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawRows.length === 0) {
          setParseErrors([{ row: 0, errors: ["El archivo está vacío o no tiene datos en la primera hoja"] }]);
          return;
        }

        const firstRow = rawRows[0];
        const keys = Object.keys(firstRow).map(normalizeKey);
        const missing = REQUIRED_FIELDS.filter((f) => !keys.includes(f));
        if (missing.length > 0) {
          setParseErrors([{ row: 0, errors: [`Columnas faltantes: ${missing.join(", ")}. Encontradas: ${keys.join(", ")}`] }]);
          return;
        }

        const mapped = rawRows.map(mapRow);
        const errors = mapped.map((p, i) => {
          const errs = validateParticipant(p);
          return errs.length ? { row: i + 2, errors: errs } : null;
        }).filter(Boolean);

        setParseErrors(errors);

        const valid = mapped.filter((p) => validateParticipant(p).length === 0);
        if (valid.length > 0) onParticipantsLoad(valid);
      } catch (err) {
        setParseErrors([{ row: 0, errors: [`Error al leer el archivo: ${err.message}`] }]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [onParticipantsLoad]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleFileChange = (e) => { const file = e.target.files[0]; if (file) processFile(file); };

  const handleClear = () => {
    onParticipantsLoad([]);
    setParseErrors([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Manual entry ───────────────────────────────────────────────────────────

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors([]);
    setFormSuccess("");
  };

  const handleDocumentoChange = useCallback(async (value) => {
    setForm((prev) => ({ ...prev, documento: value, nombre: "" }));
    setFormErrors([]);
    setFormSuccess("");
    setDniLookupStatus("idle");
    if (!/^\d{8}$/.test(value.trim())) return;
    setDniLookupStatus("loading");
    const result = await api.getDni(value.trim());
    if (!result.success) { setDniLookupStatus("error"); return; }
    const nombre = extractReniecName(result.data);
    if (nombre) {
      setForm((prev) => ({ ...prev, nombre }));
      setDniLookupStatus("found");
    } else {
      setDniLookupStatus("not-found");
    }
  }, []);

  const handleManualAdd = useCallback(async () => {
    const p = {
      documento: form.documento.trim(),
      nombre: form.nombre.trim(),
      edad: parseInt(form.edad, 10),
      genero: form.genero.trim().toUpperCase(),
      distancia: form.distancia.trim().toUpperCase(),
      ...(form.dorsal.trim() ? { dorsal: form.dorsal.trim() } : {}),
    };
    const errors = validateParticipant(p);
    if (errors.length) { setFormErrors(errors); return; }

    setFormBusy(true);
    setFormErrors([]);
    try {
      await onParticipantsLoad([p]);
      setFormSuccess(`✓ ${p.nombre} agregado correctamente.`);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormErrors([err.message || "Error al agregar participante."]);
    } finally {
      setFormBusy(false);
    }
  }, [form, onParticipantsLoad]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="upload-container">
      <div className="section-header">
        <h2>Cargar Participantes</h2>
        {participants.length > 0 && (
          <span className="badge badge-green">{participants.length} participantes</span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="upload-mode-toggle">
        <button
          className={`btn btn-tab ${mode === "excel" ? "btn-tab-active" : ""}`}
          onClick={() => setMode("excel")}
        >
          Desde Excel
        </button>
        <button
          className={`btn btn-tab ${mode === "manual" ? "btn-tab-active" : ""}`}
          onClick={() => setMode("manual")}
        >
          Ingreso manual
        </button>
      </div>

      {/* ── Excel mode ── */}
      {mode === "excel" && (
        <>
          <div
            className={`drop-zone ${isDragging ? "drag-over" : ""} ${participants.length > 0 ? "drop-zone-loaded" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            aria-label="Zona de carga de archivos"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {participants.length === 0 ? (
              <>
                <div className="drop-icon">📂</div>
                <p className="drop-title">Arrastra el archivo Excel aquí</p>
                <p className="drop-subtitle">o haz clic para seleccionar</p>
                <p className="drop-hint">Formatos: .xlsx, .xls</p>
              </>
            ) : (
              <>
                <div className="drop-icon">✅</div>
                <p className="drop-title">{fileName || "Archivo cargado"}</p>
                <p className="drop-subtitle">{participants.length} participantes cargados correctamente</p>
                <p className="drop-hint">Haz clic para reemplazar</p>
              </>
            )}
          </div>

          {parseErrors.length > 0 && (
            <div className="error-panel">
              <h3 className="error-title">⚠️ Errores de validación ({parseErrors.length})</h3>
              <ul className="error-list">
                {parseErrors.map((e, i) => (
                  <li key={i}><span className="error-row">Fila {e.row}:</span> {e.errors.join(", ")}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="format-guide">
            <h3>Formato esperado del Excel</h3>
            <div className="table-wrapper">
              <table className="sample-table">
                <thead>
                  <tr>
                    <th>documento</th>
                    <th>nombre</th>
                    <th>edad</th>
                    <th>genero</th>
                    <th>distancia</th>
                    <th>dorsal (opcional)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>12345678</td><td>Juan Pérez</td><td>34</td><td>M</td><td>10K</td><td>001</td></tr>
                  <tr><td>87654321</td><td>Ana García</td><td>28</td><td>F</td><td>5K</td><td></td></tr>
                </tbody>
              </table>
            </div>
            <p className="format-note">
              El campo <strong>documento</strong> es obligatorio. El género debe ser <strong>M</strong> o <strong>F</strong>.
              El <strong>dorsal</strong> es opcional y puede asignarse luego en Acreditación.
            </p>
          </div>
        </>
      )}

      {/* ── Manual mode ── */}
      {mode === "manual" && (
        <div className="manual-entry-panel">
          <h3 className="manual-entry-title">Agregar participante</h3>
          <div className="manual-entry-grid">
            <div className="manual-field">
              <label className="manual-label">Documento *</label>
              <input
                className="manual-input"
                type="text"
                inputMode="numeric"
                placeholder="12345678"
                value={form.documento}
                onChange={(e) => handleDocumentoChange(e.target.value)}
                disabled={formBusy}
                maxLength={8}
              />
            </div>
            <div className="manual-field manual-field-nombre">
              <label className="manual-label">
                Nombre completo *
                {dniLookupStatus === "loading" && <span className="dni-lookup-status"> consultando RENIEC...</span>}
                {dniLookupStatus === "found" && <span className="dni-lookup-status dni-lookup-ok"> ✓ RENIEC</span>}
                {dniLookupStatus === "not-found" && <span className="dni-lookup-status dni-lookup-warn"> no encontrado, ingresalo manualmente</span>}
                {dniLookupStatus === "error" && <span className="dni-lookup-status dni-lookup-warn"> sin conexión a RENIEC</span>}
              </label>
              <input
                className="manual-input"
                type="text"
                placeholder="Apellidos y nombres"
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                disabled={formBusy || dniLookupStatus === "loading"}
              />
            </div>
            <div className="manual-field">
              <label className="manual-label">Edad *</label>
              <input
                className="manual-input manual-input-short"
                type="number"
                min="1"
                max="120"
                placeholder="34"
                value={form.edad}
                onChange={(e) => setField("edad", e.target.value)}
                disabled={formBusy}
              />
            </div>
            <div className="manual-field">
              <label className="manual-label">Género *</label>
              <select
                className="manual-input manual-input-short"
                value={form.genero}
                onChange={(e) => setField("genero", e.target.value)}
                disabled={formBusy}
              >
                <option value="M">M — Masculino</option>
                <option value="F">F — Femenino</option>
              </select>
            </div>
            <div className="manual-field">
              <label className="manual-label">Distancia *</label>
              <select
                className="manual-input manual-input-short"
                value={form.distancia}
                onChange={(e) => setField("distancia", e.target.value)}
                disabled={formBusy}
              >
                <option value="">—</option>
                <option value="5K">5K</option>
                <option value="10K">10K</option>
              </select>
            </div>
            <div className="manual-field">
              <label className="manual-label">Dorsal</label>
              <input
                className="manual-input manual-input-short"
                type="text"
                placeholder="001"
                value={form.dorsal}
                onChange={(e) => setField("dorsal", e.target.value)}
                disabled={formBusy}
              />
            </div>
          </div>

          {formErrors.length > 0 && (
            <div className="input-error-msg">{formErrors.join(" · ")}</div>
          )}
          {formSuccess && (
            <div className="manual-success">{formSuccess}</div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleManualAdd}
            disabled={formBusy}
          >
            {formBusy ? "Agregando..." : "+ Agregar participante"}
          </button>
        </div>
      )}

      {/* Preview table (always visible when participants exist) */}
      {participants.length > 0 && (
        <div className="preview-section">
          <div className="preview-header">
            <h3>Participantes registrados — {participants.length}</h3>
            <button className="btn btn-danger btn-sm" onClick={handleClear}>
              Limpiar todos
            </button>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Documento</th>
                  <th>Dorsal</th>
                  <th>Nombre</th>
                  <th>Edad</th>
                  <th>Género</th>
                  <th>Distancia</th>
                </tr>
              </thead>
              <tbody>
                {participants.slice(0, 50).map((p, i) => (
                  <tr key={(p.documento || p.id || i) + i}>
                    <td className="text-muted">{i + 1}</td>
                    <td className="acred-table-doc">{p.documento}</td>
                    <td>
                      {p.dorsal
                        ? <span className="dorsal-badge">{p.dorsal}</span>
                        : <span className="text-muted">—</span>
                      }
                    </td>
                    <td>{p.nombre}</td>
                    <td>{p.edad}</td>
                    <td>
                      <span className={`gender-badge gender-${p.genero?.toLowerCase()}`}>{p.genero}</span>
                    </td>
                    <td><span className="category-tag">{p.distancia}</span></td>
                  </tr>
                ))}
                {participants.length > 50 && (
                  <tr>
                    <td colSpan={7} className="text-muted text-center">
                      ... y {participants.length - 50} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
