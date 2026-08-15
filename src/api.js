const BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || "").replace(/\/+$/, "");

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

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : { error: await res.text() };
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
  const fileNameMatch =
    disposition.match(/filename\*=UTF-8''([^;]+)/i) ||
    disposition.match(/filename="([^"]+)"/i) ||
    disposition.match(/filename=([^;]+)/i);
  const contentType = res.headers.get("content-type") || "";
  const extension = contentType.includes("pdf")
    ? ".pdf"
    : contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : contentType.includes("jpeg") || contentType.includes("jpg")
          ? ".jpg"
          : "";
  const fallbackName = `archivo${extension}`;
  return {
    blob: await res.blob(),
    fileName: fileNameMatch ? decodeURIComponent(fileNameMatch[1].trim().replace(/^"|"$/g, "")) : fallbackName,
  };
}

async function requestForm(method, path, formData) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : { error: await res.text() };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function ensureExtension(fileName, extension) {
  const normalized = String(fileName || "").trim() || `archivo${extension}`;
  return normalized.toLowerCase().endsWith(extension.toLowerCase())
    ? normalized
    : normalized.replace(/\.[a-z0-9]+$/i, "") + extension;
}

function withRaceId(path, raceId) {
  if (raceId == null) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}raceId=${encodeURIComponent(raceId)}`;
}

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api")) return `${BASE.replace(/\/api$/, "")}${path}`;
  return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function publicAppUrl() {
  return PUBLIC_APP_URL || window.location.origin;
}

export const api = {
  getAssetUrl: assetUrl,
  getPublicAppUrl: publicAppUrl,
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
  uploadPaymentQr: (raceId, file) => {
    const formData = new FormData();
    formData.append("qr", file);
    return requestForm("POST", `/races/${encodeURIComponent(raceId)}/payment-qr`, formData);
  },
  uploadRaceRulesPdf: (raceId, file) => {
    const formData = new FormData();
    formData.append("pdf", file);
    return requestForm("POST", `/races/${encodeURIComponent(raceId)}/rules-pdf`, formData);
  },
  uploadRaceLogo: (raceId, file) => {
    const formData = new FormData();
    formData.append("logo", file);
    return requestForm("POST", `/races/${encodeURIComponent(raceId)}/logo`, formData);
  },
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
  downloadCertificateImage: async (slug, dorsal, documento) => {
    const result = await requestBlob("POST", `/public/${encodeURIComponent(slug)}/certificate/image`, { dorsal, documento });
    return {
      ...result,
      fileName: ensureExtension(result.fileName, ".png"),
    };
  },

  getRegistrationForm: (slug) =>
    fetch(`${BASE}/public/${encodeURIComponent(slug)}/registration`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al obtener formulario de inscripción");
      return data;
    }),
  validateDiscountCode: (slug, code, subtotalAmount) =>
    fetch(`${BASE}/public/${encodeURIComponent(slug)}/discount-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotalAmount }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al validar descuento");
      return data;
    }),
  submitRegistration: (slug, payload, vouchers, participantPhotos = {}) => {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    vouchers.forEach((file) => formData.append("vouchers", file));
    Object.entries(participantPhotos).forEach(([index, file]) => {
      if (file) formData.append(`participantPhoto_${index}`, file);
    });
    return requestForm("POST", `/public/${encodeURIComponent(slug)}/registration`, formData);
  },
  getRegistrationReview: (token) =>
    fetch(`${BASE}/registration-review/${encodeURIComponent(token)}`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al obtener revisión de pago");
      return data;
    }),
  approveRegistrationReview: (token) =>
    fetch(`${BASE}/registration-review/${encodeURIComponent(token)}/approve`, { method: "POST" }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al aprobar inscripción");
      return data;
    }),
  rejectRegistrationReview: (token, notes) =>
    fetch(`${BASE}/registration-review/${encodeURIComponent(token)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al rechazar inscripción");
      return data;
    }),
  getRegistrationReviewVoucherUrl: (token, voucherId) =>
    `${BASE}/registration-review/${encodeURIComponent(token)}/vouchers/${encodeURIComponent(voucherId)}`,
  downloadRegistrationReviewVoucher: (token, voucherId) =>
    requestBlob("GET", `/registration-review/${encodeURIComponent(token)}/vouchers/${encodeURIComponent(voucherId)}`),
  getRegistrationReviewPhotoUrl: (token, participantId) =>
    `${BASE}/registration-review/${encodeURIComponent(token)}/participants/${encodeURIComponent(participantId)}/photo`,
  downloadRegistrationReviewPhoto: (token, participantId) =>
    requestBlob("GET", `/registration-review/${encodeURIComponent(token)}/participants/${encodeURIComponent(participantId)}/photo`),
  getRegistrations: (raceId, status) => {
    const basePath = withRaceId("/registrations", raceId);
    const separator = basePath.includes("?") ? "&" : "?";
    return request("GET", status ? `${basePath}${separator}status=${encodeURIComponent(status)}` : basePath);
  },
  getDiscountCodes: (raceId) => request("GET", withRaceId("/discount-codes", raceId)),
  createDiscountCode: (payload, raceId) => request("POST", "/discount-codes", { ...payload, raceId }),
  updateDiscountCode: (id, payload, raceId) =>
    request("PUT", `/discount-codes/${idToPath(id)}`, { ...payload, raceId }),
  getWhatsAppStatus: () => request("GET", "/whatsapp/status"),
  restartWhatsApp: () => request("POST", "/whatsapp/restart"),
  logoutWhatsApp: () => request("POST", "/whatsapp/logout"),
  requestWhatsAppPairingCode: (phoneNumber) => request("POST", "/whatsapp/pairing-code", { phoneNumber }),
  cancelWhatsAppPairingCode: () => request("POST", "/whatsapp/pairing-code/cancel"),
  sendWhatsAppTest: (number, message) => request("POST", "/whatsapp/test", { number, message }),
  approveRegistration: (id, raceId) =>
    request("POST", `/registrations/${idToPath(id)}/approve`, raceId == null ? undefined : { raceId }),
  rejectRegistration: (id, notes, raceId) =>
    request("POST", `/registrations/${idToPath(id)}/reject`, { notes, raceId }),
  deleteRegistration: (id, raceId) =>
    request("DELETE", `/registrations/${idToPath(id)}`, raceId == null ? undefined : { raceId }),
  notifyRegistrationPayment: (id, raceId) =>
    request("POST", `/registrations/${idToPath(id)}/notify-payment`, { raceId, baseUrl: PUBLIC_APP_URL || undefined }),
  notifyRegistrationConfirmation: (id, raceId) =>
    request("POST", `/registrations/${idToPath(id)}/notify-confirmation`, raceId == null ? undefined : { raceId }),
  downloadRegistrationVoucher: (registrationId, voucherId, raceId) =>
    requestBlob("GET", withRaceId(`/registrations/${idToPath(registrationId)}/vouchers/${idToPath(voucherId)}`, raceId)),
  downloadRegistrationParticipantPhoto: (registrationId, participantId, raceId) =>
    requestBlob("GET", withRaceId(`/registrations/${idToPath(registrationId)}/participants/${idToPath(participantId)}/photo`, raceId)),

  uploadParticipants: (participants, raceId) => request("POST", "/participants", { participants, raceId }),
  uploadParticipantDorsals: (assignments, raceId) =>
    request("POST", "/participants/dorsals", { assignments, raceId }),
  searchParticipant: (q, raceId) => request("GET", withRaceId(`/participants/search?q=${encodeURIComponent(q)}`, raceId)),
  updateParticipant: (id, payload, raceId) =>
    request("PUT", `/participants/${idToPath(id)}`, { ...payload, raceId }),
  deleteParticipant: (id, raceId) =>
    request("DELETE", `/participants/${idToPath(id)}`, raceId == null ? undefined : { raceId }),
  assignDorsal: (id, dorsal, raceId) => request("POST", `/participants/${id}/dorsal`, { dorsal, raceId }),
  toggleKit: (id, raceId) => request("POST", `/participants/${id}/kit`, raceId == null ? undefined : { raceId }),
  toggleCarta: (id, raceId) => request("POST", `/participants/${id}/carta`, raceId == null ? undefined : { raceId }),

  getCategories: (raceId) => request("GET", withRaceId("/config/categories", raceId)),
  saveCategories: (categories, raceId) => request("PUT", "/config/categories", { categories, raceId }),

  addFinisher: (dorsal, timestamp, elapsedMs, raceId) =>
    request("POST", "/finishers", { dorsal, timestamp, elapsedMs, raceId }),
  importFinishers: (finishers, raceId, replace = false) =>
    request("POST", "/finishers/import", { finishers, raceId, replace }),
  addMissedFinisher: (dorsal, timestamp, elapsedMs, raceId) =>
    request("POST", "/finishers", { dorsal, timestamp, elapsedMs, reorder: true, raceId }),
  removeFinisher: (dorsal, raceId) => request("DELETE", withRaceId(`/finishers/${dorsal}`, raceId)),
  reorderFinishers: (finishers, raceId) => request("PUT", "/finishers/reorder", { finishers, raceId }),
  disqualifyFinisher: (dorsal, disqualified, reason, raceId) =>
    request("POST", `/finishers/${encodeURIComponent(dorsal)}/disqualify`, { disqualified, reason, raceId }),
  markFinisherNoTime: (dorsal, noTime, raceId) =>
    request("POST", `/finishers/${encodeURIComponent(dorsal)}/no-time`, { noTime, raceId }),
  updateFinisherTime: (dorsal, elapsedMs, raceStartTime, raceId) =>
    request("PUT", `/finishers/${encodeURIComponent(dorsal)}/time`, { elapsedMs, raceStartTime, raceId }),
  updateFinisherPosition: (dorsal, position, raceId) =>
    request("PUT", `/finishers/${encodeURIComponent(dorsal)}/position`, { position, raceId }),

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
