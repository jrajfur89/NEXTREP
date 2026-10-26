// DES-01 / D1.2 + D1.4 — the user's own (private) exercises: records, validation, changes, archive and usage.
//
// Pure: no storage, no atlas import. The atlas (for dictionaries and families) and the user's plans / history
// are passed in; every function returns new values and never changes its input.
//
// A private record is an atlas-shaped exercise (EXERCISE_FIELDS of the atlas schema) with:
//   exerciseId  — a UUID made on the device (the nr1 contract of privateExerciseId), never an atlas id;
//   scope       — "private";
//   status      — "active" | "archived" (+ archivedReason, as in the atlas, and archivedAt);
//   familyId    — optional: an exercise made from scratch has none; a variant made from an atlas exercise
//                 may inherit the family of its base (DES-01 Q2), which must exist in the atlas;
//   entryRev    — starts at 1, goes up when a field that changes what history computes changes (CALC_FIELDS);
//   createdAt / updatedAt / archivedAt — ISO dates; basedOnExerciseId — the exercise a variant was made from.
//
// The atlas validator is used AS IT IS (validateExercise, mode "private"); the rules of the system atlas are
// not changed. Exactly three of its results are re-read for private records here:
//   EXERCISE_ID_FORMAT     — replaced by the UUID rule (PRIVATE_ID_INVALID);
//   familyId REQUIRED      — dropped when the record has no family (an exercise made from scratch);
//   LOAD_MODEL_UNKNOWN     — dropped for external_unknown („Nie wiem / inaczej”, DES-01 Q5) with weight_reps.
import { CALC_FIELDS, INTERPRETATION_FIELDS, EXERCISE_FIELDS, STATUSES, CARD_CONTENT_FIELDS } from "./atlas-schema.js";
import { validateExercise } from "./atlas-validate.js";
import { LOAD_MODELS } from "./load.js";

export const PRIVATE_EXERCISE_SCOPE = "private";
// device-side metadata of a private record (never part of the atlas schema)
export const PRIVATE_META_FIELDS = Object.freeze(["createdAt", "updatedAt", "archivedAt", "basedOnExerciseId"]);
// atlas release bookkeeping — meaningless for a record made on the device
export const PRIVATE_FORBIDDEN_FIELDS = Object.freeze(["introducedIn", "changedIn", "approvedIn", "correction", "successorHint"]);
// Editorial fields (AT3-D12): changing them never changes what history computes — no new id, no new entryRev.
// (`videoUrl` of the atlas schema is not used — materials live in their own store, DES-01 decision 4.)
export const PRIVATE_EDITORIAL_FIELDS = Object.freeze(["namePl", "aliasesPl", "tipsPl", ...CARD_CONTENT_FIELDS]);
// Fields whose change changes comparability of results (DES-01 K5 / decision 7): CALC ∪ INTERPRETATION.
export const PRIVATE_COMPARABILITY_FIELDS = Object.freeze([...new Set([...CALC_FIELDS, ...INTERPRETATION_FIELDS])]);
// What a form may set on a new record or change in an existing one.
export const PRIVATE_INPUT_FIELDS = Object.freeze([...PRIVATE_EDITORIAL_FIELDS, ...PRIVATE_COMPARABILITY_FIELDS, "familyId"]);
// Never changed by an update (identity, lifecycle — archive / restore have their own functions).
export const PRIVATE_IMMUTABLE_FIELDS = Object.freeze(["exerciseId", "scope", "status", "entryRev", "archivedReason", "familyId", ...PRIVATE_META_FIELDS]);
export const PRIVATE_ARCHIVED_REASON = "Zarchiwizowane przez użytkownika";
// external_unknown („Nie wiem / inaczej”) is accepted only where the person types kg and reps
export const PRIVATE_UNKNOWN_LOAD_MODEL = "external_unknown";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isPrivateExerciseId(v) {
  return typeof v === "string" && UUID_RE.test(v);
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const isIso = (v) => typeof v === "string" && ISO_RE.test(v) && Number.isFinite(Date.parse(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// A lower-case v4 UUID from the platform (crypto.randomUUID, else crypto.getRandomValues).
export function newPrivateExerciseId(c = globalThis.crypto) {
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toLowerCase();
  if (!c || typeof c.getRandomValues !== "function") throw new Error("NO_UUID_SOURCE");
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Validation context from an atlas release: its dictionaries and families (the same maps validateAtlas builds).
export function privateExerciseContext(atlas) {
  const a = atlas && typeof atlas === "object" ? atlas : {};
  const d = a.dictionaries || {};
  const byCode = (list) => new Map(arr(list).filter((v) => v && typeof v.code === "string").map((v) => [v.code, v]));
  return {
    dict: { equipment: byCode(d.equipment), muscles: byCode(d.muscles), variantAttributes: byCode(d.variantAttributes) },
    families: new Map(arr(a.families).filter((f) => f && typeof f.familyId === "string").map((f) => [f.familyId, f])),
    mode: "private",
  };
}

// → { ok, errors, warnings, issues }. `ok` = no error. Issues have the shape of the atlas validator's.
export function validatePrivateExercise(record, ctx) {
  const issues = [];
  const where = { exerciseId: record && record.exerciseId };
  const add = (level, rule, code, w, field, message) => issues.push({ level, rule, code, ...w, field: field ?? null, message });
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    add("error", "P0", "PRIVATE_RECORD_INVALID", where, null, "Rekord ćwiczenia własnego musi być obiektem.");
    return finish(issues);
  }
  // own rules of the private record
  if (!isPrivateExerciseId(record.exerciseId)) add("error", "P1", "PRIVATE_ID_INVALID", where, "exerciseId", "Identyfikator ćwiczenia własnego musi być UUID.");
  if (record.scope !== PRIVATE_EXERCISE_SCOPE) add("error", "P1", "PRIVATE_SCOPE_REQUIRED", where, "scope", "Ćwiczenie własne ma zakres private.");
  for (const f of PRIVATE_FORBIDDEN_FIELDS) if (record[f] != null) add("error", "P1", "PRIVATE_FIELD_FORBIDDEN", where, f, `Pole ${f} dotyczy tylko wydania Atlasu.`);
  if (!(Number.isInteger(record.entryRev) && record.entryRev >= 1)) add("error", "P1", "PRIVATE_ENTRY_REV_INVALID", where, "entryRev", "entryRev musi być liczbą całkowitą ≥ 1.");
  if (!isIso(record.createdAt)) add("error", "P2", "PRIVATE_DATE_INVALID", where, "createdAt", "Brak poprawnej daty utworzenia.");
  if (!isIso(record.updatedAt)) add("error", "P2", "PRIVATE_DATE_INVALID", where, "updatedAt", "Brak poprawnej daty aktualizacji.");
  if (record.status === "archived" && !isIso(record.archivedAt)) add("error", "P2", "PRIVATE_DATE_INVALID", where, "archivedAt", "Zarchiwizowane ćwiczenie wymaga daty archiwizacji.");
  if (record.status === "active" && record.archivedAt != null) add("error", "P2", "PRIVATE_DATE_INVALID", where, "archivedAt", "Aktywne ćwiczenie nie ma daty archiwizacji.");
  if (record.basedOnExerciseId != null && (typeof record.basedOnExerciseId !== "string" || record.basedOnExerciseId === record.exerciseId)) add("error", "P3", "PRIVATE_BASE_INVALID", where, "basedOnExerciseId", "Niepoprawne ćwiczenie bazowe.");
  // the atlas rules, as they are (mode "private"), on the atlas-shaped part of the record
  const atlasShaped = {};
  for (const [k, v] of Object.entries(record)) if (!PRIVATE_META_FIELDS.includes(k)) atlasShaped[k] = v;
  const noFamily = record.familyId == null;
  if (noFamily) delete atlasShaped.familyId;
  const unknownModel = record.loadModel === PRIVATE_UNKNOWN_LOAD_MODEL;
  if (unknownModel && record.measurementType !== "weight_reps") add("error", "P4", "PRIVATE_UNKNOWN_MODEL_MEASUREMENT", where, "loadModel", "„Nie wiem / inaczej” dotyczy tylko ćwiczeń z ciężarem i powtórzeniami.");
  validateExercise(atlasShaped, { ...ctx, mode: "private" }, (level, rule, code, w, field, message) => {
    if (code === "EXERCISE_ID_FORMAT") return; // replaced by PRIVATE_ID_INVALID (UUID)
    if (code === "REQUIRED_FIELD_MISSING" && field === "familyId" && noFamily) return; // made from scratch
    if (code === "LOAD_MODEL_UNKNOWN" && unknownModel) return; // „Nie wiem / inaczej” (Q5)
    add(level, rule, code, w, field, message);
  });
  return finish(issues);
}
function finish(issues) {
  const errors = issues.filter((i) => i.level === "error");
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.level === "warning"), issues };
}

// Form input → the atlas-shaped fields of a record (only PRIVATE_INPUT_FIELDS; trimmed name; lists default
// to []; laterality / reps counting default to bilateral / total; implements from the load model).
function fieldsFromInput(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const f of PRIVATE_INPUT_FIELDS) if (src[f] !== undefined) out[f] = clone(src[f]);
  if (typeof out.namePl === "string") out.namePl = out.namePl.trim();
  for (const f of ["variantAttributes", "equipment", "primaryMuscles", "secondaryMuscles"]) if (out[f] === undefined) out[f] = [];
  if (out.laterality === undefined) out.laterality = "bilateral";
  if (out.repsCounting === undefined) out.repsCounting = out.laterality === "unilateral" ? "per_side" : "total";
  if (out.implements === undefined) {
    const m = LOAD_MODELS[out.loadModel];
    out.implements = m && m.kg === "per_implement" ? m.implements : null;
  }
  return out;
}

// Creates a new active private record. `basedOn` = the exercise (atlas or private) a variant is made from:
// its familyId is inherited unless the input sets one; basedOnExerciseId points at it.
// → { ok, record, errors, warnings }
export function createPrivateExercise(input, { ctx, now = new Date().toISOString(), newId = newPrivateExerciseId, basedOn = null } = {}) {
  const fields = fieldsFromInput(input);
  if (fields.familyId === undefined && basedOn && typeof basedOn.familyId === "string") fields.familyId = basedOn.familyId;
  if (fields.familyId == null) delete fields.familyId;
  const record = {
    exerciseId: newId(),
    scope: PRIVATE_EXERCISE_SCOPE,
    ...fields,
    status: "active",
    archivedReason: null,
    entryRev: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...(basedOn && typeof basedOn.exerciseId === "string" ? { basedOnExerciseId: basedOn.exerciseId } : {}),
  };
  const v = validatePrivateExercise(record, ctx);
  return { ok: v.ok, record: v.ok ? record : null, errors: v.errors, warnings: v.warnings };
}

// Which fields of a patch really change the record, by kind. Unknown / immutable fields are reported too.
export function classifyPrivateChange(record, patch) {
  const out = { editorial: [], comparability: [], immutable: [], unknown: [] };
  for (const [k, v] of Object.entries(patch && typeof patch === "object" ? patch : {})) {
    if (PRIVATE_IMMUTABLE_FIELDS.includes(k)) {
      if (!same(record[k], v)) out.immutable.push(k);
    } else if (PRIVATE_EDITORIAL_FIELDS.includes(k)) {
      if (!same(record[k], typeof v === "string" && k === "namePl" ? v.trim() : v)) out.editorial.push(k);
    } else if (PRIVATE_COMPARABILITY_FIELDS.includes(k)) {
      if (!same(record[k], v)) out.comparability.push(k);
    } else out.unknown.push(k);
  }
  return out;
}

// Edits a record in place of its id. A change of a comparability field of an exercise WITH history is refused
// (K5: only „Zapisz jako nowe ćwiczenie” — deriveFromPrivateExercise). Editorial changes keep entryRev;
// a CALC_FIELDS change of an exercise without history raises it by 1. Archived records are edited too
// (the name of an archived exercise may be corrected); archive / restore have their own functions.
// → { ok, record, code?, fields?, errors, warnings }
export function updatePrivateExercise(record, patch, { ctx, usage = null, now = new Date().toISOString() } = {}) {
  const change = classifyPrivateChange(record, patch);
  if (change.immutable.length) return { ok: false, record: null, code: "IMMUTABLE_FIELD", fields: change.immutable, errors: [], warnings: [] };
  if (change.unknown.length) return { ok: false, record: null, code: "UNKNOWN_FIELD", fields: change.unknown, errors: [], warnings: [] };
  if (change.comparability.length && (!usage || usage.sessions > 0)) {
    // without a usage count the engine cannot prove there is no history → treated as "has history"
    return { ok: false, record: null, code: "COMPARABILITY_CHANGE_REQUIRES_NEW_EXERCISE", fields: change.comparability, errors: [], warnings: [] };
  }
  if (!change.editorial.length && !change.comparability.length) return { ok: true, record, code: "NO_CHANGE", fields: [], errors: [], warnings: [] };
  const next = { ...clone(record) };
  for (const f of [...change.editorial, ...change.comparability]) {
    const v = clone(patch[f]);
    if (v === undefined || v === null) {
      if (["variantAttributes", "equipment", "primaryMuscles", "secondaryMuscles"].includes(f)) next[f] = [];
      else delete next[f];
    } else next[f] = f === "namePl" && typeof v === "string" ? v.trim() : v;
  }
  if (change.comparability.some((f) => CALC_FIELDS.includes(f))) next.entryRev = record.entryRev + 1;
  next.updatedAt = now;
  const v = validatePrivateExercise(next, ctx);
  return { ok: v.ok, record: v.ok ? next : null, code: v.ok ? "UPDATED" : "INVALID", fields: [...change.editorial, ...change.comparability], errors: v.errors, warnings: v.warnings };
}

// „Zapisz jako nowe ćwiczenie” (K5): a NEW record (new UUID, entryRev 1) with the base's fields and the patch;
// the base keeps its id, fields and history. The family is kept; basedOnExerciseId points at the base.
export function deriveFromPrivateExercise(record, patch, { ctx, now = new Date().toISOString(), newId = newPrivateExerciseId } = {}) {
  const input = {};
  for (const f of PRIVATE_INPUT_FIELDS) if (record[f] !== undefined) input[f] = clone(record[f]);
  for (const [k, v] of Object.entries(patch && typeof patch === "object" ? patch : {})) {
    if (!PRIVATE_INPUT_FIELDS.includes(k)) return { ok: false, record: null, code: PRIVATE_IMMUTABLE_FIELDS.includes(k) ? "IMMUTABLE_FIELD" : "UNKNOWN_FIELD", fields: [k], errors: [], warnings: [] };
    input[k] = clone(v);
  }
  // a new load model without a count → the count follows the model (as for a new record)
  if (patch && patch.loadModel !== undefined && patch.implements === undefined) delete input.implements;
  const r = createPrivateExercise(input, { ctx, now, newId, basedOn: record });
  return { ...r, code: r.ok ? "CREATED" : "INVALID" };
}

// ---- archive / restore / delete (D1.4) ------------------------------------------------------------
export function archivePrivateExercise(record, { now = new Date().toISOString() } = {}) {
  if (!record || record.status === "archived") return { ok: false, record: null, code: "ALREADY_ARCHIVED" };
  return { ok: true, record: { ...clone(record), status: "archived", archivedReason: PRIVATE_ARCHIVED_REASON, archivedAt: now, updatedAt: now }, code: "ARCHIVED" };
}
export function restorePrivateExercise(record, { now = new Date().toISOString() } = {}) {
  if (!record || record.status !== "archived") return { ok: false, record: null, code: "NOT_ARCHIVED" };
  return { ok: true, record: { ...clone(record), status: "active", archivedReason: null, archivedAt: null, updatedAt: now }, code: "RESTORED" };
}

// Does a plan item / workout exercise refer to `exerciseId`? Every reference form of the app and nr1 is read:
// exerciseId, catalogExerciseId, privateExerciseId, and the ids inside a load snapshot.
export function refersToExercise(item, exerciseId) {
  if (!item || typeof item !== "object" || typeof exerciseId !== "string" || !exerciseId) return false;
  const s = item.loadSnapshot && typeof item.loadSnapshot === "object" ? item.loadSnapshot : null;
  return item.exerciseId === exerciseId || item.catalogExerciseId === exerciseId || item.privateExerciseId === exerciseId ||
    Boolean(s && (s.privateExerciseId === exerciseId || s.catalogExerciseId === exerciseId));
}
// How an exercise is used: plans (and their items) and saved workouts (and their exercise entries).
// → { plans, planItems, sessions, sessionEntries, total, inUse }  (total = plans + sessions)
export function countExerciseUsage(exerciseId, { plans = [], history = [] } = {}) {
  let p = 0, pi = 0, s = 0, se = 0;
  for (const plan of arr(plans)) {
    const n = arr(plan && plan.exercises).filter((it) => refersToExercise(it, exerciseId)).length;
    if (n) { p++; pi += n; }
  }
  for (const session of arr(history)) {
    const n = arr(session && session.exercises).filter((ex) => refersToExercise(ex, exerciseId)).length;
    if (n) { s++; se += n; }
  }
  return { plans: p, planItems: pi, sessions: s, sessionEntries: se, total: p + s, inUse: p + s > 0 };
}
// Delete is allowed only for an exercise used nowhere; a used one can only be archived. Plans and history are
// never changed here (no automatic removal of plan items or workout entries).
export function canDeletePrivateExercise(usage) {
  return Boolean(usage) && usage.total === 0;
}

// ---- the list (stored as an array) -------------------------------------------------------------------
// Replaces / adds / removes one record by id; never touches other records. → a new array.
export function upsertPrivateExercise(list, record) {
  const l = arr(list);
  const i = l.findIndex((r) => r && r.exerciseId === record.exerciseId);
  return i < 0 ? [...l, record] : l.map((r, j) => (j === i ? record : r));
}
export function removePrivateExerciseFromList(list, exerciseId) {
  return arr(list).filter((r) => !(r && r.exerciseId === exerciseId));
}
// Problems of a whole stored / imported list: every record valid, ids unique. → [{ index, exerciseId, code, message }]
export function privateExerciseListProblems(list, ctx) {
  if (!Array.isArray(list)) return [{ index: null, exerciseId: null, code: "PRIVATE_LIST_INVALID", message: "Lista ćwiczeń własnych musi być tablicą." }];
  const out = [];
  const seen = new Set();
  list.forEach((r, index) => {
    const id = r && r.exerciseId;
    if (typeof id === "string" && seen.has(id)) out.push({ index, exerciseId: id, code: "PRIVATE_ID_DUPLICATE", message: "Identyfikator ćwiczenia własnego powtarza się." });
    if (typeof id === "string") seen.add(id);
    for (const e of validatePrivateExercise(r, ctx).errors) out.push({ index, exerciseId: id ?? null, code: e.code, field: e.field, message: e.message });
  });
  return out;
}
// The atlas schema part of EXERCISE_FIELDS + metadata — the closed set of a private record (documentation /
// tests); the validator enforces it through UNKNOWN_FIELD.
export const PRIVATE_RECORD_FIELDS = Object.freeze([...EXERCISE_FIELDS.filter((f) => !PRIVATE_FORBIDDEN_FIELDS.includes(f)), ...PRIVATE_META_FIELDS]);
export { STATUSES as PRIVATE_STATUSES };
