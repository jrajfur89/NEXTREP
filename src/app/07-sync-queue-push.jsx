// getStorageKey("sync_queue"): scoped per namespace (Stage 4A.1) — see getStorageKey("sync_queue")
const SYNC_OPERATIONS = ["upsert", "delete"];
const SYNC_STATUSES = ["pending", "processing", "failed", "conflict"];
// Statuses that mean "this table+recordId still needs to reach the cloud" — used for both
// dedup (point 2) and for deciding what counts as "pending work" at startup/online (point 9).
const SYNC_ACTIVE_STATUSES = new Set(["pending", "processing", "failed", "conflict"]);

// --- Queue persistence (point 1) — resilient to corrupted JSON, never throws. ---
function loadSyncQueue() {
  try {
    const raw = localStorage.getItem(getStorageKey("sync_queue"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error("nextrep_sync_queue_v1: zawartość nie jest tablicą — startuję z pustą kolejką", parsed);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error("nextrep_sync_queue_v1: uszkodzony JSON w localStorage — startuję z pustą kolejką", e);
    return [];
  }
}

function saveSyncQueue(queue) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[sync diag] saveSyncQueue() called with", { length: Array.isArray(queue) ? queue.length : "NOT AN ARRAY", queue });
  try {
    const serialized = JSON.stringify(Array.isArray(queue) ? queue : []);
    localStorage.setItem(getStorageKey("sync_queue"), serialized);
    console.log("[sync diag] saveSyncQueue() wrote to localStorage OK. Read-back:", localStorage.getItem(getStorageKey("sync_queue")));
  } catch (e) {
    console.error("[sync diag] saveSyncQueue() THREW — nextrep_sync_queue_v1 zapis nie powiódł się", e);
    console.error("nextrep_sync_queue_v1: zapis kolejki nie powiódł się", e);
  }
}

// --- Add a change to the queue, with dedup by table+recordId (point 2). ---
// If an active (not-yet-synced) entry already exists for the same record, it's updated in place
// with the newest operation/version/deviceId instead of creating a second entry — so "exercise
// abc v3 -> v4 -> v5" collapses into one queue row carrying v5, exactly as specified.
function enqueueSyncChange({ table, recordId, operation, version, deviceId }) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[sync diag] enqueueSyncChange() called with", { table, recordId, operation, version, deviceId });
  if (!table || recordId == null || !SYNC_OPERATIONS.includes(operation)) {
    console.log("[sync diag] enqueueSyncChange() REJECTED arguments — no entry will be added", { table, recordId, operation });
    console.error("enqueueSyncChange: nieprawidłowe argumenty, wpis pominięty", { table, recordId, operation });
    return null;
  }
  const queue = loadSyncQueue();
  const existingIdx = queue.findIndex((it) => it.table === table && it.recordId === recordId && SYNC_ACTIVE_STATUSES.has(it.status));

  if (existingIdx >= 0) {
    const updated = {
      ...queue[existingIdx],
      operation,
      version: version ?? null,
      deviceId: deviceId ?? null,
      status: "pending",
    };
    queue[existingIdx] = updated;
    saveSyncQueue(queue);
    console.log("[sync diag] enqueueSyncChange() UPDATED existing entry (dedup):", updated);
    return updated;
  }

  const entry = {
    id: newUuid(),
    table,
    recordId,
    operation,
    version: version ?? null,
    deviceId: deviceId ?? null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  };
  queue.push(entry);
  saveSyncQueue(queue);
  console.log("[sync diag] enqueueSyncChange() CREATED new entry:", entry);
  console.log("[sync diag] enqueueSyncChange() full queue immediately after:", loadSyncQueue());
  return entry;
}

function removeSyncQueueItem(id) {
  const queue = loadSyncQueue().filter((it) => it.id !== id);
  saveSyncQueue(queue);
  return queue;
}

function updateSyncQueueItem(id, patch) {
  const queue = loadSyncQueue();
  const idx = queue.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  queue[idx] = { ...queue[idx], ...patch };
  saveSyncQueue(queue);
  return queue[idx];
}

function clearSyncQueue() {
  saveSyncQueue([]);
}

// --- Error classification (point 6). Never throws, always returns one of the 6 kinds (+ Stage 4A.4 F-5:
// "migration_paused"). ---
function classifySyncError(error) {
  if (!error) return "unknown";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  // Stage 4A.4 F-5: the account is locked by a migration attempt (NR001) — the change is kept and waits; a
  // closed-attempt answer (NR002) can't come from sync (it never sends a token) but is treated the same way.
  const mk = migrationErrorKind(error);
  if (mk === "in_progress" || mk === "closed") return "migration_paused";

  const message = String((error && error.message) || error || "");
  const name = (error && error.name) || "";
  const status = error && error.status;

  if (name === "TypeError" || /failed to fetch|network|timeout|offline/i.test(message)) return "network";
  if (status === 401 || status === 403 || /jwt|not authenticated|auth/i.test(message)) return "auth";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";
  if (typeof status === "number" && status >= 500 && status < 600) return "server";
  return "unknown";
}

// --- Retry backoff schedule (point 5): 2s, 5s, 15s, 30s, then 60s for every attempt after. ---
const SYNC_RETRY_SCHEDULE_MS = { 1: 2000, 2: 5000, 3: 15000, 4: 30000 };
function getRetryDelayMs(attempts) {
  return SYNC_RETRY_SCHEDULE_MS[attempts] ?? 60000;
}

// Placeholder for the real per-item network call. Intentionally never contacts Supabase for
// actual data sync yet — that's the real push/pull this step deliberately does not implement.
async function syncQueueItemStub() {
  throw new Error("Sync Engine nie jest jeszcze aktywny.");
}

const _syncRetryTimers = {};

// Attempts to sync exactly one queue item via `syncFn` (defaults to the not-yet-implemented
// stub). On a transient error (network/server/unknown) it keeps the item, bumps `attempts`,
// and schedules a retry per the backoff table — it never removes the item and never silently
// drops data. On auth/validation it stops retrying (would spam a doomed request) but still keeps
// the item in the queue for a human/later mechanism to resolve. On conflict it marks the item
// `conflict` and stops — the future Conflict Center will own it, not this step.
async function attemptSyncQueueItem(item, syncFn = syncQueueItemStub) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[push diag] attemptSyncQueueItem() CALLED", { itemId: item.id, table: item.table, recordId: item.recordId, operation: item.operation });
  updateSyncQueueItem(item.id, { status: "processing" });
  try {
    const syncFnReturnValue = await syncFn(item);
    console.log("[push diag] attemptSyncQueueItem(): syncFn(item) RESOLVED WITHOUT THROWING — item will be REMOVED regardless of its return value.", {
      itemId: item.id,
      syncFnReturnValue,
      note: "attemptSyncQueueItem does not inspect this return value at all — resolving without throwing IS the only success condition.",
    });
    removeSyncQueueItem(item.id);
    return { ok: true, itemId: item.id };
  } catch (e) {
    console.log("[push diag] attemptSyncQueueItem(): syncFn(item) THREW — item will be KEPT (never removed on error)", e);
    const kind = classifySyncError(e);
    const attempts = (item.attempts || 0) + 1;
    console.log("[push diag] attemptSyncQueueItem(): classifySyncError ->", kind, "attempts now", attempts);

    if (kind === "migration_paused") {
      // Stage 4A.4 F-5: kept; retried through the gate only after the lock ends (no hammering)
      updateSyncQueueItem(item.id, { attempts, status: "failed" });
      scheduleSyncRetry(item.id, MIGRATION_TIMING.pausedRetryMs, syncFn);
      return { ok: false, kind, itemId: item.id, attempts, retryScheduled: true, delayMs: MIGRATION_TIMING.pausedRetryMs };
    }
    if (kind === "network" || kind === "server" || kind === "unknown") {
      updateSyncQueueItem(item.id, { attempts, status: "failed" });
      const delay = getRetryDelayMs(attempts);
      scheduleSyncRetry(item.id, delay, syncFn);
      return { ok: false, kind, itemId: item.id, attempts, retryScheduled: true, delayMs: delay };
    }
    if (kind === "conflict") {
      updateSyncQueueItem(item.id, { attempts, status: "conflict" });
      return { ok: false, kind, itemId: item.id, attempts, retryScheduled: false };
    }
    // auth / validation: keep the item (never lose the pending change), but don't hammer a
    // request that will fail again immediately — no retry timer for these two kinds.
    updateSyncQueueItem(item.id, { attempts, status: "failed" });
    return { ok: false, kind, itemId: item.id, attempts, retryScheduled: false };
  }
}

function scheduleSyncRetry(itemId, delayMs, syncFn = syncQueueItemStub) {
  if (_syncRetryTimers[itemId]) clearTimeout(_syncRetryTimers[itemId]);
  const timer = setTimeout(() => {
    delete _syncRetryTimers[itemId];
    const queue = loadSyncQueue();
    const current = queue.find((it) => it.id === itemId);
    if (!current) return; // removed/succeeded elsewhere in the meantime
    if (current.status !== "failed" && current.status !== "pending") return; // e.g. now "conflict" — leave it alone
    runGatedSyncRetry(itemId, syncFn).catch((e) => console.error("sync retry failed", e));
  }, delayMs);
  _syncRetryTimers[itemId] = timer;
  return timer;
}
// Stage 4A.4 F-5 (Etap 6): a retry is a PUSH like any other — it never goes around the gates runSync()
// applies: session + own namespace + account ready (marker) + the server migration lock (fail closed),
// and it holds the same single-flight lock as runSync(), so a retry and a sync pass never overlap.
// Locked / unknown → the item stays (failed) and is tried again later; the queue is never cleared.
async function runGatedSyncRetry(itemId, syncFn) {
  if (_syncRunInProgress) {
    scheduleSyncRetry(itemId, 2000, syncFn); // a sync pass is running — it (or the next retry) takes the item
    return { ok: false, reason: "busy" };
  }
  _syncRunInProgress = true;
  try {
    const userId = await currentSessionUserId();
    if (!userId || !isActiveNamespaceFor(userId) || !isAccountSyncAllowed(userId)) return { ok: false, reason: "not_allowed" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
    const gate = await readMigrationGate(userId);
    if (!gate.ok || gate.blocking) {
      if (isActiveNamespaceFor(userId)) scheduleSyncRetry(itemId, MIGRATION_TIMING.pausedRetryMs, syncFn);
      return { ok: false, reason: gate.ok ? "migration_locked" : "migration_check_failed" };
    }
    if (!isActiveNamespaceFor(userId) || !isAccountSyncAllowed(userId) || (await currentSessionUserId()) !== userId) return { ok: false, reason: "not_allowed" };
    const current = loadSyncQueue().find((it) => it.id === itemId);
    if (!current || (current.status !== "failed" && current.status !== "pending")) return { ok: false, reason: "gone" };
    return await attemptSyncQueueItem(current, syncFn);
  } finally {
    _syncRunInProgress = false;
  }
}

function cancelAllScheduledSyncRetries() {
  Object.values(_syncRetryTimers).forEach((t) => clearTimeout(t));
  Object.keys(_syncRetryTimers).forEach((k) => delete _syncRetryTimers[k]);
}

// --- Debounce helper for future automatic sync (point 10). ---
let _scheduleSyncTimer = null;
// Stage 4A.2: drops a debounced sync that was scheduled for the previous workspace.
function cancelScheduledSync() {
  if (_scheduleSyncTimer) clearTimeout(_scheduleSyncTimer);
  _scheduleSyncTimer = null;
}
function scheduleSync(delayMs = 1500, runner = runSync) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[sync diag] scheduleSync() called", { delayMs, hadExistingTimer: !!_scheduleSyncTimer });
  if (_scheduleSyncTimer) clearTimeout(_scheduleSyncTimer);
  _scheduleSyncTimer = setTimeout(() => {
    _scheduleSyncTimer = null;
    console.log("[sync diag] scheduleSync() timer fired — about to call runner() (runSync)");
    runner();
  }, delayMs);
  return _scheduleSyncTimer;
}

/* ---------------------------------------------------------------------- */
/* Krok 8B.1 — prawdziwy PUSH (localStorage -> queue -> Supabase).         */
/*                                                                           */
/* Zero PULL: nic tutaj nigdy nie czyta danych treningowych Z Supabase —   */
/* wyłącznie sprawdza istnienie/wersję rekordu (SELECT id, version) po      */
/* kluczu biznesowym, żeby wiedzieć czy zrobić UPDATE czy INSERT, i żeby    */
/* wykryć konflikt wersji przed zapisem. To NIE jest odczyt treningowych   */
/* danych użytkownika — nigdzie nie ma SELECT innych kolumn niż id/version. */
/* ---------------------------------------------------------------------- */

// Kolejność respektująca FK. `devices` nie jest tu wymieniona — zapewnienie
// istnienia urządzenia to osobny krok WYKONYWANY RAZ na początku runSync(),
// nie pozycja w kolejce (nic w CRUD nie enqueue'uje zmian "device").
const SYNC_TABLE_ORDER = [
  "profile",
  "exercises",
  "custom_fields",
  "measurements",
  "plans",
  "plan_items",
  "plan_item_sets",
  "workouts",
  "workout_exercises",
  "workout_sets",
];

const SYNC_TABLE_TO_SUPABASE = {
  profile: "nextrep_profiles",
  exercises: "nextrep_exercises",
  custom_fields: "nextrep_custom_fields",
  measurements: "nextrep_measurements",
  plans: "nextrep_plans",
  plan_items: "nextrep_plan_items",
  plan_item_sets: "nextrep_plan_item_sets",
  workouts: "nextrep_workouts",
  workout_exercises: "nextrep_workout_exercises",
  workout_sets: "nextrep_workout_sets",
};

function sortQueueByDependencyOrder(queue) {
  return [...queue].sort((a, b) => {
    const ia = SYNC_TABLE_ORDER.indexOf(a.table);
    const ib = SYNC_TABLE_ORDER.indexOf(b.table);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

// Fresh-from-localStorage snapshot used for exactly one runSync() pass — never trusts React
// state (which may be stale relative to what's actually persisted), and is loaded once per run
// rather than once per item to avoid re-reading localStorage hundreds of times.
async function loadLocalSnapshotForSync() {
  const [exercises, plans, history, measurements, customFields, userName] = await Promise.all([
    loadKey(STORAGE_KEYS.exercises),
    loadKey(STORAGE_KEYS.plans),
    loadKey(STORAGE_KEYS.history),
    loadKey(STORAGE_KEYS.measurements),
    loadKey(STORAGE_KEYS.customFields),
    loadKey(STORAGE_KEYS.userName),
  ]);
  return {
    exercises: Array.isArray(exercises) ? exercises : [],
    plans: Array.isArray(plans) ? plans : [],
    history: Array.isArray(history) ? history : [],
    measurements: Array.isArray(measurements) ? measurements : [],
    customFields: Array.isArray(customFields) ? customFields : [],
    userName: typeof userName === "string" ? userName : "",
  };
}

// Locates the local record a queue item refers to, using the snapshot above. Nested records
// (plan_items, plan_item_sets, workout_exercises, workout_sets) also get their immediate parent's
// LOCAL id attached (as __parent*) so the caller can resolve that parent's Supabase UUID next.
function findLocalRecordForQueueItem(item, snap) {
  switch (item.table) {
    case "exercises":
      return snap.exercises.find((e) => e.id === item.recordId) || null;
    case "plans":
      return snap.plans.find((p) => p.id === item.recordId) || null;
    case "plan_items":
      for (const plan of snap.plans) {
        const it = (plan.exercises || []).find((x) => x.id === item.recordId);
        if (it) return { ...it, __parentPlanId: plan.id };
      }
      return null;
    case "plan_item_sets":
      for (const plan of snap.plans) {
        for (const it of plan.exercises || []) {
          const s = (it.setsDetail || []).find((x) => x.id === item.recordId);
          if (s) return { ...s, __parentPlanItemId: it.id };
        }
      }
      return null;
    case "workouts":
      return snap.history.find((h) => h.id === item.recordId) || null;
    case "workout_exercises":
      for (const session of snap.history) {
        const ex = (session.exercises || []).find((x) => x.id === item.recordId);
        if (ex) return { ...ex, __parentWorkoutId: session.id };
      }
      return null;
    case "workout_sets":
      for (const session of snap.history) {
        for (const ex of session.exercises || []) {
          const s = (ex.sets || []).find((x) => x.id === item.recordId);
          if (s) return { ...s, __parentWorkoutExerciseId: ex.id };
        }
      }
      return null;
    case "measurements":
      return snap.measurements.find((m) => m.id === item.recordId) || null;
    case "custom_fields":
      return snap.customFields.find((f) => f.key === item.recordId) || null;
    case "profile":
      return { displayName: snap.userName };
    default:
      return null;
  }
}

// =====================================================================================
// Stage 4A.4 (Etap 11) — cloud-safe values for NOT NULL number columns (every cloud write path).
// These cloud columns are NOT NULL with a server default whose meaning the app already gives to a
// missing local value (confirmed against the production schema):
//   nextrep_plan_items.rest_seconds (default 0) — a plan item without its own rest: the workout timer
//     uses 90 s for a missing value and for 0 alike (old plans, imported files);
//   nextrep_workouts.exercises_count / total_sets / total_reps / duration_sec / total_weight / volume
//     (default 0) — summaries the app writes when a workout is saved; the statistics already count a
//     missing one as 0 (old / imported sessions).
// Sending `null` there made the server refuse the row (23502) — an upload stopped half way. Now a
// missing / empty / non-numeric value is OMITTED from the row:
//   INSERT → the server default applies;   UPDATE → the cloud value stays (never overwritten by "unknown").
// (Both writers — V1 upsertByLegacyId and sync pushUpsertByLegacyId — choose INSERT or UPDATE explicitly
// after a lookup; there is no merge-upsert on these tables.) A decimal comma is read as a decimal point and
// an integer column gets a rounded value (90.5 would be refused by an integer column). Any value the server
// accepts is sent unchanged (also negative ones). Local data is never rewritten. The comparison used by sync
// (syncPayloadMatches) builds the same rows, so an omitted column is not compared — no false "remote newer".
// Values that cannot be repaired without inventing data (a missing / invalid date, a number outside the
// integer range) are reported by cloudUploadBlockers BEFORE an upload attempt starts.
// =====================================================================================
const CLOUD_INT_MAX = 2147483647;
const CLOUD_DEFAULTED_NUMBER_COLUMNS = {
  nextrep_plan_items: { rest_seconds: "int" },
  nextrep_workouts: { exercises_count: "int", total_sets: "int", total_reps: "int", duration_sec: "int", total_weight: "num", volume: "num" },
};
// → a finite number for the column, or undefined (= leave the column out)
function cloudNumberValue(v, kind) {
  if (v === null || v === undefined || typeof v === "boolean" || typeof v === "object") return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  const n = toNumber(typeof v === "string" ? v.trim() : v);
  if (n == null) return undefined;
  return kind === "int" ? Math.round(n) : n;
}
function sanitizeCloudRow(table, row) {
  const rules = CLOUD_DEFAULTED_NUMBER_COLUMNS[table];
  if (!rules || !row || typeof row !== "object") return row;
  const out = { ...row };
  for (const [col, kind] of Object.entries(rules)) {
    if (!Object.prototype.hasOwnProperty.call(out, col)) continue;
    const v = cloudNumberValue(out[col], kind);
    if (v === undefined) delete out[col];
    else out[col] = v;
  }
  return out;
}
// timestamptz columns without a default (workout_date, measurement_date): an ISO-like date string that
// parses. Never invented — a record without one cannot be uploaded.
function isCloudTimestamp(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) && Number.isFinite(Date.parse(v.trim()));
}
// Local records the cloud would refuse and that cannot be repaired without inventing data. Checked before a
// migration attempt starts (device upload, guest → account, manual tool, and their resumes), so an upload
// that is bound to fail never locks the account. → [{ kind, label, count, sample }] (empty = ok)
function cloudUploadBlockers(ds) {
  const src = ds || {};
  const out = [];
  const report = (kind, label, ids) => {
    if (ids.length) out.push({ kind, label, count: ids.length, sample: ids.slice(0, 5) });
  };
  const list = (v) => (Array.isArray(v) ? v : []);
  const outOfRange = (v) => {
    const n = cloudNumberValue(v, "int");
    return n !== undefined && (n > CLOUD_INT_MAX || n < -CLOUD_INT_MAX - 1);
  };
  report("measurement_date", "pomiary bez prawidłowej daty", list(src.measurements).filter((m) => m && typeof m === "object" && m.id != null && !isCloudTimestamp(m.date)).map((m) => String(m.id)));
  report("workout_date", "treningi bez prawidłowej daty", list(src.history).filter((s) => s && typeof s === "object" && s.id != null && !isCloudTimestamp(s.date)).map((s) => String(s.id)));
  const bigNumbers = [];
  for (const s of list(src.history)) {
    if (!s || typeof s !== "object" || s.id == null) continue;
    if ([s.exercisesCount, s.totalSets, s.totalReps, s.durationSec].some(outOfRange)) bigNumbers.push(String(s.id));
  }
  for (const plan of list(src.plans)) {
    for (const item of plan && Array.isArray(plan.exercises) ? plan.exercises : []) {
      if (item && typeof item === "object" && item.id != null && outOfRange(item.restSeconds)) bigNumbers.push(String(item.id));
    }
  }
  report("number_range", "liczby poza dopuszczalnym zakresem", bigNumbers);
  return out;
}
function cloudUploadBlockersText(blockers, { resuming = false } = {}) {
  const what = blockers.map((b) => `${b.label} (${b.count})`).join(", ");
  if (resuming) {
    // the interrupted attempt already wrote part of the data — the text must not claim "nothing was sent"
    return `Części danych nie można wysłać do chmury: ${what}. NEXTREP nie uzupełnia takich danych sam (np. nie wymyśla dat), więc przerwanego przenoszenia nie można teraz dokończyć. Nic więcej nie zostało wysłane — dane w chmurze i na tym urządzeniu pozostają bez zmian.`;
  }
  return `Części danych nie można wysłać do chmury: ${what}. NEXTREP nie uzupełnia takich danych sam (np. nie wymyśla dat), więc przenoszenie nie zostało rozpoczęte. Nic nie zostało wysłane ani zmienione — dane na tym urządzeniu są nietknięte.`;
}

// --- Payload builders: local record -> exact Supabase column shape (per the confirmed schema). ---

function buildExercisePayload(ex) {
  return {
    name: ex.name || "",
    category: ex.category || [],
    equipment: ex.equipment || [],
    is_time_based: !!ex.isTimeBased,
    is_sets_only: !!ex.isSetsOnly,
    is_cardio: !!ex.isCardio,
    device_type: ex.deviceType || "",
    video_url: ex.videoUrl || "",
    notes: ex.notes || "",
  };
}
function buildPlanPayload(plan) {
  return { name: plan.name || "" };
}
function buildPlanItemPayload(item, resolvedPlanId, resolvedExerciseId) {
  // Etap 11: rest_seconds is left out when the item has no usable value (see sanitizeCloudRow)
  return sanitizeCloudRow("nextrep_plan_items", {
    plan_id: resolvedPlanId,
    exercise_id: resolvedExerciseId,
    rest_seconds: item.restSeconds,
    superset_group: item.supersetGroup || null,
  });
}
// nextrep_plan_item_sets has NO `position` column (confirmed against the real schema) — never add one.
function buildPlanItemSetPayload(set, resolvedPlanItemId) {
  return {
    plan_item_id: resolvedPlanItemId,
    target: set.target || "",
    rir: set.rir || "",
  };
}
function buildWorkoutPayload(session, resolvedPlanId) {
  // Etap 11: summaries without a usable value are left out (see sanitizeCloudRow); the date is never invented
  return sanitizeCloudRow("nextrep_workouts", {
    workout_date: session.date || null,
    plan_id: resolvedPlanId,
    plan_name: session.planName || null,
    plan_label: session.planLabel || null,
    exercises_count: session.exercisesCount,
    total_sets: session.totalSets,
    total_reps: session.totalReps,
    total_weight: session.totalWeight,
    volume: session.volume,
    duration_sec: session.durationSec,
    analysis: session.analysis && typeof session.analysis === "object" ? session.analysis : {},
  });
}
function buildWorkoutExercisePayload(ex, resolvedWorkoutId, resolvedExerciseId, position) {
  return {
    workout_id: resolvedWorkoutId,
    exercise_id: resolvedExerciseId,
    position,
    name: ex.name || "",
    exercise_type: ex.type || "", // nextrep_workout_exercises has no `type` column — `exercise_type` only
    sets_detail: Array.isArray(ex.setsDetail) ? ex.setsDetail : [],
  };
}
// nextrep_workout_sets: weight is numeric, but reps/duration/speed/incline/distance/kcal/
// resistance/pace/level/floors/heart_rate are all TEXT — kept as strings here on purpose (this
// was the suspected root cause of an earlier "Failed to fetch" investigation; confirmed against
// the real schema this time, not assumed).
function buildWorkoutSetPayload(s, resolvedWorkoutExerciseId, position) {
  const asText = (v) => (v != null && v !== "" ? String(v) : null);
  return {
    workout_exercise_id: resolvedWorkoutExerciseId,
    position,
    weight: s.weight != null && s.weight !== "" ? Number(s.weight) : null,
    reps: asText(s.reps),
    duration: asText(s.duration),
    speed: asText(s.speed),
    incline: asText(s.incline),
    distance: asText(s.distance),
    kcal: asText(s.kcal),
    resistance: asText(s.resistance),
    pace: asText(s.pace),
    level: asText(s.level),
    floors: asText(s.floors),
    heart_rate: asText(s.heartRate),
    rir: s.rir || "",
    note: s.note || "",
    set_type: s.setType || "normal",
    done: !!s.done,
  };
}
function buildMeasurementPayload(m) {
  const { id, date, ...rest } = m;
  return { measurement_date: date || null, values: rest };
}
function buildCustomFieldPayload(f) {
  return { label: f.label || "", unit: f.unit || "" };
}
function buildProfilePayload(displayName) {
  return { display_name: displayName || "" };
}

// --- Resolvers: local id -> Supabase UUID, by business key. Read-only (SELECT id[, version]). ---

async function findExistingRemoteRecord(table, userId, businessKeyCol, businessKeyVal) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging. This is the ONLY place that ever
  // issues a .select() during PUSH.
  console.log("[push diag] SUPABASE CALL: .from(table).select('id, version, device_id') — about to run", {
    table,
    operation: "select",
    userId,
    businessKeyCol,
    businessKeyVal,
  });
  // device_id was added (Step 8C.3) so the conflict check below can tell "this row is at the
  // version I just wrote myself" (safe, same device_id — an idempotent retry) apart from "this
  // row independently reached the same version number from a DIFFERENT device" (a real
  // lost-update conflict) — the id/version-only select from before couldn't distinguish these.
  const { data, error } = await supabase.from(table).select("id, version, device_id").eq("user_id", userId).eq(businessKeyCol, businessKeyVal).limit(1);
  console.log("[push diag] SUPABASE RESPONSE: select", {
    table,
    operation: "select",
    businessKeyCol,
    businessKeyVal,
    data,
    error,
  });
  if (error) {
    console.log("[push diag] findExistingRemoteRecord() RE-THROWING error (never swallowed)", error);
    throw error;
  }
  const result = data && data.length ? data[0] : null;
  console.log("[push diag] findExistingRemoteRecord() returning", result);
  return result;
}

// Resolves a LOCAL id (e.g. a local plan.id referenced from a plan_item) to its Supabase UUID via
// legacy_id — never trusts the local id as if it were already a UUID.
async function resolveSupabaseIdByLegacyId(table, userId, localId) {
  if (localId == null) return null;
  const existing = await findExistingRemoteRecord(table, userId, "legacy_id", String(localId));
  return existing ? existing.id : null;
}

// A parent not existing yet in Supabase is treated as transient/retriable (status 503 -> "server"
// in classifySyncError) rather than a hard validation failure — the parent is very likely about to
// be pushed moments later in the very same run, or on the next retry.
function missingParentError(message) {
  const err = new Error(message);
  err.status = 503;
  return err;
}

// --- The one generic upsert used by every legacy_id-keyed table. Never guesses a UUID from a  ---
// --- local id; always resolves/creates by (user_id, legacy_id) first. Detects version conflicts ---
// --- BEFORE writing anything.                                                                    ---
async function pushUpsertByLegacyId(table, ctx, legacyId, payload, item, localRecordForConflict, parentLegacyId) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[push diag] pushUpsertByLegacyId() CALLED", { table, legacyId, payload, queueItemVersion: item.version, deviceId: ctx.deviceId });
  const existing = await findExistingRemoteRecord(table, ctx.userId, "legacy_id", String(legacyId));
  console.log("[push diag] pushUpsertByLegacyId() existing remote record =", existing);
  if (existing) {
    const isStrictlyNewer = existing.version != null && item.version != null && existing.version > item.version;
    // Step 8C.3: a TIE (same version number) from a DIFFERENT device is the classic lost-update
    // conflict — two devices independently bumped from the same base to the same next version
    // number. A tie from the SAME device is just an idempotent retry of my own already-landed
    // write and must stay a normal, silent success (never flagged as a conflict).
    const isTieFromAnotherDevice = existing.version != null && item.version != null && existing.version === item.version && ctx.deviceId && existing.device_id != null && existing.device_id !== ctx.deviceId;
    if (isStrictlyNewer || isTieFromAnotherDevice) {
      console.log("[push diag] pushUpsertByLegacyId() VERSION CONFLICT detected — will throw status 409, no write attempted", {
        table, legacyId, localVersion: item.version, remoteVersion: existing.version, isStrictlyNewer, isTieFromAnotherDevice,
      });
      let remoteRecord = null;
      try {
        const { data: fullRows } = await supabase.from(table).select("*").eq("id", existing.id).limit(1);
        remoteRecord = fullRows && fullRows[0] ? fullRows[0] : null;
      } catch (e) {
        console.log("[push diag] pushUpsertByLegacyId() could not fetch full remote row for the conflict snapshot — persisting with the partial data we have", e);
      }
      createSyncConflict({
        table: table.replace(/^nextrep_/, ""),
        recordId: String(legacyId),
        reason: "update_update_conflict",
        // The actual local-shaped record (camelCase, exactly as stored in localStorage), NOT the
        // Supabase-shaped push payload — resolveConflict() (Step 8C.4) needs to write this back
        // to localStorage as-is if "local" is chosen, so it must already be in local shape.
        localRecord: localRecordForConflict !== undefined ? localRecordForConflict : payload,
        remoteRecord: remoteRecord || { id: existing.id, version: existing.version, device_id: existing.device_id },
        localVersionNumber: item.version,
        remoteVersionNumber: existing.version,
        localDeviceId: ctx.deviceId,
        remoteDeviceId: existing.device_id,
        parentLegacyId,
      });
      const err = new Error(`Konflikt wersji: lokalna v${item.version}, zdalna v${existing.version}`);
      err.status = 409;
      throw err;
    }
    // deleted_at: null is explicit and deliberate here — this is the RESTORE path: an active
    // local record (any upsert, never a delete) must clear a prior tombstone on the same row,
    // not just leave whatever deleted_at Supabase already had.
    const updatePayload = { ...payload, version: item.version, device_id: ctx.deviceId, deleted_at: null };
    console.log("[push diag] SUPABASE CALL: .from(table).update(...).eq('id', existing.id) — about to run", {
      table,
      operation: "update",
      targetId: existing.id,
      payload: updatePayload,
    });
    const { error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq("id", existing.id);
    console.log("[push diag] SUPABASE RESPONSE: update", { table, operation: "update", targetId: existing.id, payload: updatePayload, error });
    if (error) {
      console.log("[push diag] pushUpsertByLegacyId() RE-THROWING update error (never swallowed)", error);
      throw error;
    }
    console.log("[push diag] pushUpsertByLegacyId() UPDATE succeeded, returning", { id: existing.id, action: "update" });
    return { id: existing.id, action: "update" };
  }
  const newId = newUuid();
  const insertPayload = { id: newId, user_id: ctx.userId, legacy_id: String(legacyId), ...payload, version: item.version, device_id: ctx.deviceId, deleted_at: null };
  console.log("[push diag] SUPABASE CALL: .from(table).insert(...) — about to run", {
    table,
    operation: "insert",
    payload: insertPayload,
  });
  const { error } = await supabase
    .from(table)
    .insert(insertPayload);
  console.log("[push diag] SUPABASE RESPONSE: insert", { table, operation: "insert", payload: insertPayload, error });
  if (error) {
    console.log("[push diag] pushUpsertByLegacyId() RE-THROWING insert error (never swallowed)", error);
    throw error;
  }
  console.log("[push diag] pushUpsertByLegacyId() INSERT succeeded, returning", { id: newId, action: "insert" });
  return { id: newId, action: "insert" };
}

// Tombstone delete: only ever needs the queue item's own table/recordId/version — never the local
// record's content (which may already be gone locally by the time this runs). If nothing matching
// exists remotely, there is nothing to tombstone — that's a success, not an error.
async function pushDeleteOperation(item, ctx) {
  const supabaseTable = SYNC_TABLE_TO_SUPABASE[item.table];
  const businessKeyCol = item.table === "custom_fields" ? "field_key" : item.table === "profile" ? "user_id" : "legacy_id";
  const businessKeyVal = item.table === "profile" ? ctx.userId : item.recordId;
  const existing = await findExistingRemoteRecord(supabaseTable, ctx.userId, businessKeyCol, businessKeyVal);
  if (!existing) return { id: null, action: "delete-noop" };
  if (existing.version != null && item.version != null && existing.version > item.version) {
    const err = new Error(`Konflikt wersji przy usuwaniu: lokalna v${item.version}, zdalna v${existing.version}`);
    err.status = 409;
    throw err;
  }
  const { error } = await supabase
    .from(supabaseTable)
    .update({ deleted_at: new Date().toISOString(), version: item.version, device_id: ctx.deviceId })
    .eq("id", existing.id);
  if (error) throw error;
  return { id: existing.id, action: "delete" };
}

// nextrep_profiles has ONLY user_id/display_name/created_at/updated_at — confirmed against the
// real schema. No id, no legacy_id, no deleted_at, no version, no device_id. So this deliberately
// does NOT call the generic findExistingRemoteRecord()/pushUpsertByLegacyId() helpers (which
// select "id, version" and always send version/device_id) — those columns simply don't exist
// here. Existence and the update target are both resolved by user_id alone, and there is no
// version-based conflict check to perform: the table has nothing to compare versions against.
async function pushProfile(ctx, item) {
  const payload = buildProfilePayload(ctx.localSnapshot.userName);
  const { data, error: selectError } = await supabase.from("nextrep_profiles").select("user_id").eq("user_id", ctx.userId).limit(1);
  if (selectError) throw selectError;
  const existing = data && data.length ? data[0] : null;
  if (existing) {
    const { error } = await supabase.from("nextrep_profiles").update(payload).eq("user_id", ctx.userId);
    if (error) throw error;
    return { id: ctx.userId, action: "update" };
  }
  const { error } = await supabase.from("nextrep_profiles").insert({ user_id: ctx.userId, ...payload });
  if (error) throw error;
  return { id: ctx.userId, action: "insert" };
}

async function pushCustomField(ctx, localField, item) {
  const existing = await findExistingRemoteRecord("nextrep_custom_fields", ctx.userId, "field_key", item.recordId);
  const payload = buildCustomFieldPayload(localField);
  if (existing) {
    const isStrictlyNewer = existing.version != null && item.version != null && existing.version > item.version;
    const isTieFromAnotherDevice = existing.version != null && item.version != null && existing.version === item.version && ctx.deviceId && existing.device_id != null && existing.device_id !== ctx.deviceId;
    if (isStrictlyNewer || isTieFromAnotherDevice) {
      let remoteRecord = null;
      try {
        const { data: fullRows } = await supabase.from("nextrep_custom_fields").select("*").eq("id", existing.id).limit(1);
        remoteRecord = fullRows && fullRows[0] ? fullRows[0] : null;
      } catch (e) { /* best effort — persist with what we have */ }
      createSyncConflict({
        table: "custom_fields",
        recordId: String(item.recordId),
        reason: "update_update_conflict",
        localRecord: localField,
        remoteRecord: remoteRecord || { id: existing.id, version: existing.version, device_id: existing.device_id },
        localVersionNumber: item.version,
        remoteVersionNumber: existing.version,
        localDeviceId: ctx.deviceId,
        remoteDeviceId: existing.device_id,
      });
      const err = new Error(`Konflikt wersji pola własnego: lokalna v${item.version}, zdalna v${existing.version}`);
      err.status = 409;
      throw err;
    }
    // deleted_at: null — same restore-clears-tombstone semantics as pushUpsertByLegacyId(); an
    // active field pushed via the normal upsert path must never leave a prior tombstone in place.
    const { error } = await supabase.from("nextrep_custom_fields").update({ ...payload, version: item.version, device_id: ctx.deviceId, deleted_at: null }).eq("id", existing.id);
    if (error) throw error;
    return { id: existing.id, action: "update" };
  }
  const newId = newUuid();
  const { error } = await supabase
    .from("nextrep_custom_fields")
    .insert({ id: newId, user_id: ctx.userId, field_key: item.recordId, ...payload, version: item.version, device_id: ctx.deviceId, deleted_at: null });
  if (error) throw error;
  return { id: newId, action: "insert" };
}

async function pushPlanItem(ctx, localItem, item) {
  const resolvedPlanId = await resolveSupabaseIdByLegacyId("nextrep_plans", ctx.userId, localItem.__parentPlanId);
  if (!resolvedPlanId) throw missingParentError("Nadrzędny plan nie istnieje jeszcze w Supabase.");
  const resolvedExerciseId = localItem.exerciseId != null ? await resolveSupabaseIdByLegacyId("nextrep_exercises", ctx.userId, localItem.exerciseId) : null;
  const payload = buildPlanItemPayload(localItem, resolvedPlanId, resolvedExerciseId);
  return pushUpsertByLegacyId("nextrep_plan_items", ctx, item.recordId, payload, item, localItem, localItem.__parentPlanId);
}

async function pushPlanItemSet(ctx, localSet, item) {
  const resolvedPlanItemId = await resolveSupabaseIdByLegacyId("nextrep_plan_items", ctx.userId, localSet.__parentPlanItemId);
  if (!resolvedPlanItemId) throw missingParentError("Nadrzędny element planu nie istnieje jeszcze w Supabase.");
  const payload = buildPlanItemSetPayload(localSet, resolvedPlanItemId);
  return pushUpsertByLegacyId("nextrep_plan_item_sets", ctx, item.recordId, payload, item, localSet, localSet.__parentPlanItemId);
}

async function pushWorkout(ctx, session, item) {
  const resolvedPlanId = session.planId != null ? await resolveSupabaseIdByLegacyId("nextrep_plans", ctx.userId, session.planId) : null;
  const payload = buildWorkoutPayload(session, resolvedPlanId);
  return pushUpsertByLegacyId("nextrep_workouts", ctx, item.recordId, payload, item, session);
}

async function pushWorkoutExercise(ctx, ex, item) {
  const resolvedWorkoutId = await resolveSupabaseIdByLegacyId("nextrep_workouts", ctx.userId, ex.__parentWorkoutId);
  if (!resolvedWorkoutId) throw missingParentError("Nadrzędny trening nie istnieje jeszcze w Supabase.");
  const resolvedExerciseId = ex.exerciseId != null ? await resolveSupabaseIdByLegacyId("nextrep_exercises", ctx.userId, ex.exerciseId) : null;
  const parentSession = ctx.localSnapshot.history.find((h) => h.id === ex.__parentWorkoutId);
  const position = parentSession ? Math.max(0, (parentSession.exercises || []).findIndex((e) => e.id === item.recordId)) : 0;
  const payload = buildWorkoutExercisePayload(ex, resolvedWorkoutId, resolvedExerciseId, position);
  // legacy_id here is the STABLE session.exercises[].id added in Krok 8A.1 — never the
  // workoutId-posN scheme, which remains exclusively a migration V1 concern.
  return pushUpsertByLegacyId("nextrep_workout_exercises", ctx, item.recordId, payload, item, ex, ex.__parentWorkoutId);
}

async function pushWorkoutSet(ctx, s, item) {
  const resolvedWorkoutExerciseId = await resolveSupabaseIdByLegacyId("nextrep_workout_exercises", ctx.userId, s.__parentWorkoutExerciseId);
  if (!resolvedWorkoutExerciseId) throw missingParentError("Nadrzędne ćwiczenie treningu nie istnieje jeszcze w Supabase.");
  let position = 0;
  for (const session of ctx.localSnapshot.history) {
    const ex = (session.exercises || []).find((e) => e.id === s.__parentWorkoutExerciseId);
    if (ex) {
      position = Math.max(0, (ex.sets || []).findIndex((set) => set.id === item.recordId));
      break;
    }
  }
  const payload = buildWorkoutSetPayload(s, resolvedWorkoutExerciseId, position);
  return pushUpsertByLegacyId("nextrep_workout_sets", ctx, item.recordId, payload, item, s, s.__parentWorkoutExerciseId);
}

// The real per-item PUSH — this is the `syncFn` that runSync() passes into the EXISTING
// attemptSyncQueueItem(), so retry/backoff/status handling is 100% reused, not reimplemented.
async function pushQueueItem(item, ctx) {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[push diag] pushQueueItem() CALLED", { item, ctxUserId: ctx.userId, ctxDeviceId: ctx.deviceId });

  if (item.operation === "delete") {
    console.log("[push diag] pushQueueItem() routing to pushDeleteOperation (operation=delete)");
    const result = await pushDeleteOperation(item, ctx);
    console.log("[push diag] pushQueueItem() result (delete path)", result);
    return result;
  }

  if (item.table === "profile") {
    console.log("[push diag] pushQueueItem() routing to pushProfile (table=profile)");
    const result = await pushProfile(ctx, item);
    console.log("[push diag] pushQueueItem() result (profile path)", result);
    return result;
  }

  const localRecord = findLocalRecordForQueueItem(item, ctx.localSnapshot);
  console.log("[push diag] pushQueueItem() findLocalRecordForQueueItem() ->", localRecord);
  if (!localRecord) {
    console.log("[push diag] pushQueueItem() LOCAL RECORD MISSING — about to throw status 422 (validation, no retry)", { table: item.table, recordId: item.recordId });
    const err = new Error("Lokalny rekord nie istnieje — nie można zbudować payloadu.");
    err.status = 422; // validation-class: retrying won't help, the record is simply gone
    throw err;
  }

  console.log("[push diag] pushQueueItem() routing on table =", item.table);
  let result;
  switch (item.table) {
    case "exercises":
      console.log("[push diag] pushQueueItem() -> pushUpsertByLegacyId('nextrep_exercises', ...)");
      result = await pushUpsertByLegacyId("nextrep_exercises", ctx, item.recordId, buildExercisePayload(localRecord), item, localRecord);
      break;
    case "custom_fields":
      result = await pushCustomField(ctx, localRecord, item);
      break;
    case "measurements":
      result = await pushUpsertByLegacyId("nextrep_measurements", ctx, item.recordId, buildMeasurementPayload(localRecord), item, localRecord);
      break;
    case "plans":
      result = await pushUpsertByLegacyId("nextrep_plans", ctx, item.recordId, buildPlanPayload(localRecord), item, localRecord);
      break;
    case "plan_items":
      result = await pushPlanItem(ctx, localRecord, item);
      break;
    case "plan_item_sets":
      result = await pushPlanItemSet(ctx, localRecord, item);
      break;
    case "workouts":
      result = await pushWorkout(ctx, localRecord, item);
      break;
    case "workout_exercises":
      result = await pushWorkoutExercise(ctx, localRecord, item);
      break;
    case "workout_sets":
      result = await pushWorkoutSet(ctx, localRecord, item);
      break;
    default: {
      console.log("[push diag] pushQueueItem() UNKNOWN TABLE — about to throw status 422", item.table);
      const err = new Error(`Nieznana tabela kolejki: ${item.table}`);
      err.status = 422;
      throw err;
    }
  }
  console.log("[push diag] pushQueueItem() FINAL RESULT for item", { itemId: item.id, table: item.table, recordId: item.recordId, result });
  return result;
}

// runSync(): the real PUSH entry point (Krok 8B.1). Scope is push-only — it never reads back
// training data from Supabase (only id/version, purely to resolve foreign keys and detect version
// conflicts), never merges, never resolves conflicts, and never runs automatically beyond what
// scheduleSync()/the online-event effect already trigger.
// ===== Etap 2.1 — one runSync() at a time (runtime lock, NOT localStorage) =====
// runSync() can be triggered from several places at once (scheduleSync timer, online event,
// login, manual "Synchronizuj teraz", conflict resolution). Overlapping runs could push the same
// queue item twice (and, with no UNIQUE(legacy_id) in Supabase, insert it twice). The lock lives
// in this module's memory for the lifetime of the app instance; a second caller while a run is
// active gets { started:false, skipped:true, reason:"busy" } — no PUSH, no PULL, no queue change.
// try/finally releases it on every path: early returns (no supabase / no session / offline),
// PUSH or PULL errors, conflicts and unexpected exceptions.
let _syncRunInProgress = false;
function isSyncRunInProgress() {
  return _syncRunInProgress;
}
async function runSync() {
  if (_syncRunInProgress) {
    return { started: false, skipped: true, reason: "busy", pushed: 0, failed: 0, conflicts: 0, message: "Synchronizacja już trwa — spróbuj ponownie za chwilę." };
  }
  _syncRunInProgress = true;
  try {
    return await runSyncUnlocked();
  } finally {
    _syncRunInProgress = false;
  }
}

// The unchanged sync pass — only ever called through runSync() above.
async function runSyncUnlocked() {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[push diag] ===== runSync() START =====", {
    supabaseConfigured: !!supabase,
    supabaseIsNull: supabase === null,
  });

  if (!supabase) {
    console.log("[push diag] runSync() EXIT: supabase is not configured — this is the stub path, nothing runs");
    return { started: false, pushed: 0, failed: 0, conflicts: 0, message: "Sync Engine nie jest jeszcze aktywny." };
  }

  let user;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    user = data?.session?.user;
  } catch (e) {
    console.log("[push diag] runSync() auth check THREW", e);
    return { started: false, pushed: 0, failed: 0, conflicts: 0, message: "Nie udało się sprawdzić sesji logowania." };
  }
  console.log("[push diag] AFTER AUTH CHECK", { userId: user?.id ?? null, userEmail: user?.email ?? null });
  if (!user) {
    console.log("[push diag] runSync() EXIT: no logged-in user");
    return { started: false, pushed: 0, failed: 0, conflicts: 0, message: "Musisz być zalogowany, aby synchronizować dane." };
  }
  // Stage 4A.1: local data of THIS account must be the active namespace — otherwise (start-up,
  // or an account switch still loading) sync would read/write another person's local space.
  if (!isActiveNamespaceFor(user.id)) {
    return { started: false, skipped: true, reason: "namespace_switching", pushed: 0, failed: 0, conflicts: 0, message: "Trwa wczytywanie danych konta — synchronizacja za chwilę." };
  }
  const syncNamespaceAtStart = getActiveDataNamespace();
  // Stage 4A.2: no sync before this account chose its data source, nor while that choice paused it.
  if (!isAccountSyncAllowed(user.id)) {
    const m = getAccountInitMarker(user.id);
    return { started: false, skipped: true, reason: m ? "account_sync_paused" : "account_not_initialized", pushed: 0, failed: 0, conflicts: 0,
      message: m ? "Synchronizacja tego konta jest wstrzymana (wybrano dane z urządzenia lub puste dane)." : "Najpierw wybierz źródło danych konta." };
  }

  const isOnlineNow = !(typeof navigator !== "undefined" && navigator.onLine === false);
  console.log("[push diag] AFTER ONLINE CHECK", { isOnlineNow, rawNavigatorOnLine: typeof navigator !== "undefined" ? navigator.onLine : "navigator undefined" });
  if (!isOnlineNow) {
    console.log("[push diag] runSync() EXIT: offline");
    return { started: false, pushed: 0, failed: 0, conflicts: 0, message: "Brak połączenia z internetem — zmiany pozostają zapisane lokalnie." };
  }

  // Stage 4A.4 F-5 (Etap 6): the SERVER migration lock decides before any PUSH / PULL. While an attempt of
  // this account is uploading or abandoned nothing is sent or applied; an unreadable status (network,
  // missing table, any error) stops the sync too (fail closed). The queue is kept as it is.
  const gate = await readMigrationGate(user.id);
  if (!gate.ok || gate.blocking) {
    const abandoned = gate.ok && gate.blocking.status === "abandoned";
    return {
      started: false, skipped: true, reason: !gate.ok ? "migration_check_failed" : abandoned ? "migration_abandoned" : "migration_in_progress", gate,
      pushed: 0, failed: 0, conflicts: 0,
      message: !gate.ok ? MIGRATION_TEXTS.checkFailed : abandoned ? MIGRATION_TEXTS.abandoned : gate.own ? MIGRATION_TEXTS.inProgressHere : MIGRATION_TEXTS.inProgressOther,
    };
  }
  if (!isActiveNamespaceFor(user.id) || !isAccountSyncAllowed(user.id)) {
    return { started: false, skipped: true, reason: "namespace_switching", pushed: 0, failed: 0, conflicts: 0, message: "Trwa wczytywanie danych konta — synchronizacja za chwilę." };
  }

  // FIX 1: fill missing sync_meta baselines for pre-existing local records BEFORE PUSH/PULL, so a
  // device's first PULL doesn't report false potential_conflicts. Never blocks the sync: any
  // failure simply leaves meta as it was (the next online sync tries again).
  let bootstrapResult = null;
  try {
    bootstrapResult = await bootstrapSyncMetaForExistingData();
  } catch (e) {
    bootstrapResult = { success: false, skipped: "exception" };
  }

  const queue = loadSyncQueue();
  const workQueue = queue.filter((it) => it.status === "pending" || it.status === "failed");
  console.log("[push diag] AFTER loadSyncQueue()", { fullQueueLength: queue.length, fullQueue: queue, workQueueLength: workQueue.length, workQueue });

  let pushed = 0;
  let failed = 0;
  let conflicts = 0;
  let pausedByMigration = false; // Stage 4A.4 F-5: a lock appeared during this pass (NR001)

  // Step 8C.8: an empty queue means "nothing to PUSH", not "skip the whole sync" — PULL/APPLY
  // below must still run so a device with no local changes can pick up remote ones (e.g. Device
  // B picking up something Device A pushed). PUSH itself is entirely skipped (pushed/failed/
  // conflicts stay 0) rather than attempting a pointless empty loop.
  if (workQueue.length === 0) {
    console.log("[push diag] workQueue is empty — SKIPPING the PUSH phase only, continuing to PULL/APPLY");
  } else {
    const deviceId = getOrCreateDeviceId();
    console.log("[push diag] BEFORE migrateDeviceV1()", { deviceId, userId: user.id });
    if (deviceId) {
      try {
        const deviceResult = await migrateDeviceV1(user.id, deviceId);
        console.log("[push diag] AFTER migrateDeviceV1() — succeeded, returned", deviceResult);
      } catch (e) {
        console.log("[push diag] AFTER migrateDeviceV1() — THREW (non-blocking, logged and continuing)", e);
        console.error("runSync: nie udało się zapewnić istnienia urządzenia w nextrep_devices", e);
        // Not fatal on its own — individual pushes will surface a clear FK-style error if this
        // actually matters, and those get retried through the existing mechanism regardless.
      }
    } else {
      console.log("[push diag] migrateDeviceV1() SKIPPED — deviceId is falsy");
    }

    const sorted = sortQueueByDependencyOrder(workQueue);
    const localSnapshot = await loadLocalSnapshotForSync();
    const ctx = { userId: user.id, deviceId, localSnapshot };
    console.log("[push diag] sorted queue order for this run", sorted.map((it) => `${it.table}/${it.recordId}`));

    for (const item of sorted) {
      console.log("[push diag] ----- BEFORE pushQueueItem(item) via attemptSyncQueueItem -----", item);
      const queueBeforeThisItem = loadSyncQueue().find((it) => it.id === item.id);
      console.log("[push diag] queue entry status just before this attempt:", queueBeforeThisItem);
      // Etap 2.1 re-check: the snapshot was taken at the start of this pass. Skip the item if, by
      // now, it was removed (pushed by a retry / another path) or its status no longer allows an
      // attempt (e.g. "processing" by a retry, or "conflict"). Read-only — the
      // pending→processing transition stays inside attemptSyncQueueItem().
      if (!queueBeforeThisItem || (queueBeforeThisItem.status !== "pending" && queueBeforeThisItem.status !== "failed")) {
        continue;
      }
      const result = await attemptSyncQueueItem(item, (queuedItem) => pushQueueItem(queuedItem, ctx));
      console.log("[push diag] ----- RESULT of pushQueueItem() for this item -----", result);
      const queueAfterThisItem = loadSyncQueue().find((it) => it.id === item.id);
      console.log("[push diag] queue entry AFTER this attempt (undefined = removed from queue):", queueAfterThisItem);
      console.log("[push diag] REMOVAL DECISION: item was", queueAfterThisItem === undefined ? "REMOVED (attemptSyncQueueItem treated pushQueueItem as success, i.e. it resolved without throwing)" : `KEPT with status="${queueAfterThisItem.status}"`);
      if (result.ok) {
        pushed++;
        // Step 8C.6: finalize a matching resolved-but-not-yet-confirmed conflict — ONLY here,
        // where attemptSyncQueueItem has already confirmed the actual Supabase write succeeded
        // (result.ok), never merely because the queue item disappeared or resolveConflict() ran.
        finalizeResolvedConflictForQueueItem(item);
      }
      else if (result.kind === "conflict") conflicts++;
      else failed++;
      if (result.kind === "migration_paused") {
        // the account got locked meanwhile: no further item is sent now (they all stay queued)
        pausedByMigration = true;
        break;
      }
    }
    console.log("[push diag] ===== PUSH phase END ===== queue state:", loadSyncQueue());
  }

  // Step 8C.8: PULL + APPLY — runs every time we get this far (online, logged in), regardless of
  // whether PUSH had anything to do. Neither pullRemoteChanges() nor applyRemoteChanges() is
  // modified here; runSync() only calls them and folds their results into its own return value.
  // Every existing protection (existing_conflict short-circuit in PULL, hasPendingLocalChange
  // guard in APPLY's decide()) is exactly what already guards a record that just conflicted (or
  // is still pending/failed) during the PUSH phase above — nothing new is added here.
  let pullSuccess = false;
  let pullApplied = 0;
  let pullSkipped = 0;
  let pullConflicts = 0;
  let pullError = null;
  console.log("[push diag] ===== PULL phase START =====");
  let pullResult;
  if (pausedByMigration) {
    pullResult = { success: false, error: MIGRATION_TEXTS.locked }; // the read guard would refuse it anyway
  } else {
    try {
      pullResult = await pullRemoteChanges();
    } catch (e) {
      console.log("[push diag] pullRemoteChanges() THREW unexpectedly", e);
      pullResult = { success: false, error: e && e.message ? e.message : String(e) };
    }
  }
  console.log("[push diag] pullRemoteChanges() result", pullResult);
  // Stage 4A.1: never apply pulled rows into local storage if the account (session) or the
  // active local namespace changed while this run was in flight.
  if (pullResult && pullResult.success && (getActiveDataNamespace() !== syncNamespaceAtStart || (await currentSessionUserId()) !== user.id)) {
    pullResult = { success: false, error: "Zmieniono konto w trakcie synchronizacji — pobrane zmiany zostały pominięte." };
  }
  // Stage 4A.4 F-5 (Etap 6): the status is checked AGAIN right before anything pulled is applied — a migration
  // that started meanwhile (or an unreadable status) drops the pulled data; nothing partial is applied.
  if (pullResult && pullResult.success) {
    const gateBeforeApply = await readMigrationGate(user.id);
    if (!gateBeforeApply.ok || gateBeforeApply.blocking) {
      pullResult = { success: false, error: gateBeforeApply.ok ? MIGRATION_TEXTS.locked : MIGRATION_TEXTS.checkFailed };
    } else if (gateBeforeApply.stamp !== gate.stamp) {
      // an attempt started and ended while this pass was reading: the pulled tables may mix the state before
      // and after it — nothing is applied now, the next pass reads it again
      pullResult = { success: false, error: "Dane konta zmieniły się w trakcie pobierania — zmiany zostaną pobrane przy następnej synchronizacji." };
    } else if (getActiveDataNamespace() !== syncNamespaceAtStart || (await currentSessionUserId()) !== user.id) {
      pullResult = { success: false, error: "Zmieniono konto w trakcie synchronizacji — pobrane zmiany zostały pominięte." };
    }
  }
  if (pullResult && pullResult.success) {
    pullSuccess = true;
    console.log("[push diag] ===== APPLY phase START =====");
    const applyResult = await applyRemoteChanges(pullResult);
    console.log("[push diag] applyRemoteChanges() result", applyResult);
    if (applyResult && applyResult.success) {
      pullApplied = Object.values(applyResult.applied || {}).reduce((a, b) => a + b, 0);
      pullSkipped = Object.values(applyResult.skipped || {}).reduce((a, b) => a + b, 0);
      pullConflicts = (applyResult.conflicts || []).length;
    } else {
      pullError = (applyResult && applyResult.error) || "Nie udało się zastosować zmian z chmury.";
    }
  } else {
    pullError = (pullResult && pullResult.error) || "Nie udało się pobrać zmian z chmury.";
  }
  console.log("[push diag] ===== runSync() END ===== final queue state:", loadSyncQueue(), { pushed, failed, conflicts, pullSuccess, pullApplied, pullSkipped, pullConflicts, pullError });

  const parts = [];
  if (pushed) parts.push(`wysłano ${pushed}`);
  if (failed) parts.push(`nieudane ${failed}`);
  if (conflicts) parts.push(`konflikty ${conflicts}`);
  if (pullSuccess) {
    if (pullApplied) parts.push(`pobrano ${pullApplied}`);
    if (pullConflicts) parts.push(`nowe konflikty ${pullConflicts}`);
  } else {
    parts.push(`błąd pobierania zmian`);
  }
  return {
    started: true,
    pushed,
    failed,
    conflicts,
    pullSuccess,
    pullApplied,
    pullSkipped,
    pullConflicts,
    pullError,
    bootstrap: bootstrapResult, // FIX 1 diagnostics only (message text unchanged)
    ...(pausedByMigration ? { reason: "migration_in_progress" } : {}),
    message: pausedByMigration ? MIGRATION_TEXTS.locked : parts.length ? `Synchronizacja: ${parts.join(", ")}.` : "Synchronizacja zakończona.",
  };
}

// --- UI status derivation (point 7) — pure function, no side effects. ---
function computeSyncStatus({ authUser, isOnline, queue, paused = null }) {
  if (!authUser) return { kind: "loggedOut" };
  // Stage 4A.4 F-5 (Etap 8, M3): a paused sync is never reported as up to date
  if (paused) return { kind: "paused", reason: paused, pendingCount: queue.filter((it) => SYNC_ACTIVE_STATUSES.has(it.status)).length };
  if (!isOnline) {
    const pendingCount = queue.filter((it) => SYNC_ACTIVE_STATUSES.has(it.status)).length;
    return { kind: "offline", pendingCount };
  }
  const conflictCount = queue.filter((it) => it.status === "conflict").length;
  if (conflictCount > 0) return { kind: "conflicts", count: conflictCount };

  const processingCount = queue.filter((it) => it.status === "processing").length;
  if (processingCount > 0) return { kind: "syncing" };

  const failedCount = queue.filter((it) => it.status === "failed").length;
  if (failedCount > 0) return { kind: "willRetry", count: failedCount };

  const pendingCount = queue.filter((it) => it.status === "pending").length;
  if (pendingCount > 0) return { kind: "pending", count: pendingCount };

  return { kind: "upToDate" };
}

/* ---------------------------------------------------------------------- */
/* Krok 8A — wiring the sync queue to the real CRUD gate functions.        */
/*                                                                           */
/* Still no real push/pull: this only detects what changed inside each     */
/* gate function's own prev->next transition and records it in the queue.  */
/* ---------------------------------------------------------------------- */

// getStorageKey("sync_meta"): scoped per namespace (Stage 4A.1) — see getStorageKey("sync_meta")

// Per-record version/updatedAt/deviceId, kept entirely separate from the training data itself —
// trainapp_exercises_v1 etc. are never touched to store this. Resilient to corrupted JSON, same
// pattern as loadSyncQueue.
function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(getStorageKey("sync_meta"));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error("nextrep_sync_meta_v1: zawartość nie jest obiektem — resetuję", parsed);
      return {};
    }
    return parsed;
  } catch (e) {
    console.error("nextrep_sync_meta_v1: uszkodzony JSON — resetuję", e);
    return {};
  }
}

