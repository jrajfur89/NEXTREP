// NEXTREP Progress Engine 2.0 — PE-A: load and volume normalization.
//
// One definition of "what the typed numbers mean" for every screen: which sets count, how much
// external load a set carries and what its classic volume in kg is. Pure functions: no React,
// storage or Supabase, no dependency on a particular exercise atlas. The model of an exercise
// (loadModel, implements, laterality, repsCounting) comes from the caller — from the F2 atlas once
// it exists, until then from the transitional mapping in load-legacy-map.js.
//
// Approved rules (Progress Engine 2.0 spec, 10.10.2026):
//   D2  unilateral: reps per side; alternating: reps in total; no double counting.
//   D4  missing RIR: no value is assumed; the set counts normally.
//   D5  dropsets count as working sets and volume, not for progression or records; warmups count
//       for nothing.
//   D8  body mass is never part of classic volume in kg.
//   P1  resistance bands: 0 kg classic volume; sets and reps count; typed resistance is info only.
//   P3  stored session.volume / session.totalWeight are legacy fields — never read here.
//
// Inputs accept today's set shape ({ weight, reps, duration, rir, setType: "normal"|"dropset",
// done }) and the planned v2 shape ({ loadKg, assistKg, setType: "warmup"|"working"|"dropset",
// status: "done"|"skipped" }). Stored data is only read, never changed.
//
// AT3.2c (AT3-D19, spec v2 §7.2): the model "cardio" only — a cardio set is performed when it has a
// valid `durationSec` or `distanceM` (cardio.js, P2); exerciseTotals adds time, distance and the
// derived pace; sessionTotals keeps cardio OUT of its sets, reps, seconds and kg and reports it in a
// separate `cardio` block. Every other model is unchanged.
//
// B02/S2 (B02-D25 A): the model "smith_plates_only" (Smith machine). The typed number P is the mass of
// the PLATES only. The starting resistance R of the machine is an optional per-user setting of the
// exercise card (exercise-settings.js), frozen in the workout snapshot (load-snapshot.js v3) and passed
// here as `model.startingResistanceKg` (null = R unknown; 0 = a stated zero). Computed load
// `effectiveLoadKg` = P + R when R is known, P when it is not; volume = effectiveLoadKg × reps in both
// cases and counts in the main volume (decision B). A result with R unknown has volumeStatus
// "plates_only" (never a plain "exact") and sessionTotals reports a notice for it. No e1RM here.
import { parseRirBounds } from "./rir.js";
import { cardioSetValues, paceSecPerKm } from "./cardio.js";

// Version of the volume formula. v2 stores it next to any persisted volume (decision P3).
export const VOLUME_FORMULA_VERSION = 1;

// What a typed kg means for each load model and the main unit of its work.
//   kg: "total"         — the whole load (bar with plates, stack, plates on a machine)
//       "per_implement" — one dumbbell / kettlebell; multiplied by `implements`
//       "added"         — only the load added to body mass (belt, vest)
//       "plates"        — only the plates of a Smith machine; + the starting resistance R when known
//       "assist"        — assistance (counterweight, band): never a load
//       "resistance"    — band resistance: not comparable with kg
//       "none"          — no kg at all
export const LOAD_MODELS = {
  barbell_total: { kg: "total", unit: "kg", implements: 1 },
  dumbbell_pair: { kg: "per_implement", unit: "kg", implements: 2 },
  dumbbell_single: { kg: "per_implement", unit: "kg", implements: 1 },
  kettlebell_pair: { kg: "per_implement", unit: "kg", implements: 2 },
  kettlebell_single: { kg: "per_implement", unit: "kg", implements: 1 },
  machine_stack: { kg: "total", unit: "kg", implements: 1 },
  plate_loaded: { kg: "total", unit: "kg", implements: 1 },
  cable: { kg: "total", unit: "kg", implements: 1 },
  smith_plates_only: { kg: "plates", unit: "kg", implements: 1 },
  // a loaded exercise whose equipment is not known (e.g. history of a deleted own exercise)
  external_unknown: { kg: "total", unit: "kg", implements: 1 },
  bodyweight: { kg: "none", unit: "reps", implements: 0 },
  bodyweight_plus: { kg: "added", unit: "kg", implements: 1 },
  assisted: { kg: "assist", unit: "reps", implements: 0 },
  band: { kg: "resistance", unit: "reps", implements: 0 },
  time: { kg: "none", unit: "seconds", implements: 0 },
  cardio: { kg: "none", unit: "cardio", implements: 0 },
  sets_only: { kg: "none", unit: "sets", implements: 0 },
};
export const LATERALITIES = ["bilateral", "unilateral", "alternating"];
// How sure the engine is about an exercise's model. Only "verified" and "high" give an exact volume.
//   verified — from the atlas (F2) or the transitional map for an unchanged built-in exercise
//   high     — inferred, but the kg meaning and the sides are unambiguous (e.g. a barbell)
//   low      — inferred, plausible but not certain (e.g. own dumbbell exercise: one or two?)
//   unknown  — cannot be determined; no kg volume is given
export const CONFIDENCE_LEVELS = ["verified", "high", "low", "unknown"];
// kg meanings that give a classic volume in kg
export const CLASSIC_KG_MEANINGS = ["total", "per_implement", "added", "plates"];

// B02/S2: the message contract for a performed Smith exercise without its starting resistance. The
// post-workout report (S6) shows it; the code is stable, the text is the approved meaning.
export const SMITH_STARTING_RESISTANCE_MISSING = "SMITH_STARTING_RESISTANCE_MISSING";
export const LOAD_NOTICE_MESSAGES = Object.freeze({
  [SMITH_STARTING_RESISTANCE_MISSING]: "Dla ćwiczenia na maszynie Smitha liczono same talerze, ponieważ nie uzupełniono oporu początkowego w karcie ćwiczenia.",
});

const ROLE_COUNTS = { working: true, dropset: true, warmup: false, skipped: false };
// kg sums are rounded to 1 g so that the order of sets never changes a total (float addition)
const roundKg = (x) => Math.round(x * 1000) / 1000;

// ---- parsing ----------------------------------------------------------------------------------
function parseNonNegative(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const s = String(value).trim().replace(",", ".");
  if (s === "" || !/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
// Typed kg: "57,5" and "57.5" → 57.5; empty, text, negative, NaN, Infinity → null.
export function parseKg(value) {
  return parseNonNegative(value);
}
export function parseReps(value) {
  return parseNonNegative(value);
}
export function parseSeconds(value) {
  return parseNonNegative(value);
}

// ---- model --------------------------------------------------------------------------------------
// Completes and validates a model object: unknown loadModel → "external_unknown" with confidence
// "unknown"; laterality / repsCounting default from each other; bilateral never counts per side.
export function normalizeModel(model) {
  const m = model || {};
  let loadModel = LOAD_MODELS[m.loadModel] ? m.loadModel : "external_unknown";
  let confidence = CONFIDENCE_LEVELS.includes(m.confidence) ? m.confidence : "unknown";
  if (!LOAD_MODELS[m.loadModel]) confidence = "unknown";
  const laterality = LATERALITIES.includes(m.laterality) ? m.laterality : "bilateral";
  let repsCounting = m.repsCounting === "per_side" || m.repsCounting === "total" ? m.repsCounting : laterality === "unilateral" ? "per_side" : "total";
  if (laterality === "bilateral") repsCounting = "total";
  const def = LOAD_MODELS[loadModel];
  const implements_ = def.kg === "per_implement" && Number.isInteger(m.implements) && m.implements > 0 ? m.implements : def.implements;
  const inc = parseKg(m.loadIncrementKg);
  // Smith starting resistance: a finite number ≥ 0 (0 is a stated zero); anything else = unknown
  const r = m.startingResistanceKg;
  const startingResistanceKg = def.kg === "plates" && typeof r === "number" && Number.isFinite(r) && r >= 0 ? r : null;
  return {
    loadModel,
    implements: implements_,
    laterality,
    repsCounting,
    loadIncrementKg: inc != null && inc > 0 ? inc : null,
    source: m.source || "none",
    confidence,
    unit: def.unit,
    kgMeaning: def.kg,
    startingResistanceKg,
  };
}
// Does this model have a classic volume in kg at all?
export function hasClassicKg(model) {
  return CLASSIC_KG_MEANINGS.includes(normalizeModel(model).kgMeaning);
}

// ---- sets ---------------------------------------------------------------------------------------
// warmup | working | dropset | skipped. Today's "normal" (and a missing type) is "working".
export function setRole(set) {
  if (!set || typeof set !== "object") return "skipped";
  if (set.status === "skipped") return "skipped";
  if (set.setType === "warmup") return "warmup";
  if (set.setType === "dropset") return "dropset";
  return "working";
}
// Was the set actually done? Same test as the app's isSetPerformed, per unit.
export function isPerformed(set, model) {
  if (!set || typeof set !== "object" || set.status === "skipped") return false;
  const unit = normalizeModel(model).unit;
  if (unit === "cardio") {
    const v = cardioSetValues(set);
    return v.durationSec != null || v.distanceM != null;
  }
  if (unit === "seconds") return (parseSeconds(set.duration) ?? 0) > 0;
  if (unit === "sets") return Boolean(set.done) || set.status === "done" || (set.weight !== "" && set.weight != null);
  return (parseReps(set.reps) ?? 0) > 0;
}
// Counts for sets and volume (D5): performed working sets and dropsets.
export function isWorkingSet(set, model) {
  return ROLE_COUNTS[setRole(set)] === true && isPerformed(set, model);
}
// Counts for progression and records (D5): performed working sets only.
export function isProgressSet(set, model) {
  return setRole(set) === "working" && isPerformed(set, model);
}

// The one place where typed numbers of a set are interpreted.
export function normalizeLoad(set, model) {
  const m = normalizeModel(model);
  const s = set && typeof set === "object" ? set : {};
  const role = setRole(set);
  const performed = isPerformed(set, m);
  const counts = ROLE_COUNTS[role] === true && performed;
  const reps = parseReps(s.reps) ?? 0;
  const seconds = m.unit === "cardio" ? cardioSetValues(s).durationSec ?? 0 : parseSeconds(s.duration) ?? 0;
  const perSide = m.repsCounting === "per_side";
  const typed = parseKg(s.loadKg !== undefined && s.loadKg !== null && s.loadKg !== "" ? s.loadKg : s.weight);

  let kgPerImplement = null;
  let externalKg = 0;
  if (m.kgMeaning === "total" || m.kgMeaning === "added") {
    kgPerImplement = typed;
    externalKg = typed ?? 0;
  } else if (m.kgMeaning === "per_implement") {
    kgPerImplement = typed;
    externalKg = (typed ?? 0) * m.implements;
  } else if (m.kgMeaning === "plates") {
    // P typed; R from the model (snapshot). No typed P → no load, like every other model.
    kgPerImplement = typed;
    externalKg = typed == null ? 0 : roundKg(typed + (m.startingResistanceKg ?? 0));
  }
  const assistKg = m.kgMeaning === "assist" ? parseKg(s.assistKg !== undefined && s.assistKg !== null && s.assistKg !== "" ? s.assistKg : s.weight) : null;
  const bandResistance = m.kgMeaning === "resistance" ? typed : null;

  const kgApplies = hasClassicKg(m);
  let volumeKg = 0;
  if (kgApplies && counts) volumeKg = m.confidence === "unknown" ? null : roundKg(externalKg * reps * (perSide ? 2 : 1));

  const cardio = m.unit === "cardio" ? cardioSetValues(s) : null;
  const rirBounds = parseRirBounds(s.rir);
  const rirKnown = rirBounds != null;
  const repBased = m.unit === "kg" || m.unit === "reps";
  return {
    role,
    performed,
    counts,
    progress: counts && role === "working",
    // reps as typed (per side for repsCounting "per_side", in total otherwise)
    reps,
    // cardio only (null for every other model): valid canonical values of the set
    durationSec: cardio ? cardio.durationSec : null,
    distanceM: cardio ? cardio.distanceM : null,
    repsPerSide: m.laterality === "bilateral" ? null : perSide ? reps : reps / 2,
    repsAllSides: perSide ? reps * 2 : reps,
    seconds,
    kgPerImplement,
    externalKg,
    // computed load of the set (= externalKg); for Smith P + R, or P when R is unknown
    effectiveLoadKg: externalKg,
    // Smith only (null for every other model): what was typed (P) and the R used
    platesKg: m.kgMeaning === "plates" ? typed : null,
    startingResistanceKg: m.kgMeaning === "plates" ? m.startingResistanceKg : null,
    volumeKg,
    assistKg,
    bandResistance,
    isLoaded: externalKg > 0,
    rir: rirKnown ? s.rir : null,
    rirKnown,
    // kg typed, but the set was not performed (no reps): kept out of every sum, flagged
    incomplete: repBased && role !== "skipped" && !performed && (typed != null || assistKg != null),
  };
}
// Classic volume of one set in kg: 0 for warmups, skipped, not performed and models without kg;
// null when the exercise's model is unknown (the volume cannot be stated).
export function setVolumeKg(set, model) {
  return normalizeLoad(set, model).volumeKg;
}

// ---- exercise and session ----------------------------------------------------------------------
// volumeStatus: "exact" | "estimated" (model confidence low) | "unavailable" (model unknown)
//               | "plates_only" (Smith with the starting resistance unknown: plates only, B02-D25 A)
//               | "none" (the model has no classic kg: bodyweight, assisted, band, time, cardio, sets)
function volumeStatusOf(m) {
  if (!hasClassicKg(m)) return "none";
  if (m.confidence === "unknown") return "unavailable";
  if (m.confidence === "low") return "estimated";
  if (m.kgMeaning === "plates" && m.startingResistanceKg == null) return "plates_only";
  return "exact";
}
// Status of a sum of several results: worst first (shared by sessionTotals and muscle-stats).
export function combineVolumeStatuses(statuses) {
  const s = statuses instanceof Set ? statuses : new Set(statuses);
  if (s.has("unavailable")) return "partial";
  if (s.has("estimated")) return "estimated";
  if (s.has("plates_only")) return "plates_only";
  if (s.has("exact")) return "exact";
  return "none";
}
export function exerciseTotals(sets, model) {
  const m = normalizeModel(model);
  const t = {
    unit: m.unit,
    loadModel: m.loadModel,
    confidence: m.confidence,
    volumeStatus: volumeStatusOf(m),
    workingSets: 0,
    progressSets: 0,
    dropsetSets: 0,
    warmupSets: 0,
    skippedSets: 0,
    incompleteSets: 0,
    reps: 0,
    repsAllSides: 0,
    seconds: 0,
    volumeKg: 0,
    topExternalKg: null,
    minAssistKg: null,
    rirMissingSets: 0,
    // Smith only: the basis of the computed load and whether R is missing (null for other models)
    loadBasis: m.kgMeaning === "plates" ? (m.startingResistanceKg == null ? "plates_only" : "plates_plus_starting_resistance") : null,
    startingResistanceKg: m.kgMeaning === "plates" ? m.startingResistanceKg : null,
    startingResistanceMissing: m.kgMeaning === "plates" ? m.startingResistanceKg == null : false,
    topPlatesKg: null,
    // cardio only (model "cardio"): time, distance and pace from the sets that have both values
    durationSec: 0,
    distanceM: 0,
    pacedDurationSec: 0,
    pacedDistanceM: 0,
    paceSecPerKm: null,
  };
  for (const set of Array.isArray(sets) ? sets : []) {
    const n = normalizeLoad(set, m);
    if (n.role === "warmup") t.warmupSets++;
    if (n.role === "skipped") t.skippedSets++;
    if (n.incomplete) t.incompleteSets++;
    if (!n.counts) continue;
    t.workingSets++;
    if (n.role === "dropset") t.dropsetSets++;
    if (n.progress) t.progressSets++;
    t.reps += n.reps;
    t.repsAllSides += n.repsAllSides;
    t.seconds += n.seconds;
    if (t.volumeKg !== null) t.volumeKg = n.volumeKg === null ? null : roundKg(t.volumeKg + n.volumeKg);
    if (!n.rirKnown) t.rirMissingSets++;
    if (m.unit === "cardio") {
      t.durationSec += n.durationSec ?? 0;
      t.distanceM += n.distanceM ?? 0;
      if (n.durationSec != null && n.distanceM != null) {
        t.pacedDurationSec += n.durationSec;
        t.pacedDistanceM += n.distanceM;
      }
    }
    if (n.progress && n.isLoaded) t.topExternalKg = Math.max(t.topExternalKg ?? 0, n.externalKg);
    if (n.progress && n.platesKg != null) t.topPlatesKg = Math.max(t.topPlatesKg ?? 0, n.platesKg);
    if (n.progress && n.assistKg != null) t.minAssistKg = t.minAssistKg == null ? n.assistKg : Math.min(t.minAssistKg, n.assistKg);
  }
  if (t.volumeStatus === "unavailable") t.volumeKg = null;
  t.paceSecPerKm = paceSecPerKm(t.pacedDurationSec, t.pacedDistanceM);
  return t;
}

// Session totals = the sum of exerciseTotals over its exercises. `resolveModel(sessionExercise)`
// returns the model of one entry of session.exercises ({ exerciseId, type, sets, … }).
// volumeStatus: "exact" | "estimated" | "partial" (some exercise's volume unavailable — volumeKg is
// the sum of the others) | "plates_only" (a Smith exercise without R, B02-D25 A) | "none" (no
// exercise with classic kg). `notices`: [{ code, exerciseId, message }] — today only
// SMITH_STARTING_RESISTANCE_MISSING, for a PERFORMED Smith exercise whose snapshot has no R.
export function sessionTotals(session, resolveModel) {
  const list = session && Array.isArray(session.exercises) ? session.exercises : [];
  const exercises = list.map((ex) => {
    const model = normalizeModel(typeof resolveModel === "function" ? resolveModel(ex) : null);
    return { exerciseId: ex ? ex.exerciseId : null, model, totals: exerciseTotals(ex ? ex.sets : [], model) };
  });
  const out = { workingSets: 0, reps: 0, repsAllSides: 0, seconds: 0, volumeKg: 0, volumeStatus: "none", exercises, notices: [] };
  // cardio (AT3-D19): its own block, never mixed into the sums above. Distance is kept per
  // exercise (activity) only — no distance total across different activities (O-32).
  const cardio = { activities: 0, sets: 0, durationSec: 0, byExercise: {} };
  const statuses = new Set();
  for (const e of exercises) {
    const t = e.totals;
    if (e.model.unit === "cardio") {
      if (t.workingSets === 0) continue;
      cardio.activities++;
      cardio.sets += t.workingSets;
      cardio.durationSec += t.durationSec;
      const raw = list[exercises.indexOf(e)] || {};
      const key = e.exerciseId ?? raw.catalogExerciseId ?? raw.privateExerciseId ?? "unknown";
      const b = cardio.byExercise[key] || (cardio.byExercise[key] = { activities: 0, durationSec: 0, distanceM: 0, pacedDurationSec: 0, pacedDistanceM: 0, paceSecPerKm: null });
      b.activities++;
      b.durationSec += t.durationSec;
      b.distanceM += t.distanceM;
      b.pacedDurationSec += t.pacedDurationSec;
      b.pacedDistanceM += t.pacedDistanceM;
      b.paceSecPerKm = paceSecPerKm(b.pacedDurationSec, b.pacedDistanceM);
      continue;
    }
    out.workingSets += t.workingSets;
    out.reps += t.reps;
    out.repsAllSides += t.repsAllSides;
    out.seconds += t.seconds;
    if (t.volumeStatus !== "none" && t.workingSets > 0) statuses.add(t.volumeStatus);
    if (t.volumeKg != null) out.volumeKg = roundKg(out.volumeKg + t.volumeKg);
    if (t.startingResistanceMissing && t.workingSets > 0) {
      const raw = list[exercises.indexOf(e)] || {};
      const exerciseId = e.exerciseId ?? raw.catalogExerciseId ?? raw.privateExerciseId ?? null;
      out.notices.push({ code: SMITH_STARTING_RESISTANCE_MISSING, exerciseId, message: LOAD_NOTICE_MESSAGES[SMITH_STARTING_RESISTANCE_MISSING] });
    }
  }
  out.volumeStatus = combineVolumeStatuses(statuses);
  out.cardio = cardio;
  return out;
}
