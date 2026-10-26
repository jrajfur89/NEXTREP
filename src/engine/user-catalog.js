// DES-01 / D1.1 + D1.3 + D1.5 — the user's catalog: the atlas + the user's own exercises + private names of atlas
// exercises, and the user data around them (favourites, private names, material metadata).
//
// Pure: the atlas and the user data are passed in; nothing reads storage. Search uses the existing atlas index
// (buildAtlasIndex) on one combined, atlas-shaped object — no second search implementation.
//
// Rules:
//   - a private name is a display name of an ATLAS exercise, keyed by its exerciseId: it never creates an id,
//     never changes a record, saved workouts or snapshots; search finds the exercise by it (an extra alias);
//   - private exercises are found by their own name and aliases;
//   - resolve(id) returns active AND archived exercises (plans and history keep pointing at archived ids);
//     search / lists show active ones unless { includeArchived: true };
//   - material metadata is data only (no files, no network): YouTube links (https, youtube.com / youtu.be)
//     and references to files on the device; the files themselves are never part of this data or of a backup.
import { buildAtlasIndex } from "./atlas-index.js";
import { normalizeName, EXERCISE_ID_PATTERN } from "./atlas-schema.js";
import { isPrivateExerciseId, privateExerciseListProblems, PRIVATE_META_FIELDS } from "./private-exercise.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const isIso = (v) => typeof v === "string" && ISO_RE.test(v) && Number.isFinite(Date.parse(v));

export const CUSTOM_NAME_MAX_LENGTH = 80;
export const MEDIA_TITLE_MAX_LENGTH = 120;
export const MEDIA_KINDS = Object.freeze(["youtube", "file"]);
export const MEDIA_PER_EXERCISE_MAX = 20;

export function isAtlasExerciseIdFormat(v) {
  return typeof v === "string" && v.length <= 64 && EXERCISE_ID_PATTERN.test(v);
}
// any id a user record may point at: an atlas id or the UUID of an own exercise
export function isUserExerciseRef(v) {
  return isAtlasExerciseIdFormat(v) || isPrivateExerciseId(v);
}

// ---- the catalog (D1.3) -------------------------------------------------------------------------------
// → { resolve, displayName, search, list, isPrivate, sourceOf, customNameOf, atlasIndex }
export function buildUserCatalog({ atlas, privateExercises = [], exerciseNames = {} } = {}) {
  const a = isObj(atlas) ? atlas : {};
  const atlasIds = new Set(arr(a.exercises).map((e) => e && e.exerciseId).filter(Boolean));
  const names = normalizeExerciseNames(exerciseNames, { atlasIds }).names;
  // private records: valid UUID, private scope, not shadowing an atlas id; metadata kept out of the index
  const privates = [];
  const seen = new Set();
  for (const r of arr(privateExercises)) {
    if (!isObj(r) || !isPrivateExerciseId(r.exerciseId) || r.scope !== "private" || seen.has(r.exerciseId) || atlasIds.has(r.exerciseId)) continue;
    seen.add(r.exerciseId);
    privates.push(r);
  }
  const indexRecord = (r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) if (!PRIVATE_META_FIELDS.includes(k)) out[k] = v;
    return out;
  };
  const combined = {
    dictionaries: a.dictionaries,
    families: a.families,
    exercises: [
      ...arr(a.exercises).map((e) => (names[e.exerciseId] ? { ...e, aliasesPl: [...arr(e.aliasesPl), names[e.exerciseId].name] } : e)),
      ...privates.map(indexRecord),
    ],
  };
  const index = buildAtlasIndex(combined);
  const atlasIndex = buildAtlasIndex(a);
  const privateById = new Map(privates.map((r) => [r.exerciseId, r]));

  const sourceOf = (id) => (privateById.has(id) ? "private" : atlasIds.has(id) ? "atlas" : null);
  const customNameOf = (id) => (atlasIds.has(id) && names[id] ? names[id].name : null);
  function resolve(id) {
    const source = sourceOf(id);
    if (!source) return null;
    const exercise = source === "private" ? privateById.get(id) : atlasIndex.resolve(id);
    const customName = customNameOf(id);
    return {
      exerciseId: id,
      source,
      exercise,
      displayName: customName || exercise.namePl,
      atlasName: source === "atlas" ? exercise.namePl : null,
      customName,
      archived: exercise.status === "archived",
    };
  }
  const displayName = (id) => {
    const r = resolve(id);
    return r ? r.displayName : null;
  };
  const toEntry = (ex) => resolve(ex.exerciseId);
  // sources: ["atlas", "private"] by default
  function search(query, { includeArchived = false, sources = null } = {}) {
    const want = sources ? new Set(sources) : null;
    return index.search(query, { includeArchived }).map(toEntry).filter((e) => e && (!want || want.has(e.source)));
  }
  function list({ includeArchived = false, sources = null } = {}) {
    return search("", { includeArchived, sources });
  }
  return { resolve, displayName, search, list, isPrivate: (id) => privateById.has(id), sourceOf, customNameOf, atlasIndex };
}

// ---- private names of atlas exercises --------------------------------------------------------------------
// Stored as { [atlasExerciseId]: { name, updatedAt } }. Only atlas ids (a private exercise has its own name).
export function customNameProblem(name) {
  if (typeof name !== "string") return "NAME_TYPE";
  const t = name.trim();
  if (!t) return "NAME_EMPTY";
  if (t.length > CUSTOM_NAME_MAX_LENGTH) return "NAME_TOO_LONG";
  return null;
}
// Lenient read: keeps valid entries, reports the rest. `atlasIds` (optional) also requires the id to exist.
export function normalizeExerciseNames(raw, { atlasIds = null } = {}) {
  const names = {};
  const problems = [];
  if (raw == null) return { names, problems };
  if (!isObj(raw)) return { names, problems: [{ key: null, code: "NAMES_INVALID" }] };
  for (const [id, v] of Object.entries(raw)) {
    if (!isAtlasExerciseIdFormat(id) || (atlasIds && !atlasIds.has(id))) { problems.push({ key: id, code: "NAME_ID_NOT_ATLAS" }); continue; }
    const p = isObj(v) ? customNameProblem(v.name) : "NAME_TYPE";
    if (p) { problems.push({ key: id, code: p }); continue; }
    if (!isIso(v.updatedAt)) { problems.push({ key: id, code: "NAME_DATE_INVALID" }); continue; }
    names[id] = { name: v.name.trim(), updatedAt: v.updatedAt };
  }
  return { names, problems };
}
// → { ok, names, code }. A name equal (normalizeName) to the atlas name is not stored (it would change nothing).
export function setCustomExerciseName(names, exerciseId, name, { atlasIndex, now = new Date().toISOString() } = {}) {
  const ex = atlasIndex && atlasIndex.resolve(exerciseId);
  if (!ex) return { ok: false, names, code: "NAME_ID_NOT_ATLAS" };
  const p = customNameProblem(name);
  if (p) return { ok: false, names, code: p };
  if (normalizeName(name) === normalizeName(ex.namePl)) return { ok: false, names, code: "NAME_SAME_AS_ATLAS" };
  return { ok: true, names: { ...(isObj(names) ? names : {}), [exerciseId]: { name: name.trim(), updatedAt: now } }, code: "NAME_SET" };
}
export function removeCustomExerciseName(names, exerciseId) {
  const n = { ...(isObj(names) ? names : {}) };
  const had = Object.prototype.hasOwnProperty.call(n, exerciseId);
  delete n[exerciseId];
  return { ok: had, names: n, code: had ? "NAME_REMOVED" : "NAME_NOT_SET" };
}

// ---- favourites -------------------------------------------------------------------------------------------
// Stored as [{ exerciseId, addedAt }] — atlas ids and UUIDs alike; order = order of adding.
export function normalizeFavourites(raw) {
  const favourites = [];
  const problems = [];
  if (raw == null) return { favourites, problems };
  if (!Array.isArray(raw)) return { favourites, problems: [{ index: null, code: "FAVOURITES_INVALID" }] };
  const seen = new Set();
  raw.forEach((f, index) => {
    if (!isObj(f) || !isUserExerciseRef(f.exerciseId)) return problems.push({ index, code: "FAVOURITE_ID_INVALID" });
    if (!isIso(f.addedAt)) return problems.push({ index, code: "FAVOURITE_DATE_INVALID" });
    if (seen.has(f.exerciseId)) return problems.push({ index, code: "FAVOURITE_DUPLICATE" });
    seen.add(f.exerciseId);
    favourites.push({ exerciseId: f.exerciseId, addedAt: f.addedAt });
  });
  return { favourites, problems };
}
export function isFavourite(favourites, exerciseId) {
  return arr(favourites).some((f) => f && f.exerciseId === exerciseId);
}
// → { ok, favourites, favourite: boolean after the toggle }
export function toggleFavourite(favourites, exerciseId, { now = new Date().toISOString() } = {}) {
  if (!isUserExerciseRef(exerciseId)) return { ok: false, favourites, favourite: false, code: "FAVOURITE_ID_INVALID" };
  const list = arr(favourites);
  if (isFavourite(list, exerciseId)) return { ok: true, favourites: list.filter((f) => f.exerciseId !== exerciseId), favourite: false, code: "FAVOURITE_REMOVED" };
  return { ok: true, favourites: [...list, { exerciseId, addedAt: now }], favourite: true, code: "FAVOURITE_ADDED" };
}

// ---- material metadata (no files, no playback — D6) --------------------------------------------------------
// Stored as { [exerciseId]: [{ id, kind: "youtube" | "file", url?, fileRef?, title, isMain, addedAt }] }.
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
export function isYoutubeUrl(url) {
  if (typeof url !== "string" || url.length > 2048) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && YOUTUBE_HOSTS.has(u.hostname.toLowerCase()) && !u.username && !u.password;
}
export function mediaItemProblem(m) {
  if (!isObj(m)) return "MEDIA_ITEM_INVALID";
  if (typeof m.id !== "string" || !m.id || m.id.length > 64) return "MEDIA_ID_INVALID";
  if (!MEDIA_KINDS.includes(m.kind)) return "MEDIA_KIND_INVALID";
  if (m.kind === "youtube" && !isYoutubeUrl(m.url)) return "MEDIA_URL_INVALID";
  if (m.kind === "file" && !(typeof m.fileRef === "string" && m.fileRef.trim() && m.fileRef.length <= 1024)) return "MEDIA_FILE_REF_INVALID";
  if (m.title != null && !(typeof m.title === "string" && m.title.length <= MEDIA_TITLE_MAX_LENGTH)) return "MEDIA_TITLE_INVALID";
  if (typeof m.isMain !== "boolean") return "MEDIA_MAIN_INVALID";
  if (!isIso(m.addedAt)) return "MEDIA_DATE_INVALID";
  return null;
}
// Lenient read: keeps the valid items (at most one main per exercise — the first), reports the rest.
export function normalizeExerciseMedia(raw) {
  const media = {};
  const problems = [];
  if (raw == null) return { media, problems };
  if (!isObj(raw)) return { media, problems: [{ key: null, index: null, code: "MEDIA_INVALID" }] };
  for (const [exerciseId, items] of Object.entries(raw)) {
    if (!isUserExerciseRef(exerciseId)) { problems.push({ key: exerciseId, index: null, code: "MEDIA_EXERCISE_INVALID" }); continue; }
    if (!Array.isArray(items)) { problems.push({ key: exerciseId, index: null, code: "MEDIA_LIST_INVALID" }); continue; }
    const out = [];
    const ids = new Set();
    let main = false;
    items.forEach((m, index) => {
      const p = mediaItemProblem(m) || (ids.has(m.id) ? "MEDIA_ID_DUPLICATE" : null) || (out.length >= MEDIA_PER_EXERCISE_MAX ? "MEDIA_TOO_MANY" : null);
      if (p) return problems.push({ key: exerciseId, index, code: p });
      if (m.isMain && main) problems.push({ key: exerciseId, index, code: "MEDIA_MAIN_DUPLICATE" });
      ids.add(m.id);
      const item = { id: m.id, kind: m.kind, title: m.title ?? null, isMain: m.isMain && !main, addedAt: m.addedAt };
      if (m.kind === "youtube") item.url = m.url;
      else item.fileRef = m.fileRef;
      main = main || item.isMain;
      out.push(item);
    });
    if (out.length) media[exerciseId] = out;
  }
  return { media, problems };
}

// ---- import / restore check (D1.5) -------------------------------------------------------------------------
// Checks the user-exercise part of a backup or JSON export BEFORE anything is written, and prepares what to write.
// Only the fields present in `data` are checked and written (an older copy without them is compatible and leaves
// the current data as it is).
//   - blocking problems (nothing may be written): a field of the wrong shape, an invalid own-exercise record
//     (validator, UUID, duplicate id), an invalid favourite / name / material entry, a name of a non-atlas id;
//   - dangling references (not blocking): a favourite or material of an exercise that exists neither in the atlas
//     nor among the own exercises after the import (the copy's list, or — when the copy has none — the current
//     one, `currentPrivateIds`). They point at nothing; they are reported and left out of what is written.
// Links between own exercises, favourites, names and materials are kept by id, never re-created.
// → { ok, problems: [{ field, code, ... }], dangling: [{ field, exerciseId }], present: [fields], write: { field: value } }
export const USER_EXERCISE_DATA_FIELDS = Object.freeze(["userExercises", "favourites", "exerciseNames", "exerciseMedia"]);
export function userExerciseDataProblems(data, { atlas, ctx, currentPrivateIds = [] } = {}) {
  const d = isObj(data) ? data : {};
  const present = USER_EXERCISE_DATA_FIELDS.filter((f) => d[f] !== undefined && d[f] !== null);
  const problems = [];
  const dangling = [];
  const write = {};
  const atlasIds = new Set(arr(atlas && atlas.exercises).map((e) => e && e.exerciseId).filter(Boolean));
  let privateIds = new Set(arr(currentPrivateIds).filter(isPrivateExerciseId));
  if (present.includes("userExercises")) {
    for (const p of privateExerciseListProblems(d.userExercises, ctx)) problems.push({ field: "userExercises", ...p });
    privateIds = new Set(arr(d.userExercises).map((r) => r && r.exerciseId).filter(isPrivateExerciseId));
    for (const id of privateIds) if (atlasIds.has(id)) problems.push({ field: "userExercises", exerciseId: id, code: "PRIVATE_ID_IS_ATLAS" });
    write.userExercises = d.userExercises;
  }
  const known = (id) => atlasIds.has(id) || privateIds.has(id);
  if (present.includes("favourites")) {
    const r = normalizeFavourites(d.favourites);
    for (const p of r.problems) problems.push({ field: "favourites", ...p });
    for (const f of r.favourites) if (!known(f.exerciseId)) dangling.push({ field: "favourites", exerciseId: f.exerciseId });
    write.favourites = r.favourites.filter((f) => known(f.exerciseId));
  }
  if (present.includes("exerciseNames")) {
    const r = normalizeExerciseNames(d.exerciseNames, { atlasIds });
    for (const p of r.problems) problems.push({ field: "exerciseNames", ...p });
    write.exerciseNames = r.names;
  }
  if (present.includes("exerciseMedia")) {
    const r = normalizeExerciseMedia(d.exerciseMedia);
    for (const p of r.problems) if (p.code !== "MEDIA_MAIN_DUPLICATE") problems.push({ field: "exerciseMedia", ...p });
    const media = {};
    for (const [id, items] of Object.entries(r.media)) {
      if (known(id)) media[id] = items;
      else dangling.push({ field: "exerciseMedia", exerciseId: id });
    }
    write.exerciseMedia = media;
  }
  const ok = problems.length === 0;
  return { ok, problems, dangling, present, write: ok ? write : {} };
}
