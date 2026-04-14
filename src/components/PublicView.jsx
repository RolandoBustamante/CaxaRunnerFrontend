import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { formatTime } from "../utils/categories";

const POLL_INTERVAL = 2000;

function getPublicSlug() {
  const match = window.location.pathname.match(/^\/timer\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function PublicView() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const serverOffsetRef = useRef(0);
  const slug = getPublicSlug();
  const raceDuration = state?.raceStartTime && state?.raceEndTime
    ? Math.max(0, state.raceEndTime - state.raceStartTime)
    : null;

  useEffect(() => {
    async function fetchPublic() {
      try {
        const requestStartedAt = Date.now();
        const data = slug ? await api.getPublicBySlug(slug) : await api.getPublic();
        const requestEndedAt = Date.now();
        if (typeof data.serverNow === "number") {
          const estimatedServerNow = data.serverNow + (requestEndedAt - requestStartedAt) / 2;
          serverOffsetRef.current = estimatedServerNow - requestEndedAt;
        }
        setState(data);
        setError(null);
      } catch (fetchError) {
        setError(fetchError.message);
      }
    }

    fetchPublic();
    pollRef.current = setInterval(fetchPublic, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [slug]);

  useEffect(() => {
    if (!state?.raceStarted || !state?.raceStartTime || state?.raceClosed) {
      setElapsed(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setElapsed(Math.max(0, Date.now() + serverOffsetRef.current - state.raceStartTime));
    }, 100);
    return () => clearInterval(interval);
  }, [state?.raceStarted, state?.raceStartTime, state?.raceClosed]);

  const status = !state
    ? { label: "Conectando...", sub: "", duration: null, closed: false }
    : !state.raceStarted
      ? { label: "En espera", sub: "La carrera aun no ha iniciado", duration: null, closed: false }
      : state.raceClosed
        ? {
            label: "Carrera finalizada",
            sub: `${state.finishersCount} atletas en meta`,
            duration: raceDuration,
            closed: true,
          }
        : {
            label: formatTime(elapsed, true, true),
            sub: `${state.finishersCount} atletas en meta`,
            duration: null,
            closed: false,
          };

  return (
    <div className="public-view">
      <div className="public-logo-wrap">
        <img src="/crlogo-horizontal.svg" alt="Cajamarca Runners" className="public-logo" />
      </div>

      <div className="public-clock-wrap">
        {state?.name && <div className="public-race-name">{state.name}</div>}
        {status.closed ? (
          <div className="public-closed-wrap">
            <div className="public-closed-title">{status.label}</div>
            {status.duration != null && (
              <div className="public-clock public-clock-closed">{formatTime(status.duration, true, true)}</div>
            )}
          </div>
        ) : (
          <div className={`public-clock ${state?.raceClosed ? "public-clock-closed" : ""}`}>
            {status.label}
          </div>
        )}
        <div className="public-sub">{status.sub}</div>
        {status.closed && status.duration != null && (
          <div className="public-duration-note">
            Duracion total de carrera
          </div>
        )}
      </div>

      {error && (
        <div className="public-top">
          <h3 className="public-top-title">Error</h3>
          <div className="public-sub">{error}</div>
        </div>
      )}

      {state?.raceStarted && state?.recentFinishers?.length > 0 && (
        <div className="public-top">
          <h3 className="public-top-title">Ultimos en llegar</h3>
          <ol className="public-top-list">
            {state.recentFinishers.slice(0, 5).map((finisher) => (
              <li key={`recent-${finisher.id ?? finisher.dorsal}`} className="public-top-item">
                <span className="public-top-pos">#{finisher.position}</span>
                <span className="public-top-dorsal">{finisher.dorsal}</span>
                <span className="public-top-time">{formatTime(finisher.elapsedMs)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {state?.raceStarted && state?.topFinishers?.length > 0 && (
        <div className="public-top">
          <h3 className="public-top-title">Top general</h3>
          <ol className="public-top-list">
            {state.topFinishers.slice(0, 5).map((finisher) => (
              <li key={`top-${finisher.id ?? finisher.dorsal}`} className="public-top-item">
                <span className="public-top-pos">#{finisher.position}</span>
                <span className="public-top-dorsal">{finisher.dorsal}</span>
                <span className="public-top-time">{formatTime(finisher.elapsedMs)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
