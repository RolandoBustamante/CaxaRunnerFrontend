export function toDateInputValue(value) {
  if (!value) return "";
  const source = value instanceof Date ? value.toISOString() : String(value);
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function formatRaceDate(value, options = {}) {
  const dateValue = toDateInputValue(value);
  if (!dateValue) return "";

  const [year, month, day] = dateValue.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return normalized.toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  });
}
