const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.85;
const MIN_COMPRESS_SIZE_BYTES = 700 * 1024;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo comprimir la imagen"));
    }, type, quality);
  });
}

export async function compressImageFile(file, options = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) return file;
  if (file.size < (options.minSizeBytes || MIN_COMPRESS_SIZE_BYTES)) return file;

  const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const quality = options.quality || DEFAULT_QUALITY;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (blob.size >= file.size) return file;

  const fileName = String(file.name || "foto.jpg").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
  return new File([blob], fileName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
