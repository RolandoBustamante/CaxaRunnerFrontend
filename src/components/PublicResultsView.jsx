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

function ImageDownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="certificate-action-icon">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.7" fill="currentColor" />
      <path d="M6.5 16l3.8-3.6 2.8 2.4 2.9-3 2.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CertificatePreview({ race, certificate }) {
  const isNoTimeCertificate = Boolean(certificate?.noTime);
  return (
    <div className="certificate-preview-shell">
      <div className="certificate-preview">
        <div className="certificate-watermark">
          <img src="/Cajamarcar Runners Logo sin fondo-01.png" alt="" />
        </div>
        <div className="certificate-header">
          <div>
            <img className="certificate-logo" src="/crlogo-horizontal.svg" alt="Cajamarca Runners" />
            <div className="certificate-race">{race?.name}</div>
          </div>
          <div className="certificate-seal">
            <div className="certificate-seal-title">Certificado de Finisher</div>
            <div className="certificate-seal-sub">Comité organizador</div>
          </div>
        </div>
        <div className="certificate-title">CERTIFICADO</div>
        <p className="certificate-copy">
          {isNoTimeCertificate ? "El comite organizador certifica una llegada validada sin tiempo oficial." : "El comite organizador certifica que el corredor(a) concluyo oficialmente la prueba."}
        </p>
        <div className="certificate-name">{certificate.name}</div>
        <p className="certificate-copy certificate-copy-strong">
          {isNoTimeCertificate ? (<>Se certifica la llegada validada a la distancia de <strong>{certificate.distance}</strong>, con registro confirmado <strong>sin tiempo oficial</strong>.</>) : (<>Concluyo oficialmente la distancia de <strong>{certificate.distance}</strong>, ocupando el puesto <strong>{certificate.position}</strong> en la clasificacion general de su distancia, con un tiempo oficial de <strong>{formatCertificateTime(certificate.timeMs)}</strong>.</>)}
        </p>
        <div className="certificate-grid">
          <div className="certificate-metric">
            <div className="certificate-metric-value">{formatCertificateTime(certificate.timeMs)}</div>
            <div className="certificate-metric-label">Tiempo oficial</div>
          </div>
          <div className="certificate-metric">
            <div className="certificate-metric-value">{certificate.position}</div>
            <div className="certificate-metric-label">Puesto general por distancia</div>
          </div>
          <div className="certificate-metric">
            <div className="certificate-metric-value">{certificate.dorsal}</div>
            <div className="certificate-metric-label">Dorsal</div>
          </div>
        </div>
        <div className="certificate-secondary-meta">
          <span><strong>Puesto por género:</strong> {certificate.genderPosition ?? "-"}</span>
          <span><strong>Categoría:</strong> {certificate.categoryName ?? "-"}</span>
          <span><strong>Puesto en categoría:</strong> {certificate.categoryPosition ?? "-"}</span>
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
  const [distanceTab, setDistanceTab] = useState("TODAS");
  const [selectedResult, setSelectedResult] = useState(null);
  const [documentInput, setDocumentInput] = useState("");
  const [validationError, setValidationError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [certificate, setCertificate] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);

  useEffect(() => {
    async function fetchResults() {
      try {
        const data = await api.getPublicResultsBySlug(slug);
        setState(data);
        setNoticeAccepted(!String(data?.race?.publicNotice || "").trim());
        setError(null);
      } catch (fetchError) {
        setError(fetchError.message);
      }
    }

    fetchResults();
  }, [slug]);

  const availableDistances = useMemo(() => {
    const results = state?.results || [];
    return [
      "TODAS",
      ...Array.from(new Set(
        results
          .map((result) => String(result.distance || "").trim().toUpperCase())
          .filter(Boolean)
      )).sort(),
    ];
  }, [state?.results]);

  const filteredResults = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const results = (state?.results || []).filter((result) => (
      distanceTab === "TODAS" ||
      String(result.distance || "").trim().toUpperCase() === distanceTab
    ));

    if (!normalized) {
      return results.filter((result) => !result.noTime);
    }

    return results.filter((result) => {
      const matches = (
        String(result.dorsal || "").toLowerCase().includes(normalized) ||
        String(result.certificateDorsal || "").toLowerCase().includes(normalized) ||
        String(result.name || "").toLowerCase().includes(normalized)
      );
      if (!matches) return false;
      return true;
    });
  }, [distanceTab, search, state?.results]);

  const publicNotice = String(state?.race?.publicNotice || "").trim();
  const certificatesEnabled = state?.race?.certificatesEnabled !== false;
  const showDorsalPublic = state?.race?.showDorsalPublic !== false;

  async function handleValidateCertificate() {
    const dorsal = selectedResult?.certificateDorsal || selectedResult?.dorsal;
    if (!dorsal || !documentInput.trim()) return;

    setValidating(true);
    setValidationError(null);
    try {
      const data = await api.validateCertificateAccess(slug, dorsal, documentInput.trim());
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
    setDownloadingImage(false);
  }

  async function handleDownloadCertificate() {
    const dorsal = selectedResult?.certificateDorsal || selectedResult?.dorsal;
    if (!dorsal || !documentInput.trim()) return;

    setDownloading(true);
    setValidationError(null);
    try {
      const { blob, fileName } = await api.downloadCertificatePdf(slug, dorsal, documentInput.trim());
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

  async function handleDownloadCertificateImage() {
    const dorsal = selectedResult?.certificateDorsal || selectedResult?.dorsal;
    if (!dorsal || !documentInput.trim()) return;

    setDownloadingImage(true);
    setValidationError(null);
    try {
      const { blob, fileName } = await api.downloadCertificateImage(slug, dorsal, documentInput.trim());
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
      setDownloadingImage(false);
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
          {certificatesEnabled && (
            <div className="public-results-note">
              Usa el boton Ver para validar tu documento, ver el certificado y luego descargarlo en PDF o imagen.
            </div>
          )}

          <div className={`public-results-content ${!noticeAccepted && publicNotice ? "public-results-content-blocked" : ""}`}>
            <div className="results-searchbar">
              <input
                className="results-search-input"
                type="text"
                  placeholder={showDorsalPublic ? "Buscar por nombre o dorsal..." : "Buscar por nombre..."}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button type="button" className="results-search-clear" onClick={() => setSearch("")}>
                  Limpiar
                </button>
              )}
            </div>

            <div className="view-toggle">
              {availableDistances.map((distance) => (
                <button
                  key={distance}
                  type="button"
                  className={`btn btn-tab ${distanceTab === distance ? "btn-tab-active" : ""}`}
                  onClick={() => setDistanceTab(distance)}
                >
                  {distance === "TODAS" ? "Todas" : distance}
                </button>
              ))}
            </div>

            <div className="table-wrapper">
              <table className="data-table public-results-table">
                <thead>
                  <tr>
                    <th>Pos.</th>
                    {showDorsalPublic && <th>Dorsal</th>}
                    <th>Nombre</th>
                    <th>Tiempo</th>
                    {certificatesEnabled && <th>Ver</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result) => (
                    <tr
                      key={result.id ?? `${result.dorsal}-${result.position ?? "dq"}`}
                      className={`public-result-row ${(result.disqualified || result.noTime) ? "public-result-row-disabled" : ""}`}
                    >
                      <td>
                        <span className={`position-badge ${(result.disqualified || result.noTime) ? "dq-badge" : ""}`}>
                          {result.noTime ? "ST" : result.disqualified ? "DQ" : result.position}
                        </span>
                      </td>
                      {showDorsalPublic && <td><span className="dorsal-badge">{result.dorsal}</span></td>}
                      <td className="name-cell">
                        {result.name}
                        {result.disqualified && result.dqReason && (
                          <span className="dq-reason-inline"> - {result.dqReason}</span>
                        )}
                      </td>
                      <td className="time-cell public-results-time">{result.noTime ? "Sin tiempo" : formatCertificateTime(result.timeMs)}</td>
                      {certificatesEnabled && (
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
                            Ver
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={3 + (showDorsalPublic ? 1 : 0) + (certificatesEnabled ? 1 : 0)} className="results-empty-filter">
                        No hay resultados para esta busqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!error && !noticeAccepted && publicNotice && (
        <div className="app-dialog-backdrop">
          <div className="app-dialog public-notice-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="app-dialog-header">
              <h3>Comunicado oficial</h3>
            </div>
            <div className="app-dialog-body">
              <p className="public-notice-copy">{publicNotice}</p>
            </div>
            <div className="app-dialog-actions">
              <button type="button" className="btn btn-primary" onClick={() => setNoticeAccepted(true)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {certificatesEnabled && selectedResult && (
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
                    Para descargar el certificado, ingresa tu número de documento.
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
                    className="btn btn-secondary certificate-share-btn"
                    onClick={handleDownloadCertificateImage}
                    disabled={downloadingImage}
                    title="Descargar imagen"
                  >
                    <ImageDownloadIcon />
                    {downloadingImage ? "Generando imagen..." : "Descargar imagen"}
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

