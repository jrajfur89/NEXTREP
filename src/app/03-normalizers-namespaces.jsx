// Migrates exercises saved under older schemas (single category/equipment strings, or the
// original type: weight/bodyweight/time field) to the current schema: category/equipment as
// arrays (an exercise can target multiple muscle groups / use multiple equipment types),
// plus isTimeBased and isSetsOnly flags.
// Defends against malformed session entries that can enter `history` via an imported JSON file
// or older/corrupted localStorage data: a missing exercises array, a missing sets array inside
// one exercise, or a session that isn't even an object. Never drops a session outright for
// having extra/unexpected fields — only fills in the structural pieces the app reads directly
// (e.g. `session.exercises.map(...)`) so they can't throw.
// Same defensive purpose as normalizeHistorySession, for plans: a plan missing its exercises
// array (e.g. from an older export format or a hand-edited import file) would otherwise crash
// the Plans list and the plan editor the moment they try to read `.exercises.length`.
function normalizePlan(p) {
  if (!p || typeof p !== "object") return null;
  return {
    ...p,
    id: p.id || uid(),
    name: p.name || "Plan treningowy",
    exercises: Array.isArray(p.exercises) ? p.exercises : [],
  };
}

function normalizeHistorySession(s) {
  if (!s || typeof s !== "object") return null;
  return {
    ...s,
    id: s.id || uid(),
    date: s.date || new Date().toISOString(),
    exercises: Array.isArray(s.exercises)
      ? s.exercises.map((ex) =>
          ex && typeof ex === "object"
            ? { ...ex, id: ex.id || newUuid(), sets: Array.isArray(ex.sets) ? ex.sets : [] }
            : { id: newUuid(), exerciseId: null, name: "Ćwiczenie", type: "weight", sets: [] }
        )
      : [],
  };
}

function normalizeExercise(ex) {
  if (!ex || typeof ex !== "object") ex = {};
  const category = Array.isArray(ex.category) ? ex.category : ex.category ? [ex.category] : ["Całe ciało"];
  let equipment;
  if (Array.isArray(ex.equipment)) {
    equipment = ex.equipment;
  } else if (ex.equipment) {
    equipment = [ex.equipment];
  } else {
    let eq = "Sztanga";
    if (ex.type === "bodyweight") eq = "Masa ciała";
    if (ex.type === "time") eq = "Masa ciała";
    equipment = [eq];
  }
  return {
    id: ex.id || uid(),
    name: ex.name || "Ćwiczenie",
    category,
    equipment,
    isTimeBased: ex.isTimeBased || ex.type === "time" || false,
    isSetsOnly: ex.isSetsOnly || false,
    isCardio: ex.isCardio || false,
    deviceType: ex.deviceType || (ex.isCardio ? "Inne" : ""),
    videoUrl: ex.videoUrl || "",
    notes: ex.notes || "",
  };
}

// Plans historically stored one blanket "targetSets" (count) + "targetReps" (one string) per
// exercise. The plan editor now lets you define each series individually (its own target +
// RIR), stored as `setsDetail`. This getter transparently synthesizes a `setsDetail` array from
// the old fields when a plan hasn't been re-saved yet, so old plans keep working unchanged.
function getPlanItemSetsDetail(item) {
  if (Array.isArray(item.setsDetail) && item.setsDetail.length) return item.setsDetail;
  const count = Math.max(1, Number(item.targetSets) || 3);
  const target = item.targetReps || "";
  return Array.from({ length: count }, (_, i) => ({ id: `${item.id || "legacy"}-${i}`, target, rir: "" }));
}

// =====================================================================================
// Stage 4A.1 — per-user LOCAL DATA NAMESPACES
//
//   GOŚĆ    → nextrep_guest_<name>_v1
//   KONTO A → nextrep_user_<idA>_<name>_v1
//   KONTO B → nextrep_user_<idB>_<name>_v1
//
// One central place decides which namespace is active (getLocalDataNamespace / the active
// namespace set by activateDataNamespace) and builds every scoped key (getStorageKey). Nothing
// else in the app chooses a key per user — STORAGE_KEYS (below) resolves through it.
// Data is never moved between namespaces on login/logout: each namespace simply keeps its own
// keys, so A → logout → B → logout → A finds A's data again. Guest data is NOT imported into an
// account (that's a later, explicit step).
// Device-level settings stay global on purpose: onboarding, local PRO flags, the backup list.
// =====================================================================================
let _activeDataNamespace = null; // null until the app has resolved the session at start-up
function getLocalDataNamespace(userId) {
  if (userId == null || userId === "") return "guest";
  const safe = String(userId).toLowerCase().replace(/[^a-z0-9-]/g, "");
  return safe ? `user_${safe}` : "guest";
}
// The namespace all scoped keys currently resolve to. Before the first activation it is
// "pending": nothing is ever displayed from it and sync refuses to run against it.
function getActiveDataNamespace() {
  return _activeDataNamespace || "pending";
}
// userId === undefined → the ACTIVE namespace; null/"" → guest; a user id → that user.
function getStorageKey(name, userId) {
  const ns = userId === undefined ? getActiveDataNamespace() : getLocalDataNamespace(userId);
  return `nextrep_${ns}_${name}_v1`;
}
function isActiveNamespaceFor(userId) {
  return _activeDataNamespace != null && _activeDataNamespace === getLocalDataNamespace(userId);
}

// ---- one-time, NON-destructive migration of the old global keys ----
// The old global keys are COPIED (raw strings, byte for byte) into the namespace that is active
// at the first start of this version — guest if nobody is logged in, otherwise the account that
// was already using this data on this device. The old keys are never removed or overwritten:
// they stay as the recovery copy. Runs once (global marker); a key already present in the
// target namespace is never overwritten.
const LEGACY_LOCAL_KEYS = {
  exercises: "trainapp_exercises_v1",
  plans: "trainapp_plans_v1",
  history: "trainapp_history_v1",
  measurements: "trainapp_measurements_v1",
  custom_fields: "trainapp_custom_fields_v1",
  user_name: "trainapp_user_name_v1",
  active_workout_draft: "trainapp_active_workout_draft_v1",
  sync_queue: "nextrep_sync_queue_v1",
  sync_meta: "nextrep_sync_meta_v1",
  sync_conflicts: "nextrep_sync_conflicts_v1",
  migration_v1_status: "nextrep_migration_v1_status",
  migration_workout_identity: "nextrep_migration_workout_identity_v1",
  device_id: "nextrep_device_id_v1",
};
const LOCAL_NS_MIGRATION_KEY = "nextrep_local_namespace_migration_v1";
function getLocalNamespaceMigration() {
  try {
    const raw = localStorage.getItem(LOCAL_NS_MIGRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function migrateLegacyLocalDataOnce(targetNs) {
  const prev = getLocalNamespaceMigration();
  if (prev && prev.status === "completed") return prev;
  const copied = [];
  const keptExisting = [];
  try {
    for (const [name, legacyKey] of Object.entries(LEGACY_LOCAL_KEYS)) {
      const raw = localStorage.getItem(legacyKey);
      if (raw == null) continue;
      const target = `nextrep_${targetNs}_${name}_v1`;
      if (localStorage.getItem(target) != null) {
        keptExisting.push(name);
        continue;
      }
      localStorage.setItem(target, raw);
      copied.push(name);
    }
    for (const name of copied) {
      if (localStorage.getItem(`nextrep_${targetNs}_${name}_v1`) !== localStorage.getItem(LEGACY_LOCAL_KEYS[name])) throw new Error(`kopia ${name} niezgodna`);
    }
    const marker = { status: "completed", target: targetNs, at: new Date().toISOString(), copied, keptExisting, legacyKeysKept: true };
    localStorage.setItem(LOCAL_NS_MIGRATION_KEY, JSON.stringify(marker));
    return marker;
  } catch (e) {
    // Undo only what THIS attempt wrote, so the namespace isn't left half-filled; the old keys
    // were never touched. Next start retries.
    for (const name of copied) {
      try {
        localStorage.removeItem(`nextrep_${targetNs}_${name}_v1`);
      } catch {}
    }
    try {
      localStorage.setItem(LOCAL_NS_MIGRATION_KEY, JSON.stringify({ status: "failed", target: targetNs, at: new Date().toISOString(), error: String((e && e.message) || e) }));
    } catch {}
    return null;
  }
}
// Session user id right now (null when logged out / on error) — used by sync to detect that the
// account changed while it was running.
async function currentSessionUserId() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return (data && data.session && data.session.user && data.session.user.id) || null;
  } catch {
    return null;
  }
}
// Switches every scoped key to the namespace of `userId` (null → guest). The first activation
// in this version also performs the one-time legacy copy into that namespace.
function activateDataNamespace(userId) {
  const ns = getLocalDataNamespace(userId);
  migrateLegacyLocalDataOnce(ns);
  migrateLegacyProOnce();
  _activeDataNamespace = ns;
  return ns;
}
// =====================================================================================
// Stage 4A.2 — ACCOUNT DATA SOURCE INITIALISATION
// After login the app decides — or lets the user decide — which data this account's local
// namespace starts with: what's already on the device, what's in the cloud, or nothing. Never an
// automatic mix of the two. The decision is stored as a TECHNICAL marker in the account's own
// namespace (nextrep_user_<id>_account_init_v1), so returning to the account doesn't ask again;
// it never skips the namespace isolation of Stage 4A.1 and can be reset from "Moje konto".
//   marker = { status: "ready", source: "new" | "device" | "cloud" | "empty", syncPaused, at }
//   syncPaused = true when the user kept device data / started empty although the cloud HAS data:
//   normal sync would otherwise pull the cloud in (= the automatic mix this step forbids).
// =====================================================================================
// Network failures from fetch / supabase-js (offline, DNS, connection drops) — never shown raw.
function isNetworkError(error) {
  if (!error) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const name = String(error.name || "");
  const msg = String(error.message || error || "");
  if (name === "AuthRetryableFetchError" || (error.status === 0 && /fetch|network/i.test(msg))) return true;
  return /failed to fetch|networkerror|network request failed|load failed|network error|fetch failed|err_internet_disconnected/i.test(msg);
}
