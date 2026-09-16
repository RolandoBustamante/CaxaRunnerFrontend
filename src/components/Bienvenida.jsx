import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "../api";
import { errorDialog } from "../utils/dialog";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const DEFAULT_FRAME = { zoom: 118, focusX: 50, focusY: 42 };
const NUDGE_STEP = 3;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export default function Bienvenida({ raceId }) {
  const [candidates, setCandidates] = useState([]);
  const [sinFoto, setSinFoto] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const [manualPhoto, setManualPhoto] = useState(null);
  const [showProcedencia, setShowProcedencia] = useState(true);
  const [html, setHtml] = useState("");
  const [rendering, setRendering] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_FRAME.zoom);
  const [downloading, setDownloading] = useState(false);
  const [scale, setScale] = useState(0.34);

  // El encuadre vive en un ref: lo mueve el iframe, no React.
  const frameRef = useRef({ ...DEFAULT_FRAME });
  const iframeRef = useRef(null);
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api
      .getWelcomeParticipants(raceId)
      .then((data) => {
        if (cancelled) return;
        setCandidates(data.participants || []);
        setSinFoto(data.sinFoto || 0);
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

  const postToCard = (message) => iframeRef.current?.contentWindow?.postMessage(message, "*");

  const visibles = useMemo(
    () => (showAll ? candidates : candidates.filter((c) => c.hasPhoto)),
    [candidates, showAll]
  );

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return visibles;
    return visibles.filter(
      (c) =>
        normalize(c.nombre).includes(needle) ||
        String(c.documento || "").includes(needle) ||
        String(c.dorsal || "").includes(needle)
    );
  }, [visibles, query]);

  const loadPreview = useCallback(
    async (participant, frame, photo, conProcedencia) => {
      if (!participant.hasPhoto && !photo) {
        setHtml("");
        return;
      }
      setRendering(true);
      try {
        const data = await api.renderWelcomeCard(
          { participantId: participant.id, raceId, showProcedencia: conProcedencia, ...frame },
          photo
        );
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
    setManualPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    frameRef.current = { ...DEFAULT_FRAME };
    setZoom(DEFAULT_FRAME.zoom);
    loadPreview(participant, DEFAULT_FRAME, null, showProcedencia);
  };

  const handleManualPhoto = (file) => {
    if (!file || !selected) return;
    setManualPhoto(file);
    frameRef.current = { ...DEFAULT_FRAME };
    setZoom(DEFAULT_FRAME.zoom);
    loadPreview(selected, DEFAULT_FRAME, file, showProcedencia);
  };

  // Toggles y reinicio se resuelven dentro del iframe: no hay que re-subir la foto manual.
  const handleProcedencia = (value) => {
    setShowProcedencia(value);
    postToCard({ type: "welcome-procedencia", show: value });
  };

  const handleZoom = (value) => {
    setZoom(value);
    frameRef.current = { ...frameRef.current, zoom: value };
    postToCard({ type: "welcome-zoom", zoom: value });
  };

  const handleNudge = (dx, dy) => postToCard({ type: "welcome-nudge", dx: dx * NUDGE_STEP, dy: dy * NUDGE_STEP });

  const handleReset = () => {
    if (!selected) return;
    frameRef.current = { ...DEFAULT_FRAME };
    setZoom(DEFAULT_FRAME.zoom);
    postToCard({ type: "welcome-reset", ...DEFAULT_FRAME });
  };

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const { blob, fileName } = await api.downloadWelcomeCard(
        {
          participantId: selected.id,
          raceId,
          nombre: selected.nombre,
          showProcedencia,
          ...frameRef.current,
        },
        manualPhoto
      );
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

  const necesitaFoto = Boolean(selected && !selected.hasPhoto && !manualPhoto);

  return (
    <div className="welcome-tab">
      <div className="section-header">
        <h2>Tarjetas de bienvenida</h2>
        <p className="text-muted">
          Inscritos aprobados en orden de inscripción.
          {sinFoto > 0 && ` ${sinFoto} sin foto utilizable (podés subirle una a mano).`}
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

          <label className="welcome-check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            <span>Mostrar también los que no tienen foto</span>
          </label>

          {loading && <p className="text-muted">Cargando inscritos…</p>}
          {loadError && <p className="welcome-error">{loadError}</p>}
          {!loading && !loadError && filtered.length === 0 && (
            <div className="empty-state">
              {candidates.length === 0
                ? "Todavía no hay inscripciones aprobadas en esta carrera."
                : "Sin resultados para esa búsqueda."}
            </div>
          )}

          <ul className="welcome-candidates">
            {filtered.map((participant, index) => (
              <li key={participant.id}>
                <button
                  type="button"
                  className={`welcome-candidate ${selected?.id === participant.id ? "is-active" : ""}`}
                  onClick={() => handleSelect(participant)}
                >
                  <span className="welcome-candidate-name">
                    <span className="welcome-candidate-order">{index + 1}.</span> {participant.nombre}
                    {!participant.hasPhoto && <span className="welcome-tag">sin foto</span>}
                  </span>
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
                {necesitaFoto ? (
                  <div className="empty-state">
                    {selected.nombre} no tiene foto en el sistema. Subí una para armar su tarjeta.
                  </div>
                ) : (
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
                )}
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
                    disabled={necesitaFoto}
                  />
                </label>

                <label className="welcome-check">
                  <input
                    type="checkbox"
                    checked={showProcedencia}
                    onChange={(e) => handleProcedencia(e.target.checked)}
                  />
                  <span>Mostrar procedencia</span>
                </label>

                <label className="welcome-file">
                  <span>{manualPhoto ? `Foto manual: ${manualPhoto.name}` : "Subir otra foto"}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleManualPhoto(e.target.files?.[0])}
                  />
                </label>

                <div className="welcome-nudge">
                  <span>Mover la foto</span>
                  <div className="welcome-pad">
                    <button type="button" onClick={() => handleNudge(0, -1)} disabled={necesitaFoto} title="Arriba">↑</button>
                    <button type="button" onClick={() => handleNudge(-1, 0)} disabled={necesitaFoto} title="Izquierda">←</button>
                    <button type="button" onClick={() => handleNudge(1, 0)} disabled={necesitaFoto} title="Derecha">→</button>
                    <button type="button" onClick={() => handleNudge(0, 1)} disabled={necesitaFoto} title="Abajo">↓</button>
                  </div>
                </div>

                <p className="text-muted welcome-hint">
                  También podés arrastrar la foto dentro del círculo.
                </p>

                <div className="welcome-actions">
                  <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={necesitaFoto}>
                    Reiniciar encuadre
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDownload}
                    disabled={downloading || rendering || necesitaFoto}
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
