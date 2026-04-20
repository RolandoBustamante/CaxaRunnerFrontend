export const DEFAULT_CATEGORIES = [
  { name: "Sub-18", minAge: 0, maxAge: 17, distance: null, gender: null },
  { name: "Open", minAge: 18, maxAge: 39, distance: null, gender: null },
  { name: "Master A", minAge: 40, maxAge: 49, distance: null, gender: null },
  { name: "Master B", minAge: 50, maxAge: 59, distance: null, gender: null },
  { name: "Master C", minAge: 60, maxAge: null, distance: null, gender: null },
];

function normalizeDistance(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeGender(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function normalizeCategoryRule(category) {
  return {
    ...category,
    distance: normalizeDistance(category?.distance),
    gender: normalizeGender(category?.gender),
  };
}

function getAgeCategoryRule(edad, genero, distancia, categories = DEFAULT_CATEGORIES) {
  const age = parseInt(edad, 10);
  if (Number.isNaN(age)) return null;

  const participantDistance = normalizeDistance(distancia);
  const participantGender = normalizeGender(genero);
  const normalizedCategories = categories.map(normalizeCategoryRule);

  for (const category of normalizedCategories) {
    const distanceMatches = !category.distance || category.distance === participantDistance;
    const genderMatches = !category.gender || category.gender === participantGender;
    const ageMatches = age >= category.minAge && (category.maxAge === null || age <= category.maxAge);

    if (distanceMatches && genderMatches && ageMatches) {
      return category;
    }
  }

  return null;
}

export function getCategoryName(edad, genero, distancia, categories = DEFAULT_CATEGORIES) {
  const category = getAgeCategoryRule(edad, genero, distancia, categories);
  return category ? category.name : "-";
}

export function getCategory(edad, genero, distancia, categories = DEFAULT_CATEGORIES) {
  const gender = normalizeGender(genero) || "-";
  const categoryName = getCategoryName(edad, genero, distancia, categories);
  const distance = normalizeDistance(distancia);
  const prefix = distance ? `${distance} - ` : "";
  return `${prefix}${gender} ${categoryName}`;
}

export function applyCompetitionRanking(entries, sourceField = "position", targetField = "rank") {
  let seen = 0;
  let lastSource = null;
  let currentRank = 0;

  return entries.map((entry) => {
    seen += 1;
    const rawSource = Number(entry?.[sourceField]);
    const source = Number.isFinite(rawSource) && rawSource > 0 ? rawSource : seen;

    if (lastSource !== source) {
      currentRank = seen;
      lastSource = source;
    }

    return {
      ...entry,
      [targetField]: currentRank,
    };
  });
}

export function groupByDistance(finishers, participants, categories = DEFAULT_CATEGORIES) {
  const participantMap = {};
  for (const participant of participants) {
    if (participant.dorsal) participantMap[String(participant.dorsal).trim()] = participant;
  }

  const byDistance = {};
  const activeFinishers = finishers.filter((finisher) => !finisher.disqualified);

  activeFinishers.forEach((finisher, index) => {
    const participant = participantMap[String(finisher.dorsal).trim()];
    if (!participant) return;

    const distance = participant.distancia || "-";
    const category = getCategory(participant.edad, participant.genero, participant.distancia, categories);

    if (!byDistance[distance]) byDistance[distance] = {};
    if (!byDistance[distance][category]) byDistance[distance][category] = [];

    byDistance[distance][category].push({
      ...finisher,
      overallPosition: Number(finisher.position) || index + 1,
      participant,
      category,
    });
  });

  for (const distance of Object.keys(byDistance)) {
    for (const category of Object.keys(byDistance[distance])) {
      byDistance[distance][category] = applyCompetitionRanking(
        byDistance[distance][category],
        "position",
        "categoryPosition"
      );
    }
  }

  return byDistance;
}

export function getAbsoluteByGender(finishers, participants, distance) {
  const participantMap = {};
  for (const participant of participants) {
    if (participant.dorsal) participantMap[String(participant.dorsal).trim()] = participant;
  }

  const result = { M: [], F: [] };
  const rankState = {
    M: { seen: 0, lastSource: null, currentRank: 0 },
    F: { seen: 0, lastSource: null, currentRank: 0 },
  };

  for (const finisher of finishers.filter((entry) => !entry.disqualified)) {
    const participant = participantMap[String(finisher.dorsal).trim()];
    if (!participant || participant.distancia !== distance) continue;
    const gender = String(participant.genero).toUpperCase();
    if (gender !== "M" && gender !== "F") continue;

    const state = rankState[gender];
    state.seen += 1;
    const source = Number(finisher.position) || state.seen;

    if (state.lastSource !== source) {
      state.currentRank = state.seen;
      state.lastSource = source;
    }

    if (state.currentRank <= 3) {
      result[gender].push({ ...finisher, genderPosition: state.currentRank, participant });
    }
  }

  return result;
}

export function sortedCategories(categoryGroups, distancia, categories = DEFAULT_CATEGORIES) {
  const distance = normalizeDistance(distancia);
  const ordered = [];

  for (const category of categories.map(normalizeCategoryRule)) {
    const applicableDistance = !category.distance || category.distance === distance;
    if (!applicableDistance) continue;

    const genders = category.gender ? [category.gender] : ["M", "F"];
    for (const gender of genders) {
      const key = `${distance ? `${distance} - ` : ""}${gender} ${category.name}`;
      if (categoryGroups[key] && !ordered.includes(key)) ordered.push(key);
    }
  }

  for (const key of Object.keys(categoryGroups)) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  return ordered;
}

export function formatTime(ms, showCentis = true, forceHours = false) {
  if (ms == null || Number.isNaN(ms)) return forceHours ? "--:--:--.--" : "--:--.--";
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
