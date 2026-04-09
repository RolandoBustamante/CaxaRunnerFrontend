import { useState, useEffect, useRef } from "react";
import { formatTime } from "../utils/categories";

export default function CronometroTab({ raceStartTime, raceEndTime, raceClosed, finishers }) {
  const [elapsed, setElapsed] = useState(0);
  const perfStartRef = useRef(null);

  useEffect(() => {
    if (!raceStartTime) return;
    perfStartRef.current = raceStartTime - performance.timeOrigin;

    // Si está cerrada, congelar — con o sin endTime
    if (raceClosed) {
      if (raceEndTime) setElapsed(raceEndTime - raceStartTime);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(performance.now() - perfStartRef.current);
    }, 10);
    return () => clearInterval(interval);
  }, [raceStartTime, raceEndTime, raceClosed]);

  return (
    <div className="crono-tab">
      <div className={`crono-clock ${raceClosed ? "crono-clock-closed" : ""}`}>
        {formatTime(elapsed, true, true)}
      </div>
      <div className="crono-meta">
        <span className="crono-count">{finishers.length}</span>
        <span className="crono-count-label">atletas en meta</span>
      </div>
    </div>
  );
}
