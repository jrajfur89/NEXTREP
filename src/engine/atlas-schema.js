// NEXTREP 1.0 atlas (F2.1) — the shape of the atlas and its TECHNICAL dictionaries.
//
// Content (exercises, names, families, variants, the equipment and muscle dictionaries) comes from
// the approved "Standaryzacja ćwiczeń NextRep" batches; nothing here decides content. What is fixed
// here is what the engine needs to interpret typed numbers: load models, laterality, reps counting,
// the 10 statistics groups (decided Oct 2026) and the measurement types (technical proposal, K2).
// Pure data and helpers: no React, storage or Supabase.
import { LOAD_MODELS, LATERALITIES } from "./load.js";

export const ATLAS_FORMAT_VERSION = 1;

// The 10 muscle-group ids of the statistics layer (same ids as MUSCLE_GROUPS of the current engine).
export const STATS_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "quads", "hamstrings_glutes", "calves"];

export const SCOPES = ["system", "private"];
export const STATUSES = ["active", "archived"];
export const REPS_COUNTINGS = ["total", "per_side"];
export { LATERALITIES };
export const LOAD_MODEL_CODES = Object.keys(LOAD_MODELS).filter((m) => m !== "external_unknown");
// models whose numbers do not depend on any load equipment
export const NO_LOAD_MODELS = ["bodyweight", "time", "cardio", "sets_only"];
// models that ignore load equipment completely (no kg is interpreted at all)
export const LOAD_FREE_MODELS = ["time", "cardio", "sets_only"];
export const PER_IMPLEMENT_MODELS = Object.keys(LOAD_MODELS).filter((m) => LOAD_MODELS[m].kg === "per_implement");

// Measurement types — TECHNICAL PROPOSAL (K2): labels and allowed load models, to be approved with
// the first batch. A measurement type says what the person types; the load model says what it means.
export const MEASUREMENT_TYPES = {
  weight_reps: { labelPl: "Ciężar i powtórzenia", loadModels: ["barbell_total", "dumbbell_pair", "dumbbell_single", "kettlebell_pair", "kettlebell_single", "machine_stack", "plate_loaded", "cable", "smith_plates_only"] },
  bodyweight_reps: { labelPl: "Masa ciała i powtórzenia", loadModels: ["bodyweight", "bodyweight_plus", "assisted"] },
  band_reps: { labelPl: "Guma i powtórzenia", loadModels: ["band"] },
  time: { labelPl: "Czas", loadModels: ["time"] },
  cardio: { labelPl: "Cardio", loadModels: ["cardio"] },
  sets_only: { labelPl: "Tylko serie", loadModels: ["sets_only"] },
};

// Equipment roles in the equipment dictionary: "load" carries the weight (its loadModels say which
// models it allows), "support" only supports (bench, rack), "assist" helps (counterweight, band
// under the knees; allows only "assisted").
export const EQUIPMENT_ROLES = ["load", "support", "assist"];
// Dimensions of variant attributes (K3). A "laterality" attribute states laterality (+ optionally
// repsCounting); an "implements" attribute states how many implements are held.
export const VARIANT_DIMENSIONS = ["grip", "angle", "position", "laterality", "implements", "execution"];

// Full exercise card (AT3-D12 A, B02/S1): three editorial lists of Polish points, in system and
// private records. Editorial only — never in CALC_FIELDS or INTERPRETATION_FIELDS, so editing the text
// does not raise entryRev and never reinterprets history. Since B02/S4 every SYSTEM record must have
// all three (validator T5 CARD_CONTENT_REQUIRED); in private records they stay optional. `[]` is never
// allowed — an absent field is the only "no content".
export const CARD_CONTENT_FIELDS = ["instructionsPl", "commonMistakesPl", "safetyPl"];
export const CARD_CONTENT_LIMITS = Object.freeze({ minItems: 1, maxItems: 10, maxItemLength: 300 });

// Closed schema of each record — any other field is an error (no hidden equivalence fields).
export const EXERCISE_FIELDS = [
  "exerciseId", "scope", "familyId", "namePl", "aliasesPl", "variantAttributes", "equipment",
  "primaryMuscles", "secondaryMuscles", "measurementType", "loadModel", "implements", "laterality",
  "repsCounting", "loadIncrementKg", "tipsPl", "videoUrl", "status", "archivedReason", "successorHint",
  "entryRev", "introducedIn", "changedIn", "approvedIn", "correction",
  ...CARD_CONTENT_FIELDS,
];

// Problems of one card-content field. → [{ code, index }] (index of the point, or null for the field).
// `undefined` (field absent) has no problems; everything else must be a list of 1–10 points, each a
// string that is non-empty after trimming, at most 300 characters (trimmed) and unique after trimming.
export function cardContentProblems(value) {
  if (value === undefined) return [];
  const L = CARD_CONTENT_LIMITS;
  if (!Array.isArray(value)) return [{ code: "CARD_CONTENT_TYPE", index: null }];
  const out = [];
  if (value.length < L.minItems) out.push({ code: "CARD_CONTENT_EMPTY", index: null });
  if (value.length > L.maxItems) out.push({ code: "CARD_CONTENT_TOO_MANY", index: null });
  const seen = new Set();
  value.forEach((p, i) => {
    if (typeof p !== "string") { out.push({ code: "CARD_ITEM_TYPE", index: i }); return; }
    const t = p.trim();
    if (!t) { out.push({ code: "CARD_ITEM_EMPTY", index: i }); return; }
    if (t.length > L.maxItemLength) out.push({ code: "CARD_ITEM_TOO_LONG", index: i });
    if (seen.has(t)) out.push({ code: "CARD_ITEM_DUPLICATE", index: i });
    seen.add(t);
  });
  return out;
}

// Lenient read of the card of any record (e.g. an older or damaged private exercise): never throws,
// never changes the record. Each field → a new frozen list of the valid points (trimmed, de-duplicated,
// at most 10); a missing or invalid field → []. Points over 300 characters are left out, not cut.
export function readCardContent(record) {
  const out = {};
  for (const f of CARD_CONTENT_FIELDS) {
    const v = record && typeof record === "object" ? record[f] : undefined;
    const seen = new Set();
    const points = [];
    for (const p of Array.isArray(v) ? v : []) {
      if (typeof p !== "string") continue;
      const t = p.trim();
      if (!t || t.length > CARD_CONTENT_LIMITS.maxItemLength || seen.has(t)) continue;
      seen.add(t);
      if (points.length < CARD_CONTENT_LIMITS.maxItems) points.push(t);
    }
    out[f] = Object.freeze(points);
  }
  return Object.freeze(out);
}
// fields whose change changes what history computes → entryRev must go up (I5)
export const CALC_FIELDS = ["variantAttributes", "equipment", "primaryMuscles", "secondaryMuscles", "measurementType", "loadModel", "implements", "laterality", "repsCounting", "loadIncrementKg"];
// fields that define how typed numbers are interpreted → change needs a new variant (I6, K3)
export const INTERPRETATION_FIELDS = ["loadModel", "implements", "laterality", "repsCounting"];
export const FAMILY_FIELDS = ["familyId", "namePl", "status"];
export const DICTIONARY_FIELDS = {
  equipment: ["code", "labelPl", "role", "loadModels", "status"],
  muscles: ["code", "labelPl", "statsGroup", "status"],
  variantAttributes: ["code", "labelPl", "dimension", "laterality", "repsCounting", "implements", "status"],
};
// names that would mean "these exercises are equivalent" — never allowed (V8)
export const EQUIVALENCE_FIELDS = ["equivalentTo", "equivalents", "substitutes", "substituteFor", "replacedBy", "sameAs", "interchangeableWith"];

export const EXERCISE_ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/; // until the Standaryzacja format (K5)
export const DICT_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

// Name comparison: case, Polish letters and spacing do not make two names different.
export function normalizeName(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9°]+/g, " ")
    .trim();
}

export function emptyAtlas() {
  return { formatVersion: ATLAS_FORMAT_VERSION, atlasVersion: 0, dictionaries: { equipment: [], muscles: [], variantAttributes: [] }, families: [], exercises: [], issuedIds: [] };
}
