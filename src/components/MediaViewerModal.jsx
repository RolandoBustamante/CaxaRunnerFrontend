import { useEffect, useMemo } from "react";

export default function MediaViewerModal({ file, onClose }) {
  const url = useMemo(() => (file?.blob ? URL.createObjectURL(file.blob) : ""), [file?.blob]);

  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose?.();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!file || !url) return null;

  const type = String(file.blob?.type || "").toLowerCase();
  const title = file.title || file.fileName || "Archivo";
  const fileName = file.fileName || title;
  const isImage = type.startsWith("image/");
  const isPdf = type === "application/pdf";

  return (
    <div className="app-dialog-backdrop media-viewer-backdrop" onClick={onClose}>
      <div className="app-dialog media-viewer-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="app-dialog-header media-viewer-header">
          <div>
            <span className="media-viewer-kicker">Vista previa</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="app-dialog-close" onClick={onClose} aria-label="Cerrar">
            x
          </button>
        </div>

        <div className="media-viewer-body">
          {isImage && <img src={url} alt={title} />}
          {isPdf && <iframe src={url} title={title} />}
          {!isImage && !isPdf && (
            <div className="media-viewer-fallback">
              No se pudo previsualizar este archivo. Puedes descargarlo para abrirlo.
            </div>
          )}
        </div>

        <div className="app-dialog-actions media-viewer-actions">
          <a className="btn btn-secondary" href={url} download={fileName}>
            Descargar
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
