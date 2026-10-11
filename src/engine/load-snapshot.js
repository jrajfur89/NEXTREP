// NEXTREP 1.0 — snapshot of an exercise's load model in a workout (F2.1, decisions D13, F2-4, F2-5).
//
// Every exercise of every NEXTREP 1.0 workout stores the load model that applied when it was done.
// History reads THAT snapshot, so a new atlas release or an edited private exercise never silently
// changes old results. A missing snapshot is a fault, never a normal path: the engine then answers
// from the current atlas only with an explicit warning and never as an exact value.
//
// SNAPSHOT_FIELDS is the ONE contract for the engine, the client and the database: the SQL draft
// (db/v2-draft/001_load_snapshot.sql) is tested against it column by column and constraint by
// constraint, and validateLoadSnapshot mirrors every SQL CHECK (tests compare both on random rows).
import { normalizeModel, LOAD_MODELS, VOLUME_FORMULA_VERSION } from "./load.js";
import { STATS_GROUPS, MEASUREMENT_TYPES, LATERALITIES, REPS_COUNTINGS } from "./atlas-schema.js";
import { deriveGroups } from "./atlas-validate.js";

export const LOAD_SNAPSHOT_VERSION = 1;
export const SNAPSHOT_SOURCES = ["atlas", "private", "user_correction"];
export const SNAPSHOT_CONFIDENCES = ["verified", "high", "low", "unknown"];
export const SNAPSHOT_LOAD_MODELS = Object.keys(LOAD_MODELS); // incl. external_unknown (private "nie wiem")
const PAIR = Object.keys(LOAD_MODELS).filter((m) => LOAD_MODELS[m].kg === "per_implement" && LOAD_MODELS[m].implements === 2);
const SINGLE = Object.keys(LOAD_MODELS).filter((m) => LOAD_MODELS[m].kg === "per_implement" && LOAD_MODELS[m].implements === 1);
const KG_MODELS = Object.keys(LOAD_MODELS).filter((m) => ["total", "per_implement", "added"].includes(LOAD_MODELS[m].kg));

// name (client / engine) → column (v2 workout_exercises), SQL type, nullability, allowed values
export const SNAPSHOT_FIELDS = [
  { name: "snapshotVersion", column: "load_snapshot_version", sql: "smallint", nullable: false, values: [LOAD_SNAPSHOT_VERSION] },
  { name: "source", column: "load_source", sql: "text", nullable: false, values: SNAPSHOT_SOURCES },
  { name: "catalogExerciseId", column: "catalog_exercise_id", sql: "text", nullable: true },
  { name: "privateExerciseId", column: "private_exercise_id", sql: "uuid", nullable: true },
  { name: "atlasVersion", column: "atlas_version", sql: "integer", nullable: true },
  { name: "entryRev", column: "entry_rev", sql: "integer", nullable: false },
  { name: "familyId", column: "family_id", sql: "text", nullable: true },
  { name: "measurementType", column: "measurement_type", sql: "text", nullable: true, values: Object.keys(MEASUREMENT_TYPES) },
  { name: "loadModel", column: "load_model", sql: "text", nullable: false, values: SNAPSHOT_LOAD_MODELS },
  { name: "implements", column: "load_implements", sql: "smallint", nullable: true, values: [1, 2] },
  { name: "laterality", column: "laterality", sql: "text", nullable: false, values: LATERALITIES },
  { name: "repsCounting", column: "reps_counting", sql: "text", nullable: false, values: REPS_COUNTINGS },
  { name: "loadIncrementKg", column: "load_increment_kg", sql: "numeric", nullable: true },
  { name: "primaryMuscles", column: "primary_muscles", sql: "text[]", nullable: false },
  { name: "secondaryMuscles", column: "secondary_muscles", sql: "text[]", nullable: false },
  { name: "primaryGroups", column: "primary_groups", sql: "text[]", nullable: false, values: STATS_GROUPS },
  { name: "secondaryGroups", column: "secondary_groups", sql: "text[]", nullable: false, values: STATS_GROUPS },
  { name: "weightUnit", column: "weight_unit", sql: "text", nullable: false, values: ["kg"] },
  { name: "confidence", column: "load_confidence", sql: "text", nullable: false, values: SNAPSHOT_CONFIDENCES },
  { name: "volumeFormulaVersion", column: "volume_formula_version", sql: "smallint", nullable: false, values: [VOLUME_FORMULA_VERSION] },
  { name: "capturedAt", column: "load_captured_at", sql: "timestamptz", nullable: false },
  { name: "correctionCount", column: "load_correction_count", sql: "integer", nullable: false },
];

const isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);
const isIso = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));

// Every rule here has a SQL CHECK of the same name in db/v2-draft/001_load_snapshot.sql.
export function validateLoadSnapshot(s) {
  const errors = [];
  const e = (code, field) => errors.push({ code, field });
  if (!s || typeof s !== "object") return [{ code: "SNAPSHOT_MISSING", field: null }];
  for (const f of SNAPSHOT_FIELDS) {
    const v = s[f.name];
    if (v === undefined || v === null) {
      if (!f.nullable) e("NOT_NULL", f.name);
      continue;
    }
    if (f.sql === "text[]") {
      if (!isStrList(v)) e("TYPE", f.name);
      else if (f.values && v.some((x) => !f.values.includes(x))) e("VALUE", f.name);
      continue;
    }
    if (["smallint", "integer"].includes(f.sql) && !Number.isInteger(v)) { e("TYPE", f.name); continue; }
    if (f.sql === "numeric" && !(typeof v === "number" && Number.isFinite(v))) { e("TYPE", f.name); continue; }
    if (f.sql === "timestamptz" && !isIso(v)) { e("TYPE", f.name); continue; }
    if (["text", "uuid"].includes(f.sql) && typeof v !== "string") { e("TYPE", f.name); continue; }
    if (f.values && !f.values.includes(v)) e("VALUE", f.name);
  }
  if (errors.length) return errors;
  // cross-field checks (same names as the SQL constraints)
  const hasCat = s.catalogExerciseId != null;
  const hasPriv = s.privateExerciseId != null;
  if (hasCat === hasPriv) e("ws_exactly_one_exercise", "catalogExerciseId");
  if (s.source === "atlas" && !(hasCat && s.atlasVersion != null && s.confidence === "verified")) e("ws_atlas_source", "source");
  if (s.source === "private" && !hasPriv) e("ws_private_source", "source");
  if (s.laterality === "bilateral" && s.repsCounting !== "total") e("ws_bilateral_total", "repsCounting");
  if (PAIR.includes(s.loadModel) ? s.implements !== 2 : SINGLE.includes(s.loadModel) ? s.implements !== 1 : s.implements != null) e("ws_implements_model", "implements");
  if (s.loadModel === "external_unknown" && s.confidence !== "unknown") e("ws_unknown_model_confidence", "confidence");
  if (s.loadIncrementKg != null && !(s.loadIncrementKg > 0 && KG_MODELS.includes(s.loadModel))) e("ws_load_increment", "loadIncrementKg");
  if (s.primaryGroups.some((g) => s.secondaryGroups.includes(g))) e("ws_groups_disjoint", "secondaryGroups");
  if (s.primaryMuscles.some((m) => s.secondaryMuscles.includes(m))) e("ws_muscles_disjoint", "secondaryMuscles");
  if (s.source === "atlas" && s.primaryGroups.length === 0) e("ws_atlas_primary_group", "primaryGroups");
  if (s.entryRev < 1) e("ws_entry_rev", "entryRev");
  if (s.atlasVersion != null && s.atlasVersion < 1) e("ws_atlas_version", "atlasVersion");
  if (s.correctionCount < 0 || (s.source === "user_correction") !== (s.correctionCount > 0)) e("ws_correction_count", "correctionCount");
  if (s.measurementType != null && !MEASUREMENT_TYPES[s.measurementType].loadModels.includes(s.loadModel)) e("ws_measurement_model", "measurementType");
  return errors;
}

// Snapshot of an atlas exercise or a private exercise at the moment it enters a workout.
// atlas: { exercise, atlasVersion, muscles (dictionary) }; private: { privateExercise, muscles }.
export function buildLoadSnapshot({ exercise, privateExercise, atlasVersion = null, muscles = [], now = new Date().toISOString() }) {
  const src = exercise || privateExercise;
  if (!src) throw new Error("buildLoadSnapshot: no exercise");
  const isAtlas = Boolean(exercise);
  const groups = deriveGroups(src, muscles);
  const model = src.loadModel || "external_unknown";
  const snapshot = {
    snapshotVersion: LOAD_SNAPSHOT_VERSION,
    source: isAtlas ? "atlas" : "private",
    catalogExerciseId: isAtlas ? src.exerciseId : null,
    privateExerciseId: isAtlas ? null : src.privateExerciseId || src.exerciseId,
    atlasVersion: isAtlas ? atlasVersion : null,
    entryRev: Number.isInteger(src.entryRev) ? src.entryRev : 1,
    familyId: src.familyId || null,
    measurementType: src.measurementType || null,
    loadModel: model,
    implements: LOAD_MODELS[model] && LOAD_MODELS[model].kg === "per_implement" ? LOAD_MODELS[model].implements : null,
    laterality: src.laterality || "bilateral",
    repsCounting: src.repsCounting || (src.laterality === "unilateral" ? "per_side" : "total"),
    loadIncrementKg: typeof src.loadIncrementKg === "number" ? src.loadIncrementKg : null,
    primaryMuscles: [...(src.primaryMuscles || [])],
    secondaryMuscles: [...(src.secondaryMuscles || [])],
    primaryGroups: groups.primaryGroups,
    secondaryGroups: groups.secondaryGroups,
    weightUnit: "kg",
    confidence: isAtlas ? "verified" : model === "external_unknown" ? "unknown" : SNAPSHOT_CONFIDENCES.includes(src.confidence) ? src.confidence : "low",
    volumeFormulaVersion: VOLUME_FORMULA_VERSION,
    capturedAt: now,
    correctionCount: 0,
  };
  const errors = validateLoadSnapshot(snapshot);
  if (errors.length) throw new Error(`buildLoadSnapshot: invalid snapshot (${errors.map((x) => x.code + ":" + x.field).join(", ")})`);
  return snapshot;
}

// Engine model from a snapshot (for normalizeLoad / exerciseTotals).
export function modelFromSnapshot(s) {
  return normalizeModel({ loadModel: s.loadModel, implements: s.implements, laterality: s.laterality, repsCounting: s.repsCounting, loadIncrementKg: s.loadIncrementKg, confidence: s.confidence, source: `snapshot:${s.source}` });
}

// Model of an exercise IN A WORKOUT, in the approved order: (1) its valid snapshot; (2) fault — no
// or invalid snapshot: the current atlas / private entry, confidence lowered to "low", with a warning
// and status "snapshot_missing" (never exact); (3) nothing known: "unknown".
export function resolveWorkoutExerciseModel(workoutExercise, { atlasById = new Map(), privateById = new Map() } = {}) {
  const s = workoutExercise && workoutExercise.loadSnapshot;
  if (s && validateLoadSnapshot(s).length === 0) return { status: "snapshot", model: modelFromSnapshot(s), groups: { primaryGroups: s.primaryGroups, secondaryGroups: s.secondaryGroups }, warning: null };
  const id = workoutExercise && (workoutExercise.catalogExerciseId || workoutExercise.exerciseId);
  const current = (id && atlasById.get(id)) || (workoutExercise && workoutExercise.privateExerciseId && privateById.get(workoutExercise.privateExerciseId));
  const warning = "Obliczone z aktualnego atlasu, nie z danych zapisanych przy treningu.";
  if (current && current.loadModel) {
    const model = normalizeModel({ loadModel: current.loadModel, implements: current.implements, laterality: current.laterality, repsCounting: current.repsCounting, confidence: "low", source: "current-atlas-fallback" });
    return { status: "snapshot_missing", model, groups: null, warning };
  }
  return { status: "unknown", model: normalizeModel(null), groups: null, warning };
}

// Explicit user correction of a FINISHED workout's exercise (F2-5): only that workout, marked, with
// the previous model kept in an append-only correction record.
export function correctLoadSnapshot(current, changes, { reason, now = new Date().toISOString() } = {}) {
  if (validateLoadSnapshot(current).length) throw new Error("correctLoadSnapshot: current snapshot invalid");
  if (!(typeof reason === "string" && reason.trim())) throw new Error("correctLoadSnapshot: a reason is required");
  const allowed = ["loadModel", "laterality", "repsCounting", "loadIncrementKg", "measurementType"];
  for (const k of Object.keys(changes || {})) if (!allowed.includes(k)) throw new Error(`correctLoadSnapshot: field ${k} cannot be corrected`);
  const next = { ...current, ...changes, source: "user_correction", correctionCount: current.correctionCount + 1, capturedAt: now };
  const lm = LOAD_MODELS[next.loadModel];
  next.implements = lm && lm.kg === "per_implement" ? lm.implements : null;
  if (next.laterality === "bilateral") next.repsCounting = "total";
  // the person states the model explicitly → verified, unless they still do not know it
  next.confidence = next.loadModel === "external_unknown" ? "unknown" : "verified";
  if (next.loadIncrementKg != null && !KG_MODELS.includes(next.loadModel)) next.loadIncrementKg = null;
  const errors = validateLoadSnapshot(next);
  if (errors.length) throw new Error(`correctLoadSnapshot: invalid result (${errors.map((x) => x.code + ":" + x.field).join(", ")})`);
  return { snapshot: next, correction: { previousSnapshot: current, newSnapshot: next, reason: reason.trim(), correctedAt: now } };
}

// Client object ↔ database row (column names from SNAPSHOT_FIELDS).
export function snapshotToRow(s) {
  return Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f.column, s[f.name] === undefined ? null : s[f.name]]));
}
export function rowToSnapshot(row) {
  const out = {};
  for (const f of SNAPSHOT_FIELDS) {
    let v = row[f.column];
    if (v === undefined) v = null;
    if (v != null && f.sql === "numeric") v = Number(v);
    if (v != null && f.sql === "timestamptz") v = new Date(v).toISOString();
    out[f.name] = v;
  }
  return out;
}
