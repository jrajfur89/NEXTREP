// Returns the [start, end) window for a given range key, plus the immediately preceding
// equal-length window to compare against. "all" has no meaningful previous period.
function getRangeBounds(rangeKey) {
  const now = new Date();
  const end = new Date(now.getTime() + 1);
  if (rangeKey === "week") {
    const start = new Date(now);
    const dayIdx = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayIdx);
    start.setHours(0, 0, 0, 0);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    return { start, end, prevStart, prevEnd: start };
  }
  if (rangeKey === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start, end, prevStart, prevEnd: start };
  }
  return { start: new Date(0), end, prevStart: null, prevEnd: null };
}

// ---- Muscle groups in the UI (NR-MGW-002): one dictionary (MUSCLE_GROUPS) for the exercise form,
// every muscle-group filter and the badges. Cardio is not a muscle group, but stays a separate filter.
const MUSCLE_GROUP_BY_ID = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.id, g]));
const MUSCLE_GROUP_BY_LABEL = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.label, g]));
const MUSCLE_FILTER_CARDIO = "Cardio";
const MUSCLE_FILTER_OPTIONS = [...MUSCLE_GROUPS.map((g) => g.label), MUSCLE_FILTER_CARDIO];
const MUSCLE_GROUP_UNKNOWN_LABEL = "Partia nieokreślona";
// Filter list for a given exercise library: the 10 groups + Cardio, plus "Partia nieokreślona" only
// while some exercise can't be classified — so old own exercises never vanish from browsing.
function muscleFilterOptionsFor(exercises) {
  const anyUnknown = (exercises || []).some((e) => exerciseMatchesMuscleFilter(e, MUSCLE_GROUP_UNKNOWN_LABEL, exercises));
  return anyUnknown ? [...MUSCLE_FILTER_OPTIONS, MUSCLE_GROUP_UNKNOWN_LABEL] : MUSCLE_FILTER_OPTIONS;
}
function isCardioExercise(ex) {
  return !!ex && (!!ex.isCardio || (Array.isArray(ex.category) && ex.category.includes("Cardio")));
}
// Does an exercise belong under a filter tile (a MUSCLE_GROUPS label or "Cardio")? A muscle group
// matches its primary OR secondary groups — the same reach the old category filter had.
function exerciseMatchesMuscleFilter(ex, filter, exercises) {
  if (!filter || filter === "Wszystkie") return true;
  if (filter === MUSCLE_FILTER_CARDIO) return isCardioExercise(ex);
  // an exercise that can't be classified (e.g. an old own "Nogi") stays findable under its own filter
  if (filter === MUSCLE_GROUP_UNKNOWN_LABEL) return !!ex && !isCardioExercise(ex) && !getExerciseMuscleGroups(ex.id, exercises && exercises.length ? exercises : [ex]);
  const g = MUSCLE_GROUP_BY_LABEL[filter];
  if (!g || !ex) return false;
  const mg = getExerciseMuscleGroups(ex.id, exercises && exercises.length ? exercises : [ex]);
  return !!mg && (mg.muscleGroup === g.id || mg.secondaryMuscleGroups.includes(g.id));
}
// Badges for lists / details: primary first, then secondary; cardio = "Cardio"; an exercise that can't
// be classified unambiguously (e.g. an old own "Nogi") gets a neutral fallback, never a guess.
function exerciseMuscleBadges(ex, exercises) {
  if (isCardioExercise(ex)) return [MUSCLE_FILTER_CARDIO];
  const mg = ex ? getExerciseMuscleGroups(ex.id, exercises && exercises.length ? exercises : [ex]) : null;
  if (!mg) return [MUSCLE_GROUP_UNKNOWN_LABEL];
  return [mg.muscleGroup, ...mg.secondaryMuscleGroups].map((id) => (MUSCLE_GROUP_BY_ID[id] ? MUSCLE_GROUP_BY_ID[id].label : id));
}
// Which old-category visuals (CATEGORY_IMAGES / CATEGORY_META) a label uses.
function categoryVisualKey(cat) {
  return MUSCLE_GROUP_BY_LABEL[cat] ? MUSCLE_GROUP_BY_LABEL[cat].metaCat : cat;
}
// The exercise form's saved value in the EXISTING category field: the primary label first (always),
// then the secondary labels in dictionary order (deterministic, never click order); the primary is
// never repeated as a secondary.
function buildMuscleCategory(primaryId, secondaryIds) {
  if (!MUSCLE_GROUP_BY_ID[primaryId]) return [];
  const sec = MUSCLE_GROUPS.filter((g) => g.id !== primaryId && (secondaryIds || []).includes(g.id)).map((g) => g.label);
  return [MUSCLE_GROUP_BY_ID[primaryId].label, ...sec];
}
// What the exercise form shows for an existing exercise: atlas → its fixed groups (read-only);
// own → read from category (old or new format); an unmappable first entry ("Nogi", "Całe ciało")
// → no primary, so the person has to choose consciously.
function readMuscleSelection(exercise) {
  if (exercise && Object.prototype.hasOwnProperty.call(ATLAS_MUSCLE_GROUPS, exercise.id)) {
    const a = ATLAS_MUSCLE_GROUPS[exercise.id];
    return { atlas: true, primary: a.muscleGroup, secondary: [...a.secondaryMuscleGroups], legacyUnmapped: false };
  }
  const cats = exercise && Array.isArray(exercise.category) ? exercise.category : [];
  const primary = cats.length ? CATEGORY_TO_MUSCLE_GROUP[cats[0]] || null : null;
  const secondary = [];
  cats.slice(1).forEach((c) => {
    const id = CATEGORY_TO_MUSCLE_GROUP[c];
    if (id && id !== primary && !secondary.includes(id)) secondary.push(id);
  });
  return { atlas: false, primary, secondary, legacyUnmapped: !!exercise && cats.length > 0 && !primary && !isCardioExercise(exercise) };
}


// Statistics per muscle group within [start, end): the muscle-group workload layer (no second
// volume definition, no double counting). Keyed by MUSCLE_GROUPS ids.
function computeStatsByCategory(history, exercises, start, end) {
  return computeMuscleGroupWorkload(history, exercises, start, end);
}

// Session-level totals (already stored on each session) within [start, end).
function computeOverallStats(history, start, end) {
  const sessions = history.filter((h) => {
    const d = new Date(h.date);
    return d >= start && d < end;
  });
  const totalSets = sessions.reduce((s, h) => s + (h.totalSets || 0), 0);
  const totalVolume = sessions.reduce((s, h) => s + (h.volume || 0), 0);
  return { sessionsCount: sessions.length, totalSets, totalVolume };
}



// Chart series for one muscle group: the last 10 sessions in the unit of the most recent one
// (kg / reps / seconds are never drawn on one axis).
function computeCategoryTimeSeries(history, exercises, group) {
  const points = muscleGroupSessionPoints(history, exercises, group);
  if (!points.length) return [];
  const unit = points[points.length - 1].unit;
  return points.filter((p) => p.unit === unit).slice(-10);
}


// A short, deterministic (not literally AI-generated) plain-language summary of where training
// stands right now: the overall direction, plus the specific exercises driving it.
// Formats a set for side-by-side "Poprzednio / Dzisiaj" display in the training report.
function formatReportSet(s, kind) {
  const rirTag = formatRir(s.rir) ? ` @RIR ${formatRir(s.rir)}` : "";
  const dropTag = s.setType === "dropset" ? "Dropset: " : "";
  if (kind === "time") return `${dropTag}${s.duration}s${rirTag}`;
  if (kind === "cardio") {
    const parts = [`${s.duration || 0}s`];
    if (s.speed) parts.push(`${s.speed}km/h`);
    if (s.incline) parts.push(`${s.incline}%`);
    return `${dropTag}${parts.join(" · ")}`;
  }
  if (kind === "sets") return `${dropTag}${s.weight != null ? `${s.weight}kg` : "seria wykonana"}`;
  if (kind === "bodyweight") return `${dropTag}${s.reps} powt.${rirTag}`;
  if (kind === "bodyweightPlus") return `${dropTag}MW+${s.weight || 0}kg × ${s.reps}${rirTag}`;
  return `${dropTag}${s.weight}kg × ${s.reps}${rirTag}`;
}


// The full local "Analiza treningu" report — generated on demand from the session's own saved
// data plus history, never stored as a separate text blob, so it's automatically correct again
// if the session is later edited (no stale cached report to go out of sync). Entirely local:
// no API, no key, no network — a deterministic write-up, not a live AI call.
// Cardio gets its own comparison, never the weight/rep progression engine: same time but more
// distance (or less time for the same distance) reads as an improvement; anything else is just
// reported neutrally. No fabricated weight targets, no RIR — just what actually happened.
function analyzeCardioSession(todaySet, priorSet) {
  if (!todaySet) return { status: null, message: null };
  if (!priorSet) return { status: null, message: "Zapisano dzisiejszy wynik — porównanie pojawi się przy kolejnym wykonaniu tego ćwiczenia." };

  const td = Number(todaySet.duration) || 0;
  const pd = Number(priorSet.duration) || 0;
  const tdist = Number(todaySet.distance) || 0;
  const pdist = Number(priorSet.distance) || 0;

  if (tdist > 0 && pdist > 0) {
    if (tdist > pdist && td <= pd * 1.05) {
      return { status: "green", message: `W podobnym czasie pokonałeś większy dystans niż poprzednio (${tdist} km vs ${pdist} km). To oznacza poprawę wyniku w tej sesji.` };
    }
    if (tdist < pdist && td >= pd * 0.95) {
      return { status: "yellow", message: `Dystans był mniejszy niż poprzednio przy podobnym czasie (${tdist} km vs ${pdist} km).` };
    }
    return { status: "yellow", message: `Dzisiaj: ${tdist} km. Poprzednio: ${pdist} km.` };
  }
  if (td > 0 && pd > 0) {
    if (td > pd * 1.05) return { status: "green", message: `Trening trwał dłużej niż poprzednio (${fmtClock(td)} vs ${fmtClock(pd)}).` };
    if (td < pd * 0.95) return { status: "yellow", message: `Trening był krótszy niż poprzednio (${fmtClock(td)} vs ${fmtClock(pd)}).` };
    return { status: "yellow", message: `Podobny czas jak poprzednio (${fmtClock(td)}).` };
  }
  return { status: null, message: "Zapisano dzisiejszy wynik — porównanie pojawi się przy kolejnym wykonaniu tego ćwiczenia." };
}

function generateTrainingReport(session, history, exercises) {
  const exerciseReports = (session.exercises || []).map((ex) => {
    const kind = ex.type;
    const matches = findMatchingSessions(history, { exerciseId: ex.exerciseId, beforeDate: session.date });
    const priorSession = matches[0] || null;
    const priorData = priorSession?.exercises.find((e) => e.exerciseId === ex.exerciseId) || null;
    const priorSets = priorData?.sets || [];

    // The report is an aggregation of the ONE per-exercise engine, recomputed with the current
    // logic from this session's own data and only the history before it (no future leakage).
    // Any analysis text stored inside an older session stays in the data untouched as a
    // historical record — it's just never presented as the current recommendation.
    const analysis = kind === "cardio" ? analyzeCardioSession(ex.sets[0], priorSets[0]) : analyzeSessionExercise(history, session, ex);

    const best = getHistoricalBest(history, ex.exerciseId, session.date);
    const todayMaxWeight = Math.max(0, ...ex.sets.map((s) => Number(s.weight) || 0));
    const todayMaxReps = Math.max(0, ...ex.sets.map((s) => Number(s.reps) || 0));
    const todayMaxDuration = Math.max(0, ...ex.sets.map((s) => Number(s.duration) || 0));

    let achievement = null;
    if (best.hasHistory) {
      if ((kind === "weight" || kind === "bodyweightPlus") && todayMaxWeight > best.maxWeight) {
        achievement = `Nowy maksymalny ciężar: ${todayMaxWeight} kg (poprzednio ${best.maxWeight} kg).`;
      } else if (kind === "bodyweight" && todayMaxReps > best.maxReps) {
        achievement = `Nowy rekord powtórzeń: ${todayMaxReps} (poprzednio ${best.maxReps}).`;
      } else if (kind === "time" && todayMaxDuration > best.maxDuration) {
        achievement = `Nowy najdłuższy czas: ${todayMaxDuration}s (poprzednio ${best.maxDuration}s).`;
      }
    }

    const notes = ex.sets.map((s) => s.note).filter(Boolean);
    const hadDropset = ex.sets.some((s) => s.setType === "dropset");

    return {
      exerciseId: ex.exerciseId,
      name: ex.name,
      kind,
      priorSets,
      todaySets: ex.sets,
      status: analysis?.baseline ? null : analysis?.status || null,
      baseline: !!analysis?.baseline,
      message: analysis?.message || null,
      achievement,
      notes,
      hadDropset,
    };
  });

  const counts = { green: 0, yellow: 0, red: 0, stagnation: 0 };
  exerciseReports.forEach((r) => {
    if (r.status && counts[r.status] !== undefined) counts[r.status]++;
  });
  const total = exerciseReports.length;

  const opening =
    total === 0
      ? "Trening zapisany."
      : counts.green >= Math.ceil(total * 0.5)
      ? "To był mocny trening."
      : counts.red + counts.stagnation > counts.green
      ? "Dzisiejszy trening był wymagający."
      : "Solidny, stabilny trening.";

  const narrativeParts = [opening];
  if (counts.green > 0) {
    narrativeParts.push(
      `W ${counts.green} z ${total} ${total === 1 ? "ćwiczenia" : "ćwiczeń"} widać progres — więcej powtórzeń, lepszy zapas (RIR), większą objętość lub stabilizację nowego ciężaru.`
    );
  }
  if (counts.yellow > 0) {
    narrativeParts.push(
      `${counts.yellow} ${plWord(counts.yellow, "ćwiczenie", "ćwiczenia", "ćwiczeń")} ze statusem „${STATUS_META.yellow.label}” — obecny poziom nadal jest odpowiedni do dalszej pracy.`
    );
  }
  if (counts.red > 0) {
    narrativeParts.push(
      `W ${counts.red} ${plWord(counts.red, "ćwiczeniu", "ćwiczeniach", "ćwiczeniach")} pogorszenie utrzymuje się od kolejnego wykonania — priorytetem jest jakość na obecnym ciężarze.`
    );
  }
  if (counts.stagnation > 0) {
    narrativeParts.push(
      `⚠️ ${counts.stagnation} ${plWord(counts.stagnation, "ćwiczenie pokazuje", "ćwiczenia pokazują", "ćwiczeń pokazuje")} możliwą stagnację — kolejne wykonania przy tym samym ciężarze bez poprawy. To sygnał do obserwacji i pracy nad powtórzeniami — ewentualnie z pomocą dropsetu, bez zmiany ćwiczenia czy programu.`
    );
  }

  const achievements = exerciseReports.filter((r) => r.achievement).map((r) => `${r.name}: ${r.achievement}`);

  const motivational =
    total === 0
      ? ""
      : counts.green >= Math.ceil(total * 0.6)
      ? "Dobra robota. Konsekwentnie budujesz wynik — trzymaj tempo."
      : counts.red + counts.stagnation >= Math.ceil(total * 0.5)
      ? "Dzisiejszy wynik był słabszy w kilku ćwiczeniach, ale pojedynczy gorszy trening nie oznacza regresu formy. Najważniejsze będzie sprawdzenie kolejnego wykonania."
      : "Solidna sesja — utrzymanie wyniku też jest wartościowym krokiem naprzód.";

  const stepPriority = { red: 0, stagnation: 1, yellow: 2, green: 3 };
  const nextSteps = [...exerciseReports]
    .filter((r) => r.message)
    .sort((a, b) => (stepPriority[a.status] ?? 4) - (stepPriority[b.status] ?? 4))
    .slice(0, 5)
    .map((r) => ({ name: r.name, message: r.message, status: r.status }));

  return {
    header: { title: session.planName || "Trening bez planu", date: session.date, durationSec: session.durationSec },
    quickSummary: {
      exercisesCount: session.exercisesCount,
      totalSets: session.totalSets,
      totalReps: session.totalReps,
      totalWeight: session.totalWeight,
      volume: session.volume,
      durationSec: session.durationSec,
      dropsetCount: (session.exercises || []).reduce((sum, ex) => sum + ex.sets.filter((s) => s.setType === "dropset").length, 0),
    },
    exerciseReports,
    counts,
    narrative: narrativeParts.join(" "),
    achievements,
    motivational,
    nextSteps,
  };
}

// Picks at most one gentle PRO upsell hint to show on the dashboard, honestly earned by real
// data (never invented, never shown after a mediocre session) and never repeated too often.
// `proHints` maps a hint's key to when it was last shown, so each kind of hint has its own
// cooldown instead of nagging on every visit.
function computeProHint(history, exercises, proHints) {
  const last = [...history].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (!last) return null;
  const now = Date.now();
  const daysSince = (d) => (now - new Date(d).getTime()) / 86400000;
  const wasShown = (key, cooldownDays) => {
    const at = proHints[key];
    return at != null && now - at < cooldownDays * 86400000;
  };

  const candidates = [];

  // 1. Milestone session count — shown once per milestone, ever.
  const milestones = [10, 25, 50, 100, 200];
  if (milestones.includes(history.length)) {
    const key = `milestone_${history.length}`;
    if (!proHints[key]) {
      candidates.push({ key, priority: 1, text: `To już Twój ${history.length}. zapisany trening. Konsekwencja robi robotę — sprawdź swój progres w PRO.` });
    }
  }

  const lastReport = generateTrainingReport(last, history, exercises);
  const lastTotal = lastReport.exerciseReports.length;

  // 2. A real record was set last session — teaser only, doesn't say which one.
  if (lastReport.achievements.length > 0) {
    const key = `record_${last.id}`;
    if (!proHints[key]) {
      candidates.push({ key, priority: 2, text: `🏆 Dziś padł nowy rekord w jednym z ćwiczeń. Zobacz w którym →` });
    }
  }

  // 3. Three sessions in a row on the same plan, none of them a net regression.
  if (last.planId) {
    const samePlan = history
      .filter((h) => h.planId === last.planId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
    if (samePlan.length === 3) {
      const allSolid = samePlan.every((s) => {
        const r = generateTrainingReport(s, history, exercises);
        return r.exerciseReports.length > 0 && r.counts.green >= r.counts.red + r.counts.stagnation;
      });
      const key = `streak_${last.id}`;
      if (allSolid && !proHints[key]) {
        candidates.push({ key, priority: 3, text: `Trzeci trening z rzędu bez regresu. Ładny trend — pełny wykres zobaczysz w PRO.` });
      }
    }
  }

  // 4. Coming back after a real break — re-eligible every few days while still true, not on
  // every single visit.
  if (daysSince(last.date) >= 10 && !wasShown("break", 3)) {
    candidates.push({ key: "break", priority: 4, text: `Dawno Cię nie było — witaj z powrotem. W PRO sprawdzisz, jak wygląda Twój progres na tle sprzed przerwy.` });
  }

  // 5. Solidly good session overall (majority green) — the general "nice work" nudge, lowest
  // priority so a more specific hint always wins when one applies.
  if (lastTotal > 0 && lastReport.counts.green >= Math.ceil(lastTotal * 0.5)) {
    const key = `good_${last.id}`;
    if (!proHints[key]) {
      candidates.push({ key, priority: 5, text: `Mocny trening — ${lastReport.counts.green} z ${lastTotal} ${plWord(lastTotal, "ćwiczenia", "ćwiczeń", "ćwiczeń")} w progresie. W PRO zobaczysz, które konkretnie i o ile.` });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0] || null;
}

function generateProgressReport(progressSignal) {
  const { counts, items } = progressSignal;
  const total = items.length;
  if (total === 0) {
    return "Zbyt mało danych, żeby ocenić progres — zapisz przynajmniej dwa wykonania tego samego ćwiczenia.";
  }
  const namesFor = (status) =>
    items
      .filter((i) => i.status === status)
      .map((i) => i.name)
      .slice(0, 3)
      .join(", ");

  const parts = [];
  if (counts.green > 0) parts.push(`🟢 ${STATUS_META.green.label}: ${namesFor("green")}${counts.green > 3 ? " i inne" : ""} — lepsze wykonanie niż wcześniej.`);
  if (counts.stagnation > 0) parts.push(`⚠️ ${STATUS_META.stagnation.label}: ${namesFor("stagnation")} — warto popracować nad powtórzeniami, ewentualnie dorzucić dropset.`);
  if (counts.red > 0) parts.push(`🔴 ${STATUS_META.red.label}: ${namesFor("red")} — priorytetem jest jakość wykonania na obecnym poziomie.`);
  if (counts.yellow > 0 && parts.length < 2) {
    parts.push(`🟡 ${STATUS_META.yellow.label}: ${counts.yellow} ${plWord(counts.yellow, "ćwiczenie", "ćwiczenia", "ćwiczeń")} — obecny poziom nadal jest odpowiedni do dalszej pracy.`);
  }

  const heading =
    counts.green >= counts.red + counts.stagnation
      ? "Ogólnie idzie w dobrym kierunku — trzymaj tempo."
      : "Ogólnie warto popracować nad jakością serii na obecnych ciężarach.";

  return [heading, ...parts].join(" ");
}

