const BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

function getToken() {
  return localStorage.getItem("token");
}

async function request(method, path, body) {
  const token = getToken();
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Sesion expirada");
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function requestBlob(method, path, body) {
  const token = getToken();
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      message = data.error || message;
    } else {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  const disposition = res.headers.get("content-disposition") || "";
  const fileNameMatch = disposition.match(/filename="([^"]+)"/i);
  return {
    blob: await res.blob(),
    fileName: fileNameMatch ? fileNameMatch[1] : "certificado.pdf",
  };
}

function withRaceId(path, raceId) {
  if (raceId == null) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}raceId=${encodeURIComponent(raceId)}`;
}

export const api = {
  login: (username, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al iniciar sesion");
      return data;
    }),

  getUsers: () => request("GET", "/auth/users"),
  createUser: (username, password) => request("POST", "/auth/users", { username, password }),
  deleteUser: (id) => request("DELETE", `/auth/users/${id}`),
  assignUserToRace: (userId, raceId) => request("POST", `/auth/users/${idToPath(userId)}/races`, { raceId }),
  removeUserFromRace: (userId, raceId) => request("DELETE", `/auth/users/${idToPath(userId)}/races/${idToPath(raceId)}`),

  getRaces: () => request("GET", "/races"),
  createRace: (payload) => request("POST", "/races", payload),
  updateRace: (raceId, payload) => request("PUT", `/races/${encodeURIComponent(raceId)}`, payload),
  getRace: (raceId) => request("GET", withRaceId("/race", raceId)),
  startRace: (raceId) => request("POST", "/race/start", raceId == null ? undefined : { raceId }),
  closeRace: (raceId) => request("POST", "/race/close", raceId == null ? undefined : { raceId }),
  resetResults: (raceId) => request("POST", "/race/reset-results", raceId == null ? undefined : { raceId }),
  resetRace: (raceId) => request("POST", "/race/reset", raceId == null ? undefined : { raceId }),
  markRaceOfficial: (raceId) => request("POST", `/races/${encodeURIComponent(raceId)}/mark-official`),
  getPublic: (raceId) => fetch(`${BASE}${withRaceId("/public", raceId)}`).then((r) => r.json()),
  getPublicBySlug: (slug) =>
    fetch(`${BASE}/public/${encodeURIComponent(slug)}`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al obtener vista publica");
      return data;
    }),
  getPublicResultsBySlug: (slug) =>
    fetch(`${BASE}/public/${encodeURIComponent(slug)}/results`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al obtener resultados publicos");
      return data;
    }),
  validateCertificateAccess: (slug, dorsal, documento) =>
    request("POST", `/public/${encodeURIComponent(slug)}/certificate`, { dorsal, documento }),
  downloadCertificatePdf: (slug, dorsal, documento) =>
    requestBlob("POST", `/public/${encodeURIComponent(slug)}/certificate/pdf`, { dorsal, documento }),
  downloadCertificateImage: (slug, dorsal, documento) =>
    requestBlob("POST", `/public/${encodeURIComponent(slug)}/certificate/image`, { dorsal, documento }),

  uploadParticipants: (participants, raceId) => request("POST", "/participants", { participants, raceId }),
  uploadParticipantDorsals: (assignments, raceId) =>
    request("POST", "/participants/dorsals", { assignments, raceId }),
  searchParticipant: (q, raceId) => request("GET", withRaceId(`/participants/search?q=${encodeURIComponent(q)}`, raceId)),
  assignDorsal: (id, dorsal, raceId) => request("POST", `/participants/${id}/dorsal`, { dorsal, raceId }),
  toggleKit: (id, raceId) => request("POST", `/participants/${id}/kit`, raceId == null ? undefined : { raceId }),
  toggleCarta: (id, raceId) => request("POST", `/participants/${id}/carta`, raceId == null ? undefined : { raceId }),

  getCategories: (raceId) => request("GET", withRaceId("/config/categories", raceId)),
  saveCategories: (categories, raceId) => request("PUT", "/config/categories", { categories, raceId }),

  addFinisher: (dorsal, timestamp, elapsedMs, raceId) =>
    request("POST", "/finishers", { dorsal, timestamp, elapsedMs, raceId }),
  addMissedFinisher: (dorsal, timestamp, elapsedMs, raceId) =>
    request("POST", "/finishers", { dorsal, timestamp, elapsedMs, reorder: true, raceId }),
  removeFinisher: (dorsal, raceId) => request("DELETE", withRaceId(`/finishers/${dorsal}`, raceId)),
  reorderFinishers: (finishers, raceId) => request("PUT", "/finishers/reorder", { finishers, raceId }),
  disqualifyFinisher: (dorsal, disqualified, reason, raceId) =>
    request("POST", `/finishers/${encodeURIComponent(dorsal)}/disqualify`, { disqualified, reason, raceId }),
  updateFinisherTime: (dorsal, elapsedMs, raceStartTime, raceId) =>
    request("PUT", `/finishers/${encodeURIComponent(dorsal)}/time`, { elapsedMs, raceStartTime, raceId }),

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

function idToPath(value) {
  return encodeURIComponent(value);
}
