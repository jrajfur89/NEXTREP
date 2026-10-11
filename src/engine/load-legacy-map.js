// NEXTREP Progress Engine 2.0 — PE-A: TRANSITIONAL load models for today's exercises.
//
// Today's exercises have no loadModel / laterality / repsCounting. Until the F2 atlas assigns them
// (decision of 11.10.2026: no manual review of the 68 old exercises), this module derives a model:
//   1. a built-in exercise (DEFAULT_EXERCISES id) whose equipment and flags are still the
//      original ones → its entry in LEGACY_ATLAS_MODELS (source "legacy-map", confidence "high");
//   2. otherwise (own exercise, or a built-in one the person edited) → rules on the equipment
//      (source "inferred"); confidence "low" or "unknown" wherever the meaning of the typed kg or
//      the sides cannot be known — such volume is never presented as certain;
//   3. a history entry whose exercise no longer exists → the kind stored with the workout
//      (source "kind").
// The F2 atlas replaces step 1 (source "atlas", confidence "verified"); load.js does not change.
import { normalizeModel } from "./load.js";

const BODY = new Set(["Masa ciała", "Drążek", "Piłka", "Kółko do brzucha"]);
const BAND = new Set(["Gumy oporowe", "Guma oporowa"]);
const LOADED = {
  Sztanga: "barbell",
  "Sztanga łamana": "barbell",
  Hantle: "dumbbell",
  Kettlebell: "kettlebell",
  Maszyny: "machine",
  Wyciąg: "cable",
  Linki: "cable",
};
const ADDED = "Obciążenie";

// Key that identifies an unchanged built-in exercise: sorted equipment + flags.
export function legacyEquipmentKey(exercise) {
  const ex = exercise || {};
  const eq = (Array.isArray(ex.equipment) ? ex.equipment : ex.equipment ? [ex.equipment] : []).map((e) => String(e).trim()).filter(Boolean).sort();
  const flags = [ex.isCardio ? "@cardio" : "", ex.isTimeBased ? "@time" : "", ex.isSetsOnly ? "@sets" : ""].filter(Boolean);
  return [...eq, ...flags].join("+");
}

const model = (loadModel, confidence, source, laterality = "bilateral") => normalizeModel({ loadModel, confidence, source, laterality });

// Rules on equipment and flags (own exercises, edited built-in ones).
export function inferLoadModel(exercise) {
  const ex = exercise || {};
  if (ex.isCardio) return model("cardio", "high", "inferred");
  if (ex.isTimeBased) return model("time", "high", "inferred");
  if (ex.isSetsOnly) return model("sets_only", "high", "inferred");
  const eq = [...new Set((Array.isArray(ex.equipment) ? ex.equipment : ex.equipment ? [ex.equipment] : []).map((e) => String(e).trim()).filter(Boolean))];
  if (!eq.length) return model("external_unknown", "unknown", "inferred");
  const body = eq.filter((e) => BODY.has(e));
  const band = eq.filter((e) => BAND.has(e));
  const added = eq.includes(ADDED);
  const loaded = [...new Set(eq.filter((e) => LOADED[e]).map((e) => LOADED[e]))];
  const other = eq.filter((e) => !BODY.has(e) && !BAND.has(e) && !LOADED[e] && e !== ADDED);
  if (other.length) return model("external_unknown", "unknown", "inferred"); // "Inne" or a typed name
  if (!loaded.length && !added) {
    if (band.length && eq.includes("Drążek")) return model("assisted", "high", "inferred");
    if (band.length) return model("band", "high", "inferred");
    return model("bodyweight", "high", "inferred");
  }
  // load on top of body mass (weighted dips, a vest, a dumbbell between the feet): only the added kg
  if (body.length && (added || loaded.length === 1)) return model("bodyweight_plus", "low", "inferred");
  if (loaded.length > 1 || (added && loaded.length)) return model("external_unknown", "unknown", "inferred");
  if (added) return model("external_unknown", "low", "inferred");
  switch (loaded[0]) {
    case "barbell": return model("barbell_total", "high", "inferred"); // the bar's total, sides almost always both
    case "machine": return model("machine_stack", "high", "inferred"); // the stack / plates as shown
    case "cable": return model("cable", "low", "inferred"); // single-arm work is common
    case "dumbbell": return model("dumbbell_pair", "low", "inferred"); // one or two? unknown
    case "kettlebell": return model("kettlebell_single", "low", "inferred"); // one or two? unknown
    default: return model("external_unknown", "unknown", "inferred");
  }
}

// History entry whose exercise is gone: only the kind stored with the workout is known.
export function loadModelFromKind(kind) {
  switch (kind) {
    case "bodyweight": return model("bodyweight", "high", "kind");
    case "bodyweightPlus": return model("bodyweight_plus", "low", "kind");
    case "time": return model("time", "high", "kind");
    case "cardio": return model("cardio", "high", "kind");
    case "sets": return model("sets_only", "high", "kind");
    case "weight": return model("external_unknown", "low", "kind"); // kg × reps, but per what?
    default: return model("external_unknown", "unknown", "kind");
  }
}

// Model of an exercise from today's atlas or an own exercise.
export function legacyLoadModel(exercise) {
  const entry = exercise && LEGACY_ATLAS_MODELS[exercise.id];
  if (entry && entry.key === legacyEquipmentKey(exercise)) {
    return normalizeModel({ loadModel: entry.loadModel, laterality: entry.laterality, confidence: "high", source: "legacy-map" });
  }
  return inferLoadModel(exercise);
}

// Resolver for sessionTotals: session.exercises[i] → model, via the person's exercise list.
export function makeLegacyResolver(exercises) {
  const byId = new Map((Array.isArray(exercises) ? exercises : []).filter((e) => e && e.id != null).map((e) => [String(e.id), e]));
  return (sessionExercise) => {
    const ex = sessionExercise && sessionExercise.exerciseId != null ? byId.get(String(sessionExercise.exerciseId)) : null;
    return ex ? legacyLoadModel(ex) : loadModelFromKind(sessionExercise ? sessionExercise.type : null);
  };
}

// Built-in exercises (DEFAULT_EXERCISES, src/app/10-atlas-templates.jsx) — generated by
// tools/gen-legacy-load-map.mjs: the rules above, made certain for the built-in exercise, plus the
// exceptions listed in that tool (one dumbbell, per side, alternating, assisted).
// BEGIN LEGACY_ATLAS_MODELS
export const LEGACY_ATLAS_MODELS = {
  squat_barbell: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  bench_press: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  deadlift: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  pullup: { key: "Drążek", loadModel: "bodyweight", laterality: "bilateral" },
  pushup: { key: "Masa ciała", loadModel: "bodyweight", laterality: "bilateral" },
  rkc_plank: { key: "Masa ciała+@time", loadModel: "time", laterality: "bilateral" },
  dips: { key: "Masa ciała+Obciążenie", loadModel: "bodyweight_plus", laterality: "bilateral" },
  farmers_walk: { key: "Hantle+@sets", loadModel: "sets_only", laterality: "bilateral" },
  cardio_run_treadmill: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  cardio_walk_treadmill: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  cardio_elliptical: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  cardio_bike: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  cardio_rower: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  cardio_stairs: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  cardio_airbike: { key: "Maszyny+@cardio", loadModel: "cardio", laterality: "bilateral" },
  lat_pulldown: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  rdl_barbell: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  db_shoulder_press_seated: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "bilateral" },
  db_curl_supination: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "bilateral" },
  cable_triceps_rope: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  barbell_row: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  ez_bar_curl: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  pullup_overhand: { key: "Drążek", loadModel: "bodyweight", laterality: "bilateral" },
  db_incline_press_30: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "bilateral" },
  chest_supported_row_machine: { key: "Maszyny", loadModel: "machine_stack", laterality: "bilateral" },
  leg_press: { key: "Maszyny", loadModel: "plate_loaded", laterality: "bilateral" },
  rdl_dumbbell: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "bilateral" },
  leg_curl_seated: { key: "Maszyny", loadModel: "machine_stack", laterality: "bilateral" },
  hip_abduction_machine: { key: "Maszyny", loadModel: "machine_stack", laterality: "bilateral" },
  db_lateral_raise: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "bilateral" },
  rear_delt_machine: { key: "Maszyny", loadModel: "machine_stack", laterality: "bilateral" },
  cable_crunch: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  cable_fly_standing: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  barbell_row_bent: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  lat_pulldown_neutral: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  ohp_seated_barbell: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  ohp_standing_barbell: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  pullup_band_assist: { key: "Drążek+Guma oporowa", loadModel: "assisted", laterality: "bilateral" },
  hanging_knee_raise: { key: "Drążek", loadModel: "bodyweight", laterality: "bilateral" },
  pullup_underhand: { key: "Drążek", loadModel: "bodyweight", laterality: "bilateral" },
  squat_front_barbell: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  pullup_overhand_weighted: { key: "Drążek+Obciążenie", loadModel: "bodyweight_plus", laterality: "bilateral" },
  hanging_leg_raise_straight: { key: "Drążek", loadModel: "bodyweight", laterality: "bilateral" },
  pullup_underhand_weighted: { key: "Drążek+Obciążenie", loadModel: "bodyweight_plus", laterality: "bilateral" },
  cable_row_seated: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  rear_delt_cable: { key: "Wyciąg", loadModel: "cable", laterality: "bilateral" },
  db_lunge: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "alternating" },
  calf_raise_standing: { key: "Maszyny", loadModel: "machine_stack", laterality: "bilateral" },
  hip_thrust_barbell: { key: "Sztanga", loadModel: "barbell_total", laterality: "bilateral" },
  bodyweight_squat: { key: "Masa ciała", loadModel: "bodyweight", laterality: "bilateral" },
  db_row_single_arm: { key: "Hantle", loadModel: "dumbbell_single", laterality: "unilateral" },
  glute_bridge_bodyweight: { key: "Masa ciała", loadModel: "bodyweight", laterality: "bilateral" },
  plank: { key: "Masa ciała+@time", loadModel: "time", laterality: "bilateral" },
  bulgarian_split_squat_db: { key: "Hantle", loadModel: "dumbbell_pair", laterality: "unilateral" },
  hip_abduction_band: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_squat: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_chest_press: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_row: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_rdl: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_overhead_press: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_curl: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_triceps_extension: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  band_lateral_raise: { key: "Guma oporowa", loadModel: "band", laterality: "bilateral" },
  dead_bug: { key: "Masa ciała", loadModel: "bodyweight", laterality: "alternating" },
  bird_dog: { key: "Masa ciała", loadModel: "bodyweight", laterality: "alternating" },
  lying_knee_raise: { key: "Masa ciała", loadModel: "bodyweight", laterality: "bilateral" },
  ab_wheel_rollout: { key: "Kółko do brzucha", loadModel: "bodyweight", laterality: "bilateral" },
  weighted_plank: { key: "Masa ciała+Obciążenie+@time", loadModel: "time", laterality: "bilateral" },
};
// END LEGACY_ATLAS_MODELS
