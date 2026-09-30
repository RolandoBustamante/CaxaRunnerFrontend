import { getCategoryName, DEFAULT_CATEGORIES } from "../utils/categories";

export const EMPTY_FILTERS = { q: "", categoria: "", genero: "", distancia: "" };

const norm = (value) => String(value || "").trim().toUpperCase();

export function matchesFilters(p, filters, categories = DEFAULT_CATEGORIES) {
  const q = filters.q.trim().toLowerCase();
  if (q && !`${p.nombre || ""} ${p.documento || ""}`.toLowerCase().includes(q)) return false;
  if (filters.genero && norm(p.genero) !== filters.genero) return false;
  if (filters.distancia && norm(p.distancia) !== filters.distancia) return false;
  if (filters.categoria && getCategoryName(p.edad, p.genero, p.distancia, categories) !== filters.categoria) return false;
  return true;
}

// ponytail: si la carrera no tiene distancias configuradas, se deducen de los datos
export function distanceOptions(raceDistances, items) {
  const fromRace = [...new Set((raceDistances || []).map(norm).filter(Boolean))];
  if (fromRace.length) return fromRace;
  return [...new Set((items || []).map((p) => norm(p.distancia)).filter(Boolean))];
}

export default function ParticipantFilters({ filters, onChange, categories = DEFAULT_CATEGORIES, distances = [] }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const categoryNames = [...new Set(categories.map((c) => c.name))];
  const hasFilters = filters.q || filters.categoria || filters.genero || filters.distancia;

  return (
    <div className="participant-filters">
      <input
        className="participant-filters-input"
        type="text"
        placeholder="Nombre o documento..."
        value={filters.q}
        onChange={(e) => set({ q: e.target.value })}
      />
      <select className="participant-filters-select" value={filters.categoria} onChange={(e) => set({ categoria: e.target.value })}>
        <option value="">Todas las categorías</option>
        {categoryNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <select className="participant-filters-select" value={filters.genero} onChange={(e) => set({ genero: e.target.value })}>
        <option value="">Ambos sexos</option>
        <option value="M">Masculino</option>
        <option value="F">Femenino</option>
      </select>
      <select className="participant-filters-select" value={filters.distancia} onChange={(e) => set({ distancia: e.target.value })}>
        <option value="">Todas las distancias</option>
        {distances.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      {hasFilters && (
        <button className="btn btn-secondary btn-sm" onClick={() => onChange(EMPTY_FILTERS)}>Limpiar</button>
      )}
    </div>
  );
}
