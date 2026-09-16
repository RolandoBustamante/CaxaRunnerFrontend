import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "../api";
import { errorDialog } from "../utils/dialog";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const DEFAULT_FRAME = { zoom: 118, focusX: 50, focusY: 42 };

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export default function Bienvenida({ raceId }) {
  const [candidates, setCandidates] = useState([]);
  const [descartadas, setDescartadas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [html, setHtml] = useState("");
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_FRAME.zoom);
  const [downloading, setDownloading] = useState(false);
  const [scale, setScale] = useState(0.34);

  // El encuadre vive en un ref: lo mueve el iframe, no React.
  const frameRef = useRef({ ...DEFAULT_FRAME });
  const iframeRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api
      .getWelcomeParticipants(raceId)
      .then((data) => {
        if (cancelled) return;
        setCandidates(data.participants || []);
        setDescartadas(data.descartadas || 0);
      })
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  // La tarjeta mide 1080px: se escala para caber en el panel.
  useEffect(() => {
    const fit = () => {
      const width = stageRef.current?.clientWidth;
      if (width) setScale(Math.min(0.5, width / CARD_WIDTH));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [html]);

  // El encuadre se arrastra dentro del iframe y viaja de vuelta por postMessage.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type !== "welcome-frame") return;
      frameRef.current = {
        zoom: event.data.zoom,
        focusX: event.data.focusX,
        focusY: event.data.focusY,
      };
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return candidates;
    return candidates.filter(
      (c) =>
        normalize(c.nombre).includes(needle) ||
        String(c.documento || "").includes(needle) ||
        String(c.dorsal || "").includes(needle)
    );
  }, [candidates, query]);

  const loadPreview = useCallback(
    async (participant, frame) => {
      setRendering(true);
      try {
        const data = await api.renderWelcomeCard({ participantId: participant.id, raceId, ...frame });
        setHtml(data.html);
      } catch (err) {
        setHtml("");
        errorDialog({ title: "No se pudo generar la tarjeta", text: err.message });
      } finally {
        setRendering(false);
      }
    },
    [raceId]
  );

  const handleSelect = (participant) => {
    setSelected(participant);
    frameRef.current = { ...DEFAULT_FRAME };
    setZoom(DEFAULT_FRAME.zoom);
    loadPreview(participant, DEFAULT_FRAME);
  };

  const handleZoom = (value) => {
    setZoom(value);
    frameRef.current = { ...frameRef.current, zoom: value };
    iframeRef.current?.contentWindow?.postMessage({ type: "welcome-zoom", zoom: value }, "*");
  };

  const handleReset = () => {
    if (!selected) return;
    frameRef.current = { ...DEFAULT_FRAME };
    setZoom(DEFAULT_FRAME.zoom);
    loadPreview(selected, DEFAULT_FRAME);
  };

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const { blob, fileName } = await api.downloadWelcomeCard({
        participantId: selected.id,
        raceId,
        nombre: selected.nombre,
        ...frameRef.current,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      errorDialog({ title: "No se pudo generar la tarjeta", text: err.message });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="welcome-tab">
      <div className="section-header">
        <h2>Tarjetas de bienvenida</h2>
        <p className="text-muted">
          Solo aparecen los inscritos aprobados cuya foto se pudo abrir correctamente.
          {descartadas > 0 && ` ${descartadas} quedaron fuera por foto faltante o dañada.`}
        </p>
      </div>

      <div className="welcome-layout">
        <aside className="welcome-list">
          <input
            type="search"
            className="welcome-search"
            placeholder="Buscar por nombre, documento o dorsal"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {loading && <p className="text-muted">Cargando participantes…</p>}
          {loadError && <p className="welcome-error">{loadError}</p>}
          {!loading && !loadError && filtered.length === 0 && (
            <div className="empty-state">
              {candidates.length === 0
                ? "Ningún inscrito aprobado tiene foto válida todavía."
                : "Sin resultados para esa búsqueda."}
            </div>
          )}

          <ul className="welcome-candidates">
            {filtered.map((participant) => (
              <li key={participant.id}>
                <button
                  type="button"
                  className={`welcome-candidate ${selected?.id === participant.id ? "is-active" : ""}`}
                  onClick={() => handleSelect(participant)}
                >
                  <span className="welcome-candidate-name">{participant.nombre}</span>
                  <span className="welcome-candidate-meta">
                    {participant.distancia}
                    {participant.dorsal ? ` · Dorsal ${participant.dorsal}` : ""} · {participant.documento}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="welcome-preview">
          {!selected ? (
            <div className="empty-state">Elegí un participante para armar su tarjeta.</div>
          ) : (
            <>
              <div className="welcome-stage" ref={stageRef}>
                <div
                  className="welcome-stage-inner"
                  style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale }}
                >
                  {html && (
                    <iframe
                      ref={iframeRef}
                      title="Vista previa de la tarjeta"
                      srcDoc={html}
                      style={{
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                      }}
                    />
                  )}
                  {rendering && <div className="welcome-stage-loading">Generando…</div>}
                </div>
              </div>

              <div className="welcome-controls">
                <label className="welcome-zoom">
                  <span>Zoom de la foto</span>
                  <input
                    type="range"
                    min="100"
                    max="320"
                    value={zoom}
                    onChange={(e) => handleZoom(Number(e.target.value))}
                  />
                </label>
                <p className="text-muted welcome-hint">
                  Arrastrá la foto dentro del círculo para encuadrarla.
                </p>
                <div className="welcome-actions">
                  <button type="button" className="btn btn-secondary" onClick={handleReset}>
                    Reiniciar encuadre
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDownload}
                    disabled={downloading || rendering}
                  >
                    {downloading ? "Generando PNG…" : "Descargar PNG"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
