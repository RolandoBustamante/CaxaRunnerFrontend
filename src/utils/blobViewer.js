export function openBlobViewer(blob, title = "Archivo") {
  const url = URL.createObjectURL(blob);
  const viewer = window.open("", "_blank", "noopener,noreferrer");

  if (!viewer) {
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    return;
  }

  const type = String(blob?.type || "").toLowerCase();
  const safeTitle = String(title || "Archivo").replace(/[<>&"]/g, "");
  const canPreviewImage = type.startsWith("image/");
  const canPreviewPdf = type === "application/pdf";
  const preview = canPreviewImage
    ? `<img src="${url}" alt="${safeTitle}" />`
    : canPreviewPdf
      ? `<iframe src="${url}" title="${safeTitle}"></iframe>`
      : `<div class="fallback">No se pudo previsualizar este archivo. Usa descargar para abrirlo.</div>`;

  viewer.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
        <style>
          html, body { margin: 0; min-height: 100%; background: #f6f8fc; color: #111827; font-family: system-ui, sans-serif; }
          body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
          .viewer { width: min(100%, 1080px); display: grid; gap: 16px; }
          .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
          a { border: 1px solid #acc7ff; border-radius: 6px; background: #fff; color: #003f8f; font-weight: 800; padding: 10px 14px; text-decoration: none; }
          img, iframe { display: block; width: 100%; max-height: 82vh; margin: 0 auto; background: white; border: 1px solid #d7dfef; border-radius: 8px; }
          img { max-width: 100%; width: auto; object-fit: contain; }
          iframe { height: 82vh; }
          .fallback { padding: 20px; background: white; border: 1px solid #d7dfef; border-radius: 8px; }
        </style>
      </head>
      <body>
        <main class="viewer">
          <div class="toolbar">
            <strong>${safeTitle}</strong>
            <a href="${url}" download>Descargar</a>
          </div>
          ${preview}
        </main>
      </body>
    </html>
  `);
  viewer.document.close();
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}
