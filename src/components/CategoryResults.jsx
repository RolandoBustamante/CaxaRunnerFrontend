import { formatTime } from "../utils/categories";

const PODIUM_STYLES = [
  { label: "1°", className: "podium-gold", icon: "🥇" },
  { label: "2°", className: "podium-silver", icon: "🥈" },
  { label: "3°", className: "podium-bronze", icon: "🥉" },
];

export default function CategoryResults({ categoryName, finishers, participants }) {
  const participantMap = {};
  for (const p of participants) {
    participantMap[String(p.dorsal).trim()] = p;
  }

  const top3 = finishers.slice(0, 3);
  const rest = finishers.slice(3);

  return (
    <div className="category-card">
      <div className="category-header">
        <h3 className="category-name">{categoryName}</h3>
        <span className="badge badge-muted">{finishers.length} finisher{finishers.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="podium-row">
          {top3.map((f, i) => {
            const p = participantMap[String(f.dorsal).trim()];
            const style = PODIUM_STYLES[i];
            return (
              <div key={f.dorsal} className={`podium-card ${style.className}`}>
                <div className="podium-icon">{style.icon}</div>
                <div className="podium-position">{style.label}</div>
                <div className="podium-dorsal">#{f.dorsal}</div>
                <div className="podium-athlete-name">{p ? p.nombre : "—"}</div>
                <div className="podium-time">{formatTime(f.elapsedMs)}</div>
                <div className="podium-overall">Gral. #{f.overallPosition}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rest of finishers */}
      {rest.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: "0.75rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cat.</th>
                <th>Gral.</th>
                <th>Dorsal</th>
                <th>Nombre</th>
                <th>Edad</th>
                <th>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((f) => {
                const p = participantMap[String(f.dorsal).trim()];
                return (
                  <tr key={f.dorsal}>
                    <td><strong>{f.categoryPosition}</strong></td>
                    <td className="text-muted">{f.overallPosition}</td>
                    <td><span className="dorsal-badge">{f.dorsal}</span></td>
                    <td>{p ? p.nombre : "—"}</td>
                    <td className="text-muted">{p ? p.edad : "—"}</td>
                    <td className="time-cell">{formatTime(f.elapsedMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {finishers.length === 0 && (
        <p className="text-muted">No hay finishers en esta categoría.</p>
      )}
    </div>
  );
}
