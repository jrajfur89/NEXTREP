// I2: the clean data space has its own backup list — snapshots of the old data are never offered here
const BACKUP_LIST_KEY = NR_CLEAN_DATA_SPACE ? "nextrep1_backup_list_v1" : "nextrep_backup_list_v1";
const BACKUP_LIMIT = 10;
const BACKUP_APP_VERSION = "1/2026";
let lastAutoBackupAt = 0;
const AUTO_BACKUP_MIN_INTERVAL_MS = 4000; // avoid a flurry of near-identical auto-snapshots

// Reads every current trainapp_* value directly from localStorage — not from React state — so a
// snapshot always reflects exactly what's actually persisted right now.
function readAllAppData() {
  const safeGet = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  return {
    exercises: safeGet(STORAGE_KEYS.exercises),
    plans: safeGet(STORAGE_KEYS.plans),
    history: safeGet(STORAGE_KEYS.history),
    measurements: safeGet(STORAGE_KEYS.measurements),
    customFields: safeGet(STORAGE_KEYS.customFields),
    userName: safeGet(STORAGE_KEYS.userName),
    proStatus: safeGet(STORAGE_KEYS.proStatus),
    proHints: safeGet(STORAGE_KEYS.proHints),
    // DES-01 / D1.5: own exercises, favourites, private names, material metadata (no video files)
    userExercises: safeGet(STORAGE_KEYS.userExercises),
    favourites: safeGet(STORAGE_KEYS.favourites),
    exerciseNames: safeGet(STORAGE_KEYS.exerciseNames),
    exerciseMedia: safeGet(STORAGE_KEYS.exerciseMedia),
  };
}

// Stage 4A.1: the backup list stays ONE global key (not moved), but every snapshot belongs to the
// namespace whose data it holds. Snapshots from before 4A.1 carry no namespace — they hold the
// old global data, i.e. whatever the one-time legacy copy assigned to its target namespace.
function backupOwnerNamespace(b) {
  if (b && b.namespace) return b.namespace;
  const m = getLocalNamespaceMigration();
  return m && m.target ? m.target : "guest";
}
function loadBackupListForActiveNamespace() {
  const ns = getActiveDataNamespace();
  return loadBackupList().filter((b) => backupOwnerNamespace(b) === ns);
}
function loadBackupList() {
  try {
    const raw = localStorage.getItem(BACKUP_LIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveBackupList(list) {
  try {
    localStorage.setItem(BACKUP_LIST_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("backup list save failed", e);
    return false;
  }
}

// Creates one local snapshot and appends it to the backup list (trimmed to BACKUP_LIMIT, oldest
// dropped first — this only ever discards old nextrep_backup_* entries, never trainapp_* data).
// `reason` is one of "auto" | "manual" | "before-import" | "before-restore" | "before-reset".
// Auto-backups are throttled so a burst of saves doesn't create a pile of near-duplicates; pass
// `force: true` to bypass the throttle (used for manual and "before-*" safety backups, which
// should never be silently skipped).
// Returns the created snapshot, or null if it couldn't be written (e.g. storage full/unavailable)
// — callers must treat null as "backup skipped", never as a reason to block or fail the
// operation that triggered it, and never report success to the user when this returns null.
function createBackupSnapshot(reason, options = {}) {
  if (reason === "auto" && !options.force) {
    const now = Date.now();
    if (now - lastAutoBackupAt < AUTO_BACKUP_MIN_INTERVAL_MS) return null;
    lastAutoBackupAt = now;
  }
  try {
    const snapshot = {
      backupId: uid(),
      createdAt: new Date().toISOString(),
      appVersion: BACKUP_APP_VERSION,
      formatVersion: 1,
      reason,
      namespace: getActiveDataNamespace(), // Stage 4A.1: whose data this snapshot contains
      ...(options.meta && typeof options.meta === "object" ? options.meta : {}), // e.g. kind/userId/source of a device snapshot
      data: readAllAppData(),
    };
    let list = loadBackupList();
    list.push(snapshot);
    // Stage 4A.3: before-cloud-load snapshots are outside BACKUP_LIMIT, but bounded per namespace.
    if (snapshot.kind === BEFORE_CLOUD_RESTORE_KIND) list = pruneBeforeCloudRestoreBackups(list, snapshot.namespace, snapshot.userId, snapshot.backupId);
    // Stage 4A.4 Part 2: the copy of the ORIGINAL data taken before an upload re-identified it ("before-migration")
    // is outside BACKUP_LIMIT too — bounded to the 2 newest per namespace instead.
    if (snapshot.reason === "before-migration") {
      const isBm = (b) => b && b.reason === "before-migration" && backupOwnerNamespace(b) === snapshot.namespace;
      const keepBm = new Set(list.filter(isBm).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, 2).map((b) => b.backupId));
      keepBm.add(snapshot.backupId);
      list = list.filter((b) => !isBm(b) || keepBm.has(b.backupId));
    }
    // keep BACKUP_LIMIT per namespace (one account's backups never push out another's)
    const owner = (b) => backupOwnerNamespace(b);
    // the device snapshot taken before "Wczytaj z chmury" is never trimmed away by later backups
    // Stage 4A.4: nor the guest snapshot taken before a guest → account migration (own retention)
    const trimmable = (b) => owner(b) === snapshot.namespace && b.kind !== BEFORE_CLOUD_RESTORE_KIND && b.kind !== BEFORE_GUEST_MIGRATION_KIND && b.reason !== "before-migration";
    while (list.filter(trimmable).length > BACKUP_LIMIT) {
      list.splice(list.findIndex(trimmable), 1);
    }
    return saveBackupList(list) ? snapshot : null;
  } catch (e) {
    console.error("createBackupSnapshot failed", e);
    return null;
  }
}

// Stage 4A.3: retention of the device snapshots taken before "Wczytaj z chmury": per namespace, the
// BEFORE_CLOUD_RESTORE_KEEP newest stay, plus any snapshot that this account's restore pointer or
// init marker (loading / pending cloud load) still refers to. Other namespaces (other accounts, the
// guest) and other kinds of backups are never touched. `keepBackupId` (the snapshot being created
// right now) is always kept — even if older entries carry later timestamps (device clock moved back),
// the snapshot a cloud load is about to rely on can never be pruned before it is referenced.
const BEFORE_CLOUD_RESTORE_KEEP = 2;
function pruneBeforeCloudRestoreBackups(list, ns, userId, keepBackupId = null) {
  const isMine = (b) => b && b.kind === BEFORE_CLOUD_RESTORE_KIND && backupOwnerNamespace(b) === ns;
  const keep = new Set(
    list
      .filter(isMine)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
      .slice(0, BEFORE_CLOUD_RESTORE_KEEP)
      .map((b) => b.backupId)
  );
  if (keepBackupId) keep.add(keepBackupId);
  if (userId) {
    const p = getLastCloudRestorePointer(userId);
    if (p && p.backupId) keep.add(p.backupId);
    const m = getAccountInitMarker(userId);
    if (m && m.backupId) keep.add(m.backupId);
  }
  return list.filter((b) => !isMine(b) || keep.has(b.backupId));
}

// A snapshot's data is only ever restored field-by-field, and only for fields that are actually
// present and array-shaped where an array is expected — this mirrors the same validation already
// used for JSON import, so a malformed/partial snapshot can't wipe out a field it didn't cover.
// DES-01 / D1.5: the user-exercise fields of the snapshot are checked first (records, UUIDs, references); a
// snapshot whose user-exercise part is invalid is not restored at all (nothing is written). A snapshot from
// before D1 has none of them and restores as before (the current user-exercise data stays).
function restoreFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.data || typeof snapshot.data !== "object") return false;
  const d = snapshot.data;
  const userCheck = userExerciseDataImportProblems(d);
  if (!userCheck.ok) return false;
  try {
    if (Array.isArray(d.exercises)) localStorage.setItem(STORAGE_KEYS.exercises, JSON.stringify(d.exercises));
    if (Array.isArray(d.plans)) localStorage.setItem(STORAGE_KEYS.plans, JSON.stringify(d.plans));
    if (Array.isArray(d.history)) localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(d.history));
    if (Array.isArray(d.measurements)) localStorage.setItem(STORAGE_KEYS.measurements, JSON.stringify(d.measurements));
    if (Array.isArray(d.customFields)) localStorage.setItem(STORAGE_KEYS.customFields, JSON.stringify(d.customFields));
    if (typeof d.userName === "string") localStorage.setItem(STORAGE_KEYS.userName, JSON.stringify(d.userName));
    if (d.proStatus && typeof d.proStatus === "object") localStorage.setItem(STORAGE_KEYS.proStatus, JSON.stringify(d.proStatus));
    if (d.proHints && typeof d.proHints === "object") localStorage.setItem(STORAGE_KEYS.proHints, JSON.stringify(d.proHints));
    return writeUserExerciseDataFrom(userCheck);
  } catch (e) {
    console.error("restoreFromSnapshot failed", e);
    return false;
  }
}

// DES-01 / D1.5: the JSON import of the backup screen (13-account-ui.jsx), as one checked function. Order:
// recognise → check (S1 atlas gate, user-exercise data) → backup of the current state → write. Nothing is
// written when a check fails. Older copies (without the user-exercise fields) import as before; the fields a
// copy does not contain stay as they are. → { ok, code: "IMPORTED" | "UNRECOGNIZED" | "ATLAS_INCOMPATIBLE" |
// "USER_EXERCISES_INVALID" | "STORAGE_FAILED", problems }
function applyImportedAppData(data) {
  const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const recognized =
    isObj(data) &&
    ([data.exercises, data.plans, data.history, data.measurements, data.userExercises, data.favourites].some((v) => Array.isArray(v)) ||
      isObj(data.exerciseNames) || isObj(data.exerciseMedia));
  if (!recognized) return { ok: false, code: "UNRECOGNIZED", problems: [] };
  // I3: in S1 only a copy that fits the atlas-only model is imported (the import code stays)
  if (NR_ATLAS_ONLY_EXERCISES) {
    const p = atlasImportProblems(data);
    if (p.length > 0) return { ok: false, code: "ATLAS_INCOMPATIBLE", problems: p };
  }
  const u = userExerciseDataImportProblems(data);
  if (!u.ok) return { ok: false, code: "USER_EXERCISES_INVALID", problems: u.problems };

  // Safety backup of the current state before touching anything, per the required order:
  // parse → validate → backup current → apply → normalize (on reload) → refresh.
  createBackupSnapshot("before-import", { force: true });

  if (Array.isArray(data.exercises)) localStorage.setItem(STORAGE_KEYS.exercises, JSON.stringify(data.exercises));
  if (Array.isArray(data.plans)) {
    const cleanPlans = data.plans.map(normalizePlan).filter(Boolean);
    localStorage.setItem(STORAGE_KEYS.plans, JSON.stringify(cleanPlans));
  }
  if (Array.isArray(data.history)) {
    const cleanHistory = data.history.map(normalizeHistorySession).filter(Boolean);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(cleanHistory));
  }
  if (Array.isArray(data.measurements)) localStorage.setItem(STORAGE_KEYS.measurements, JSON.stringify(data.measurements));
  if (Array.isArray(data.customFields)) localStorage.setItem(STORAGE_KEYS.customFields, JSON.stringify(data.customFields));
  if (typeof data.userName === "string") localStorage.setItem(STORAGE_KEYS.userName, JSON.stringify(data.userName));
  if (data.proStatus && typeof data.proStatus === "object") localStorage.setItem(STORAGE_KEYS.proStatus, JSON.stringify(data.proStatus));
  if (data.proHints && typeof data.proHints === "object") localStorage.setItem(STORAGE_KEYS.proHints, JSON.stringify(data.proHints));
  if (!writeUserExerciseDataFrom(u)) return { ok: false, code: "STORAGE_FAILED", problems: [] };
  return { ok: true, code: "IMPORTED", problems: [], dangling: u.dangling };
}

const BACKUP_REASON_LABELS = {
  auto: "Automatyczna kopia",
  manual: "Ręczna kopia",
  "before-import": "Przed importem",
  "before-restore": "Przed przywróceniem",
  "before-reset": "Przed resetem",
  "before-guest-migration": "Przed przeniesieniem do konta", // Stage 4A.4
};

