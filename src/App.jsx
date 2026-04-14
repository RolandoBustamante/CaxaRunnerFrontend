import { useState, useEffect, useCallback, useRef } from "react";
import ParticipantUpload from "./components/ParticipantUpload";
import FinishLine from "./components/FinishLine";
import Results from "./components/Results";
import Acreditacion from "./components/Acreditacion";
import Login from "./components/Login";
import Users from "./components/Users";
import CronometroTab from "./components/CronometroTab";
import CategoryConfig from "./components/CategoryConfig";
import RaceSelector from "./components/RaceSelector";
import { api } from "./api";
import { confirmDialog } from "./utils/dialog";
import { DEFAULT_CATEGORIES } from "./utils/categories";

const POLL_INTERVAL = 2000;
const POLLING_TABS = new Set(["meta", "resultados", "cronometro"]);

function getTabs(role, raceStarted, raceClosed) {
  const tabs = [
    { id: "participantes", label: "Participantes" },
    { id: "acreditacion", label: "Acreditación" },
    { id: "meta", label: "Meta" },
    { id: "resultados", label: "Resultados" },
  ];
  if (raceStarted && !raceClosed) {
    tabs.splice(2, 0, { id: "cronometro", label: "Cronómetro" });
  }
  if (role === "MASTER") {
    tabs.push({ id: "usuarios", label: "Usuarios" });
    tabs.push({ id: "configuracion", label: "Configuración" });
  }
  return tabs;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });
  const [races, setRaces] = useState([]);
  const [selectedRaceId, setSelectedRaceId] = useState(() => {
    const saved = localStorage.getItem("selectedRaceId");
    return saved ? Number(saved) : null;
  });
  const [activeTab, setActiveTab] = useState("participantes");
  const [raceState, setRaceState] = useState({
    raceStarted: false,
    raceStartTime: null,
    participants: [],
    finishers: [],
  });
  const [raceElapsed, setRaceElapsed] = useState(0);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(!!currentUser);
  const [error, setError] = useState(null);
  const [creatingRace, setCreatingRace] = useState(false);
  const [createRaceOpen, setCreateRaceOpen] = useState(false);
  const [newRaceName, setNewRaceName] = useState("");
  const pollRef = useRef(null);
  const errorCount = useRef(0);
  const raceClockRef = useRef({ raceStartTime: null, startPerf: null, baseElapsed: 0 });
  const serverOffsetRef = useRef(0);
  const MAX_ERRORS = 3;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (selectedRaceId == null) {
      localStorage.removeItem("selectedRaceId");
      return;
    }
    localStorage.setItem("selectedRaceId", String(selectedRaceId));
  }, [selectedRaceId]);

  useEffect(() => {
    const handler = () => {
      stopPolling();
      setCurrentUser(null);
      setRaces([]);
      setSelectedRaceId(null);
      setActiveTab("participantes");
    };
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, [stopPolling]);

  const fetchRace = useCallback(async () => {
    if (selectedRaceId == null) {
      setRaceState({
        raceStarted: false,
        raceStartTime: null,
        participants: [],
        finishers: [],
      });
      setCategories(DEFAULT_CATEGORIES);
      setLoading(false);
      return;
    }

    try {
      const requestStartedAt = Date.now();
      const data = await api.getRace(selectedRaceId);
      const requestEndedAt = Date.now();
      if (typeof data.serverNow === "number") {
        const estimatedServerNow = data.serverNow + (requestEndedAt - requestStartedAt) / 2;
        serverOffsetRef.current = estimatedServerNow - requestEndedAt;
      }
      setRaceState(data);
      setError(null);
      errorCount.current = 0;
    } catch (err) {
      if (err.message === "Sesión expirada") return;
      errorCount.current += 1;
      if (errorCount.current >= MAX_ERRORS) {
        stopPolling();
        setError("offline");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedRaceId, stopPolling]);

  const refreshRaces = useCallback(async () => {
    if (!currentUser) return [];

    const data = await api.getRaces();
    setRaces(data);

    const availableIds = new Set(data.map((race) => race.id));
    setSelectedRaceId((prev) => {
      if (prev != null && availableIds.has(prev)) return prev;
      if (data.length === 0) return null;
      return data[0].id;
    });

    return data;
  }, [currentUser]);

  const startPolling = useCallback(() => {
    stopPolling();
    errorCount.current = 0;
    setError(null);
    pollRef.current = setInterval(fetchRace, POLL_INTERVAL);
  }, [fetchRace, stopPolling]);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      stopPolling();
      return;
    }

    setLoading(true);
    refreshRaces().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [currentUser, refreshRaces, stopPolling]);

  useEffect(() => {
    if (!currentUser || selectedRaceId == null) {
      setLoading(false);
      return;
    }

    fetchRace();
    api.getCategories(selectedRaceId)
      .then((data) => setCategories(data.categories))
      .catch(() => {});
  }, [currentUser, selectedRaceId, fetchRace]);

  useEffect(() => {
    if (!currentUser || selectedRaceId == null) {
      stopPolling();
      return;
    }

    if (POLLING_TABS.has(activeTab)) {
      startPolling();
      return stopPolling;
    }

    stopPolling();
  }, [activeTab, currentUser, selectedRaceId, startPolling, stopPolling]);

  useEffect(() => {
    const { raceStarted, raceClosed, raceStartTime, raceEndTime } = raceState;
    const getServerNow = () => Date.now() + serverOffsetRef.current;

    if (!raceStarted || !raceStartTime) {
      raceClockRef.current = { raceStartTime: null, startPerf: null, baseElapsed: 0 };
      setRaceElapsed(0);
      return;
    }

    if (raceClosed) {
      const currentElapsed = raceClockRef.current.startPerf == null
        ? raceClockRef.current.baseElapsed
        : raceClockRef.current.baseElapsed + (performance.now() - raceClockRef.current.startPerf);
      const closedElapsed = raceEndTime
        ? Math.max(0, raceEndTime - raceStartTime)
        : Math.max(0, currentElapsed);
      raceClockRef.current = {
        raceStartTime,
        startPerf: null,
        baseElapsed: closedElapsed,
      };
      setRaceElapsed(closedElapsed);
      return;
    }

    if (raceClockRef.current.raceStartTime !== raceStartTime || raceClockRef.current.startPerf == null) {
      const initialElapsed = Math.max(0, getServerNow() - raceStartTime);
      raceClockRef.current = {
        raceStartTime,
        startPerf: performance.now(),
        baseElapsed: initialElapsed,
      };
      setRaceElapsed(initialElapsed);
    }

    const interval = setInterval(() => {
      const { startPerf, baseElapsed } = raceClockRef.current;
      if (startPerf == null) return;
      setRaceElapsed(Math.max(0, baseElapsed + (performance.now() - startPerf)));
    }, 10);

    return () => clearInterval(interval);
  }, [raceState.raceStarted, raceState.raceClosed, raceState.raceStartTime, raceState.raceEndTime]);

  const handleLogin = useCallback((user) => {
    setCurrentUser(user);
    setLoading(true);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedRaceId");
    stopPolling();
    setCurrentUser(null);
    setRaces([]);
    setSelectedRaceId(null);
    setActiveTab("participantes");
  }, [stopPolling]);

  const handleParticipantsLoad = useCallback(async (participants) => {
    await api.uploadParticipants(participants, selectedRaceId);
    await fetchRace();
  }, [fetchRace, selectedRaceId]);

  const handleStartRace = useCallback(async () => {
    await api.startRace(selectedRaceId);
    await fetchRace();
    await refreshRaces();
    setActiveTab("meta");
  }, [fetchRace, refreshRaces, selectedRaceId]);

  const handleCloseRace = useCallback(async () => {
    const ok = await confirmDialog({
      title: "¿Cerrar la carrera?",
      text: "Ya no se podrán registrar más dorsales.",
      confirmText: "Cerrar carrera",
    });
    if (!ok) return;
    await api.closeRace(selectedRaceId);
    await fetchRace();
    await refreshRaces();
  }, [fetchRace, refreshRaces, selectedRaceId]);

  const handleResetResults = useCallback(async () => {
    const ok = await confirmDialog({
      title: "¿Limpiar resultados?",
      text: "Se borrarán todos los finishers y se reiniciará la carrera. Los participantes se mantienen.",
      confirmText: "Limpiar",
    });
    if (!ok) return;
    await api.resetResults(selectedRaceId);
    await fetchRace();
    await refreshRaces();
    setActiveTab("meta");
  }, [fetchRace, refreshRaces, selectedRaceId]);

  const handleResetAll = useCallback(async () => {
    const ok = await confirmDialog({
      title: "¿Resetear todo?",
      text: "Se borrarán participantes, resultados y el estado de la carrera. Esta acción no se puede deshacer.",
      confirmText: "Resetear todo",
    });
    if (!ok) return;
    await api.resetRace(selectedRaceId);
    await fetchRace();
    await refreshRaces();
    setActiveTab("participantes");
  }, [fetchRace, refreshRaces, selectedRaceId]);

  const handleFinisherAdd = useCallback(async (finisher) => {
    const serverTimestamp = Math.round(finisher.timestamp + serverOffsetRef.current);
    await api.addFinisher(finisher.dorsal, serverTimestamp, finisher.elapsedMs, selectedRaceId);
    await fetchRace();
  }, [fetchRace, selectedRaceId]);

  const handleMissedFinisherAdd = useCallback(async (finisher) => {
    await api.addMissedFinisher(finisher.dorsal, finisher.timestamp, finisher.elapsedMs, selectedRaceId);
    await fetchRace();
  }, [fetchRace, selectedRaceId]);

  const handleFinisherRemove = useCallback(async (dorsal) => {
    await api.removeFinisher(dorsal, selectedRaceId);
    await fetchRace();
  }, [fetchRace, selectedRaceId]);

  const handleReorder = useCallback(async (reordered) => {
    setRaceState((prev) => ({ ...prev, finishers: reordered }));
    await api.reorderFinishers(reordered, selectedRaceId);
    await fetchRace();
  }, [fetchRace, selectedRaceId]);

  const handleFinisherDisqualify = useCallback(async (dorsal, disqualified, reason) => {
    await api.disqualifyFinisher(dorsal, disqualified, reason, selectedRaceId);
    await fetchRace();
  }, [fetchRace, selectedRaceId]);

  const handleFinisherTimeUpdate = useCallback(async (dorsal, elapsedMs) => {
    await api.updateFinisherTime(dorsal, elapsedMs, raceState.raceStartTime, selectedRaceId);
    await fetchRace();
  }, [fetchRace, raceState.raceStartTime, selectedRaceId]);

  const handleAcreditacionUpdate = useCallback(async () => {
    await fetchRace();
  }, [fetchRace]);

  const handleCreateRace = useCallback(async () => {
    const name = newRaceName.trim();
    if (!name) return;

    setCreatingRace(true);
    try {
      const race = await api.createRace({ name });
      await refreshRaces();
      setSelectedRaceId(race.id);
      setActiveTab("participantes");
      setCreateRaceOpen(false);
      setNewRaceName("");
    } finally {
      setCreatingRace(false);
    }
  }, [newRaceName, refreshRaces]);

  if (!currentUser) return <Login onLogin={handleLogin} />;

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Conectando al servidor...</p>
        </div>
      </div>
    );
  }

  const { raceStarted, raceClosed, raceStartTime, participants, finishers } = raceState;
  const selectedRace = races.find((race) => race.id === selectedRaceId) || null;
  const TABS = getTabs(currentUser.role, raceStarted, raceClosed);

  return (
    <div className="app">
      <button
        className="theme-toggle"
        onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <header className="navbar">
        <div className="navbar-brand">
          <img src="/crlogo-horizontal.svg" alt="Cajamarca Runners" className="brand-logo" />
        </div>

        <div className="navbar-race-pill">
          {selectedRace ? selectedRace.name : "Sin carrera"}
        </div>

        <nav className="tab-nav">
          {TABS.map((tab) => {
            const badge =
              tab.id === "participantes"
                ? participants.length || null
                : tab.id === "acreditacion"
                  ? participants.length || null
                  : tab.id === "meta" || tab.id === "resultados"
                    ? finishers.length || null
                    : null;

            return (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "tab-btn-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {badge !== null && badge > 0 && (
                  <span className={`tab-badge ${activeTab === tab.id ? "tab-badge-active" : ""}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="navbar-right">
          {raceStarted && (
            <div className="navbar-status">
              <span className="status-dot"></span>
              <span className="status-text">EN CURSO</span>
            </div>
          )}
          {error === "offline" && (
            <button className="reconnect-btn" onClick={startPolling}>
              ⚠️ Sin conexión — Reconectar
            </button>
          )}
          <div className="navbar-user">
            <span className="navbar-username">{currentUser.username}</span>
            <button className="logout-btn" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <RaceSelector
          races={races}
          selectedRaceId={selectedRaceId}
          onSelectRace={(raceId) => {
            setSelectedRaceId(raceId);
            setActiveTab("participantes");
          }}
          currentUser={currentUser}
          onCreateRace={() => setCreateRaceOpen(true)}
          creatingRace={creatingRace}
        />

        {createRaceOpen && (
          <div
            className="app-dialog-backdrop"
            onClick={() => {
              if (!creatingRace) {
                setCreateRaceOpen(false);
                setNewRaceName("");
              }
            }}
          >
            <div
              className="app-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="app-dialog-header">
                <h3>Nueva carrera</h3>
                <button
                  type="button"
                  className="app-dialog-close"
                  onClick={() => {
                    if (!creatingRace) {
                      setCreateRaceOpen(false);
                      setNewRaceName("");
                    }
                  }}
                  disabled={creatingRace}
                >
                  X
                </button>
              </div>

              <div className="app-dialog-body">
                <label className="login-label" htmlFor="new-race-name">Nombre</label>
                <input
                  id="new-race-name"
                  className="login-input"
                  type="text"
                  value={newRaceName}
                  onChange={(event) => setNewRaceName(event.target.value)}
                  placeholder="Ej: 10K Cajamarca 2026"
                  autoFocus
                  disabled={creatingRace}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleCreateRace();
                    }
                  }}
                />
              </div>

              <div className="app-dialog-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCreateRaceOpen(false);
                    setNewRaceName("");
                  }}
                  disabled={creatingRace}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateRace}
                  disabled={creatingRace || !newRaceName.trim()}
                >
                  {creatingRace ? "Creando..." : "Crear carrera"}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedRaceId == null ? (
          <div className="card race-selector-empty-panel">
            No hay una carrera disponible para trabajar en este usuario.
          </div>
        ) : (
          <>
        {activeTab === "participantes" && (
          <ParticipantUpload
            participants={participants}
            onParticipantsLoad={handleParticipantsLoad}
          />
        )}
        {activeTab === "acreditacion" && (
          <Acreditacion
            participants={participants}
            categories={categories}
            onUpdate={handleAcreditacionUpdate}
            raceId={selectedRaceId}
          />
        )}
        {activeTab === "meta" && (
          <FinishLine
            participants={participants}
            finishers={finishers}
            raceStarted={raceStarted}
            raceClosed={raceState.raceClosed}
            raceStartTime={raceStartTime}
            raceEndTime={raceState.raceEndTime}
            elapsed={raceElapsed}
            onStartRace={handleStartRace}
            onCloseRace={handleCloseRace}
            onFinisherAdd={handleFinisherAdd}
            onFinisherRemove={handleFinisherRemove}
          />
        )}
        {activeTab === "resultados" && (
          <Results
            participants={participants}
            finishers={finishers}
            raceStartTime={raceStartTime}
            categories={categories}
            race={selectedRace}
            onReorder={handleReorder}
            onFinisherAdd={handleMissedFinisherAdd}
            onFinisherDisqualify={handleFinisherDisqualify}
            onFinisherTimeUpdate={handleFinisherTimeUpdate}
            onResetResults={handleResetResults}
            onResetAll={handleResetAll}
          />
        )}
        {activeTab === "cronometro" && (
          <CronometroTab
            raceClosed={raceClosed}
            finishers={finishers}
            elapsed={raceElapsed}
            race={selectedRace}
          />
        )}
        {activeTab === "usuarios" && currentUser.role === "MASTER" && <Users />}
        {activeTab === "configuracion" && currentUser.role === "MASTER" && (
          <CategoryConfig
            categories={categories}
            onCategoriesChange={setCategories}
            raceId={selectedRaceId}
            race={selectedRace}
            onRaceUpdated={refreshRaces}
          />
        )}
          </>
        )}
      </main>
    </div>
  );
}
