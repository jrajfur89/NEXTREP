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
import { parseRirBounds } from "./legacy-progression.js";

// Version of the volume formula. v2 stores it next to any persisted volume (decision P3).
export const VOLUME_FORMULA_VERSION = 1;

// What a typed kg means for each load model and the main unit of its work.
//   kg: "total"         — the whole load (bar with plates, stack, plates on a machine)
//       "per_implement" — one dumbbell / kettlebell; multiplied by `implements`
//       "added"         — only the load added to body mass (belt, vest)
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
  };
}
// Does this model have a classic volume in kg at all?
export function hasClassicKg(model) {
  const k = normalizeModel(model).kgMeaning;
  return k === "total" || k === "per_implement" || k === "added";
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
  if (unit === "seconds" || unit === "cardio") return (parseSeconds(set.duration) ?? 0) > 0;
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
  const seconds = parseSeconds(s.duration) ?? 0;
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
  }
  const assistKg = m.kgMeaning === "assist" ? parseKg(s.assistKg !== undefined && s.assistKg !== null && s.assistKg !== "" ? s.assistKg : s.weight) : null;
  const bandResistance = m.kgMeaning === "resistance" ? typed : null;

  const kgApplies = hasClassicKg(m);
  let volumeKg = 0;
  if (kgApplies && counts) volumeKg = m.confidence === "unknown" ? null : roundKg(externalKg * reps * (perSide ? 2 : 1));

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
    repsPerSide: m.laterality === "bilateral" ? null : perSide ? reps : reps / 2,
    repsAllSides: perSide ? reps * 2 : reps,
    seconds,
    kgPerImplement,
    externalKg,
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
//               | "none" (the model has no classic kg: bodyweight, assisted, band, time, cardio, sets)
function volumeStatusOf(m) {
  if (!hasClassicKg(m)) return "none";
  if (m.confidence === "unknown") return "unavailable";
  if (m.confidence === "low") return "estimated";
  return "exact";
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
    if (n.progress && n.isLoaded) t.topExternalKg = Math.max(t.topExternalKg ?? 0, n.externalKg);
    if (n.progress && n.assistKg != null) t.minAssistKg = t.minAssistKg == null ? n.assistKg : Math.min(t.minAssistKg, n.assistKg);
  }
  if (t.volumeStatus === "unavailable") t.volumeKg = null;
  return t;
}

// Session totals = the sum of exerciseTotals over its exercises. `resolveModel(sessionExercise)`
// returns the model of one entry of session.exercises ({ exerciseId, type, sets, … }).
// volumeStatus: "exact" | "estimated" | "partial" (some exercise's volume unavailable — volumeKg is
// the sum of the others) | "none" (no exercise with classic kg).
export function sessionTotals(session, resolveModel) {
  const list = session && Array.isArray(session.exercises) ? session.exercises : [];
  const exercises = list.map((ex) => {
    const model = normalizeModel(typeof resolveModel === "function" ? resolveModel(ex) : null);
    return { exerciseId: ex ? ex.exerciseId : null, model, totals: exerciseTotals(ex ? ex.sets : [], model) };
  });
  const out = { workingSets: 0, reps: 0, repsAllSides: 0, seconds: 0, volumeKg: 0, volumeStatus: "none", exercises };
  const statuses = new Set();
  for (const e of exercises) {
    const t = e.totals;
    out.workingSets += t.workingSets;
    out.reps += t.reps;
    out.repsAllSides += t.repsAllSides;
    out.seconds += t.seconds;
    if (t.volumeStatus !== "none" && t.workingSets > 0) statuses.add(t.volumeStatus);
    if (t.volumeKg != null) out.volumeKg = roundKg(out.volumeKg + t.volumeKg);
  }
  if (statuses.has("unavailable")) out.volumeStatus = "partial";
  else if (statuses.has("estimated")) out.volumeStatus = "estimated";
  else if (statuses.has("exact")) out.volumeStatus = "exact";
  return out;
}
