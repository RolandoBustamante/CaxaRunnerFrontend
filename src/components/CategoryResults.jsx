import { formatTime, getCategory, DEFAULT_CATEGORIES } from "../utils/categories";

const PODIUM_STYLES = [
  { label: "1", className: "podium-gold", icon: "1" },
  { label: "2", className: "podium-silver", icon: "2" },
  { label: "3", className: "podium-bronze", icon: "3" },
];

export default function CategoryResults({
  categoryName,
  finishers,
  participants,
  categories = DEFAULT_CATEGORIES,
}) {
  const participantMap = {};
  for (const participant of participants) {
    participantMap[String(participant.dorsal).trim()] = participant;
  }

  const top3 = finishers.slice(0, 3);
  const rest = finishers.slice(3);

  return (
    <div className="category-card">
      <div className="category-header">
        <h3 className="category-name">{categoryName}</h3>
        <span className="badge badge-muted">
          {finishers.length} finisher{finishers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {top3.length > 0 && (
        <div className="podium-row">
          {top3.map((finisher, index) => {
            const participant = participantMap[String(finisher.dorsal).trim()];
            const style = PODIUM_STYLES[index];
            return (
              <div key={finisher.dorsal} className={`podium-card ${style.className}`}>
                <div className="podium-icon">{style.icon}</div>
                <div className="podium-position">{style.label}</div>
                <div className="podium-dorsal">#{finisher.dorsal}</div>
                <div className="podium-athlete-name">{participant ? participant.nombre : "-"}</div>
                <div className="podium-time">{formatTime(finisher.elapsedMs)}</div>
                <div className="podium-overall">Gral. #{finisher.overallPosition}</div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="table-wrapper" style={{ marginTop: "0.75rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cat.</th>
                <th>Gral.</th>
                <th>Dorsal</th>
                <th>Nombre</th>
                <th>Categoria</th>
                <th>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((finisher) => {
                const participant = participantMap[String(finisher.dorsal).trim()];
                const category = participant
                  ? getCategory(participant.edad, participant.genero, participant.distancia, categories)
                  : "-";

                return (
                  <tr key={finisher.dorsal}>
                    <td><strong>{finisher.categoryPosition}</strong></td>
                    <td className="text-muted">{finisher.overallPosition}</td>
                    <td><span className="dorsal-badge">{finisher.dorsal}</span></td>
                    <td>{participant ? participant.nombre : "-"}</td>
                    <td><span className="category-tag">{category}</span></td>
                    <td className="time-cell">{formatTime(finisher.elapsedMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {finishers.length === 0 && (
        <p className="text-muted">No hay finishers en esta categoria.</p>
      )}
    </div>
  );
}
