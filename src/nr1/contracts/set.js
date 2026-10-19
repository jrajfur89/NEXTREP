// NEXTREP 1.0 (N1) — workout set contract.
//
// A set stores typed values as NUMBERS (never text): reps, loadKg, assistKg, durationSec, plus rir
// (category string or null), setType (D5) and status. Which values may be filled depends on the load
// model of the exercise's snapshot — the model frozen when the exercise was added (D13, F2-4):
//
//   kg meaning total / per_implement / added  → loadKg (kg per implement for dumbbells, added kg
//                                                for weighted bodyweight) + reps
//   plates (smith_plates_only)                 → loadKg = mass of the plates only (P) + reps
//   assist (assisted)                          → assistKg + reps
//   none + reps (bodyweight), resistance (band) → reps only (band level: later stage)
//   seconds (time), cardio                     → durationSec only, no RIR
//   sets (sets_only)                           → nothing but the status
//
// Text typed by the person ("62,5", " 10 ") is parsed by the engine's parsers (PE-27); text that is
// not a number is an error, never a silent null.
import { LOAD_MODELS, parseKg, parseReps, parseSeconds } from "../../engine/load.js";
import { RIR_CATEGORIES, WORKOUT_SET_TYPES, WORKOUT_SET_STATUSES, LIMITS } from "./constants.js";

export const SET_VALUE_FIELDS = ["reps", "loadKg", "assistKg", "durationSec", "rir"];

// Allowed value fields for a load model.
export function allowedSetFields(loadModel) {
  const m = LOAD_MODELS[loadModel];
  if (!m) return null;
  if (m.unit === "seconds" || m.unit === "cardio") return ["durationSec"];
  if (m.unit === "sets") return [];
  if (["total", "per_implement", "added", "plates"].includes(m.kg)) return ["reps", "loadKg", "rir"]; // plates: loadKg = P (B02/S2)
  if (m.kg === "assist") return ["reps", "assistKg", "rir"];
  return ["reps", "rir"]; // bodyweight, band
}

const decimals = (n) => {
  const s = String(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};

export function validateWorkoutSet(set, snapshot, where = {}) {
  const errors = [];
  const e = (code, field) => errors.push({ code, field, ...where, id: set && set.id });
  if (!WORKOUT_SET_TYPES.includes(set.setType)) e("SET_TYPE_INVALID", "setType");
  if (!WORKOUT_SET_STATUSES.includes(set.status)) e("SET_STATUS_INVALID", "status");
  const allowed = snapshot ? allowedSetFields(snapshot.loadModel) : null;
  if (!allowed) { e("SET_MODEL_UNKNOWN", "loadSnapshot"); return errors; }
  for (const f of SET_VALUE_FIELDS) {
    const v = set[f] ?? null;
    if (v === null) continue;
    if (!allowed.includes(f)) { e("SET_FIELD_NOT_ALLOWED", f); continue; }
    if (f === "rir") { if (!RIR_CATEGORIES.includes(v)) e("RIR_INVALID", f); continue; }
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) { e("SET_VALUE_INVALID", f); continue; }
    if ((f === "reps" || f === "durationSec") && !Number.isInteger(v)) e("SET_VALUE_NOT_INTEGER", f);
    if (f === "reps" && v > LIMITS.repsMax) e("SET_VALUE_TOO_LARGE", f);
    if (f === "durationSec" && v > LIMITS.durationMaxSec) e("SET_VALUE_TOO_LARGE", f);
    if ((f === "loadKg" || f === "assistKg") && (v > LIMITS.kgMax || decimals(v) > LIMITS.kgDecimals)) e("SET_VALUE_TOO_LARGE", f);
  }
  // a done set has its main value (reps, or seconds); a skipped set may be empty
  if (set.status === "done") {
    if (allowed.includes("reps") && !((set.reps ?? 0) > 0)) e("SET_REPS_REQUIRED", "reps");
    if (allowed.includes("durationSec") && !((set.durationSec ?? 0) > 0)) e("SET_DURATION_REQUIRED", "durationSec");
  }
  return errors;
}

// Parses what the person typed into set values. Returns { values, errors }; empty input → null.
export function parseSetInput(raw = {}) {
  const values = {};
  const errors = [];
  const parsers = { reps: parseReps, loadKg: parseKg, assistKg: parseKg, durationSec: parseSeconds };
  for (const [f, parse] of Object.entries(parsers)) {
    if (!(f in raw)) continue;
    const v = raw[f];
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) { values[f] = null; continue; }
    const n = parse(v);
    if (n === null) errors.push({ code: "SET_INPUT_NOT_A_NUMBER", field: f });
    else values[f] = n;
  }
  if ("rir" in raw) {
    const r = raw.rir === undefined || raw.rir === "" ? null : raw.rir;
    if (r !== null && !RIR_CATEGORIES.includes(r)) errors.push({ code: "RIR_INVALID", field: "rir" });
    else values.rir = r;
  }
  return { values, errors };
}
