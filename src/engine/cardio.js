// AT3.2c — cardio set contract (AT3-D19, O-30–O-33, P1–P3; atlas spec v2 §7).
//
// A cardio set stores time and distance only, in canonical units: `durationSec` (integer seconds,
// 1–86 400) and `distanceM` (integer metres, 1–1 000 000). Nothing else is measured in 1.0: no
// calories, heart rate, speed as its own field, incline, GPS or device data (O-31). Pace is never
// stored; it is derived from time and distance. Time and distance are never converted to kg.
//
// P2: an empty field means "no value"; an explicit zero, a negative number, a non-integer or text is
// invalid; a set is performed when at least one of the two values is valid. The same rules apply to
// system (atlas) and private exercises.
//
// Pure and self-contained (load.js imports this module, so it imports nothing).

export const CARDIO_LIMITS = Object.freeze({
  durationSec: Object.freeze({ min: 1, max: 86400 }),
  distanceM: Object.freeze({ min: 1, max: 1000000 }),
});
export const CARDIO_VALUE_FIELDS = Object.freeze(["durationSec", "distanceM"]);
// Fields a cardio set may carry (identity, order, role); everything else is outside the contract.
export const CARDIO_SET_FIELDS = Object.freeze(["id", "setType", "status", "position", "durationSec", "distanceM"]);

const isEmpty = (v) => v === undefined || v === null || v === "";

// One canonical value: { value: integer | null, error: code | null }.
export function checkCardioValue(field, v) {
  const lim = CARDIO_LIMITS[field];
  if (!lim) throw new TypeError(`Nieznane pole cardio: ${field}`);
  if (isEmpty(v)) return { value: null, error: null };
  if (typeof v !== "number" || !Number.isFinite(v)) return { value: null, error: "TYPE" };
  if (!Number.isInteger(v)) return { value: null, error: "NOT_INTEGER" };
  if (v === 0) return { value: null, error: "ZERO" };
  if (v < 0) return { value: null, error: "NEGATIVE" };
  if (v > lim.max) return { value: null, error: "TOO_LARGE" };
  return { value: v, error: null };
}

// Errors of a cardio set: [{ code, field }]. A set with no valid value is not an error by itself
// (it is simply not performed); `performed` tells which case it is.
export function validateCardioSet(set) {
  const errors = [];
  if (!set || typeof set !== "object") return { errors: [{ code: "SET_MISSING", field: null }], performed: false, values: { durationSec: null, distanceM: null } };
  for (const k of Object.keys(set)) if (!CARDIO_SET_FIELDS.includes(k)) errors.push({ code: "FIELD_NOT_ALLOWED", field: k });
  const values = {};
  for (const f of CARDIO_VALUE_FIELDS) {
    const r = checkCardioValue(f, set[f]);
    if (r.error) errors.push({ code: r.error, field: f });
    values[f] = r.value;
  }
  return { errors, performed: values.durationSec != null || values.distanceM != null, values };
}

// The valid canonical values of a set (invalid ones count as absent). `legacyDuration`: the engine
// still accepts the older `duration` field for seconds when `durationSec` is absent.
export function cardioSetValues(set) {
  const s = set && typeof set === "object" ? set : {};
  let d = s.durationSec;
  if (isEmpty(d) && !isEmpty(s.duration)) {
    const n = Number(String(s.duration).replace(",", "."));
    d = Number.isFinite(n) ? n : s.duration;
  }
  return { durationSec: checkCardioValue("durationSec", d).value, distanceM: checkCardioValue("distanceM", s.distanceM).value };
}

// Pace in seconds per km, derived only; null without both values.
export function paceSecPerKm(durationSec, distanceM) {
  if (!(durationSec > 0 && distanceM > 0)) return null;
  return Math.round((durationSec / (distanceM / 1000)) * 10) / 10;
}

// ---- input parsing (what a person types → canonical value) ----------------------------------------
// { value, error }: empty input → { null, null }; anything that is not a valid value → an error code.

// "25:30" (mm:ss), "1:02:03" (h:mm:ss), "30" or "30,5" (minutes).
export function parseDurationInput(text) {
  const t = String(text ?? "").trim();
  if (!t) return { value: null, error: null };
  let seconds;
  if (t.includes(":")) {
    const parts = t.split(":");
    if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return { value: null, error: "FORMAT" };
    const n = parts.map(Number);
    if (n.slice(1).some((x) => x > 59)) return { value: null, error: "FORMAT" };
    seconds = n.reduce((acc, x) => acc * 60 + x, 0);
  } else {
    if (!/^-?\d+(?:[.,]\d+)?$/.test(t)) return { value: null, error: "FORMAT" };
    seconds = Math.round(Number(t.replace(",", ".")) * 60);
  }
  return checkCardioValue("durationSec", seconds);
}

// "5,2" or "5.2 km" → 5200; "800 m" → 800. Without a unit the number is in km. Rounded to the metre.
export function parseDistanceInput(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return { value: null, error: null };
  const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*(km|m)?$/);
  if (!m) return { value: null, error: "FORMAT" };
  const n = Number(m[1].replace(",", "."));
  const metres = Math.round(m[2] === "m" ? n : n * 1000);
  return checkCardioValue("distanceM", metres);
}
