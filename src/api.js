const BASE = import.meta.env.DEV
  ? "/api"
  : "https://server-caxas.seypro.net.pe/api";

function getToken() {
  return localStorage.getItem("token");
}

async function request(method, path, body) {
  const token = getToken();
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Sesión expirada");
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login: (username, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al iniciar sesión");
      return data;
    }),

  // Users (MASTER only)
  getUsers: () => request("GET", "/auth/users"),
  createUser: (username, password) => request("POST", "/auth/users", { username, password }),
  deleteUser: (id) => request("DELETE", `/auth/users/${id}`),

  // Race
  getRace: () => request("GET", "/race"),
  startRace: () => request("POST", "/race/start"),
  closeRace: () => request("POST", "/race/close"),
  resetResults: () => request("POST", "/race/reset-results"),
  resetRace: () => request("POST", "/race/reset"),
  getPublic: () => fetch(`${BASE}/public`).then((r) => r.json()),

  // Participants
  uploadParticipants: (participants) => request("POST", "/participants", { participants }),
  searchParticipant: (q) => request("GET", `/participants/search?q=${encodeURIComponent(q)}`),
  assignDorsal: (id, dorsal) => request("POST", `/participants/${id}/dorsal`, { dorsal }),
  toggleKit: (id) => request("POST", `/participants/${id}/kit`),
  toggleCarta: (id) => request("POST", `/participants/${id}/carta`),

  // Config
  getCategories: () => request("GET", "/config/categories"),
  saveCategories: (categories) => request("PUT", "/config/categories", { categories }),

  // Finishers
  addFinisher: (dorsal, timestamp, elapsedMs) =>
    request("POST", "/finishers", { dorsal, timestamp, elapsedMs }),
  addMissedFinisher: (dorsal, timestamp, elapsedMs) =>
    request("POST", "/finishers", { dorsal, timestamp, elapsedMs, reorder: true }),
  removeFinisher: (dorsal) => request("DELETE", `/finishers/${dorsal}`),
  reorderFinishers: (finishers) => request("PUT", "/finishers/reorder", { finishers }),
  disqualifyFinisher: (dorsal, disqualified, reason) =>
    request("POST", `/finishers/${encodeURIComponent(dorsal)}/disqualify`, { disqualified, reason }),
  updateFinisherTime: (dorsal, elapsedMs, raceStartTime) =>
    request("PUT", `/finishers/${encodeURIComponent(dorsal)}/time`, { elapsedMs, raceStartTime }),

  // DNI peruano — RENIEC vía ESSALUD
  getDni: async (dni) => {
    try {
      const res = await fetch(
        `https://viva.essalud.gob.pe/viva/validar-ws-reniec?numero=${dni}&tipoDoc=01`
      );
      const data = await res.json();
      return { success: true, data };
    } catch {
      return { success: false };
    }
  },
};
