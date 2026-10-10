function saveSyncMeta(meta) {
  try {
    localStorage.setItem(getStorageKey("sync_meta"), JSON.stringify(meta && typeof meta === "object" ? meta : {}));
  } catch (e) {
    console.error("nextrep_sync_meta_v1: zapis nie powiódł się", e);
  }
}

// Per-record version — never a single global app version. Returns the new version number.
function bumpRecordVersion(table, recordId) {
  const meta = loadSyncMeta();
  const key = `${table}:${recordId}`;
  const prevVersion = (meta[key] && meta[key].version) || 0;
  const nextVersion = prevVersion + 1;
  meta[key] = { version: nextVersion, updatedAt: new Date().toISOString(), deviceId: getOrCreateDeviceId() };
  saveSyncMeta(meta);
  return nextVersion;
}

// =====================================================================================
// Step 8C.3 — Conflict storage (nextrep_sync_conflicts_v1)
//
// A conflict means the SAME logical record was changed independently on both sides — never
// resolved automatically here (no "newer wins", no "remote wins", no "local wins"). This is a
// separate mechanism from nextrep_sync_queue_v1: the queue means "I have a local change that
// still needs to be pushed"; a conflict means "local and remote diverged on the same record and a
// human decision is needed" (that decision itself — resolveConflict(), any UI — is a later step).
// =====================================================================================

// getStorageKey("sync_conflicts"): scoped per namespace (Stage 4A.1) — see getStorageKey("sync_conflicts")

function loadSyncConflicts() {
  try {
    const raw = localStorage.getItem(getStorageKey("sync_conflicts"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error("nextrep_sync_conflicts_v1: zawartość nie jest tablicą — resetuję", parsed);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error("nextrep_sync_conflicts_v1: uszkodzony JSON — resetuję", e);
    return [];
  }
}

function saveSyncConflicts(conflicts) {
  try {
    localStorage.setItem(getStorageKey("sync_conflicts"), JSON.stringify(Array.isArray(conflicts) ? conflicts : []));
  } catch (e) {
    console.error("nextrep_sync_conflicts_v1: zapis nie powiódł się", e);
  }
}

// =====================================================================================
// FIX 1 — bootstrapSyncMetaForExistingData()
//
// Records that already existed locally before sync (default atlas, V1-migrated data) have no
// entry in nextrep_sync_meta_v1, so classifyRemoteRecord() — correctly and conservatively — calls
// every such record "potential_conflict". This fills ONLY the missing baselines, once, using the
// record's real remote state, and never touches anything else:
//   • only when logged in and online (otherwise it returns without doing anything);
//   • never for a record with a queue entry in pending/processing/failed/conflict, or with a
//     pending sync conflict (a real local change must keep its own context);
//   • never for a remote tombstone (deleted_at) — a delete is never turned into a plain record;
//   • never for a local record that has no remote counterpart (it is NOT marked as synced);
//   • never overwrites an existing meta entry (idempotent), never enqueues, never bumps a
//     version, never writes training data, never calls update*/queue/push/pull/apply;
//   • profile is left exactly as before (no version model on nextrep_profiles).
// Baseline choice (same {version, updatedAt, deviceId} format bumpRecordVersion() writes):
//   • local content == remote content  → { version: remote.version, updatedAt: remote.updated_at,
//     deviceId: remote.device_id } — the device is genuinely in sync with that remote version;
//   • local content != remote content (and nothing local is pending — every local edit always
//     goes through the queue) → the remote side moved on after this device's copy, so the baseline
//     is one below remote.version (unknown updatedAt/deviceId). PULL then classifies the record as
//     remote_newer and applyRemoteChanges() applies it and records the real remote meta.
//     Taking remote.version here instead would make PULL call it remote_same and silently keep
//     the stale local copy — exactly the lost update of the E2E "Test 3".
// Content is compared through the existing PUSH payload builders (build*Payload), relations by
// legacy_id — no new mapping, no new data shape. Anything that can't be compared counts as
// "different", which only means the remote copy gets applied to a record with no pending change.
// =====================================================================================
// Computed on call (PULL_TABLE_ORDER is declared further down in this file).
const syncMetaBootstrapTables = () => PULL_TABLE_ORDER.filter((t) => t !== "profiles");

function syncCanonical(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?)?$/.test(v)) {
    const t = Date.parse(v.replace(" ", "T"));
    if (!Number.isNaN(t)) return `@date:${t}`;
  }
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  if (Array.isArray(v)) return v.map(syncCanonical);
  if (typeof v === "object") {
    const out = {};
    Object.keys(v)
      .sort()
      .forEach((k) => {
        const c = syncCanonical(v[k]);
        if (c !== null) out[k] = c;
      });
    return out;
  }
  return v;
}
function syncPayloadMatches(payload, remote, skipKeys) {
  return Object.keys(payload)
    .filter((k) => !skipKeys.includes(k))
    .every((k) => JSON.stringify(syncCanonical(payload[k])) === JSON.stringify(syncCanonical(remote[k])));
}
// remote FK uuid → the referenced row's legacy_id (null when the FK is empty or unresolvable)
function syncRemoteLegacyRef(remoteByTable, table, uuid) {
  if (uuid == null) return null;
  const row = (remoteByTable[table] || []).find((r) => r.id === uuid);
  return row ? row.legacy_id : undefined;
}
function syncRefMatches(remoteByTable, table, remoteUuid, localRef) {
  const expected = syncRemoteLegacyRef(remoteByTable, table, remoteUuid);
  if (expected === undefined) return false;
  if (expected === null) return localRef == null || !(remoteByTable[table] || []).some((r) => r.legacy_id === String(localRef));
  return String(localRef) === String(expected);
}
function localRecordMatchesRemote(pullTable, local, remote, localSnapshot, remoteByTable) {
  switch (pullTable) {
    case "exercises":
      return syncPayloadMatches(buildExercisePayload(local), remote, []);
    case "custom_fields":
      return syncPayloadMatches(buildCustomFieldPayload(local), remote, []);
    case "measurements":
      return syncPayloadMatches(buildMeasurementPayload(local), remote, []);
    case "plans":
      return syncPayloadMatches(buildPlanPayload(local), remote, []);
    case "plan_items":
      return syncPayloadMatches(buildPlanItemPayload(local, null, null), remote, ["plan_id", "exercise_id"]) && syncRefMatches(remoteByTable, "exercises", remote.exercise_id, local.exerciseId);
    case "plan_item_sets":
      return syncPayloadMatches(buildPlanItemSetPayload(local, null), remote, ["plan_item_id"]);
    case "workouts":
      return syncPayloadMatches(buildWorkoutPayload(local, null), remote, ["plan_id"]) && syncRefMatches(remoteByTable, "plans", remote.plan_id, local.planId);
    case "workout_exercises": {
      const parent = localSnapshot.history.find((h) => (h.exercises || []).includes(local));
      const position = parent ? parent.exercises.indexOf(local) : null;
      return syncPayloadMatches(buildWorkoutExercisePayload(local, null, null, position), remote, ["workout_id", "exercise_id"]) && syncRefMatches(remoteByTable, "exercises", remote.exercise_id, local.exerciseId);
    }
    case "workout_sets": {
      let position = null;
      for (const h of localSnapshot.history) for (const ex of h.exercises || []) if ((ex.sets || []).includes(local)) position = ex.sets.indexOf(local);
      return syncPayloadMatches(buildWorkoutSetPayload(local, null, position), remote, ["workout_exercise_id"]);
    }
    default:
      return false;
  }
}
// Every local record id that sync tracks, as "table:recordId" (same keys as nextrep_sync_meta_v1).
function collectLocalSyncKeys(localSnapshot) {
  const keys = [];
  (localSnapshot.exercises || []).forEach((e) => e && e.id != null && keys.push(`exercises:${e.id}`));
  (localSnapshot.customFields || []).forEach((f) => f && f.key != null && keys.push(`custom_fields:${f.key}`));
  (localSnapshot.measurements || []).forEach((m) => m && m.id != null && keys.push(`measurements:${m.id}`));
  (localSnapshot.plans || []).forEach((p) => {
    if (!p || p.id == null) return;
    keys.push(`plans:${p.id}`);
    (p.exercises || []).forEach((it) => {
      if (it && it.id != null) keys.push(`plan_items:${it.id}`);
      ((it && it.setsDetail) || []).forEach((s) => s && s.id != null && keys.push(`plan_item_sets:${s.id}`));
    });
  });
  (localSnapshot.history || []).forEach((h) => {
    if (!h || h.id == null) return;
    keys.push(`workouts:${h.id}`);
    (h.exercises || []).forEach((ex) => {
      if (ex && ex.id != null) keys.push(`workout_exercises:${ex.id}`);
      ((ex && ex.sets) || []).forEach((s) => s && s.id != null && keys.push(`workout_sets:${s.id}`));
    });
  });
  return keys;
}

// Stage 4A.3: counted so source selection can wait until no bootstrap is still writing sync_meta
// (it also runs outside runSync's lock — see waitForSyncIdle).
let _syncBootstrapRuns = 0;
function isSyncBootstrapInProgress() {
  return _syncBootstrapRuns > 0;
}
async function bootstrapSyncMetaForExistingData() {
  _syncBootstrapRuns++;
  try {
    return await bootstrapSyncMetaForExistingDataUnlocked();
  } finally {
    _syncBootstrapRuns--;
  }
}
async function bootstrapSyncMetaForExistingDataUnlocked() {
  const result = { success: true, skipped: null, created: 0, createdInSync: 0, createdRemoteNewer: 0, skippedExistingMeta: 0, skippedPendingLocal: 0, skippedRemoteDeleted: 0, localOnly: 0 };
  if (!supabase) return { ...result, skipped: "no_supabase" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ...result, skipped: "offline" };
  let user = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    user = data && data.session ? data.session.user : null;
  } catch (e) {
    return { ...result, success: false, skipped: "session_error" };
  }
  if (!user) return { ...result, skipped: "no_user" };
  if (!isActiveNamespaceFor(user.id)) return { ...result, skipped: "namespace_switching" }; // Stage 4A.1
  if (!isAccountSyncAllowed(user.id)) return { ...result, skipped: "account_not_ready" }; // Stage 4A.2
  const bootstrapNamespace = getActiveDataNamespace();

  const localSnapshot = await loadLocalSnapshotForSync();
  const metaAtStart = loadSyncMeta();
  const missing = collectLocalSyncKeys(localSnapshot).filter((k) => !metaAtStart[k]);
  if (missing.length === 0) return { ...result, skipped: "nothing_missing" }; // no network call at all
  // Stage 4A.4 F-5 (Etap 6): no remote read while a migration attempt locks the account (fail closed)
  const gate = await readMigrationGate(user.id);
  if (!gate.ok || gate.blocking) return { ...result, success: gate.ok, skipped: gate.ok ? "migration_locked" : "migration_check_failed" };
  if (getActiveDataNamespace() !== bootstrapNamespace) return { ...result, success: false, skipped: "context_changed" };

  const remoteByTable = {};
  try {
    for (const t of syncMetaBootstrapTables()) remoteByTable[t] = await fetchRemoteTable(t, user.id);
  } catch (e) {
    return { ...result, success: false, skipped: "fetch_error" }; // nothing written
  }

  const isLocallyBusy = (queue, table, recordId) =>
    queue.some((q) => q.table === table && q.recordId === recordId && SYNC_ACTIVE_STATUSES.has(q.status)) || !!findPendingSyncConflict(table, recordId);

  const queue = loadSyncQueue();
  const proposals = {};
  const matchedKeys = new Set();
  for (const table of syncMetaBootstrapTables()) {
    for (const remote of remoteByTable[table] || []) {
      const legacyId = table === "custom_fields" ? remote.field_key : remote.legacy_id;
      if (legacyId == null) continue;
      const key = `${table}:${legacyId}`;
      matchedKeys.add(key);
      if (metaAtStart[key]) { result.skippedExistingMeta++; continue; }
      if (isLocallyBusy(queue, table, legacyId)) { result.skippedPendingLocal++; continue; }
      if (remote.deleted_at) { result.skippedRemoteDeleted++; continue; }
      if (remote.version == null) continue;
      const local = findLocalRecordForRemote(table, remote, localSnapshot, remoteByTable);
      if (!local) continue; // remote-only record: PULL's remote_new handles it
      let same = false;
      try {
        same = localRecordMatchesRemote(table, local, remote, localSnapshot, remoteByTable);
      } catch (e) {
        same = false;
      }
      proposals[key] = same
        ? { version: remote.version, updatedAt: remote.updated_at != null ? remote.updated_at : null, deviceId: remote.device_id != null ? remote.device_id : null }
        : { version: Math.max(0, Number(remote.version) - 1), updatedAt: null, deviceId: null };
      if (same) result.createdInSync++;
      else result.createdRemoteNewer++;
    }
  }
  result.localOnly = missing.filter((k) => !matchedKeys.has(k)).length; // not in Supabase → stays un-synced

  // Stage 4A.1: drop everything if the account / namespace changed while fetching.
  if (getActiveDataNamespace() !== bootstrapNamespace || (await currentSessionUserId()) !== user.id) return { ...result, success: false, skipped: "context_changed" };
  // Write: re-read meta AND queue right now, so an edit made while we were fetching wins.
  const meta = loadSyncMeta();
  const queueNow = loadSyncQueue();
  let written = 0;
  for (const key of Object.keys(proposals)) {
    const sep = key.indexOf(":");
    const table = key.slice(0, sep);
    const recordId = key.slice(sep + 1);
    if (meta[key] || isLocallyBusy(queueNow, table, recordId)) continue;
    meta[key] = proposals[key];
    written++;
  }
  if (written > 0) saveSyncMeta(meta);
  result.created = written;
  return result;
}

// A conflict is identified by table+recordId, never by its own id — there is only ever one
// ACTIVE (status="pending") conflict per record. Repeated detection of the same conflict must
// never create a second entry (Step 8C.3, section 6).
function findPendingSyncConflict(table, recordId) {
  return loadSyncConflicts().find((c) => c.table === table && c.recordId === recordId && c.status === "pending") || null;
}

function deepCloneForConflict(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (e) {
      // fall through to the JSON fallback below (e.g. a value structuredClone can't handle)
    }
  }
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

// Idempotent: if a pending conflict already exists for this exact table+recordId, it is returned
// UNCHANGED — its original snapshots are never overwritten by a later detection of "the same"
// conflict (Step 8C.3, section 7: don't lose the original conflict; generational conflict history
// is explicitly out of scope for this step).
function createSyncConflict({ table, recordId, reason, localRecord, remoteRecord, localVersionNumber, remoteVersionNumber, localDeviceId, remoteDeviceId, parentLegacyId, relatedExerciseLegacyId, relatedPlanLegacyId }) {
  const conflicts = loadSyncConflicts();
  const existing = conflicts.find((c) => c.table === table && c.recordId === recordId && c.status === "pending");
  if (existing) return existing;
  const conflict = {
    id: uid(),
    table,
    recordId,
    reason: reason || "update_update_conflict",
    localVersionNumber: localVersionNumber != null ? localVersionNumber : null,
    remoteVersionNumber: remoteVersionNumber != null ? remoteVersionNumber : null,
    localDeviceId: localDeviceId || null,
    remoteDeviceId: remoteDeviceId || null,
    localRecord: deepCloneForConflict(localRecord),
    remoteRecord: deepCloneForConflict(remoteRecord),
    // For nested tables (plan_items, plan_item_sets, workout_exercises, workout_sets) — the
    // LOCAL legacy_id of the direct parent, captured now because Step 8C.4's resolveConflict()
    // must never re-fetch Supabase, so this is the only place this mapping is ever available.
    parentLegacyId: parentLegacyId != null ? parentLegacyId : null,
    // Step 8C.7 — same reasoning, for the SIBLING reference fields (not a parent-container
    // relationship): plan_items.exercise_id / workout_exercises.exercise_id resolved to
    // relatedExerciseLegacyId, workouts.plan_id resolved to relatedPlanLegacyId. Captured only
    // where remoteByTable is already available at conflict-creation time (see
    // applyRemoteChanges()) — never re-fetched later. null when no mapping was found.
    relatedExerciseLegacyId: relatedExerciseLegacyId != null ? relatedExerciseLegacyId : null,
    relatedPlanLegacyId: relatedPlanLegacyId != null ? relatedPlanLegacyId : null,
    detectedAt: new Date().toISOString(),
    status: "pending",
  };
  conflicts.push(conflict);
  saveSyncConflicts(conflicts);
  return conflict;
}

// =====================================================================================
// Step 8C.6 — finalizing a conflict after a CONFIRMED PUSH success
//
// resolveConflict() only ever produces status "resolved_pending_push" — it never closes a
// conflict itself (section 3 of 8C.4/8C.6). The conflict is only actually removed once the exact
// resolved version has been confirmed pushed to Supabase, matched by table + recordId +
// resolvedVersion (never conflictId alone, never table+recordId alone — see section 4/21).
// =====================================================================================

function findResolvedPendingConflictForQueueItem(item) {
  return (
    loadSyncConflicts().find(
      (c) => c.status === "resolved_pending_push" && c.table === item.table && c.recordId === item.recordId && c.resolvedVersion === item.version
    ) || null
  );
}

// Called ONLY from runSync(), and only once attemptSyncQueueItem() has already confirmed the
// actual Supabase write for `item` succeeded — never on the mere disappearance of the queue item,
// never on resolveConflict() success alone. Idempotent: if no matching conflict exists (already
// finalized, never existed, or superseded by a newer generation), this is a silent no-op.
function finalizeResolvedConflictForQueueItem(item) {
  const match = findResolvedPendingConflictForQueueItem(item);
  if (!match) return { finalized: false };
  const conflicts = loadSyncConflicts();
  const idx = conflicts.findIndex((c) => c.id === match.id);
  if (idx === -1) return { finalized: false }; // already gone — another finalize call (or the user) beat us to it
  // Re-check status/version right before removal in case something changed it since the lookup
  // above (e.g. a brand-new "pending" conflict was created for the same table+recordId in the
  // meantime — createSyncConflict() dedupes only against status:"pending", so it never touches
  // this resolved_pending_push entry, but re-checking here costs nothing and keeps this strictly
  // scoped to the exact version that was actually just pushed).
  if (conflicts[idx].status !== "resolved_pending_push" || conflicts[idx].resolvedVersion !== item.version) return { finalized: false };
  conflicts.splice(idx, 1);
  saveSyncConflicts(conflicts);
  return { finalized: true, conflictId: match.id };
}

// =====================================================================================
// Step 8C.1 — READ-ONLY PULL (diagnostic only)
//
// pullRemoteChanges() fetches every nextrep_* table for the current user, classifies each
// remote record against local state/meta, and returns a report. It NEVER writes to
// localStorage, NEVER touches nextrep_sync_queue_v1, NEVER calls any CRUD/update*/save*
// function, and NEVER triggers a PUSH (scheduleSync/runSync are not called from here). This is
// strictly diagnostic — applyRemoteChanges() does not exist yet.
// =====================================================================================

// Pull order mirrors the existing PUSH dependency order (parents before children) — this is
// the "kolejność PULL ustalona wcześniej", not a new ordering system.
const PULL_TABLE_ORDER = ["exercises", "profiles", "custom_fields", "measurements", "plans", "plan_items", "plan_item_sets", "workouts", "workout_exercises", "workout_sets"];

const PULL_TABLE_TO_SUPABASE = {
  exercises: "nextrep_exercises",
  profiles: "nextrep_profiles",
  custom_fields: "nextrep_custom_fields",
  measurements: "nextrep_measurements",
  plans: "nextrep_plans",
  plan_items: "nextrep_plan_items",
  plan_item_sets: "nextrep_plan_item_sets",
  workouts: "nextrep_workouts",
  workout_exercises: "nextrep_workout_exercises",
  workout_sets: "nextrep_workout_sets",
};

// Read-only fetch, always scoped to the current user (user isolation — never omit this .eq,
// including for nextrep_profiles). select("*") is fine here: we work only with whatever columns
// actually come back rather than assuming any — nextrep_profiles simply won't have
// id/legacy_id/version/device_id/deleted_at in its rows, and nothing below reads those for it.
//
// Stage 4A.3: one PostgREST response is capped (Supabase default max_rows = 1000), so a single
// select silently returned an INCOMPLETE table for bigger accounts. The table is now read page by
// page in a stable order (id; user_id for nextrep_profiles, which has no id) until the total
// reported with the first page is reached, or an empty page comes back. The next page starts after
// the rows actually received, so a server cap smaller than the page size can't end it early. Any
// page error fails the whole fetch — a partial table is never returned as if it were complete.
const REMOTE_FETCH_PAGE_SIZE = 500;
// Stage 4A.4 F-5 (Etap 6): `migrationToken` only from V1 code (verification / collision check) — sync never passes it.
async function fetchRemoteTable(pullTable, userId, { migrationToken = null } = {}) {
  const supabaseTable = PULL_TABLE_TO_SUPABASE[pullTable];
  const orderColumn = pullTable === "profiles" ? "user_id" : "id";
  const rows = [];
  const seenIds = new Set();
  let total = null;
  let from = 0;
  for (;;) {
    let query = supabase.from(supabaseTable);
    query = withMigrationToken(from === 0 ? query.select("*", { count: "exact" }) : query.select("*"), migrationToken);
    const { data, error, count } = await query.eq("user_id", userId).order(orderColumn, { ascending: true }).range(from, from + REMOTE_FETCH_PAGE_SIZE - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    if (from === 0 && typeof count === "number") total = count;
    if (page.length === 0) break;
    let added = 0;
    for (const row of page) {
      const id = row && row.id != null ? row.id : null;
      if (id != null) {
        if (seenIds.has(id)) continue; // a row inserted meanwhile can shift one row into the next page
        seenIds.add(id);
      }
      rows.push(row);
      added++;
    }
    if (added === 0) throw new Error(`Niespójne stronicowanie ${supabaseTable}`); // never loop or return a guess
    from += page.length;
    if (total != null && from >= total) break;
  }
  return rows;
}

// Resolves the LOCAL record a remote row identifies — legacy_id is how a remote row names its
// local counterpart; the Supabase UUID (`remote.id`) is never assumed to equal any local id, and
// is never used for lookup here. Nested tables resolve their parent first via the parent's own
// legacy_id (exactly mirroring how the PUSH side resolves parent UUIDs, just in reverse), using
// `remoteByTable` (the rows already fetched earlier in this same pull, per PULL_TABLE_ORDER).
function findLocalRecordForRemote(pullTable, remote, localSnapshot, remoteByTable) {
  switch (pullTable) {
    case "exercises":
      return localSnapshot.exercises.find((e) => e.id === remote.legacy_id) || null;
    case "measurements":
      return localSnapshot.measurements.find((m) => m.id === remote.legacy_id) || null;
    case "custom_fields":
      return localSnapshot.customFields.find((f) => f.key === remote.field_key) || null;
    case "plans":
      return localSnapshot.plans.find((p) => p.id === remote.legacy_id) || null;
    case "plan_items": {
      const parentPlan = (remoteByTable.plans || []).find((p) => p.id === remote.plan_id);
      if (!parentPlan) return null;
      const localPlan = localSnapshot.plans.find((p) => p.id === parentPlan.legacy_id);
      if (!localPlan) return null;
      return (localPlan.exercises || []).find((it) => it.id === remote.legacy_id) || null;
    }
    case "plan_item_sets": {
      const parentItem = (remoteByTable.plan_items || []).find((pi) => pi.id === remote.plan_item_id);
      if (!parentItem) return null;
      const parentPlan = (remoteByTable.plans || []).find((p) => p.id === parentItem.plan_id);
      if (!parentPlan) return null;
      const localPlan = localSnapshot.plans.find((p) => p.id === parentPlan.legacy_id);
      if (!localPlan) return null;
      const localItem = (localPlan.exercises || []).find((it) => it.id === parentItem.legacy_id);
      if (!localItem) return null;
      return (localItem.setsDetail || []).find((s) => s.id === remote.legacy_id) || null;
    }
    case "workouts":
      return localSnapshot.history.find((h) => h.id === remote.legacy_id) || null;
    case "workout_exercises": {
      const parentWorkout = (remoteByTable.workouts || []).find((w) => w.id === remote.workout_id);
      if (!parentWorkout) return null;
      const localWorkout = localSnapshot.history.find((h) => h.id === parentWorkout.legacy_id);
      if (!localWorkout) return null;
      return (localWorkout.exercises || []).find((ex) => ex.id === remote.legacy_id) || null;
    }
    case "workout_sets": {
      const parentWex = (remoteByTable.workout_exercises || []).find((we) => we.id === remote.workout_exercise_id);
      if (!parentWex) return null;
      const parentWorkout = (remoteByTable.workouts || []).find((w) => w.id === parentWex.workout_id);
      if (!parentWorkout) return null;
      const localWorkout = localSnapshot.history.find((h) => h.id === parentWorkout.legacy_id);
      if (!localWorkout) return null;
      const localWex = (localWorkout.exercises || []).find((ex) => ex.id === parentWex.legacy_id);
      if (!localWex) return null;
      return (localWex.sets || []).find((s) => s.id === remote.legacy_id) || null;
    }
    default:
      return null; // profiles is handled separately — singleton, compared directly by display_name
  }
}

// version is always PER RECORD, read from nextrep_sync_meta_v1 at key "table:recordId" (the
// exact format bumpRecordVersion() already writes) — never a single global app version, and
// never a second meta system. hasPendingLocalChange (a queue entry for the same table+recordId
// still pending/failed) upgrades an otherwise-clean classification to potential_conflict: it
// means THIS side also changed the record and hasn't pushed yet, so remote and local have both
// moved — a real judgment call, not something to silently resolve as same/newer.
function classifyRemoteRecord(remote, localFound, localMetaVersion, hasPendingLocalChange) {
  if (remote.deleted_at) return "remote_deleted";
  if (!localFound) return "remote_new";
  if (localMetaVersion == null) return "potential_conflict"; // local record exists but we have no recorded version for it — can't safely call this same/newer/older
  if (remote.version === localMetaVersion) return hasPendingLocalChange ? "potential_conflict" : "remote_same";
  if (remote.version > localMetaVersion) return hasPendingLocalChange ? "potential_conflict" : "remote_newer";
  return "remote_older";
}

function emptyPullTableSummary() {
  return { fetched: 0, remote_new: 0, remote_same: 0, remote_newer: 0, remote_older: 0, remote_deleted: 0, potential_conflict: 0, existing_conflict: 0 };
}

async function pullRemoteChanges() {
  if (!supabase) return { success: false, error: "Konto nie jest jeszcze skonfigurowane." };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { success: false, error: sessionError.message };
  const user = sessionData && sessionData.session && sessionData.session.user;
  if (!user) return { success: false, error: "Nie jesteś zalogowany." };

  // Read-only throughout: loadLocalSnapshotForSync() only calls loadKey() (localStorage.getItem),
  // loadSyncMeta()/loadSyncQueue() likewise. Nothing below ever calls setItem, any update*/save*
  // CRUD function, queueChangesForDiff, enqueueSyncChange, or scheduleSync/runSync.
  const localSnapshot = await loadLocalSnapshotForSync();
  const syncMeta = loadSyncMeta();
  const queue = loadSyncQueue();

  const remoteByTable = {};
  const tables = {};
  const records = [];

  for (const pullTable of PULL_TABLE_ORDER) {
    let rows;
    try {
      rows = await fetchRemoteTable(pullTable, user.id);
    } catch (e) {
      return { success: false, error: `Błąd pobierania ${pullTable}: ${e.message}`, tables, records };
    }
    remoteByTable[pullTable] = rows;
    const summary = emptyPullTableSummary();
    summary.fetched = rows.length;

    if (pullTable === "profiles") {
      // Profile is the documented exception: no version/id/legacy_id/device_id, keyed by
      // user_id, compared directly by display_name rather than through the version model.
      // (Profile conflict detection is a described limitation, not implemented — see the
      // Step 8C.3 report: there is no stored "last known remote value" for the profile, so a
      // pending local username change vs. a different current remote display_name cannot be
      // told apart from the normal, expected "I edited it, haven't pushed yet" case without
      // guessing. findPendingSyncConflict is still checked here for forward-compatibility, even
      // though nothing in this step ever creates a profile conflict.)
      const existingConflict = findPendingSyncConflict("profile", "self");
      if (existingConflict) {
        summary.existing_conflict = 1;
        records.push({ table: "profiles", remoteId: null, legacyId: null, classification: "existing_conflict", conflictId: existingConflict.id });
        tables[pullTable] = summary;
        continue;
      }
      const row = rows[0] || null;
      const remoteName = row ? row.display_name : null;
      const classification = row == null ? "remote_new" : remoteName === localSnapshot.userName ? "remote_same" : "remote_changed";
      summary[classification === "remote_changed" ? "remote_newer" : classification] = 1;
      summary.remote_changed = classification === "remote_changed" ? 1 : 0;
      records.push({ table: "profiles", remoteId: row ? row.user_id : null, legacyId: null, classification, remoteValue: remoteName, localValue: localSnapshot.userName, remote: row });
      tables[pullTable] = summary;
      continue;
    }

    for (const remote of rows) {
      const legacyId = pullTable === "custom_fields" ? remote.field_key : remote.legacy_id;

      // Step 8C.3: an existing pending conflict for this exact record freezes it — no
      // reclassification, no re-detection, no touching local data or the conflict itself. This
      // is a pure read (findPendingSyncConflict only reads nextrep_sync_conflicts_v1), so it
      // doesn't break PULL's read-only guarantee.
      const existingConflict = findPendingSyncConflict(pullTable, legacyId);
      if (existingConflict) {
        summary.existing_conflict = (summary.existing_conflict || 0) + 1;
        records.push({ table: pullTable, remoteId: remote.id, legacyId, classification: "existing_conflict", remote, conflictId: existingConflict.id });
        continue;
      }

      const localFound = findLocalRecordForRemote(pullTable, remote, localSnapshot, remoteByTable);
      const metaKey = `${pullTable}:${legacyId}`;
      const localMetaVersion = syncMeta[metaKey] ? syncMeta[metaKey].version : null;
      const hasPendingLocalChange = queue.some((q) => q.table === pullTable && q.recordId === legacyId && (q.status === "pending" || q.status === "processing" || q.status === "failed"));
      const classification = classifyRemoteRecord(remote, !!localFound, localMetaVersion, hasPendingLocalChange);
      summary[classification] = (summary[classification] || 0) + 1;

      const rec = { table: pullTable, remoteId: remote.id, legacyId, classification, remote };
      // Relation diagnostics (never affects classification, purely informational).
      if (pullTable === "plan_items") rec.parentPlanFound = (remoteByTable.plans || []).some((p) => p.id === remote.plan_id);
      if (pullTable === "plan_item_sets") rec.parentPlanItemFound = (remoteByTable.plan_items || []).some((pi) => pi.id === remote.plan_item_id);
      if (pullTable === "workout_exercises") {
        rec.parentWorkoutFound = (remoteByTable.workouts || []).some((w) => w.id === remote.workout_id);
        rec.exerciseFound = remote.exercise_id == null || (remoteByTable.exercises || []).some((e) => e.id === remote.exercise_id);
      }
      if (pullTable === "workout_sets") rec.parentWorkoutExerciseFound = (remoteByTable.workout_exercises || []).some((we) => we.id === remote.workout_exercise_id);
      records.push(rec);
    }
    tables[pullTable] = summary;
  }

  return { success: true, tables, records, remoteByTable };
}

// =====================================================================================
// Step 8C.2 — applyRemoteChanges(pullResult)
//
// Takes the result of pullRemoteChanges() and applies only the classifications that are safe to
// apply automatically (remote_new, and remote_newer/remote_deleted when there is no local
// pending/processing/failed change for that exact record). Writes directly to localStorage via
// saveKey() — deliberately NOT through updateExercises/updatePlans/updateHistory/
// updateMeasurements/updateCustomFields/saveUserName, since those are CRUD gates that would
// enqueue a sync change and could trigger a PUSH; PULL applying a remote value is not a local
// edit and must never round-trip back into the queue. Never calls queueChangesForDiff,
// enqueueSyncChange, scheduleSync, or runSync.
//
// KNOWN LIMITATION (documented, not guessed around): the current local data model has no
// tombstone/deleted-at concept for exercises, plans, plan_items, plan_item_sets, measurements,
// custom_fields, or history at any level — delete is simply "absent from the array". Per the
// explicit instruction not to invent a new local data shape for this, remote_deleted records are
// recognized and reported (as a conflict-list entry with reason
// "remote_deleted_no_local_tombstone_model") but NEVER applied in this step. The local record is
// left exactly as-is. This is the one place this step intentionally stops short of the full
// target behavior — see the final report.
// =====================================================================================

function pullRecordsByTable(pullResult) {
  const byTable = {};
  for (const rec of pullResult.records || []) {
    (byTable[rec.table] = byTable[rec.table] || []).push(rec);
  }
  return byTable;
}

async function applyRemoteChanges(pullResult) {
  if (!pullResult || pullResult.success !== true) {
    return { success: false, error: "Brak poprawnego wyniku pullRemoteChanges() do zastosowania.", applied: {}, skipped: {}, conflicts: [], errors: [] };
  }

  const localSnapshot = await loadLocalSnapshotForSync();
  const queue = loadSyncQueue(); // read-only guard against overwriting a pending local change
  const syncMeta = loadSyncMeta();
  const remoteByTable = pullResult.remoteByTable || {};
  const recordsByTable = pullRecordsByTable(pullResult);

  const hasPendingLocalChange = (table, recordId, operation) =>
    queue.some((q) => q.table === table && q.recordId === recordId && (operation ? q.operation === operation : true) && (q.status === "pending" || q.status === "processing" || q.status === "failed"));

  const applied = {};
  const skipped = { remote_same: 0, remote_older: 0, potential_conflict: 0, remote_deleted_not_supported: 0, existing_conflict: 0 };
  const conflicts = [];
  const errors = [];
  for (const t of PULL_TABLE_ORDER) applied[t] = 0;

  // In-memory working copies. Only written to localStorage (once each, at the very end) if a
  // change was actually applied to that category — nothing is written speculatively.
  let exercises = localSnapshot.exercises.map((e) => ({ ...e }));
  let plans = localSnapshot.plans.map((p) => ({ ...p, exercises: (p.exercises || []).map((it) => ({ ...it, setsDetail: (it.setsDetail || []).map((s) => ({ ...s })) })) }));
  let history = localSnapshot.history.map((s) => ({ ...s, exercises: (s.exercises || []).map((ex) => ({ ...ex, sets: (ex.sets || []).map((st) => ({ ...st })) })) }));
  let measurements = localSnapshot.measurements.map((m) => ({ ...m }));
  let customFields = localSnapshot.customFields.map((f) => ({ ...f }));
  let userName = localSnapshot.userName;

  let exercisesChanged = false, plansChanged = false, historyChanged = false, measurementsChanged = false, customFieldsChanged = false, userNameChanged = false;
  const metaUpdates = {}; // "table:recordId" -> {version, updatedAt, deviceId}, merged into syncMeta only for records actually applied

  // Step 8C.3: genuine conflict detection, using only data that already exists — the queue
  // (which operation, if any, is pending for this record) and syncMeta (the last known local
  // version). No new local "delete tracking" structure is invented (see the report):
  //
  //  Rule 1 (update/update, spec section 1/13.A): a local upsert is still pending/processing/
  //    failed for this record AND remote hasn't fallen behind (remote_older is fine — the local
  //    change is simply ahead and unconfronted) → both sides independently moved past the same
  //    base → CONFLICT.
  //  Rule 2 (local update|restore vs remote delete, 13.B/13.D): remote.deleted_at is set AND a
  //    local UPSERT is still pending → CONFLICT (13.B and 13.D are indistinguishable with the
  //    current data model — see report — both collapse to this one detectable condition).
  //  Rule 3 (local delete vs remote update|restore, 13.C/13.E): a local DELETE is still pending
  //    for this record AND remote is NOT a tombstone → CONFLICT (13.C and 13.E likewise collapse
  //    to one condition).
  //
  // None of this is "newer wins" / "remote wins" / "local wins" — every one of these paths ends
  // in DO NOT APPLY, and the two full snapshots are persisted for a later, human decision.
  // Same parent-resolution the PUSH side already threads through via __parentPlanId etc., just
  // computed from the remote side here (remoteByTable), used only to stamp a conflict record with
  // the LOCAL legacy_id of its direct parent — so resolveConflict() (Step 8C.4) never has to
  // re-fetch Supabase to find where a nested record lives locally.
  function resolveParentLegacyId(pullTable, remote) {
    if (pullTable === "plan_items") {
      const parentPlan = (remoteByTable.plans || []).find((p) => p.id === remote.plan_id);
      return parentPlan ? parentPlan.legacy_id : null;
    }
    if (pullTable === "plan_item_sets") {
      const parentItem = (remoteByTable.plan_items || []).find((pi) => pi.id === remote.plan_item_id);
      return parentItem ? parentItem.legacy_id : null;
    }
    if (pullTable === "workout_exercises") {
      const parentWorkout = (remoteByTable.workouts || []).find((w) => w.id === remote.workout_id);
      return parentWorkout ? parentWorkout.legacy_id : null;
    }
    if (pullTable === "workout_sets") {
      const parentWex = (remoteByTable.workout_exercises || []).find((we) => we.id === remote.workout_exercise_id);
      return parentWex ? parentWex.legacy_id : null;
    }
    return null;
  }

  // Step 8C.7 — same pattern as resolveParentLegacyId(), but for the SIBLING reference fields
  // (plan_items.exercise_id, workout_exercises.exercise_id, workouts.plan_id) rather than a
  // parent-container relationship. Uses only remoteByTable already fetched for this pull — never
  // a new Supabase query. Returns null (never a guessed id) when no match is found.
  function resolveRelatedExerciseLegacyId(pullTable, remote) {
    if (pullTable !== "plan_items" && pullTable !== "workout_exercises") return null;
    if (remote.exercise_id == null) return null;
    const match = (remoteByTable.exercises || []).find((e) => e.id === remote.exercise_id);
    return match ? match.legacy_id : null;
  }
  function resolveRelatedPlanLegacyId(pullTable, remote) {
    if (pullTable !== "workouts") return null;
    if (remote.plan_id == null) return null;
    const match = (remoteByTable.plans || []).find((p) => p.id === remote.plan_id);
    return match ? match.legacy_id : null;
  }

  function decide(pullTable, rec) {
    if (rec.classification === "existing_conflict") {
      skipped.existing_conflict++;
      return "skip"; // already persisted earlier — never re-detect, never touch, never duplicate
    }
    if (rec.classification === "remote_same") { skipped.remote_same++; return "skip"; }

    const legacyId = rec.legacyId;
    const remote = rec.remote;
    const pendingDelete = legacyId != null && hasPendingLocalChange(pullTable, legacyId, "delete");
    const pendingUpsert = legacyId != null && hasPendingLocalChange(pullTable, legacyId, "upsert");

    // Rule 3 — local delete pending, remote has real (non-tombstoned) content. A remote row the
    // local side no longer has (because it deleted it, not because it never existed) reads to the
    // plain classifier as "remote_new" — that's exactly the case this guards against re-creating
    // a record the user just deleted.
    if (pendingDelete && !remote.deleted_at) {
      skipped.potential_conflict++;
      const conflict = createSyncConflict({
        table: pullTable, recordId: legacyId, reason: "local_delete_remote_update_conflict",
        localRecord: null, // no content to snapshot — local no longer has this record (see report)
        remoteRecord: remote,
        localVersionNumber: null, remoteVersionNumber: remote.version != null ? remote.version : null,
        localDeviceId: getOrCreateDeviceId(), remoteDeviceId: remote.device_id != null ? remote.device_id : null,
        parentLegacyId: resolveParentLegacyId(pullTable, remote),
        relatedExerciseLegacyId: resolveRelatedExerciseLegacyId(pullTable, remote),
        relatedPlanLegacyId: resolveRelatedPlanLegacyId(pullTable, remote),
      });
      conflicts.push({ table: pullTable, legacyId, remoteId: rec.remoteId, reason: "local_delete_remote_update_conflict", conflictId: conflict.id });
      return "skip";
    }

    if (rec.classification === "remote_older") { skipped.remote_older++; return "skip"; }

    // Rule 2 — remote is a tombstone, but a local upsert (an ordinary edit, or a restore — both
    // look identical to the queue, see report) is still pending for the very same record.
    if (remote.deleted_at && pendingUpsert) {
      skipped.potential_conflict++;
      const localRecord = findLocalRecordForRemote(pullTable, remote, localSnapshot, remoteByTable);
      const conflict = createSyncConflict({
        table: pullTable, recordId: legacyId, reason: "local_update_remote_delete_conflict",
        localRecord, remoteRecord: remote,
        localVersionNumber: syncMeta[`${pullTable}:${legacyId}`] ? syncMeta[`${pullTable}:${legacyId}`].version : null,
        remoteVersionNumber: remote.version != null ? remote.version : null,
        localDeviceId: getOrCreateDeviceId(), remoteDeviceId: remote.device_id != null ? remote.device_id : null,
        parentLegacyId: resolveParentLegacyId(pullTable, remote),
        relatedExerciseLegacyId: resolveRelatedExerciseLegacyId(pullTable, remote),
        relatedPlanLegacyId: resolveRelatedPlanLegacyId(pullTable, remote),
      });
      conflicts.push({ table: pullTable, legacyId, remoteId: rec.remoteId, reason: "local_update_remote_delete_conflict", conflictId: conflict.id });
      return "skip";
    }
    if (rec.classification === "remote_deleted") {
      // Remote deleted, but nothing local is pending against it — not a conflict, just a
      // representational gap: the current local model has no tombstone/deletedAt field on any
      // record type, so there is nothing safe to write locally. Recognized, reported, never
      // guessed into an invented shape.
      skipped.remote_deleted_not_supported++;
      conflicts.push({ table: pullTable, legacyId, remoteId: rec.remoteId, reason: "remote_deleted_no_local_tombstone_model" });
      return "skip";
    }

    // Rule 1 — same record, remote at/ahead of the last known local version, AND a local upsert
    // is still unpushed: both sides moved independently past the same base.
    if (pendingUpsert && (rec.classification === "remote_newer" || rec.classification === "potential_conflict" || rec.classification === "remote_same")) {
      skipped.potential_conflict++;
      const localRecord = findLocalRecordForRemote(pullTable, remote, localSnapshot, remoteByTable);
      const conflict = createSyncConflict({
        table: pullTable, recordId: legacyId, reason: "update_update_conflict",
        localRecord, remoteRecord: remote,
        localVersionNumber: syncMeta[`${pullTable}:${legacyId}`] ? syncMeta[`${pullTable}:${legacyId}`].version : null,
        remoteVersionNumber: remote.version != null ? remote.version : null,
        localDeviceId: getOrCreateDeviceId(), remoteDeviceId: remote.device_id != null ? remote.device_id : null,
        parentLegacyId: resolveParentLegacyId(pullTable, remote),
        relatedExerciseLegacyId: resolveRelatedExerciseLegacyId(pullTable, remote),
        relatedPlanLegacyId: resolveRelatedPlanLegacyId(pullTable, remote),
      });
      conflicts.push({ table: pullTable, legacyId, remoteId: rec.remoteId, reason: "update_update_conflict", conflictId: conflict.id });
      return "skip";
    }
    if (rec.classification === "potential_conflict") {
      // No pending local change, yet we still can't tell same/newer/older (no meta recorded for
      // an existing local record) — genuinely ambiguous, not a confirmed two-sided conflict, so
      // nothing is persisted to nextrep_sync_conflicts_v1; just don't apply.
      skipped.potential_conflict++;
      conflicts.push({ table: pullTable, legacyId, remoteId: rec.remoteId, reason: "potential_conflict_no_meta" });
      return "skip";
    }
    if (rec.classification !== "remote_new" && rec.classification !== "remote_newer") return "skip"; // defensive — unknown classification, never guess
    if (legacyId != null && pendingUpsert) {
      // Reached only if classification was remote_newer but somehow not already caught above —
      // kept as a final safety net so a pending local change can never be silently overwritten.
      skipped.potential_conflict++;
      conflicts.push({ table: pullTable, legacyId, remoteId: rec.remoteId, reason: "local_pending_change" });
      return "skip";
    }
    return "apply";
  }

  // ---- exercises ----
  for (const rec of recordsByTable.exercises || []) {
    if (decide("exercises", rec) !== "apply") continue;
    const remote = rec.remote;
    const localRecord = { id: rec.legacyId, name: remote.name, category: remote.category, equipment: remote.equipment, isTimeBased: remote.is_time_based, isSetsOnly: remote.is_sets_only, isCardio: remote.is_cardio, deviceType: remote.device_type, videoUrl: remote.video_url, notes: remote.notes };
    const idx = exercises.findIndex((e) => e.id === rec.legacyId);
    if (idx >= 0) exercises[idx] = { ...exercises[idx], ...localRecord }; else exercises.push(localRecord);
    exercisesChanged = true;
    applied.exercises++;
    metaUpdates[`exercises:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }

  // ---- profiles (no version, no legacy_id, no device_id — compared/applied by display_name only) ----
  for (const rec of recordsByTable.profiles || []) {
    if (rec.classification === "existing_conflict") { skipped.existing_conflict++; continue; }
    if (rec.classification !== "remote_changed") { if (rec.classification === "remote_same") skipped.remote_same++; continue; }
    if (hasPendingLocalChange("profile", "self")) {
      skipped.potential_conflict++;
      conflicts.push({ table: "profiles", legacyId: null, remoteId: rec.remoteId, reason: "local_pending_change" });
      continue;
    }
    userName = rec.remote.display_name || "";
    userNameChanged = true;
    applied.profiles++;
    // Deliberately no meta write — nextrep_profiles has no version, and the local
    // "profile:self" meta entry belongs to the PUSH side's own edit-tracking, not to PULL.
  }

  // ---- custom_fields (keyed by field_key, no legacy_id, no position) ----
  for (const rec of recordsByTable.custom_fields || []) {
    if (decide("custom_fields", rec) !== "apply") continue;
    const remote = rec.remote;
    const localRecord = { key: rec.legacyId, label: remote.label, unit: remote.unit };
    const idx = customFields.findIndex((f) => f.key === rec.legacyId);
    if (idx >= 0) customFields[idx] = { ...customFields[idx], ...localRecord }; else customFields.push(localRecord);
    customFieldsChanged = true;
    applied.custom_fields++;
    metaUpdates[`custom_fields:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }

  // ---- measurements (values is JSONB — spread back in 1:1, never touched/flattened) ----
  for (const rec of recordsByTable.measurements || []) {
    if (decide("measurements", rec) !== "apply") continue;
    const remote = rec.remote;
    const localRecord = { id: rec.legacyId, date: remote.measurement_date, ...(remote.values && typeof remote.values === "object" ? remote.values : {}) };
    const idx = measurements.findIndex((m) => m.id === rec.legacyId);
    if (idx >= 0) measurements[idx] = localRecord; else measurements.push(localRecord);
    measurementsChanged = true;
    applied.measurements++;
    metaUpdates[`measurements:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }

  // ---- plans -> plan_items -> plan_item_sets (parents applied before children, per PULL_TABLE_ORDER) ----
  for (const rec of recordsByTable.plans || []) {
    if (decide("plans", rec) !== "apply") continue;
    const remote = rec.remote;
    const idx = plans.findIndex((p) => p.id === rec.legacyId);
    if (idx >= 0) plans[idx] = { ...plans[idx], name: remote.name };
    else plans.push({ id: rec.legacyId, name: remote.name, exercises: [] });
    plansChanged = true;
    applied.plans++;
    metaUpdates[`plans:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }
  for (const rec of recordsByTable.plan_items || []) {
    if (decide("plan_items", rec) !== "apply") continue;
    const remote = rec.remote;
    const parentPlanRemote = (remoteByTable.plans || []).find((p) => p.id === remote.plan_id);
    if (!parentPlanRemote) { errors.push({ table: "plan_items", legacyId: rec.legacyId, error: "parent plan not found in this pull's remote data" }); continue; }
    const plan = plans.find((p) => p.id === parentPlanRemote.legacy_id);
    if (!plan) { errors.push({ table: "plan_items", legacyId: rec.legacyId, error: `parent plan (legacy_id=${parentPlanRemote.legacy_id}) does not exist locally — cannot attach plan_item` }); continue; }
    const exerciseRemote = remote.exercise_id != null ? (remoteByTable.exercises || []).find((e) => e.id === remote.exercise_id) : null;
    const localItem = { id: rec.legacyId, exerciseId: exerciseRemote ? exerciseRemote.legacy_id : null, restSeconds: remote.rest_seconds, supersetGroup: remote.superset_group };
    const itemIdx = plan.exercises.findIndex((it) => it.id === rec.legacyId);
    if (itemIdx >= 0) plan.exercises[itemIdx] = { ...plan.exercises[itemIdx], ...localItem };
    else { localItem.setsDetail = []; plan.exercises.push(localItem); }
    plansChanged = true;
    applied.plan_items++;
    metaUpdates[`plan_items:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }
  for (const rec of recordsByTable.plan_item_sets || []) {
    if (decide("plan_item_sets", rec) !== "apply") continue;
    const remote = rec.remote;
    const parentItemRemote = (remoteByTable.plan_items || []).find((pi) => pi.id === remote.plan_item_id);
    if (!parentItemRemote) { errors.push({ table: "plan_item_sets", legacyId: rec.legacyId, error: "parent plan_item not found in this pull's remote data" }); continue; }
    const parentPlanRemote = (remoteByTable.plans || []).find((p) => p.id === parentItemRemote.plan_id);
    if (!parentPlanRemote) { errors.push({ table: "plan_item_sets", legacyId: rec.legacyId, error: "parent plan not found in this pull's remote data" }); continue; }
    const plan = plans.find((p) => p.id === parentPlanRemote.legacy_id);
    const item = plan && plan.exercises.find((it) => it.id === parentItemRemote.legacy_id);
    if (!item) { errors.push({ table: "plan_item_sets", legacyId: rec.legacyId, error: `parent plan_item (legacy_id=${parentItemRemote.legacy_id}) does not exist locally — cannot attach plan_item_set` }); continue; }
    // no `position` — nextrep_plan_item_sets does not have that column, never read/write it here
    const localSet = { id: rec.legacyId, target: remote.target, rir: remote.rir };
    const setIdx = item.setsDetail.findIndex((s) => s.id === rec.legacyId);
    if (setIdx >= 0) item.setsDetail[setIdx] = { ...item.setsDetail[setIdx], ...localSet }; else item.setsDetail.push(localSet);
    plansChanged = true;
    applied.plan_item_sets++;
    metaUpdates[`plan_item_sets:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }

  // ---- workouts -> workout_exercises -> workout_sets (same parent-before-child pattern) ----
  for (const rec of recordsByTable.workouts || []) {
    if (decide("workouts", rec) !== "apply") continue;
    const remote = rec.remote;
    const planRemote = remote.plan_id != null ? (remoteByTable.plans || []).find((p) => p.id === remote.plan_id) : null;
    const fields = { date: remote.workout_date, planId: planRemote ? planRemote.legacy_id : null, planName: remote.plan_name, planLabel: remote.plan_label, exercisesCount: remote.exercises_count, totalSets: remote.total_sets, totalReps: remote.total_reps, totalWeight: remote.total_weight, volume: remote.volume, durationSec: remote.duration_sec, analysis: remote.analysis };
    const idx = history.findIndex((h) => h.id === rec.legacyId);
    if (idx >= 0) history[idx] = { ...history[idx], ...fields };
    else history.push({ id: rec.legacyId, ...fields, exercises: [] });
    historyChanged = true;
    applied.workouts++;
    metaUpdates[`workouts:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }
  for (const rec of recordsByTable.workout_exercises || []) {
    if (decide("workout_exercises", rec) !== "apply") continue;
    const remote = rec.remote;
    const parentWorkoutRemote = (remoteByTable.workouts || []).find((w) => w.id === remote.workout_id);
    if (!parentWorkoutRemote) { errors.push({ table: "workout_exercises", legacyId: rec.legacyId, error: "parent workout not found in this pull's remote data" }); continue; }
    const session = history.find((h) => h.id === parentWorkoutRemote.legacy_id);
    if (!session) { errors.push({ table: "workout_exercises", legacyId: rec.legacyId, error: `parent workout (legacy_id=${parentWorkoutRemote.legacy_id}) does not exist locally — cannot attach workout_exercise` }); continue; }
    const exerciseRemote = remote.exercise_id != null ? (remoteByTable.exercises || []).find((e) => e.id === remote.exercise_id) : null;
    const localEx = { id: rec.legacyId, exerciseId: exerciseRemote ? exerciseRemote.legacy_id : null, name: remote.name, type: remote.exercise_type, setsDetail: Array.isArray(remote.sets_detail) ? remote.sets_detail : [] };
    const exIdx = session.exercises.findIndex((ex) => ex.id === rec.legacyId);
    if (exIdx >= 0) session.exercises[exIdx] = { ...session.exercises[exIdx], ...localEx };
    else { localEx.sets = []; session.exercises.push(localEx); }
    historyChanged = true;
    applied.workout_exercises++;
    metaUpdates[`workout_exercises:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }
  for (const rec of recordsByTable.workout_sets || []) {
    if (decide("workout_sets", rec) !== "apply") continue;
    const remote = rec.remote;
    const parentWexRemote = (remoteByTable.workout_exercises || []).find((we) => we.id === remote.workout_exercise_id);
    if (!parentWexRemote) { errors.push({ table: "workout_sets", legacyId: rec.legacyId, error: "parent workout_exercise not found in this pull's remote data" }); continue; }
    const parentWorkoutRemote = (remoteByTable.workouts || []).find((w) => w.id === parentWexRemote.workout_id);
    if (!parentWorkoutRemote) { errors.push({ table: "workout_sets", legacyId: rec.legacyId, error: "parent workout not found in this pull's remote data" }); continue; }
    const session = history.find((h) => h.id === parentWorkoutRemote.legacy_id);
    const wex = session && session.exercises.find((ex) => ex.id === parentWexRemote.legacy_id);
    if (!wex) { errors.push({ table: "workout_sets", legacyId: rec.legacyId, error: `parent workout_exercise (legacy_id=${parentWexRemote.legacy_id}) does not exist locally — cannot attach workout_set` }); continue; }
    const localSet = { id: rec.legacyId, weight: remote.weight, reps: remote.reps, duration: remote.duration, speed: remote.speed, incline: remote.incline, distance: remote.distance, kcal: remote.kcal, resistance: remote.resistance, pace: remote.pace, level: remote.level, floors: remote.floors, heartRate: remote.heart_rate, rir: remote.rir, note: remote.note, setType: remote.set_type, done: remote.done };
    const setIdx = wex.sets.findIndex((s) => s.id === rec.legacyId);
    if (setIdx >= 0) wex.sets[setIdx] = { ...wex.sets[setIdx], ...localSet }; else wex.sets.push(localSet);
    historyChanged = true;
    applied.workout_sets++;
    metaUpdates[`workout_sets:${rec.legacyId}`] = { version: remote.version, updatedAt: remote.updated_at, deviceId: remote.device_id };
  }

  // ---- commit: write each changed category exactly once, then merge meta updates ----
  if (exercisesChanged) saveKey(STORAGE_KEYS.exercises, exercises);
  if (plansChanged) saveKey(STORAGE_KEYS.plans, plans);
  if (historyChanged) saveKey(STORAGE_KEYS.history, history);
  if (measurementsChanged) saveKey(STORAGE_KEYS.measurements, measurements);
  if (customFieldsChanged) saveKey(STORAGE_KEYS.customFields, customFields);
  if (userNameChanged) saveKey(STORAGE_KEYS.userName, userName);
  if (Object.keys(metaUpdates).length > 0) {
    Object.assign(syncMeta, metaUpdates);
    saveSyncMeta(syncMeta);
  }

  return { success: true, applied, skipped, conflicts, errors };
}

// =====================================================================================
// Step 8C.4 — resolveConflict(conflictId, choice)
//
// Resolves ONE pending conflict by choosing "local" or "remote". This is itself a NEW change
// (never a revert to an old version): the resolved record always gets
// max(localVersionNumber, remoteVersionNumber) + 1, then a single upsert (or delete, if the
// chosen side is the deleted one) is queued through the EXISTING enqueueSyncChange()/runSync()
// pipeline — resolveConflict() never writes to Supabase directly. The conflict is marked
// "resolved_pending_push" (never "resolved" outright) until a later step can confirm the PUSH
// actually landed — see the report for why that confirmation loop isn't built yet.
// =====================================================================================

// Converts a raw Supabase row (snake_case) into the local record shape for the given pull-table
// — the exact reverse of the buildXPayload() functions PUSH uses. Returns null when there's
// nothing to convert (used for a table with no matching case, defensively).
// KNOWN LIMITATION: plan_items.exercise_id / workout_exercises.exercise_id / workouts.plan_id are
// Supabase UUIDs in the stored conflict snapshot — resolving them to a local legacy_id would
// require re-fetching Supabase, which section 4 of Step 8C.4 explicitly forbids (the snapshot
// taken at detection time is the sole source for resolution). When such a reference is present,
// choosing "remote" for that record intentionally clears the reference to null rather than
// writing a raw Supabase UUID into a local id field — see the report.
function remoteRowToLocalShape(table, remoteRow) {
  if (!remoteRow) return null;
  switch (table) {
    case "exercises":
      return { name: remoteRow.name, category: remoteRow.category, equipment: remoteRow.equipment, isTimeBased: remoteRow.is_time_based, isSetsOnly: remoteRow.is_sets_only, isCardio: remoteRow.is_cardio, deviceType: remoteRow.device_type, videoUrl: remoteRow.video_url, notes: remoteRow.notes };
    case "measurements":
      return { date: remoteRow.measurement_date, ...(remoteRow.values && typeof remoteRow.values === "object" ? remoteRow.values : {}) };
    case "custom_fields":
      return { label: remoteRow.label, unit: remoteRow.unit };
    case "plans":
      return { name: remoteRow.name };
    case "plan_items":
      return { exerciseId: null, restSeconds: remoteRow.rest_seconds, supersetGroup: remoteRow.superset_group };
    case "plan_item_sets":
      return { target: remoteRow.target, rir: remoteRow.rir };
    case "workouts":
      return { date: remoteRow.workout_date, planId: null, planName: remoteRow.plan_name, planLabel: remoteRow.plan_label, exercisesCount: remoteRow.exercises_count, totalSets: remoteRow.total_sets, totalReps: remoteRow.total_reps, totalWeight: remoteRow.total_weight, volume: remoteRow.volume, durationSec: remoteRow.duration_sec, analysis: remoteRow.analysis };
    case "workout_exercises":
      return { exerciseId: null, name: remoteRow.name, type: remoteRow.exercise_type, setsDetail: Array.isArray(remoteRow.sets_detail) ? remoteRow.sets_detail : [] };
    case "workout_sets":
      return { weight: remoteRow.weight, reps: remoteRow.reps, duration: remoteRow.duration, speed: remoteRow.speed, incline: remoteRow.incline, distance: remoteRow.distance, kcal: remoteRow.kcal, resistance: remoteRow.resistance, pace: remoteRow.pace, level: remoteRow.level, floors: remoteRow.floors, heartRate: remoteRow.heart_rate, rir: remoteRow.rir, note: remoteRow.note, setType: remoteRow.set_type, done: remoteRow.done };
    case "profile":
      return remoteRow.display_name;
    default:
      return null;
  }
}

// Low-level, SINGLE-RECORD local write for conflict resolution. Deliberately NOT a CRUD-gate
// call (updateExercises/updatePlans/updateHistory/updateMeasurements/updateCustomFields/
// saveUserName) — those diff the whole collection and enqueue their own change; resolution is a
// controlled operation that touches exactly the one conflicting record and enqueues exactly one
// deliberate change itself (in resolveConflict(), right after this returns). For nested tables,
// sibling records (other plan_items, other workout_sets, ...) are never read from or written
// through — only the exact array slot for `recordId` (and, for a top-level plan/workout
// resolution, its children array is left completely untouched, never replaced).
async function applyResolvedRecordLocally(table, recordId, parentLegacyId, record, isDelete) {
  const snap = await loadLocalSnapshotForSync();

  if (table === "exercises") {
    let arr = snap.exercises.map((e) => ({ ...e }));
    if (isDelete) arr = arr.filter((e) => e.id !== recordId);
    else {
      const idx = arr.findIndex((e) => e.id === recordId);
      const withId = { ...record, id: recordId };
      if (idx >= 0) arr[idx] = withId; else arr.push(withId);
    }
    saveKey(STORAGE_KEYS.exercises, arr);
    return { ok: true };
  }

  if (table === "measurements") {
    let arr = snap.measurements.map((m) => ({ ...m }));
    if (isDelete) arr = arr.filter((m) => m.id !== recordId);
    else {
      const idx = arr.findIndex((m) => m.id === recordId);
      const withId = { ...record, id: recordId };
      if (idx >= 0) arr[idx] = withId; else arr.push(withId);
    }
    saveKey(STORAGE_KEYS.measurements, arr);
    return { ok: true };
  }

  if (table === "custom_fields") {
    let arr = snap.customFields.map((f) => ({ ...f }));
    if (isDelete) arr = arr.filter((f) => f.key !== recordId);
    else {
      const idx = arr.findIndex((f) => f.key === recordId);
      const withKey = { ...record, key: recordId };
      if (idx >= 0) arr[idx] = withKey; else arr.push(withKey);
    }
    saveKey(STORAGE_KEYS.customFields, arr);
    return { ok: true };
  }

  if (table === "plans") {
    let arr = snap.plans.map((p) => ({ ...p, exercises: (p.exercises || []).map((it) => ({ ...it, setsDetail: (it.setsDetail || []).map((s) => ({ ...s })) })) }));
    if (isDelete) arr = arr.filter((p) => p.id !== recordId);
    else {
      const idx = arr.findIndex((p) => p.id === recordId);
      // A plan-level resolution only ever touches the plan's OWN fields (name) — its children
      // array is always preserved exactly as it currently is, never replaced from the snapshot.
      if (idx >= 0) arr[idx] = { ...arr[idx], ...record, id: recordId, exercises: arr[idx].exercises };
      else arr.push({ ...record, id: recordId, exercises: [] });
    }
    saveKey(STORAGE_KEYS.plans, arr);
    return { ok: true };
  }

  if (table === "plan_items") {
    if (!parentLegacyId) return { ok: false, error: "Brak parentLegacyId dla plan_items — nie można zlokalizować nadrzędnego planu." };
    let arr = snap.plans.map((p) => ({ ...p, exercises: (p.exercises || []).map((it) => ({ ...it, setsDetail: (it.setsDetail || []).map((s) => ({ ...s })) })) }));
    const plan = arr.find((p) => p.id === parentLegacyId);
    if (!plan) return { ok: false, error: `Nadrzędny plan (${parentLegacyId}) nie istnieje lokalnie.` };
    if (isDelete) plan.exercises = plan.exercises.filter((it) => it.id !== recordId);
    else {
      const idx = plan.exercises.findIndex((it) => it.id === recordId);
      if (idx >= 0) plan.exercises[idx] = { ...plan.exercises[idx], ...record, id: recordId, setsDetail: plan.exercises[idx].setsDetail };
      else plan.exercises.push({ ...record, id: recordId, setsDetail: [] });
    }
    saveKey(STORAGE_KEYS.plans, arr);
    return { ok: true };
  }

  if (table === "plan_item_sets") {
    if (!parentLegacyId) return { ok: false, error: "Brak parentLegacyId dla plan_item_sets — nie można zlokalizować nadrzędnego elementu planu." };
    let arr = snap.plans.map((p) => ({ ...p, exercises: (p.exercises || []).map((it) => ({ ...it, setsDetail: (it.setsDetail || []).map((s) => ({ ...s })) })) }));
    let item = null;
    for (const plan of arr) { item = plan.exercises.find((it) => it.id === parentLegacyId); if (item) break; }
    if (!item) return { ok: false, error: `Nadrzędny element planu (${parentLegacyId}) nie istnieje lokalnie.` };
    if (isDelete) item.setsDetail = item.setsDetail.filter((s) => s.id !== recordId);
    else {
      const idx = item.setsDetail.findIndex((s) => s.id === recordId);
      const withId = { ...record, id: recordId };
      if (idx >= 0) item.setsDetail[idx] = withId; else item.setsDetail.push(withId);
    }
    saveKey(STORAGE_KEYS.plans, arr);
    return { ok: true };
  }

  if (table === "workouts") {
    let arr = snap.history.map((s) => ({ ...s, exercises: (s.exercises || []).map((ex) => ({ ...ex, sets: (ex.sets || []).map((st) => ({ ...st })) })) }));
    if (isDelete) arr = arr.filter((s) => s.id !== recordId);
    else {
      const idx = arr.findIndex((s) => s.id === recordId);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...record, id: recordId, exercises: arr[idx].exercises };
      else arr.push({ ...record, id: recordId, exercises: [] });
    }
    saveKey(STORAGE_KEYS.history, arr);
    return { ok: true };
  }

  if (table === "workout_exercises") {
    if (!parentLegacyId) return { ok: false, error: "Brak parentLegacyId dla workout_exercises — nie można zlokalizować nadrzędnego treningu." };
    let arr = snap.history.map((s) => ({ ...s, exercises: (s.exercises || []).map((ex) => ({ ...ex, sets: (ex.sets || []).map((st) => ({ ...st })) })) }));
    const session = arr.find((s) => s.id === parentLegacyId);
    if (!session) return { ok: false, error: `Nadrzędny trening (${parentLegacyId}) nie istnieje lokalnie.` };
    if (isDelete) session.exercises = session.exercises.filter((ex) => ex.id !== recordId);
    else {
      const idx = session.exercises.findIndex((ex) => ex.id === recordId);
      if (idx >= 0) session.exercises[idx] = { ...session.exercises[idx], ...record, id: recordId, sets: session.exercises[idx].sets };
      else session.exercises.push({ ...record, id: recordId, sets: [] });
    }
    saveKey(STORAGE_KEYS.history, arr);
    return { ok: true };
  }

  if (table === "workout_sets") {
    if (!parentLegacyId) return { ok: false, error: "Brak parentLegacyId dla workout_sets — nie można zlokalizować nadrzędnego ćwiczenia treningu." };
    let arr = snap.history.map((s) => ({ ...s, exercises: (s.exercises || []).map((ex) => ({ ...ex, sets: (ex.sets || []).map((st) => ({ ...st })) })) }));
    let ex = null;
    for (const session of arr) { ex = session.exercises.find((e) => e.id === parentLegacyId); if (ex) break; }
    if (!ex) return { ok: false, error: `Nadrzędne ćwiczenie treningu (${parentLegacyId}) nie istnieje lokalnie.` };
    if (isDelete) ex.sets = ex.sets.filter((s) => s.id !== recordId);
    else {
      const idx = ex.sets.findIndex((s) => s.id === recordId);
      const withId = { ...record, id: recordId };
      if (idx >= 0) ex.sets[idx] = withId; else ex.sets.push(withId);
    }
    saveKey(STORAGE_KEYS.history, arr);
    return { ok: true };
  }

  if (table === "profile") {
    // No delete concept for nextrep_profiles — this step never creates profile conflicts (see
    // the report), so this branch is defensive rather than exercised.
    if (isDelete) return { ok: false, error: "Profil nie obsługuje usuwania." };
    saveKey(STORAGE_KEYS.userName, typeof record === "string" ? record : (record && record.display_name) || "");
    return { ok: true };
  }

  return { ok: false, error: `Nieznana tabela: ${table}` };
}

async function resolveConflict(conflictId, choice) {
  if (!conflictId) return { success: false, error: "Brak conflictId." };
  if (choice !== "local" && choice !== "remote") return { success: false, error: 'Nieprawidłowe choice — dozwolone tylko "local" lub "remote".' };

  const conflicts = loadSyncConflicts();
  const idx = conflicts.findIndex((c) => c.id === conflictId);
  if (idx === -1) return { success: false, error: "Konflikt nie istnieje." };
  const conflict = conflicts[idx];

  // Idempotency / already-decided (sections 3 and 20): reject cleanly, change nothing, surface
  // the current state rather than throwing or silently no-opping.
  if (conflict.status !== "pending") {
    return { success: false, error: "Konflikt nie jest w stanie pending (już rozwiązany lub w trakcie).", alreadyResolved: true, conflict: deepCloneForConflict(conflict) };
  }

  const chosenSnapshot = choice === "local" ? conflict.localRecord : conflict.remoteRecord;
  if (chosenSnapshot === undefined) {
    return { success: false, error: "Konflikt nie ma kompletnego snapshotu dla wybranej strony." };
  }

  const localVersionNumber = Number(conflict.localVersionNumber || 0);
  const remoteVersionNumber = Number(conflict.remoteVersionNumber || 0);
  const newVersion = Math.max(localVersionNumber, remoteVersionNumber) + 1;
  const deviceId = getOrCreateDeviceId();
  const table = conflict.table;
  const recordId = conflict.recordId;

  // "local" resolves to deleted when its snapshot is null (Rule 3 from Step 8C.3 — local had a
  // pending delete and never had content to snapshot). "remote" resolves to deleted when its
  // snapshot carries deleted_at.
  const isDeleteResolution = choice === "local" ? chosenSnapshot === null : !!(chosenSnapshot && chosenSnapshot.deleted_at);

  let localShapedRecord = isDeleteResolution ? null : choice === "local" ? deepCloneForConflict(chosenSnapshot) : remoteRowToLocalShape(table, chosenSnapshot);
  // Step 8C.7 — safe completion of the existing null default: when choosing "remote" (and it's
  // not a delete resolution), use the exercise_id/plan_id → legacy_id mapping captured at
  // conflict-creation time (see createSyncConflict()/applyRemoteChanges()), if present. Never a
  // new lookup here, never a guess — when the field is absent (e.g. a conflict created directly
  // by pushUpsertByLegacyId(), which has no remoteByTable), behavior is unchanged from before.
  if (!isDeleteResolution && choice === "remote" && localShapedRecord) {
    if ((table === "plan_items" || table === "workout_exercises") && conflict.relatedExerciseLegacyId != null) {
      localShapedRecord = { ...localShapedRecord, exerciseId: conflict.relatedExerciseLegacyId };
    }
    if (table === "workouts" && conflict.relatedPlanLegacyId != null) {
      localShapedRecord = { ...localShapedRecord, planId: conflict.relatedPlanLegacyId };
    }
  }

  let writeResult;
  try {
    writeResult = await applyResolvedRecordLocally(table, recordId, conflict.parentLegacyId, localShapedRecord, isDeleteResolution);
  } catch (e) {
    return { success: false, error: "Błąd zapisu lokalnego podczas rozwiązywania konfliktu: " + e.message };
  }
  if (!writeResult.ok) {
    return { success: false, error: writeResult.error || "Nie udało się zapisać lokalnie rozwiązanego rekordu." };
  }

  // Exactly ONE logical pending queue item for this record, at the new version — reuses
  // enqueueSyncChange()'s existing table+recordId dedup, never a second, parallel mechanism.
  enqueueSyncChange({ table, recordId, operation: isDeleteResolution ? "delete" : "upsert", version: newVersion, deviceId });

  if (table !== "profile") {
    const meta = loadSyncMeta();
    meta[`${table}:${recordId}`] = { version: newVersion, updatedAt: new Date().toISOString(), deviceId };
    saveSyncMeta(meta);
  }

  // Transitional state (section 15): never "resolved" outright — only a confirmed successful
  // PUSH of this exact change could safely retire the conflict, and runSync() doesn't yet report
  // per-item confirmation back to the conflict store (rebuilding that loop is out of scope here;
  // see the report). The queue entry above is the actual source of truth for the pending PUSH.
  const updatedConflict = { ...conflict, status: "resolved_pending_push", resolution: choice, resolvedVersion: newVersion, resolvedAt: new Date().toISOString() };
  conflicts[idx] = updatedConflict;
  saveSyncConflicts(conflicts);

  return { success: true, conflictId, choice, newVersion, table, recordId, deleted: isDeleteResolution, conflict: deepCloneForConflict(updatedConflict) };
}

// =====================================================================================
// Step 8C.5 — Conflict Center UI helpers (pure, presentation-layer only). No versioning, queue,
// PUSH, Supabase-write, merge, or conflict-detection logic lives here — all of that stays in
// resolveConflict()/loadSyncConflicts()/loadSyncQueue()/runSync()/scheduleSync(), which this
// layer only calls, never reimplements.
// =====================================================================================

function getPendingConflictCount() {
  return loadSyncConflicts().filter((c) => c.status === "pending").length;
}

function pluralKonflikt(n) {
  if (n === 1) return "konflikt";
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "konflikty";
  return "konfliktów";
}
function formatConflictCountLabel(n) {
  return `${n} ${pluralKonflikt(n)} ${n === 1 ? "wymaga" : "wymagają"} decyzji`;
}

// Picks whichever side of the conflict actually has a usable value for a field — never assumes
// one shape, since localRecord/remoteRecord use different casing (camelCase vs snake_case) and
// either side can be null (representing a delete).
function pickConflictField(conflict, localKey, remoteKey) {
  const l = conflict.localRecord;
  const r = conflict.remoteRecord;
  if (l && l[localKey] != null && l[localKey] !== "") return l[localKey];
  if (r && r[remoteKey] != null && r[remoteKey] !== "") return r[remoteKey];
  return null;
}

function formatConflictDateShort(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return iso;
  }
}
function formatDurationShort(sec) {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min${s > 0 ? " " + s + " s" : ""}` : `${s} s`;
}

// A short, human, never-undefined label for what a conflict is about (never a table name,
// legacy_id, or UUID). `exercisesById` (optional) maps a local exercise id -> its name, needed
// because plan_items/workout_exercises only store an exerciseId reference, not a name.
function getConflictDisplayName(conflict, exercisesById) {
  if (!conflict) return "Dane treningowe";
  const byId = exercisesById || {};
  switch (conflict.table) {
    case "exercises":
      return pickConflictField(conflict, "name", "name") || "Ćwiczenie";
    case "plans":
      return pickConflictField(conflict, "name", "name") || "Plan treningowy";
    case "plan_items": {
      const localExId = conflict.localRecord && conflict.localRecord.exerciseId;
      if (localExId && byId[localExId]) return byId[localExId];
      return "Element planu";
    }
    case "plan_item_sets":
      return "Seria planu";
    case "workouts": {
      const planName = pickConflictField(conflict, "planName", "plan_name");
      if (planName) return planName;
      const date = pickConflictField(conflict, "date", "workout_date");
      return date ? `Trening — ${formatConflictDateShort(date)}` : "Trening";
    }
    case "workout_exercises": {
      const name = pickConflictField(conflict, "name", "name");
      if (name) return name;
      const localExId = conflict.localRecord && conflict.localRecord.exerciseId;
      if (localExId && byId[localExId]) return byId[localExId];
      return "Ćwiczenie treningu";
    }
    case "workout_sets":
      return "Seria treningowa";
    case "measurements":
      return "Pomiary";
    case "custom_fields":
      return pickConflictField(conflict, "label", "label") || "Pole własne";
    case "profile":
    case "profiles":
      return "Profil";
    default:
      return "Dane treningowe";
  }
}

// Turns one side's snapshot into a short ordered list of {label, value} pairs ready for display
// — never the raw JSON (section 13). `shape` is "local" or "remote" (the two snapshots use
// different casing/column names). Only fields that actually have a value are included.
function formatConflictSnapshot(table, snapshot, shape, exercisesById) {
  if (!snapshot) return [];
  const byId = exercisesById || {};
  const isLocal = shape === "local";
  const fields = [];
  const push = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    fields.push({ label, value });
  };

  switch (table) {
    case "exercises": {
      push("Nazwa", snapshot.name);
      push("Kategoria", Array.isArray(snapshot.category) ? snapshot.category.join(", ") : snapshot.category);
      push("Sprzęt", Array.isArray(snapshot.equipment) ? snapshot.equipment.join(", ") : snapshot.equipment);
      const isTimeBased = isLocal ? snapshot.isTimeBased : snapshot.is_time_based;
      const isSetsOnly = isLocal ? snapshot.isSetsOnly : snapshot.is_sets_only;
      const isCardio = isLocal ? snapshot.isCardio : snapshot.is_cardio;
      push("Typ", isCardio ? "Cardio" : isTimeBased ? "Czasowe" : isSetsOnly ? "Tylko serie" : "Siłowe");
      push("Wideo", isLocal ? snapshot.videoUrl : snapshot.video_url);
      break;
    }
    case "plans":
      push("Nazwa planu", snapshot.name);
      break;
    case "plan_items": {
      // remote exercise_id is a Supabase UUID, not locally resolvable from this snapshot alone
      // (see the Step 8C.5 report) — only the local side can show a resolved exercise name here.
      const exId = isLocal ? snapshot.exerciseId : null;
      push("Ćwiczenie", exId ? byId[exId] : null);
      const restSeconds = isLocal ? snapshot.restSeconds : snapshot.rest_seconds;
      push("Przerwa", restSeconds != null ? `${restSeconds} s` : null);
      push("Superseria", isLocal ? snapshot.supersetGroup : snapshot.superset_group);
      break;
    }
    case "plan_item_sets":
      push("Cel", snapshot.target);
      push("RIR", formatRir(snapshot.rir) ?? snapshot.rir);
      break;
    case "workouts": {
      const date = isLocal ? snapshot.date : snapshot.workout_date;
      push("Data", date ? formatConflictDateShort(date) : null);
      push("Plan", isLocal ? snapshot.planName : snapshot.plan_name);
      push("Liczba ćwiczeń", isLocal ? snapshot.exercisesCount : snapshot.exercises_count);
      push("Liczba serii", isLocal ? snapshot.totalSets : snapshot.total_sets);
      push("Czas trwania", formatDurationShort(isLocal ? snapshot.durationSec : snapshot.duration_sec));
      break;
    }
    case "workout_exercises": {
      push("Nazwa", snapshot.name);
      const type = isLocal ? snapshot.type : snapshot.exercise_type;
      push("Typ", type === "time" ? "Czasowe" : type === "weight" ? "Siłowe" : type || null);
      break;
    }
    case "workout_sets": {
      push("Ciężar", snapshot.weight != null ? `${snapshot.weight} kg` : null);
      push("Powtórzenia", snapshot.reps);
      push("Czas", snapshot.duration);
      push("RIR", formatRir(snapshot.rir) ?? snapshot.rir);
      if (snapshot.done != null) push("Status", snapshot.done ? "Wykonana" : "Niewykonana");
      push("Notatka", snapshot.note);
      break;
    }
    case "measurements": {
      const date = isLocal ? snapshot.date : snapshot.measurement_date;
      push("Data pomiaru", date ? formatConflictDateShort(date) : null);
      const values = isLocal ? snapshot : snapshot.values && typeof snapshot.values === "object" ? snapshot.values : {};
      for (const [key, val] of Object.entries(values)) {
        if (key === "id" || key === "date") continue;
        push(key, typeof val === "object" && val !== null ? JSON.stringify(val) : val);
      }
      break;
    }
    case "custom_fields":
      push("Etykieta", snapshot.label);
      push("Jednostka", snapshot.unit);
      break;
    case "profile":
    case "profiles":
      push("Nazwa użytkownika", typeof snapshot === "string" ? snapshot : snapshot.display_name);
      break;
    default:
      break;
  }
  return fields;
}

// Which display labels differ between the two sides — used only to highlight rows, never to
// merge or pick a "better" value.
function getConflictFieldDiffs(table, conflict, exercisesById) {
  const localFields = conflict.localRecord ? formatConflictSnapshot(table, conflict.localRecord, "local", exercisesById) : [];
  const remoteFields = conflict.remoteRecord ? formatConflictSnapshot(table, conflict.remoteRecord, "remote", exercisesById) : [];
  const remoteByLabel = new Map(remoteFields.map((f) => [f.label, f.value]));
  const diffs = new Set();
  for (const f of localFields) {
    if (remoteByLabel.has(f.label) && String(remoteByLabel.get(f.label)) !== String(f.value)) diffs.add(f.label);
  }
  return diffs;
}

// The ONLY place the Conflict Center UI calls resolveConflict()/scheduleSync() — no separate
// versioning/queue/PUSH logic here, just: resolve, and if we're online, nudge the existing sync
// scheduler (never a direct Supabase write, never a second sync mechanism).
async function performConflictResolution(conflictId, choice, isOnline) {
  const result = await resolveConflict(conflictId, choice);
  if (result.success && isOnline) {
    scheduleSync();
  }
  return result;
}

// Compares two arrays of records (each identified by `idKey`, default "id") and returns which
// were added, changed, or removed. Records with a missing/null id are skipped entirely rather
// than guessed at — callers are expected to only pass arrays whose records already carry a
// stable identifier.
function diffById(prevArr, nextArr, idKey = "id") {
  const prevList = (Array.isArray(prevArr) ? prevArr : []).filter((r) => r && r[idKey] != null);
  const nextList = (Array.isArray(nextArr) ? nextArr : []).filter((r) => r && r[idKey] != null);
  const prevById = new Map(prevList.map((r) => [r[idKey], r]));
  const nextById = new Map(nextList.map((r) => [r[idKey], r]));
  const added = [];
  const updated = [];
  const removed = [];
  for (const [id, rec] of nextById) {
    const prevRec = prevById.get(id);
    if (!prevRec) added.push(rec);
    else if (JSON.stringify(prevRec) !== JSON.stringify(rec)) updated.push(rec);
  }
  for (const [id, rec] of prevById) {
    if (!nextById.has(id)) removed.push(rec);
  }
  const result = { added, updated, removed };
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[sync diag] diffById() called", {
    idKey,
    prevArr,
    nextArr,
    prevCountValid: prevList.length,
    nextCountValid: nextList.length,
    result,
  });
  return result;
}

// Turns a diffById() result into sync queue entries: upsert for added/updated, delete for
// removed, each with a freshly bumped per-record version and the current device id. Returns
// true if anything was actually enqueued, so callers can decide whether to call scheduleSync().
function queueChangesForDiff(table, diff, idKey = "id") {
  // TEMPORARY DIAGNOSTIC — zero behavior change, only logging.
  console.log("[sync diag] queueChangesForDiff() called", { table, idKey, diff });
  let any = false;
  for (const rec of [...diff.added, ...diff.updated]) {
    const version = bumpRecordVersion(table, rec[idKey]);
    console.log("[sync diag] queueChangesForDiff() enqueueing upsert", { table, recordId: rec[idKey], version });
    enqueueSyncChange({ table, recordId: rec[idKey], operation: "upsert", version, deviceId: getOrCreateDeviceId() });
    any = true;
  }
  for (const rec of diff.removed) {
    const version = bumpRecordVersion(table, rec[idKey]);
    console.log("[sync diag] queueChangesForDiff() enqueueing delete", { table, recordId: rec[idKey], version });
    enqueueSyncChange({ table, recordId: rec[idKey], operation: "delete", version, deviceId: getOrCreateDeviceId() });
    any = true;
  }
  console.log("[sync diag] queueChangesForDiff() returning", any);
  return any;
}


/* ---------------------------------------------------------------------- */
/* Local backup / snapshot system                                          */
/*                                                                           */
/* This is a device-local safety net only — never a cloud sync. It stores  */
/* its own list of snapshots under a separate key prefix (nextrep_backup_*)*/
/* and never reads or writes the trainapp_* keys except when explicitly    */
/* asked to restore one. The app's real data always lives in trainapp_*;   */
/* this layer only ever takes copies of it.                                */
/* ---------------------------------------------------------------------- */

