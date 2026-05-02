import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { api } from "../api";
import { getCategory, DEFAULT_CATEGORIES } from "../utils/categories";

function extractReniecName(data) {
  if (!data) return null;
  return data.datos || null;
}

const PARTICIPANT_REQUIRED_FIELDS = ["documento", "nombre", "edad", "genero", "distancia"];
const DORSAL_REQUIRED_FIELDS = ["documento", "dorsal"];
const EMPTY_FORM = { documento: "", nombre: "", edad: "", genero: "M", distancia: "", dorsal: "" };

function normalizeKey(key) {
  return String(key).trim().toLowerCase();
}

function mapParticipantRow(row) {
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

function mapDorsalRow(row) {
  const normalized = {};
  for (const key in row) {
    normalized[normalizeKey(key)] = row[key];
  }
  const dorsalRaw = String(normalized.dorsal ?? "").trim();
  const cleanedDorsal = dorsalRaw.endsWith(".0") ? dorsalRaw.slice(0, -2) : dorsalRaw;
  return {
    documento: String(normalized.documento ?? "").trim(),
    dorsal: cleanedDorsal.padStart(3, "0"),
  };
}

function validateParticipant(participant) {
  const errors = [];
  if (!participant.documento) errors.push("Documento vacio");
  if (!participant.nombre) errors.push("Nombre vacio");
  if (isNaN(participant.edad) || participant.edad <= 0) errors.push("Edad invalida");
  if (!["M", "F"].includes(participant.genero)) errors.push(`Genero invalido: "${participant.genero}" (M o F)`);
  if (!participant.distancia) errors.push("Distancia vacia");
  return errors;
}

function validateDorsalAssignment(item) {
  const errors = [];
  if (!item.documento) errors.push("Documento vacio");
  if (!item.dorsal) errors.push("Dorsal vacio");
  if (item.dorsal && !/^\d{3,}$/.test(item.dorsal)) errors.push(`Dorsal invalido: "${item.dorsal}"`);
  return errors;
}

export default function ParticipantUpload({
  participants,
  categories = DEFAULT_CATEGORIES,
  onParticipantsLoad,
  onParticipantDorsalsLoad,
}) {
  const [mode, setMode] = useState("excel");
  const [isDragging, setIsDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState([]);
  const [formBusy, setFormBusy] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [dniLookupStatus, setDniLookupStatus] = useState("idle");
  const [dorsalUploadResult, setDorsalUploadResult] = useState(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelSuccess, setExcelSuccess] = useState("");
  const fileInputRef = useRef(null);

  const resetExcelState = useCallback(() => {
    setParseErrors([]);
    setFileName("");
    setDorsalUploadResult(null);
    setExcelSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const processParticipantsFile = useCallback(async (rawRows) => {
    const firstRow = rawRows[0];
    const keys = Object.keys(firstRow).map(normalizeKey);
    const missing = PARTICIPANT_REQUIRED_FIELDS.filter((field) => !keys.includes(field));
    if (missing.length > 0) {
      setParseErrors([{ row: 0, errors: [`Columnas faltantes: ${missing.join(", ")}. Encontradas: ${keys.join(", ")}`] }]);
      return;
    }

    const mapped = rawRows.map(mapParticipantRow);
    const errors = mapped
      .map((participant, index) => {
        const participantErrors = validateParticipant(participant);
        return participantErrors.length ? { row: index + 2, errors: participantErrors } : null;
      })
      .filter(Boolean);

    setParseErrors(errors);
    setDorsalUploadResult(null);

    const valid = mapped.filter((participant) => validateParticipant(participant).length === 0);
    if (valid.length > 0) {
      setExcelBusy(true);
      try {
        await onParticipantsLoad(valid);
        setExcelSuccess(`${valid.length} participantes cargados correctamente.`);
      } catch (err) {
        setParseErrors([{ row: 0, errors: [err.message || "No se pudo cargar participantes"] }]);
      } finally {
        setExcelBusy(false);
      }
    }
  }, [onParticipantsLoad]);

  const processDorsalsFile = useCallback(async (rawRows) => {
    const firstRow = rawRows[0];
    const keys = Object.keys(firstRow).map(normalizeKey);
    const missing = DORSAL_REQUIRED_FIELDS.filter((field) => !keys.includes(field));
    if (missing.length > 0) {
      setParseErrors([{ row: 0, errors: [`Columnas faltantes: ${missing.join(", ")}. Encontradas: ${keys.join(", ")}`] }]);
      return;
    }

    const mapped = rawRows.map(mapDorsalRow);
    const errors = mapped
      .map((item, index) => {
        const rowErrors = validateDorsalAssignment(item);
        return rowErrors.length ? { row: index + 2, errors: rowErrors } : null;
      })
      .filter(Boolean);

    const seenDocuments = new Set();
    mapped.forEach((item, index) => {
      if (!item.documento) return;
      if (seenDocuments.has(item.documento)) {
        errors.push({ row: index + 2, errors: ["Documento repetido en el archivo"] });
      } else {
        seenDocuments.add(item.documento);
      }
    });

    setParseErrors(errors);
    if (errors.length > 0) {
      setDorsalUploadResult(null);
      return;
    }

    const result = await onParticipantDorsalsLoad(mapped);
    setDorsalUploadResult(result);
  }, [onParticipantDorsalsLoad]);

  const processFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setParseErrors([]);
    setDorsalUploadResult(null);
    setExcelSuccess("");
    setExcelBusy(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawRows.length === 0) {
          setParseErrors([{ row: 0, errors: ["El archivo esta vacio o no tiene datos en la primera hoja"] }]);
          return;
        }

        if (mode === "dorsales") {
          await processDorsalsFile(rawRows);
          return;
        }

        await processParticipantsFile(rawRows);
      } catch (err) {
        setParseErrors([{ row: 0, errors: [`Error al leer el archivo: ${err.message}`] }]);
      } finally {
        setExcelBusy(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [mode, processDorsalsFile, processParticipantsFile]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) processFile(file);
  };

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
    if (!result.success) {
      setDniLookupStatus("error");
      return;
    }
    const nombre = extractReniecName(result.data);
    if (nombre) {
      setForm((prev) => ({ ...prev, nombre }));
      setDniLookupStatus("found");
    } else {
      setDniLookupStatus("not-found");
    }
  }, []);

  const handleManualAdd = useCallback(async () => {
    const participant = {
      documento: form.documento.trim(),
      nombre: form.nombre.trim(),
      edad: parseInt(form.edad, 10),
      genero: form.genero.trim().toUpperCase(),
      distancia: form.distancia.trim().toUpperCase(),
      ...(form.dorsal.trim() ? { dorsal: form.dorsal.trim() } : {}),
    };
    const errors = validateParticipant(participant);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormBusy(true);
    setFormErrors([]);
    try {
      await onParticipantsLoad([participant]);
      setFormSuccess(`${participant.nombre} agregado correctamente.`);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormErrors([err.message || "Error al agregar participante."]);
    } finally {
      setFormBusy(false);
    }
  }, [form, onParticipantsLoad]);

  const excelTitle = mode === "dorsales" ? "Actualizar dorsales" : "Cargar participantes";
  const loadedCount = mode === "dorsales" ? dorsalUploadResult?.updatedCount ?? 0 : participants.length;

  return (
    <div className="upload-container">
      <div className="section-header">
        <h2>{excelTitle}</h2>
        {loadedCount > 0 && (
          <span className="badge badge-green">
            {mode === "dorsales" ? `${loadedCount} dorsales actualizados` : `${participants.length} participantes`}
          </span>
        )}
      </div>

      <div className="upload-mode-toggle">
        <button
          className={`btn btn-tab ${mode === "excel" ? "btn-tab-active" : ""}`}
          onClick={() => {
            setMode("excel");
            resetExcelState();
          }}
        >
          Desde Excel
        </button>
        <button
          className={`btn btn-tab ${mode === "manual" ? "btn-tab-active" : ""}`}
          onClick={() => {
            setMode("manual");
            resetExcelState();
          }}
        >
          Ingreso manual
        </button>
        <button
          className={`btn btn-tab ${mode === "dorsales" ? "btn-tab-active" : ""}`}
          onClick={() => {
            setMode("dorsales");
            resetExcelState();
          }}
        >
          Solo dorsales
        </button>
      </div>

      {(mode === "excel" || mode === "dorsales") && (
        <>
          <div
            className={`drop-zone ${isDragging ? "drag-over" : ""} ${loadedCount > 0 ? "drop-zone-loaded" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === "Enter" && fileInputRef.current?.click()}
            aria-label="Zona de carga de archivos"
          >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                disabled={excelBusy}
                style={{ display: "none" }}
              />
            {loadedCount === 0 ? (
              <>
                <div className="drop-icon">Archivo</div>
                <p className="drop-title">
                  {mode === "dorsales" ? "Arrastra el Excel de dorsales aqui" : "Arrastra el archivo Excel aqui"}
                </p>
                <p className="drop-subtitle">o haz clic para seleccionar</p>
                <p className="drop-hint">Formatos: .xlsx, .xls</p>
              </>
            ) : (
              <>
                <div className="drop-icon">Listo</div>
                <p className="drop-title">{fileName || "Archivo cargado"}</p>
                <p className="drop-subtitle">
                  {mode === "dorsales"
                    ? `${loadedCount} dorsales actualizados correctamente`
                    : `${participants.length} participantes cargados correctamente`}
                </p>
                <p className="drop-hint">Haz clic para reemplazar</p>
              </>
            )}
          </div>

          {parseErrors.length > 0 && (
            <div className="error-panel">
              <h3 className="error-title">Errores de validacion ({parseErrors.length})</h3>
              <ul className="error-list">
                {parseErrors.map((item, index) => (
                  <li key={index}>
                    <span className="error-row">Fila {item.row}:</span> {item.errors.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {excelBusy && <div className="results-copy-ok">Cargando archivo...</div>}
          {excelSuccess && mode === "excel" && <div className="results-copy-ok">{excelSuccess}</div>}

          {mode === "dorsales" && dorsalUploadResult && (
            <div className="format-guide">
              <h3>Resultado de actualizacion</h3>
              <p className="format-note">
                Actualizados: <strong>{dorsalUploadResult.updatedCount}</strong> ·
                No encontrados: <strong>{dorsalUploadResult.notFoundCount}</strong> ·
                Conflictos: <strong>{dorsalUploadResult.conflictCount}</strong>
              </p>
              {dorsalUploadResult.notFoundCount > 0 && (
                <div className="results-empty-filter">
                  Documentos no encontrados: {dorsalUploadResult.notFound.slice(0, 10).map((item) => item.documento).join(", ")}
                </div>
              )}
            </div>
          )}

          <div className="format-guide">
            <h3>{mode === "dorsales" ? "Formato esperado del Excel de dorsales" : "Formato esperado del Excel"}</h3>
            <div className="table-wrapper">
              <table className="sample-table">
                <thead>
                  <tr>
                    <th>documento</th>
                    {mode === "excel" && <th>nombre</th>}
                    {mode === "excel" && <th>edad</th>}
                    {mode === "excel" && <th>genero</th>}
                    {mode === "excel" && <th>distancia</th>}
                    <th>dorsal{mode === "excel" ? " (opcional)" : ""}</th>
                  </tr>
                </thead>
                <tbody>
                  {mode === "dorsales" ? (
                    <>
                      <tr><td>12345678</td><td>001</td></tr>
                      <tr><td>87654321</td><td>090</td></tr>
                    </>
                  ) : (
                    <>
                      <tr><td>12345678</td><td>Juan Perez</td><td>34</td><td>M</td><td>10K</td><td>001</td></tr>
                      <tr><td>87654321</td><td>Ana Garcia</td><td>28</td><td>F</td><td>5K</td><td></td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <p className="format-note">
              {mode === "dorsales"
                ? <>Este flujo actualiza unicamente el <strong>dorsal</strong> por <strong>documento</strong>. No cambia nombre, edad, genero ni distancia.</>
                : <>El campo <strong>documento</strong> es obligatorio. El genero debe ser <strong>M</strong> o <strong>F</strong>. El <strong>dorsal</strong> es opcional.</>}
            </p>
          </div>
        </>
      )}

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
                onChange={(event) => handleDocumentoChange(event.target.value)}
                disabled={formBusy}
                maxLength={8}
              />
            </div>
            <div className="manual-field manual-field-nombre">
              <label className="manual-label">
                Nombre completo *
                {dniLookupStatus === "loading" && <span className="dni-lookup-status"> consultando RENIEC...</span>}
                {dniLookupStatus === "found" && <span className="dni-lookup-status dni-lookup-ok"> RENIEC</span>}
                {dniLookupStatus === "not-found" && <span className="dni-lookup-status dni-lookup-warn"> no encontrado, ingresalo manualmente</span>}
                {dniLookupStatus === "error" && <span className="dni-lookup-status dni-lookup-warn"> sin conexion a RENIEC</span>}
              </label>
              <input
                className="manual-input"
                type="text"
                placeholder="Apellidos y nombres"
                value={form.nombre}
                onChange={(event) => setField("nombre", event.target.value)}
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
                onChange={(event) => setField("edad", event.target.value)}
                disabled={formBusy}
              />
            </div>
            <div className="manual-field">
              <label className="manual-label">Genero *</label>
              <select
                className="manual-input manual-input-short"
                value={form.genero}
                onChange={(event) => setField("genero", event.target.value)}
                disabled={formBusy}
              >
                <option value="M">M - Masculino</option>
                <option value="F">F - Femenino</option>
              </select>
            </div>
            <div className="manual-field">
              <label className="manual-label">Distancia *</label>
              <select
                className="manual-input manual-input-short"
                value={form.distancia}
                onChange={(event) => setField("distancia", event.target.value)}
                disabled={formBusy}
              >
                <option value="">-</option>
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
                onChange={(event) => setField("dorsal", event.target.value)}
                disabled={formBusy}
              />
            </div>
          </div>

          {formErrors.length > 0 && <div className="input-error-msg">{formErrors.join(" · ")}</div>}
          {formSuccess && <div className="manual-success">{formSuccess}</div>}

          <button className="btn btn-primary" onClick={handleManualAdd} disabled={formBusy}>
            {formBusy ? "Agregando..." : "+ Agregar participante"}
          </button>
        </div>
      )}

      {participants.length > 0 && mode !== "dorsales" && (
        <div className="preview-section">
          <div className="preview-header">
            <h3>Participantes registrados - {participants.length}</h3>
            <button className="btn btn-danger btn-sm" onClick={resetExcelState}>
              Limpiar vista
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
                  <th>Categoria</th>
                  <th>Genero</th>
                  <th>Distancia</th>
                </tr>
              </thead>
              <tbody>
                {participants.slice(0, 50).map((participant, index) => (
                  <tr key={(participant.documento || participant.id || index) + index}>
                    <td className="text-muted">{index + 1}</td>
                    <td className="acred-table-doc">{participant.documento}</td>
                    <td>
                      {participant.dorsal
                        ? <span className="dorsal-badge">{participant.dorsal}</span>
                        : <span className="text-muted">-</span>}
                    </td>
                    <td>{participant.nombre}</td>
                    <td>
                      <span className="category-tag">
                        {getCategory(
                          participant.edad,
                          participant.genero,
                          participant.distancia,
                          categories
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`gender-badge gender-${participant.genero?.toLowerCase()}`}>{participant.genero}</span>
                    </td>
                    <td><span className="category-tag">{participant.distancia}</span></td>
                  </tr>
                ))}
                {participants.length > 50 && (
                  <tr>
                    <td colSpan={7} className="text-muted text-center">
                      ... y {participants.length - 50} mas
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
