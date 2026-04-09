export const DEFAULT_CATEGORIES = [
  { name: "Sub-18", minAge: 0, maxAge: 17 },
  { name: "Open", minAge: 18, maxAge: 39 },
  { name: "Master A", minAge: 40, maxAge: 49 },
  { name: "Master B", minAge: 50, maxAge: 59 },
  { name: "Master C", minAge: 60, maxAge: null },
];

function getAgeCategory(edad, categories = DEFAULT_CATEGORIES) {
  const age = parseInt(edad, 10);
  if (isNaN(age)) return "—";
  for (const cat of categories) {
    if (age >= cat.minAge && (cat.maxAge === null || age <= cat.maxAge)) {
      return cat.name;
    }
  }
  return "—";
}

/**
 * Returns the full category string including distance, gender and age range.
 * e.g. "10K - M Master A", "5K - F Open"
 */
export function getCategory(edad, genero, distancia, categories = DEFAULT_CATEGORIES) {
  const g = String(genero).trim().toUpperCase();
  const ageCat = getAgeCategory(edad, categories);
  const dist = distancia ? `${distancia} - ` : "";
  return `${dist}${g} ${ageCat}`;
}

/**
 * Groups finishers by distance first, then by category within each distance.
 * Returns: { "5K": { "5K - M Open": [...], ... }, "10K": { ... } }
 */
export function groupByDistance(finishers, participants, categories = DEFAULT_CATEGORIES) {
  const participantMap = {};
  for (const p of participants) {
    if (p.dorsal) participantMap[String(p.dorsal).trim()] = p;
  }

  const byDistance = {};
  const activeFinishers = finishers.filter((f) => !f.disqualified);

  activeFinishers.forEach((finisher, idx) => {
    const p = participantMap[String(finisher.dorsal).trim()];
    if (!p) return;

    const dist = p.distancia || "—";
    const category = getCategory(p.edad, p.genero, p.distancia, categories);

    if (!byDistance[dist]) byDistance[dist] = {};
    if (!byDistance[dist][category]) byDistance[dist][category] = [];

    byDistance[dist][category].push({
      ...finisher,
      overallPosition: idx + 1,
      participant: p,
      category,
    });
  });

  // Assign category positions within each distance group
  for (const dist of Object.keys(byDistance)) {
    for (const cat of Object.keys(byDistance[dist])) {
      byDistance[dist][cat] = byDistance[dist][cat].map((entry, i) => ({
        ...entry,
        categoryPosition: i + 1,
      }));
    }
  }

  return byDistance;
}

/**
 * Returns top-3 absolute finishers per gender for a given distance.
 * Result: { M: [...], F: [...] } — each array has up to 3 entries
 */
export function getAbsoluteByGender(finishers, participants, distance) {
  const participantMap = {};
  for (const p of participants) {
    if (p.dorsal) participantMap[String(p.dorsal).trim()] = p;
  }

  const result = { M: [], F: [] };

  for (const f of finishers.filter((f) => !f.disqualified)) {
    const p = participantMap[String(f.dorsal).trim()];
    if (!p || p.distancia !== distance) continue;
    const g = String(p.genero).toUpperCase();
    if ((g === "M" || g === "F") && result[g].length < 3) {
      result[g].push({ ...f, genderPosition: result[g].length + 1, participant: p });
    }
    if (result.M.length >= 3 && result.F.length >= 3) break;
  }

  return result;
}

/**
 * Canonical category order for display within a distance group.
 */
export function sortedCategories(categoryGroups, distancia, categories = DEFAULT_CATEGORIES) {
  const dist = distancia ? `${distancia} - ` : "";
  const ordered = [];
  for (const cat of categories) {
    for (const g of ["M", "F"]) {
      const key = `${dist}${g} ${cat.name}`;
      if (categoryGroups[key]) ordered.push(key);
    }
  }
  // Any remaining not in the canonical order
  for (const key of Object.keys(categoryGroups)) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered;
}

/**
 * Formats elapsed milliseconds as HH:MM:SS.cc (centésimas) o HH:MM:SS.
 * @param {number} ms - Elapsed time in milliseconds (float for sub-ms precision)
 * @param {boolean} showCentis - Show centiseconds (default true)
 * @param {boolean} forceHours - Always show HH: prefix for stable width (default false)
 */
export function formatTime(ms, showCentis = true, forceHours = false) {
  if (ms == null || isNaN(ms)) return forceHours ? "--:--:--.--" : "--:--.--";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cc = String(centis).padStart(2, "0");
  const suffix = showCentis ? `.${cc}` : "";

  if (hours > 0 || forceHours) {
    const hh = String(hours).padStart(2, "0");
    return `${hh}:${mm}:${ss}${suffix}`;
  }
  return `${mm}:${ss}${suffix}`;
}
