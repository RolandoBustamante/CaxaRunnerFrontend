import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { formatTime } from "../utils/categories";

const POLL_INTERVAL = 2000;

export default function PublicView() {
  const [state, setState] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    async function fetchPublic() {
      try {
        const data = await api.getPublic();
        setState(data);
      } catch {}
    }
    fetchPublic();
    pollRef.current = setInterval(fetchPublic, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!state?.raceStarted || !state?.raceStartTime || state?.raceClosed) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - state.raceStartTime);
    }, 100);
    return () => clearInterval(interval);
  }, [state?.raceStarted, state?.raceStartTime, state?.raceClosed]);

  const status = !state
    ? { label: "Conectando...", sub: "" }
    : !state.raceStarted
    ? { label: "En espera", sub: "La carrera aún no ha iniciado" }
    : state.raceClosed
    ? { label: "Carrera finalizada", sub: `${state.finishersCount} atletas en meta` }
    : { label: formatTime(elapsed), sub: `${state.finishersCount} atletas en meta` };

  return (
    <div className="public-view">
      <div className="public-logo-wrap">
        <img src="/crlogo-horizontal.svg" alt="Cajamarca Runners" className="public-logo" />
      </div>

      <div className="public-clock-wrap">
        <div className={`public-clock ${state?.raceClosed ? "public-clock-closed" : ""}`}>
          {status.label}
        </div>
        <div className="public-sub">{status.sub}</div>
      </div>

      {state?.raceStarted && state?.topFinishers?.length > 0 && (
        <div className="public-top">
          <h3 className="public-top-title">Primeros en meta</h3>
          <ol className="public-top-list">
            {state.topFinishers.slice(0, 5).map((f) => (
              <li key={f.dorsal} className="public-top-item">
                <span className="public-top-pos">#{f.position}</span>
                <span className="public-top-dorsal">{f.dorsal}</span>
                <span className="public-top-time">{formatTime(f.elapsedMs)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
