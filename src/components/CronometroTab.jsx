import { formatTime } from "../utils/categories";

export default function CronometroTab({ raceClosed, finishers, elapsed }) {
  return (
    <div className="crono-tab">
      <div className={`crono-clock ${raceClosed ? "crono-clock-closed" : ""}`}>
        {formatTime(Math.max(0, elapsed ?? 0), true, true)}
      </div>
      <div className="crono-meta">
        <span className="crono-count">{finishers.length}</span>
        <span className="crono-count-label">atletas en meta</span>
      </div>
    </div>
  );
}
