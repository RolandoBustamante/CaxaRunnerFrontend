import { formatTime } from "../utils/categories";

const PODIUM = [
  { icon: "🥇", label: "1°", className: "podium-gold" },
  { icon: "🥈", label: "2°", className: "podium-silver" },
  { icon: "🥉", label: "3°", className: "podium-bronze" },
];

function GenderPodium({ title, finishers }) {
  if (finishers.length === 0) return null;
  return (
    <div className="absolute-gender-group">
      <h4 className="absolute-gender-title">{title}</h4>
      <div className="podium-row">
        {finishers.map((f, i) => {
          const style = PODIUM[i] || { icon: "•", label: `${f.genderPosition ?? i + 1}°`, className: "podium-bronze" };
          return (
            <div key={f.dorsal} className={`podium-card ${style.className}`}>
              <div className="podium-icon">{style.icon}</div>
              <div className="podium-position">{style.label}</div>
              <div className="podium-dorsal">#{f.dorsal}</div>
              <div className="podium-athlete-name">{f.participant?.nombre ?? "—"}</div>
              <div className="podium-time">{formatTime(f.elapsedMs)}</div>
              <div className="podium-overall">Gral. #{f.overallPosition ?? f.position}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AbsoluteWinners({ distance, byGender }) {
  const hasAny = byGender.M.length > 0 || byGender.F.length > 0;
  if (!hasAny) return null;

  return (
    <div className="absolute-winners">
      <div className="absolute-winners-header">
        <span className="absolute-winners-badge">{distance}</span>
        <h3 className="absolute-winners-title">Ganadores Absolutos</h3>
      </div>
      <GenderPodium title="Masculino" finishers={byGender.M} />
      <GenderPodium title="Femenino" finishers={byGender.F} />
    </div>
  );
}
