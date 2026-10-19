// B02/S2 (B02-D25 A) — the person's own settings of an exercise card. Today one setting: the
// starting resistance R [kg] of a Smith machine exercise (load model "smith_plates_only").
//
// R is a setting of ONE person for ONE exercise — never a field of the shared atlas record
// (the shared atlas is never changed when somebody types R). Absent / null = R unknown; 0 = a stated zero
// (never substituted for a missing value). When the exercise enters a workout, the current R is
// copied into the immutable load snapshot (load-snapshot.js v3, buildLoadSnapshot
// { startingResistanceKg }); editing the card later never changes an old workout. When the machine
// changes, the person updates R and is responsible for comparisons with the earlier machine
// (no catalog of machine instances).
//
// Storage: the nr1 card editor and its persistent store do not exist yet (AT3.5 / S6).
// createMemoryExerciseSettingsStore is the contract (get / set / clear) with an in-memory adapter for
// tests and the engine. TODO(S6): a persistent adapter (local store, later SY) behind the same API —
// until then NO value typed by a person is persisted anywhere.
//
// Pure: imports only the engine's load models and kg parser.
import { LOAD_MODELS, parseKg } from "./load.js";

export const EXERCISE_SETTING_FIELDS = ["startingResistanceKg"];
// input sanity, same limits as a typed kg of a set (nr1 LIMITS.kgMax / kgDecimals)
export const STARTING_RESISTANCE_LIMITS = Object.freeze({ maxKg: 1000, decimals: 3 });

const isSmithModel = (loadModel) => Boolean(LOAD_MODELS[loadModel]) && LOAD_MODELS[loadModel].kg === "plates";
const decimals = (n) => {
  const s = String(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};

// Does this exercise (atlas record, private record or snapshot) have the R setting at all?
export function supportsStartingResistance(exercise) {
  return Boolean(exercise) && isSmithModel(exercise.loadModel);
}

// What the person typed in the R field → { ok, value, code }.
// "" / spaces / null / undefined → { ok: true, value: null } (R unknown — NOT 0);
// "15", "7,5", "7.5", 15 → the number; "0" → 0 (a stated zero);
// negative, NaN, Infinity, text, too large, too many decimals → { ok: false, code }.
export function parseStartingResistanceInput(raw) {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null, code: null };
  const n = parseKg(raw);
  if (n === null) return { ok: false, value: null, code: "STARTING_RESISTANCE_INVALID" };
  if (n > STARTING_RESISTANCE_LIMITS.maxKg || decimals(n) > STARTING_RESISTANCE_LIMITS.decimals) return { ok: false, value: null, code: "STARTING_RESISTANCE_TOO_LARGE" };
  return { ok: true, value: n, code: null };
}

// A stored settings object of one exercise → [{ code, field }]. Closed shape; R must be null or a
// valid number, and is allowed only for a Smith exercise (STARTING_RESISTANCE_NOT_APPLICABLE).
export function validateExerciseSettings(settings, exercise) {
  const errors = [];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [{ code: "SETTINGS_INVALID", field: null }];
  for (const k of Object.keys(settings)) if (!EXERCISE_SETTING_FIELDS.includes(k)) errors.push({ code: "SETTING_UNKNOWN_FIELD", field: k });
  const r = settings.startingResistanceKg;
  if (r !== undefined && r !== null) {
    if (typeof r !== "number" || !Number.isFinite(r) || r < 0) errors.push({ code: "STARTING_RESISTANCE_INVALID", field: "startingResistanceKg" });
    else if (r > STARTING_RESISTANCE_LIMITS.maxKg || decimals(r) > STARTING_RESISTANCE_LIMITS.decimals) errors.push({ code: "STARTING_RESISTANCE_TOO_LARGE", field: "startingResistanceKg" });
    if (!supportsStartingResistance(exercise)) errors.push({ code: "STARTING_RESISTANCE_NOT_APPLICABLE", field: "startingResistanceKg" });
  }
  return errors;
}

// The value to freeze in a new snapshot: R or null (unknown). Never 0 for a missing value.
export function startingResistanceForSnapshot(exercise, settings) {
  if (!supportsStartingResistance(exercise)) return null;
  const r = settings && settings.startingResistanceKg;
  return typeof r === "number" && Number.isFinite(r) && r >= 0 ? r : null;
}

// Settings store contract (one person). Keyed by catalog exerciseId or private exercise id.
// get(id) → frozen copy ({} when nothing is set); set(id, settings, exercise) validates first and
// returns { ok, errors }; clear(id). Values are copied in and out — callers never share objects.
export function createMemoryExerciseSettingsStore(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, { ...v }]));
  return Object.freeze({
    kind: "memory", // TODO(S6): persistent adapter with the same API
    get(id) {
      return Object.freeze({ ...(data.get(id) || {}) });
    },
    set(id, settings, exercise) {
      if (typeof id !== "string" || !id) return { ok: false, errors: [{ code: "SETTINGS_ID_INVALID", field: null }] };
      const errors = validateExerciseSettings(settings, exercise);
      if (errors.length) return { ok: false, errors };
      const next = { ...settings };
      if (next.startingResistanceKg === undefined) delete next.startingResistanceKg;
      data.set(id, next);
      return { ok: true, errors: [] };
    },
    clear(id) {
      data.delete(id);
    },
  });
}
