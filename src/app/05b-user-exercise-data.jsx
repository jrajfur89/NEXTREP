// DES-01 / D1 (26.10.2026, approved by the product owner) — the local data layer of the user's own exercises,
// favourites, private names of atlas exercises and material metadata. No UI here (D2+).
//
// - Storage: four keys of STORAGE_KEYS (05), i.e. the ACTIVE account namespace (guest ≠ account A ≠ B); every
//   write is saveKeyStrict (written and read back). Never in CLOUD_SYNC_FIELDS — sync stays off.
// - Rules: the pure engine modules (src/engine/private-exercise.js, user-catalog.js); the atlas release is read
//   here only to resolve ids and check records (read-only, as in the catalog adapters).
// - A stored value that cannot be read (broken JSON, wrong shape) is never overwritten by an operation: the
//   operation stops with STORE_UNREADABLE, the stored value stays for recovery (backups, support).
// - Plans and history are only READ (usage count); nothing here removes or rewrites a plan item or a workout.
let _userExerciseCtx = null;
function userExerciseCtx() {
  if (!_userExerciseCtx) _userExerciseCtx = privateExerciseContext(ATLAS_RELEASE);
  return _userExerciseCtx;
}
// { state: "none" | "ok" | "unreadable", value }
function readUserStore(key) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { state: "unreadable", value: null };
  }
  if (raw == null || raw === "") return { state: "none", value: null };
  try {
    return { state: "ok", value: JSON.parse(raw) };
  } catch {
    return { state: "unreadable", value: null };
  }
}
const USER_STORE_SHAPE = { userExercises: "array", favourites: "array", exerciseNames: "object", exerciseMedia: "object" };
function readUserStoreOf(field) {
  const r = readUserStore(STORAGE_KEYS[field]);
  if (r.state !== "ok") return r;
  const isArr = Array.isArray(r.value);
  const okShape = USER_STORE_SHAPE[field] === "array" ? isArr : r.value && typeof r.value === "object" && !isArr;
  return okShape ? r : { state: "unreadable", value: null };
}

// ---- lenient reads (never write) ------------------------------------------------------------------------
// Own exercises as stored (objects with a UUID only; invalid records stay in storage, out of the catalog).
function loadUserExercises() {
  const r = readUserStoreOf("userExercises");
  return r.state === "ok" ? r.value.filter((x) => x && typeof x === "object" && isPrivateExerciseId(x.exerciseId)) : [];
}
function loadFavouriteExercises() {
  const r = readUserStoreOf("favourites");
  return r.state === "ok" ? normalizeFavourites(r.value).favourites : [];
}
function loadCustomExerciseNames() {
  const r = readUserStoreOf("exerciseNames");
  const atlasIds = new Set(ATLAS_RELEASE.exercises.map((e) => e.exerciseId));
  return r.state === "ok" ? normalizeExerciseNames(r.value, { atlasIds }).names : {};
}
function loadExerciseMediaData() {
  const r = readUserStoreOf("exerciseMedia");
  return r.state === "ok" ? normalizeExerciseMedia(r.value).media : {};
}
// The catalog of the active namespace: atlas + own exercises (active and archived) + private names.
// D2.7: cached. The cache key is the active namespace + the stored values of the own exercises and the names,
// so the catalog of another account (or of data replaced by an import / restore / any write) can never be
// served; every write of this layer also drops the cache explicitly (invalidateUserExerciseCatalog).
let _userCatalogCache = { key: null, catalog: null };
function rawUserStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
// Key of the user catalog: changes with the namespace and with any change of the own exercises or the names.
function userExerciseCatalogKey() {
  return `${getActiveDataNamespace()}\u0000${rawUserStore(STORAGE_KEYS.userExercises) ?? ""}\u0000${rawUserStore(STORAGE_KEYS.exerciseNames) ?? ""}`;
}
function invalidateUserExerciseCatalog() {
  _userCatalogCache = { key: null, catalog: null };
}
function getUserExerciseCatalog() {
  const key = userExerciseCatalogKey();
  if (_userCatalogCache.key !== key || !_userCatalogCache.catalog) {
    _userCatalogCache = { key, catalog: buildUserCatalog({ atlas: ATLAS_RELEASE, privateExercises: loadUserExercises(), exerciseNames: loadCustomExerciseNames() }) };
  }
  return _userCatalogCache.catalog;
}
// Plans and workouts that use an exercise (read from storage, never changed).
function userExerciseUsage(exerciseId) {
  const plans = readUserStore(STORAGE_KEYS.plans);
  const history = readUserStore(STORAGE_KEYS.history);
  return countExerciseUsage(exerciseId, {
    plans: plans.state === "ok" && Array.isArray(plans.value) ? plans.value : [],
    history: history.state === "ok" && Array.isArray(history.value) ? history.value : [],
  });
}

// ---- checked writes -------------------------------------------------------------------------------------
// Writes one store unless its current value is unreadable. → { ok, code }
function writeUserStore(field, value) {
  if (readUserStoreOf(field).state === "unreadable") return { ok: false, code: "STORE_UNREADABLE" };
  const ok = saveKeyStrict(STORAGE_KEYS[field], value);
  invalidateUserExerciseCatalog();
  return ok ? { ok: true, code: "SAVED" } : { ok: false, code: "STORAGE_FAILED" };
}
// The stored list itself (incl. records the lenient read leaves out) — operations keep every other record.
function storedUserExercisesForWrite() {
  const r = readUserStoreOf("userExercises");
  if (r.state === "unreadable") return null;
  return r.state === "ok" ? r.value : [];
}
function findStoredUserExercise(list, exerciseId) {
  return (list || []).find((x) => x && x.exerciseId === exerciseId) || null;
}

// ---- own exercises (D1.2, D1.4) -----------------------------------------------------------------------------
// New own exercise. `basedOnId` = an atlas or own exercise a variant is made from (family inherited, Q2).
// → { ok, code, record, errors, warnings }
function addUserExercise(input, { basedOnId = null, now } = {}) {
  const list = storedUserExercisesForWrite();
  if (!list) return { ok: false, code: "STORE_UNREADABLE", record: null, errors: [], warnings: [] };
  let basedOn = null;
  if (basedOnId != null) {
    const r = getUserExerciseCatalog().resolve(basedOnId);
    if (!r) return { ok: false, code: "BASE_NOT_FOUND", record: null, errors: [], warnings: [] };
    basedOn = r.exercise;
  }
  const c = createPrivateExercise(input, { ctx: userExerciseCtx(), basedOn, ...(now ? { now } : {}) });
  if (!c.ok) return { ...c, code: "INVALID" };
  const w = writeUserStore("userExercises", upsertPrivateExercise(list, c.record));
  return w.ok ? { ...c, code: "CREATED" } : { ok: false, code: w.code, record: null, errors: [], warnings: c.warnings };
}
// Edit of an own exercise. Editorial fields always; comparability fields only without history (K5) — otherwise
// COMPARABILITY_CHANGE_REQUIRES_NEW_EXERCISE and nothing is written (use saveUserExerciseAsNew).
function editUserExercise(exerciseId, patch, { now } = {}) {
  const list = storedUserExercisesForWrite();
  if (!list) return { ok: false, code: "STORE_UNREADABLE", record: null };
  const record = findStoredUserExercise(list, exerciseId);
  if (!record) return { ok: false, code: "NOT_FOUND", record: null };
  const usage = userExerciseUsage(exerciseId);
  const u = updatePrivateExercise(record, patch, { ctx: userExerciseCtx(), usage, ...(now ? { now } : {}) });
  if (!u.ok || u.code === "NO_CHANGE") return { ...u, usage };
  const w = writeUserStore("userExercises", upsertPrivateExercise(list, u.record));
  return w.ok ? { ...u, usage } : { ok: false, code: w.code, record: null, usage };
}
// „Zapisz jako nowe ćwiczenie” (K5): a new record next to the old one; the old one, its plans and history stay.
function saveUserExerciseAsNew(exerciseId, patch, { now } = {}) {
  const list = storedUserExercisesForWrite();
  if (!list) return { ok: false, code: "STORE_UNREADABLE", record: null };
  const record = findStoredUserExercise(list, exerciseId);
  if (!record) return { ok: false, code: "NOT_FOUND", record: null };
  const d = deriveFromPrivateExercise(record, patch, { ctx: userExerciseCtx(), ...(now ? { now } : {}) });
  if (!d.ok) return d;
  const w = writeUserStore("userExercises", upsertPrivateExercise(list, d.record));
  return w.ok ? d : { ok: false, code: w.code, record: null };
}
function setUserExerciseStatus(exerciseId, op, now) {
  const list = storedUserExercisesForWrite();
  if (!list) return { ok: false, code: "STORE_UNREADABLE", record: null };
  const record = findStoredUserExercise(list, exerciseId);
  if (!record) return { ok: false, code: "NOT_FOUND", record: null };
  const r = op(record, now ? { now } : {});
  if (!r.ok) return r;
  const w = writeUserStore("userExercises", upsertPrivateExercise(list, r.record));
  return w.ok ? r : { ok: false, code: w.code, record: null };
}
// Archive: stays in plans, history and favourites (K4, decision 8); out of search and new plans.
function archiveUserExercise(exerciseId, { now } = {}) {
  return setUserExerciseStatus(exerciseId, archivePrivateExercise, now);
}
function restoreUserExercise(exerciseId, { now } = {}) {
  return setUserExerciseStatus(exerciseId, restorePrivateExercise, now);
}
// Delete only an exercise used nowhere (EXERCISE_IN_USE otherwise → archive). Its favourite and material
// metadata go with it (they would point at nothing); plans and history are never touched.
function deleteUserExercise(exerciseId) {
  const list = storedUserExercisesForWrite();
  if (!list) return { ok: false, code: "STORE_UNREADABLE" };
  if (!findStoredUserExercise(list, exerciseId)) return { ok: false, code: "NOT_FOUND" };
  const usage = userExerciseUsage(exerciseId);
  if (!canDeletePrivateExercise(usage)) return { ok: false, code: "EXERCISE_IN_USE", usage };
  const favs = readUserStoreOf("favourites");
  const media = readUserStoreOf("exerciseMedia");
  if (favs.state === "unreadable" || media.state === "unreadable") return { ok: false, code: "STORE_UNREADABLE", usage };
  const w = writeUserStore("userExercises", removePrivateExerciseFromList(list, exerciseId));
  if (!w.ok) return { ok: false, code: w.code, usage };
  if (favs.state === "ok" && favs.value.some((f) => f && f.exerciseId === exerciseId)) writeUserStore("favourites", favs.value.filter((f) => !(f && f.exerciseId === exerciseId)));
  if (media.state === "ok" && Object.prototype.hasOwnProperty.call(media.value, exerciseId)) {
    const m = { ...media.value };
    delete m[exerciseId];
    writeUserStore("exerciseMedia", m);
  }
  return { ok: true, code: "DELETED", usage };
}

// ---- favourites and private names ------------------------------------------------------------------------
// Adds or removes a favourite. Adding needs an exercise of the catalog (atlas or own, archived too).
function toggleFavouriteExercise(exerciseId, { now } = {}) {
  const r = readUserStoreOf("favourites");
  if (r.state === "unreadable") return { ok: false, code: "STORE_UNREADABLE", favourite: false };
  const current = normalizeFavourites(r.value).favourites;
  const adding = !current.some((f) => f.exerciseId === exerciseId);
  if (adding && !getUserExerciseCatalog().resolve(exerciseId)) return { ok: false, code: "REF_UNKNOWN_EXERCISE", favourite: false };
  const t = toggleFavourite(current, exerciseId, now ? { now } : {});
  if (!t.ok) return t;
  // D2: what was removed (with its place and date) — „Cofnij” puts it back exactly there
  const index = current.findIndex((f) => f.exerciseId === exerciseId);
  const removed = adding ? null : { ...current[index], index };
  const w = writeUserStore("favourites", t.favourites);
  return w.ok ? { ...t, removed } : { ok: false, code: w.code, favourite: !adding };
}
function isFavouriteExercise(exerciseId) {
  return loadFavouriteExercises().some((f) => f.exerciseId === exerciseId);
}
// D2 „Cofnij” after removing a favourite: the same entry (date of adding) at its old place; nothing when it is
// already back. → { ok, code }
function restoreFavouriteExercise(removed) {
  if (!removed || typeof removed.exerciseId !== "string") return { ok: false, code: "NOTHING_TO_RESTORE" };
  const r = readUserStoreOf("favourites");
  if (r.state === "unreadable") return { ok: false, code: "STORE_UNREADABLE" };
  const current = normalizeFavourites(r.value).favourites;
  if (current.some((f) => f.exerciseId === removed.exerciseId)) return { ok: true, code: "ALREADY_FAVOURITE" };
  if (!getUserExerciseCatalog().resolve(removed.exerciseId)) return { ok: false, code: "REF_UNKNOWN_EXERCISE" };
  const at = Math.max(0, Math.min(Number.isInteger(removed.index) ? removed.index : current.length, current.length));
  const next = [...current.slice(0, at), { exerciseId: removed.exerciseId, addedAt: removed.addedAt }, ...current.slice(at)];
  if (normalizeFavourites(next).problems.length) return { ok: false, code: "INVALID" };
  const w = writeUserStore("favourites", next);
  return w.ok ? { ok: true, code: "FAVOURITE_RESTORED" } : { ok: false, code: w.code };
}
// A private name of an ATLAS exercise — the exerciseId stays the same (no new exercise, no copy).
function setCustomExerciseNameFor(exerciseId, name, { now } = {}) {
  const r = readUserStoreOf("exerciseNames");
  if (r.state === "unreadable") return { ok: false, code: "STORE_UNREADABLE" };
  const s = setCustomExerciseName(loadCustomExerciseNames(), exerciseId, name, { atlasIndex: getUserExerciseCatalog().atlasIndex, ...(now ? { now } : {}) });
  if (!s.ok) return s;
  const w = writeUserStore("exerciseNames", s.names);
  return w.ok ? s : { ok: false, code: w.code };
}
function removeCustomExerciseNameFor(exerciseId) {
  const r = readUserStoreOf("exerciseNames");
  if (r.state === "unreadable") return { ok: false, code: "STORE_UNREADABLE" };
  const s = removeCustomExerciseName(loadCustomExerciseNames(), exerciseId);
  if (!s.ok) return s;
  const w = writeUserStore("exerciseNames", s.names);
  return w.ok ? s : { ok: false, code: w.code };
}

// ---- backups / import (D1.5) ------------------------------------------------------------------------------
// The user-exercise part of a backup or JSON copy, checked against the atlas (and, for references, the own
// exercises the namespace will have after the write) before anything is written. → see userExerciseDataProblems
function userExerciseDataImportProblems(data) {
  return userExerciseDataProblems(data, { atlas: ATLAS_RELEASE, ctx: userExerciseCtx(), currentPrivateIds: loadUserExercises().map((r) => r.exerciseId) });
}
// Writes the user-exercise fields of an already CHECKED copy (`check.write`; absent fields stay as they are).
function writeUserExerciseDataFrom(check) {
  let ok = true;
  for (const f of USER_EXERCISE_DATA_FIELDS) if (check && check.write && check.write[f] !== undefined) ok = saveKeyStrict(STORAGE_KEYS[f], check.write[f]) && ok;
  invalidateUserExerciseCatalog(); // D2.7: an import / restore replaces the data the catalog was built from
  return ok;
}
