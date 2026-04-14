import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { formatTime } from "../utils/categories";
import { formatRaceDate } from "../utils/dates";

function getResultsSlug() {
  const match = window.location.pathname.match(/^\/resultados\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function formatCertificateTime(value) {
  const elapsedMs = value?.timeMs ?? value;
  return formatTime(elapsedMs, true, true);
}

function CertificatePreview({ race, certificate }) {
  return (
    <div className="certificate-preview-shell">
      <div className="certificate-preview">
        <div className="certificate-watermark">
          <img src="/crlogo-horizontal.svg" alt="" />
        </div>
        <div className="certificate-header">
          <div>
            <img className="certificate-logo" src="/crlogo-horizontal.svg" alt="Cajamarca Runners" />
            <div className="certificate-race">{race?.name}</div>
          </div>
          <div className="certificate-seal">
            <div className="certificate-seal-title">Certificado de Finisher</div>
            <div className="certificate-seal-sub">Comite organizador</div>
          </div>
        </div>
        <div className="certificate-title">CERTIFICADO</div>
        <p className="certificate-copy">
          El comite organizador certifica que el corredor(a) concluyo oficialmente la prueba.
        </p>
        <div className="certificate-name">{certificate.name}</div>
        <p className="certificate-copy certificate-copy-strong">
          Concluyo oficialmente la distancia de <strong>{certificate.distance}</strong>, ocupando el puesto <strong>{certificate.position}</strong> del orden general, con un tiempo oficial de <strong>{formatCertificateTime(certificate.timeMs)}</strong>.
        </p>
        <div className="certificate-grid">
          <div className="certificate-metric">
            <div className="certificate-metric-value">{formatCertificateTime(certificate.timeMs)}</div>
            <div className="certificate-metric-label">Tiempo oficial</div>
          </div>
          <div className="certificate-metric">
            <div className="certificate-metric-value">{certificate.position}</div>
            <div className="certificate-metric-label">Puesto general</div>
          </div>
          <div className="certificate-metric">
            <div className="certificate-metric-value">{certificate.dorsal}</div>
            <div className="certificate-metric-label">Dorsal</div>
          </div>
        </div>
        <div className="certificate-secondary-meta">
          <span><strong>Puesto por sexo:</strong> {certificate.genderPosition ?? "-"}</span>
          <span><strong>Categoria:</strong> {certificate.categoryName ?? "-"}</span>
          <span><strong>Puesto en categoria:</strong> {certificate.categoryPosition ?? "-"}</span>
        </div>
        <div className="certificate-footer-meta">
          <span><strong>Fecha del evento:</strong> {race?.eventDate ? formatRaceDate(race.eventDate) : "-"}</span>
          <span><strong>Codigo:</strong> {certificate.certificateCode}</span>
        </div>
      </div>
    </div>
  );
}

export default function PublicResultsView() {
  const slug = getResultsSlug();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedResult, setSelectedResult] = useState(null);
  const [documentInput, setDocumentInput] = useState("");
  const [validationError, setValidationError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [certificate, setCertificate] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchResults() {
      try {
        const data = await api.getPublicResultsBySlug(slug);
        setState(data);
        setError(null);
      } catch (fetchError) {
        setError(fetchError.message);
      }
    }

    fetchResults();
  }, [slug]);

  const filteredResults = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return state?.results || [];

    return (state?.results || []).filter((result) => (
      String(result.dorsal || "").toLowerCase().includes(normalized) ||
      String(result.name || "").toLowerCase().includes(normalized)
    ));
  }, [search, state?.results]);

  async function handleValidateCertificate() {
    if (!selectedResult?.dorsal || !documentInput.trim()) return;

    setValidating(true);
    setValidationError(null);
    try {
      const data = await api.validateCertificateAccess(slug, selectedResult.dorsal, documentInput.trim());
      setCertificate(data.certificate);
    } catch (validationFetchError) {
      setValidationError(validationFetchError.message);
    } finally {
      setValidating(false);
    }
  }

  function closeDialog() {
    setSelectedResult(null);
    setDocumentInput("");
    setValidationError(null);
    setValidating(false);
    setCertificate(null);
    setDownloading(false);
  }

  async function handleDownloadCertificate() {
    if (!selectedResult?.dorsal || !documentInput.trim()) return;

    setDownloading(true);
    setValidationError(null);
    try {
      const { blob, fileName } = await api.downloadCertificatePdf(slug, selectedResult.dorsal, documentInput.trim());
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (downloadError) {
      setValidationError(downloadError.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="public-view public-results-view">
      <div className="public-logo-wrap">
        <img src="/crlogo-horizontal.svg" alt="Cajamarca Runners" className="public-logo" />
      </div>

      <div className="public-clock-wrap">
        <div className="public-race-name">{state?.race?.name || "Resultados oficiales"}</div>
        <div className="public-sub">Orden de merito</div>
      </div>

      {error && (
        <div className="public-top">
          <h3 className="public-top-title">Error</h3>
          <div className="public-sub">{error}</div>
        </div>
      )}

      {!error && (
        <div className="public-results-panel">
          <div className="public-results-note">
            Usa el boton PDF para validar tu documento y descargar el certificado de finisher.
          </div>

          <div className="results-searchbar">
            <input
              className="results-search-input"
              type="text"
              placeholder="Buscar por nombre o dorsal..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" className="results-search-clear" onClick={() => setSearch("")}>
                Limpiar
              </button>
            )}
          </div>

          <div className="table-wrapper">
            <table className="data-table public-results-table">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Dorsal</th>
                  <th>Nombre</th>
                  <th>Tiempo</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result) => (
                  <tr
                    key={result.id ?? `${result.dorsal}-${result.position ?? "dq"}`}
                    className={`public-result-row ${result.disqualified ? "public-result-row-disabled" : ""}`}
                  >
                    <td>
                      <span className={`position-badge ${result.disqualified ? "dq-badge" : ""}`}>
                        {result.disqualified ? "DQ" : result.position}
                      </span>
                    </td>
                    <td><span className="dorsal-badge">{result.dorsal}</span></td>
                    <td className="name-cell">
                      {result.name}
                      {result.disqualified && result.dqReason && (
                        <span className="dq-reason-inline"> - {result.dqReason}</span>
                      )}
                    </td>
                    <td className="time-cell public-results-time">{formatCertificateTime(result.timeMs)}</td>
                    <td className="public-results-action-cell">
                      <button
                        type="button"
                        className="public-pdf-btn"
                        title={result.disqualified ? "Certificado no disponible" : "Descargar certificado"}
                        disabled={result.disqualified}
                        onClick={() => {
                          setSelectedResult(result);
                          setDocumentInput("");
                          setValidationError(null);
                          setCertificate(null);
                        }}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={5} className="results-empty-filter">
                      No hay resultados para esta busqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedResult && (
        <div className="app-dialog-backdrop" onClick={closeDialog}>
          <div className="app-dialog certificate-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="app-dialog-header">
              <h3>Certificado de finisher</h3>
              <button type="button" className="app-dialog-close" onClick={closeDialog}>X</button>
            </div>

            {!certificate ? (
              <>
                <div className="app-dialog-body">
                  <p className="certificate-help">
                    Para descargar el certificado del dorsal <strong>{selectedResult.dorsal}</strong>, ingresa tu numero de documento.
                    Puede ser DNI, pasaporte u otro documento registrado al inscribirte.
                  </p>
                  <label className="login-label" htmlFor="certificate-document">Documento</label>
                  <input
                    id="certificate-document"
                    className="login-input"
                    type="text"
                    value={documentInput}
                    onChange={(event) => setDocumentInput(event.target.value)}
                    placeholder="Ingresa tu documento"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleValidateCertificate();
                      }
                    }}
                  />
                  {validationError && <div className="login-error">{validationError}</div>}
                </div>

                <div className="app-dialog-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleValidateCertificate}
                    disabled={validating || !documentInput.trim()}
                  >
                    {validating ? "Validando..." : "Validar"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="app-dialog-body">
                  <CertificatePreview race={state?.race} certificate={certificate} />
                  {validationError && <div className="login-error">{validationError}</div>}
                </div>
                <div className="app-dialog-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeDialog}>
                    Cerrar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDownloadCertificate}
                    disabled={downloading}
                  >
                    {downloading ? "Generando PDF..." : "Descargar certificado"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
