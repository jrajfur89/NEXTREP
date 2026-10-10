// The exact localStorage keys this stage syncs to the cloud — deliberately excludes
// nextrep_backup_* (local-only safety net) and proStatus/proHints/onboardingCompleted
// (not part of what was asked for at this stage).
// [field name inside user_data.data (unchanged, so existing cloud copies stay compatible),
//  local key in the ACTIVE namespace (resolved at call time)]
const CLOUD_SYNC_FIELDS = [
  ["trainapp_exercises_v1", () => STORAGE_KEYS.exercises],
  ["trainapp_plans_v1", () => STORAGE_KEYS.plans],
  ["trainapp_history_v1", () => STORAGE_KEYS.history],
  ["trainapp_measurements_v1", () => STORAGE_KEYS.measurements],
  ["trainapp_custom_fields_v1", () => STORAGE_KEYS.customFields],
  ["trainapp_user_name_v1", () => STORAGE_KEYS.userName],
];

// Returns { error: null } on success, or { error: "<message>" } on failure. Never throws.
async function saveDataToCloud() {
  if (!supabase) return { error: "Konta nie są jeszcze skonfigurowane." };

  let user;
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    user = data?.session?.user;
  } catch (e) {
    return { error: "Nie udało się sprawdzić sesji logowania." };
  }
  if (!user) return { error: "Musisz być zalogowany, aby zapisać dane w chmurze." };
  // Stage 4A.2: only this account's own workspace may ever be uploaded as its data.
  if (!isActiveNamespaceFor(user.id)) return { error: "Trwa wczytywanie danych konta — spróbuj ponownie za chwilę." };
  // Stage 4A.4 F-5 (Etap 8): a paused account sends NOTHING — also not this whole-data copy (e.g. device data
  // kept after the cloud data was accepted as incomplete, or device data next to other cloud data)
  const pausedMarker = getAccountInitMarker(user.id);
  if (pausedMarker && pausedMarker.syncPaused) return { error: "Synchronizacja tego konta jest wstrzymana, więc dane nie zostały wysłane do chmury. Nic nie zostało zmienione." };

  const payload = {};
  for (const [field, localKey] of CLOUD_SYNC_FIELDS) {
    payload[field] = await loadKey(localKey());
  }

  try {
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: user.id, data: payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e?.message || "Nie udało się zapisać danych w chmurze." };
  }
  return { error: null };
}

// Read-only preview fetch: pulls the signed-in person's row from `public.user_data` (RLS already
// restricts this to their own `user_id`, and the query filters on it explicitly too, belt and
// suspenders) and returns just the 6 synced keys from its `data` column. This NEVER writes to
// localStorage, never calls saveKey, and never touches app state — it only hands the caller the
// raw cloud data so it can be shown as a preview. Restoring it is a separate, later step.
// Returns { error: null, found: bool, data: {...} | null } — `data` is null when found is false.
// Stage 4A.3: LEGACY — no longer reachable from the UI (see AccountScreen); kept, unused, so the
// historical user_data rows stay readable. Cloud data is loaded only through source selection.
async function fetchDataFromCloud() {
  if (!supabase) return { error: "Konta nie są jeszcze skonfigurowane.", found: false, data: null };

  let user;
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    user = data?.session?.user;
  } catch (e) {
    return { error: "Nie udało się sprawdzić sesji logowania.", found: false, data: null };
  }
  if (!user) return { error: "Musisz być zalogowany, aby pobrać dane z chmury.", found: false, data: null };

  try {
    const { data: rows, error } = await supabase.from("user_data").select("data").eq("user_id", user.id).limit(1);
    if (error) return { error: error.message, found: false, data: null };
    if (!rows || !rows.length) return { error: null, found: false, data: null };

    const cloudData = rows[0].data || {};
    const preview = {};
    for (const [key] of CLOUD_SYNC_FIELDS) {
      preview[key] = key in cloudData ? cloudData[key] : null;
    }
    return { error: null, found: true, data: preview };
  } catch (e) {
    return { error: e?.message || "Nie udało się pobrać danych z chmury.", found: false, data: null };
  }
}

// Writes an already-fetched cloud preview (as returned by fetchDataFromCloud, held in the
// caller's `fetchedCloudData` state) into localStorage via the existing saveKey — never fetches
// anything itself, never touches nextrep_backup_*, proStatus, proHints, or onboardingCompleted.
// If a key is null or missing in the preview (the cloud simply never had it saved), that key is
// left untouched locally — a missing cloud value is never treated as "clear the local one".
// Returns { error: null, restoredKeys: string[] } — restoredKeys lists which of the 6 keys were
// actually written (i.e. had a non-null value to restore).
// Stage 4A.3: LEGACY — not reachable from the UI any more (it overwrote local data without a backup
// and outside source selection). Kept unused; do not wire it back without the 4A.3 guards.
async function restoreDataFromCloud(fetchedCloudData) {
  if (!fetchedCloudData) return { error: "Brak pobranych danych do przywrócenia.", restoredKeys: [] };

  const restoredKeys = [];
  try {
    for (const [key, localKey] of CLOUD_SYNC_FIELDS) {
      const value = fetchedCloudData[key];
      if (value === null || value === undefined) continue; // nothing to restore for this key — leave local value as-is
      await saveKey(localKey(), value);
      restoredKeys.push(key);
    }
  } catch (e) {
    return { error: e?.message || "Nie udało się przywrócić danych z chmury.", restoredKeys };
  }
  return { error: null, restoredKeys };
}

/* ---------------------------------------------------------------------- */
/* Migration V1 — one-time copy of local data into the target nextrep_*   */
/* tables. This is NOT the ongoing sync system (no queue, no realtime, no */
/* cross-device merge) — it only ever runs when the person taps the      */
/* button, and it only ever ADDS/UPDATES rows in Supabase; it never       */
/* touches localStorage, never touches nextrep_backup_*, and never        */
/* touches the existing user_data table or its functions.                 */
/* ---------------------------------------------------------------------- */

// getStorageKey("device_id"): scoped per namespace (Stage 4A.1) — see getStorageKey("device_id")
// getStorageKey("migration_v1_status"): scoped per namespace (Stage 4A.1) — see getStorageKey("migration_v1_status")

function newUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Extremely unlikely fallback path (very old browser) — still a usable random id, just not
  // a spec-perfect UUID. Only used if the Web Crypto API isn't available at all.
  return `${uid()}-${uid()}-${uid()}-${uid()}`;
}

// A stable per-installation id, generated once and kept in localStorage for the lifetime of
// this browser/install. Never regenerated on subsequent launches.
function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(getStorageKey("device_id"));
    if (id) return id;
    id = newUuid();
    localStorage.setItem(getStorageKey("device_id"), id);
    return id;
  } catch (e) {
    console.error("getOrCreateDeviceId failed", e);
    return null;
  }
}

function getMigrationStatus() {
  try {
    const raw = localStorage.getItem(getStorageKey("migration_v1_status"));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.status) return parsed;
    return { status: "not_started" };
  } catch {
    return { status: "not_started" };
  }
}

// Stage 4A.3: `userId` pins the write to the namespace the migration started in — a workspace switch
// while it runs must never redirect the status into another account's namespace.
function setMigrationStatus(status, extra = {}, userId) {
  try {
    localStorage.setItem(
      userId !== undefined ? getStorageKey("migration_v1_status", userId) : getStorageKey("migration_v1_status"),
      JSON.stringify({ status, updatedAt: new Date().toISOString(), ...extra })
    );
  } catch (e) {
    console.error("setMigrationStatus failed", e);
  }
}

// =====================================================================================
// nextrep_workout_identity_v1 — LOCAL identity migration for history (Etap 1)
//
// Every workout_exercise and every workout_set INSTANCE gets its own unique, stable id.
//   • existing correct ids are kept;
//   • exercise without id            → id = newUuid();
//   • set whose id is a setsDetail id (a plan template id, shared by every workout of that plan)
//                                     → detailId = old id, id = newUuid();
//   • set id repeated in more than one place (non-template) → first occurrence (history order) is
//     canonical and keeps it, every other occurrence → detailId = old id, id = newUuid();
//   • set already having detailId and a unique id → untouched.
// Never changes order, values, dates, analysis or exerciseId; never deletes/merges anything.
// Saved with saveKey() only: no sync queue, no version bump, no PUSH (invisible to sync).
//
// CLOUD GUARD (pending owner approval): sets already uploaded to Supabase are identified there by
// their current id (legacy_id). Re-identifying them locally without the Etap 2 cloud
// reconciliation would make the next PULL treat them as new and append duplicates (PULL/APPLY
// may not be changed in this stage). So for history that is already linked to the cloud the
// re-identification of EXISTING sets waits for Etap 2; local-only data is migrated now (and
// then uploads with unique ids). New workouts get unique set ids everywhere from now on.
// =====================================================================================
// getStorageKey("migration_workout_identity"): scoped per namespace (Stage 4A.1) — see getStorageKey("migration_workout_identity")

function getWorkoutIdentityMigrationStatus() {
  try {
    const raw = localStorage.getItem(getStorageKey("migration_workout_identity"));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.status) return parsed;
  } catch {}
  return { status: "not_started" };
}
function setWorkoutIdentityMigrationStatus(status, extra = {}) {
  try {
    const prev = getWorkoutIdentityMigrationStatus();
    localStorage.setItem(getStorageKey("migration_workout_identity"), JSON.stringify({ ...prev, status, updatedAt: new Date().toISOString(), ...extra }));
  } catch {}
}

// History already linked to Supabase: V1 migration ran (or is running), or the sync engine already
// tracks/queues workout records.
function isHistoryCloudLinked() {
  try {
    const v1 = getMigrationStatus();
    if (v1 && (v1.status === "completed" || v1.status === "in_progress" || v1.status === "verified")) return true; // F-5: "verified" = uploaded, awaiting the server's completed
    const meta = loadSyncMeta();
    if (Object.keys(meta).some((k) => /^workout(s|_exercises|_sets):/.test(k))) return true;
    if (loadSyncQueue().some((q) => /^workout/.test(q.table))) return true;
  } catch {}
  return false;
}

// Pure + deterministic: returns { history, changed, stats }. Never mutates its input.
// Stage 4A.4 (I-2): `reidentifyRepeatedExerciseIds` (default OFF — the start-up migration never uses
// it) gives every repeat of a workout-exercise id after its FIRST occurrence (history order) a new id.
// Only the upload preparation (prepareV1UploadDataset) turns it on: a repeated ex.id cannot be a cloud
// identity, and without it V1 would fall back to "<workoutId>-posN" rows (I-1).
function normalizeWorkoutIdentity(history, plans, { migrateExistingSets = true, reidentifyRepeatedExerciseIds = false } = {}) {
  const stats = { exercisesChanged: 0, setsChanged: 0, detailIdsCreated: 0, newUuids: 0, duplicateExerciseIds: 0 };
  if (!Array.isArray(history)) return { history, changed: false, stats };
  const templateIds = new Set();
  (Array.isArray(plans) ? plans : []).forEach((p) => (p && Array.isArray(p.exercises) ? p.exercises : []).forEach((it) => (it && Array.isArray(it.setsDetail) ? it.setsDetail : []).forEach((sd) => sd && sd.id != null && templateIds.add(String(sd.id)))));
  history.forEach((s) => (s && Array.isArray(s.exercises) ? s.exercises : []).forEach((ex) => (ex && Array.isArray(ex.setsDetail) ? ex.setsDetail : []).forEach((sd) => sd && sd.id != null && templateIds.add(String(sd.id)))));
  const setOccurrences = new Map();
  const exIdCount = new Map();
  history.forEach((s) => (s && Array.isArray(s.exercises) ? s.exercises : []).forEach((ex) => {
    if (ex && ex.id != null) exIdCount.set(String(ex.id), (exIdCount.get(String(ex.id)) || 0) + 1);
    (ex && Array.isArray(ex.sets) ? ex.sets : []).forEach((st) => st && st.id != null && setOccurrences.set(String(st.id), (setOccurrences.get(String(st.id)) || 0) + 1));
  }));
  stats.duplicateExerciseIds = [...exIdCount.values()].filter((n) => n > 1).length; // reported only — existing ids are never changed
  const seen = new Set();
  const seenExIds = new Set();
  let changed = false;
  const out = history.map((session) => {
    if (!session || !Array.isArray(session.exercises)) return session;
    let sessionChanged = false;
    const exercises = session.exercises.map((ex) => {
      if (!ex || typeof ex !== "object") return ex;
      let next = ex;
      if (ex.id == null || ex.id === "") {
        next = { ...next, id: newUuid() };
        stats.exercisesChanged++;
        stats.newUuids++;
      } else if (reidentifyRepeatedExerciseIds) {
        const exId = String(ex.id);
        if (seenExIds.has(exId)) {
          next = { ...next, id: newUuid() };
          stats.exercisesChanged++;
          stats.newUuids++;
        }
        seenExIds.add(exId);
      }
      if (migrateExistingSets && Array.isArray(ex.sets)) {
        let setsChanged = false;
        const sets = ex.sets.map((st) => {
          if (!st || typeof st !== "object") return st;
          const id = st.id != null ? String(st.id) : null;
          if (id == null || id === "") {
            setsChanged = true; stats.setsChanged++; stats.newUuids++;
            return { ...st, id: newUuid() };
          }
          const duplicated = (setOccurrences.get(id) || 0) > 1;
          const isFirst = !seen.has(id);
          seen.add(id);
          if (st.detailId != null && !(duplicated && !isFirst)) return st;            // already migrated
          if (st.detailId == null && templateIds.has(id)) {                            // template id → own instance id
            setsChanged = true; stats.setsChanged++; stats.detailIdsCreated++; stats.newUuids++;
            return { ...st, id: newUuid(), detailId: id };
          }
          if (duplicated && !isFirst) {                                                // repeated id → non-canonical copy
            setsChanged = true; stats.setsChanged++; stats.newUuids++;
            if (st.detailId == null) stats.detailIdsCreated++;
            return { ...st, id: newUuid(), detailId: st.detailId != null ? st.detailId : id };
          }
          return st;
        });
        if (setsChanged) next = { ...next, sets };
      }
      if (next !== ex) sessionChanged = true;
      return next;
    });
    if (!sessionChanged) return session;
    changed = true;
    return { ...session, exercises };
  });
  return { history: changed ? out : history, changed, stats };
}

// Runs at app start on the already-normalised history. Returns { history, ran, deferred, failed, stats }.
async function runWorkoutIdentityMigration(history, plans) {
  const status = getWorkoutIdentityMigrationStatus();
  const cloudLinked = isHistoryCloudLinked();
  const preview = normalizeWorkoutIdentity(history, plans, { migrateExistingSets: !cloudLinked });
  const base = { history, ran: false, deferred: false, failed: false, stats: preview.stats, cloudLinked };
  if (!preview.changed) {
    if (status.status !== "completed" && !cloudLinked) setWorkoutIdentityMigrationStatus("completed", { completedAt: new Date().toISOString(), stats: preview.stats, deferredReason: null });
    else if (cloudLinked && status.status === "not_started") setWorkoutIdentityMigrationStatus("not_started", { deferredReason: "cloud_linked_sets_wait_for_etap2" });
    return base;
  }
  if (loadActiveWorkoutDraft()) {
    setWorkoutIdentityMigrationStatus(status.status === "completed" ? "completed" : "not_started", { deferredReason: "active_workout_draft", deferredAt: new Date().toISOString() });
    return { ...base, deferred: true };
  }
  let backupId = status.backupId || null;
  if (!backupId) {
    const snap = createBackupSnapshot("before-migration", { force: true });
    if (!snap) {
      setWorkoutIdentityMigrationStatus("failed", { error: "backup_failed: nie udało się utworzyć kopii zapasowej przed migracją — historia nie została zmieniona" });
      return { ...base, failed: true };
    }
    backupId = snap.backupId;
  }
  setWorkoutIdentityMigrationStatus("in_progress", { backupId, startedAt: status.startedAt || new Date().toISOString(), deferredReason: null });
  try {
    await saveKey(STORAGE_KEYS.history, preview.history);
    // saveKey() swallows storage errors — verify by reading back before calling it completed
    if (localStorage.getItem(STORAGE_KEYS.history) !== JSON.stringify(preview.history)) throw new Error("zapis historii nie został potwierdzony (localStorage)");
  } catch (e) {
    setWorkoutIdentityMigrationStatus("failed", { backupId, error: `save_failed: ${e && e.message ? e.message : e}` });
    return { ...base, failed: true };
  }
  setWorkoutIdentityMigrationStatus(cloudLinked ? "not_started" : "completed", {
    backupId,
    completedAt: cloudLinked ? null : new Date().toISOString(),
    stats: preview.stats,
    deferredReason: cloudLinked ? "cloud_linked_sets_wait_for_etap2" : null,
    error: null,
  });
  return { ...base, history: preview.history, ran: true };
}

// Generic "find by (user_id, legacy_id), update if found, insert if not" — used for every table
// that carries a legacy_id. Never relies on a guessed unique-constraint name for upsert/
// onConflict; does an explicit select first so it works regardless of the exact constraints
// defined on the table, and is safe to call repeatedly (re-running finds the same row again).
async function upsertByLegacyId(table, userId, legacyId, rowData0, deviceId) {
  // Etap 11: never send null into a NOT NULL column that has a server default (idempotent with the builders)
  const rowData = sanitizeCloudRow(table, rowData0);
  // TEMPORARY DIAGNOSTIC ONLY — logs the lookup request and its outcome. Does not change control
  // flow, does not retry, does not alter the query itself in any way. The Supabase JS client does
  // not expose the raw fetch URL on its response object, so "request target" below is the LOGICAL
  // shape of the request (table + filters), reconstructed from the same values actually passed to
  // .from()/.eq() — not a captured raw URL, since the SDK doesn't surface one after the fact.
  const selectStartedAt = new Date().toISOString();
  console.log("[migration diag] SELECT (lookup existing) about to run", {
    table,
    userId,
    legacyId,
    requestTarget: { table, select: "id", filters: [["user_id", userId], ["legacy_id", legacyId]], limit: 1 },
    startedAt: selectStartedAt,
  });
  const selResponse = await v1Req(supabase.from(table).select("id"))
    .eq("user_id", userId)
    .eq("legacy_id", legacyId)
    .limit(1);
  const selectFinishedAt = new Date().toISOString();
  const selErrForLog = selResponse.error;
  // Classification, purely for the log — does not affect what gets thrown below:
  //   "network"  — the fetch() call itself never got a response (browser/OS-level failure);
  //                these never carry an HTTP status, and error.name is typically "TypeError".
  //   "http"     — Supabase/PostgREST answered with a non-2xx status; has a real status code and
  //                usually a Postgres-flavored error.code/details/hint.
  //   "unknown"  — an error exists but doesn't clearly match either shape above.
  let errorKind = null;
  if (selErrForLog) {
    const looksLikeNetworkFailure =
      (selErrForLog.name === "TypeError" || /failed to fetch/i.test(selErrForLog.message || "")) && selResponse.status == null;
    errorKind = looksLikeNetworkFailure ? "network" : selResponse.status != null ? "http" : "unknown";
  }
  console.log("[migration diag] SELECT (lookup existing) response", {
    table,
    userId,
    legacyId,
    startedAt: selectStartedAt,
    finishedAt: selectFinishedAt,
    error: selErrForLog,
    errorMessage: selErrForLog ? selErrForLog.message : null,
    errorName: selErrForLog ? selErrForLog.name : null,
    errorCode: selErrForLog ? selErrForLog.code : null,
    errorDetails: selErrForLog ? selErrForLog.details : null,
    errorHint: selErrForLog ? selErrForLog.hint : null,
    httpStatus: selResponse.status,
    httpStatusText: selResponse.statusText,
    errorKind, // "network" | "http" | "unknown" | null
  });
  const { data: existing, error: selErr } = selResponse;
  if (selErr) throw new Error(`${table}: odczyt istniejącego rekordu nie powiódł się — ${selErr.message}`);

  if (existing && existing.length) {
    // Deliberately does NOT touch device_id here: an existing record's device_id represents which
    // device originally created it, and re-running the migration (possibly from a different
    // device later) must never change that origin — only new records get the current device's id.
    const id = existing[0].id;
    // TEMPORARY DIAGNOSTIC ONLY — logs what is about to be sent and what came back. Does not
    // change control flow, does not add retry, does not touch rowData. Safe to leave in place
    // while investigating; produces no behavior difference either way.
    console.log("[migration diag] UPDATE about to run", {
      table,
      recordId: id,
      legacyId,
      userId,
      currentDeviceId: deviceId, // NOT sent on update by design — logged only for visibility
      versionSentByApp: "not set by app code — relies on DB default/trigger",
      payloadKeys: Object.keys(rowData),
      payload: rowData,
    });
    const updResponse = await v1Req(supabase.from(table).update(rowData)).eq("id", id);
    console.log("[migration diag] UPDATE response", {
      table,
      recordId: id,
      legacyId,
      error: updResponse.error ? { message: updResponse.error.message, code: updResponse.error.code, details: updResponse.error.details, hint: updResponse.error.hint } : null,
      status: updResponse.status,
      statusText: updResponse.statusText,
    });
    const { error: updErr } = updResponse;
    if (updErr) throw new Error(`${table}: aktualizacja rekordu nie powiodła się — ${updErr.message}`);
    return id;
  }

  const newId = newUuid();
  const insertRow = { id: newId, user_id: userId, legacy_id: legacyId, device_id: deviceId ?? null, ...rowData };
  // TEMPORARY DIAGNOSTIC ONLY — same as above, for the insert path.
  console.log("[migration diag] INSERT about to run", {
    table,
    newId,
    legacyId,
    userId,
    deviceId: deviceId ?? null,
    payloadKeys: Object.keys(insertRow),
    payload: insertRow,
  });
  const insResponse = await v1Req(supabase.from(table).insert(insertRow));
  console.log("[migration diag] INSERT response", {
    table,
    newId,
    legacyId,
    error: insResponse.error ? { message: insResponse.error.message, code: insResponse.error.code, details: insResponse.error.details, hint: insResponse.error.hint } : null,
    status: insResponse.status,
    statusText: insResponse.statusText,
  });
  const { error: insErr } = insResponse;
  if (insErr) throw new Error(`${table}: dodanie rekordu nie powiodło się — ${insErr.message}`);
  return newId;
}

// nextrep_custom_fields has NO legacy_id column (confirmed against the real schema) — field_key
// is its stable logical identifier instead, and the app already treats it that way (it's the
// same slug the rest of NEXTREP uses to reference a custom measurement field). This mirrors
// upsertByLegacyId exactly, just keyed on (user_id, field_key) rather than (user_id, legacy_id),
// and never issues `.eq("legacy_id", ...)` against this table.
async function upsertCustomFieldByKey(userId, fieldKey, rowData, deviceId) {
  const { data: existing, error: selErr } = await v1Req(supabase.from("nextrep_custom_fields").select("id"))
    .eq("user_id", userId)
    .eq("field_key", fieldKey)
    .limit(1);
  if (selErr) throw new Error(`nextrep_custom_fields: odczyt istniejącego rekordu nie powiódł się — ${selErr.message}`);

  if (existing && existing.length) {
    // Same principle as upsertByLegacyId: never touch device_id on update — preserves the
    // record's original device.
    const id = existing[0].id;
    const { error: updErr } = await v1Req(supabase.from("nextrep_custom_fields").update(rowData)).eq("id", id);
    if (updErr) throw new Error(`nextrep_custom_fields: aktualizacja rekordu nie powiodła się — ${updErr.message}`);
    return id;
  }

  const newId = newUuid();
  const { error: insErr } = await v1Req(supabase.from("nextrep_custom_fields").insert({ id: newId, user_id: userId, field_key: fieldKey, device_id: deviceId ?? null, ...rowData }));
  if (insErr) throw new Error(`nextrep_custom_fields: dodanie rekordu nie powiodło się — ${insErr.message}`);
  return newId;
}

// --- Pre-migration validation: shape-check only, never "fixes" anything silently. ---
async function validateLocalDataForMigration() {
  const [ex, pl, hi, me, cf, un] = await Promise.all([
    loadKey(STORAGE_KEYS.exercises),
    loadKey(STORAGE_KEYS.plans),
    loadKey(STORAGE_KEYS.history),
    loadKey(STORAGE_KEYS.measurements),
    loadKey(STORAGE_KEYS.customFields),
    loadKey(STORAGE_KEYS.userName),
  ]);
  const errors = [];
  if (ex !== null && !Array.isArray(ex)) errors.push("trainapp_exercises_v1: dane nie są tablicą.");
  if (pl !== null && !Array.isArray(pl)) errors.push("trainapp_plans_v1: dane nie są tablicą.");
  if (hi !== null && !Array.isArray(hi)) errors.push("trainapp_history_v1: dane nie są tablicą.");
  if (me !== null && !Array.isArray(me)) errors.push("trainapp_measurements_v1: dane nie są tablicą.");
  if (cf !== null && !Array.isArray(cf)) errors.push("trainapp_custom_fields_v1: dane nie są tablicą.");
  if (un !== null && typeof un !== "string") errors.push("trainapp_user_name_v1: nieprawidłowy format (oczekiwano tekstu).");

  (Array.isArray(pl) ? pl : []).forEach((p, i) => {
    if (!p || typeof p !== "object" || !p.id) errors.push(`trainapp_plans_v1[${i}]: brak wymaganego pola id.`);
  });
  (Array.isArray(hi) ? hi : []).forEach((s, i) => {
    if (!s || typeof s !== "object" || !s.id) errors.push(`trainapp_history_v1[${i}]: brak wymaganego pola id.`);
  });
  (Array.isArray(me) ? me : []).forEach((m, i) => {
    if (!m || typeof m !== "object" || !m.id) errors.push(`trainapp_measurements_v1[${i}]: brak wymaganego pola id.`);
  });

  return { errors, data: { exercises: ex || [], plans: pl || [], history: hi || [], measurements: me || [], customFields: cf || [], userName: un || "" } };
}

// =====================================================================================
// Stage 4A.4 Part 1 — I-2: identity integrity of the dataset V1 uploads.
// upsertByLegacyId finds a row by (user_id, legacy_id) and UPDATES it: two local records that end
// up with the same legacy_id in one table would silently move one cloud row between parents (a set
// under another workout, an item under another plan) — the cloud would hold fewer records than the
// device, and the old verification (legacy ids only) could still pass. The helpers below derive the
// legacy ids EXACTLY as the migrate*V1 functions write them; the gate refuses any repeat (fail closed,
// before the first cloud write). The upload paths (4A.3 device → empty cloud, 4A.4 guest → empty
// account) first prepare a normalised copy (prepareV1UploadDataset) so that real data passes.
// =====================================================================================
// Legacy ids of the workout exercises / sets of `historyList`, as migrateWorkoutsV1 writes them.
// Hotfix I-1: an ex.id is the cloud identity only if it is unique in this history; otherwise (or
// without an id) the historical "<workoutId>-posN" is used. Id-less sets use "<…-posN>-setM".
function v1WorkoutLegacyIds(historyList) {
  const wexIdCount = new Map();
  for (const s of historyList || []) for (const ex of (s && Array.isArray(s.exercises) ? s.exercises : [])) if (ex && ex.id != null && ex.id !== "") wexIdCount.set(String(ex.id), (wexIdCount.get(String(ex.id)) || 0) + 1);
  return {
    exercise(session, pos, wex) {
      const posLegacyId = `${String(session.id)}-pos${pos}`;
      const legacyId = wex && wex.id != null && wex.id !== "" && wexIdCount.get(String(wex.id)) === 1 ? String(wex.id) : posLegacyId;
      return { legacyId, posLegacyId };
    },
    set(posLegacyId, s, si) {
      return String(s.id != null ? s.id : `${posLegacyId}-set${si}`);
    },
  };
}
const v1PlanItemSetLegacyId = (itemLegacyId, s, i) => String(s && s.id != null ? s.id : `${itemLegacyId}-${i}`);

// Every legacy id V1 would write for `ds` ({ history, plans, measurements }), per table, with its
// parent. Returns the list of problems (empty = safe to upload).
function v1DatasetIntegrityIssues(ds) {
  const issues = [];
  const tally = (label) => {
    const counts = new Map();
    return {
      add(id) {
        counts.set(id, (counts.get(id) || 0) + 1);
      },
      report() {
        const repeated = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        if (repeated.length) issues.push({ table: label, repeated: repeated.slice(0, 10), count: repeated.length });
      },
    };
  };
  const history = Array.isArray(ds && ds.history) ? ds.history : [];
  const plans = Array.isArray(ds && ds.plans) ? ds.plans : [];
  const measurements = Array.isArray(ds && ds.measurements) ? ds.measurements : [];
  const workouts = tally("treningi");
  const wexs = tally("ćwiczenia treningów");
  const sets = tally("serie treningów");
  const ids = v1WorkoutLegacyIds(history);
  for (const session of history) {
    if (!session || session.id == null) continue;
    workouts.add(String(session.id));
    const exs = Array.isArray(session.exercises) ? session.exercises : [];
    exs.forEach((wex, pos) => {
      if (!wex) return;
      const { legacyId, posLegacyId } = ids.exercise(session, pos, wex);
      wexs.add(legacyId);
      (Array.isArray(wex.sets) ? wex.sets : []).forEach((s, si) => s && sets.add(ids.set(posLegacyId, s, si)));
    });
  }
  const planT = tally("plany");
  const items = tally("pozycje planów");
  const itemSets = tally("serie planów");
  for (const plan of plans) {
    if (!plan || plan.id == null) continue;
    planT.add(String(plan.id));
    for (const item of Array.isArray(plan.exercises) ? plan.exercises : []) {
      if (!item || item.id == null) continue;
      items.add(String(item.id));
      getPlanItemSetsDetail(item).forEach((s, i) => itemSets.add(v1PlanItemSetLegacyId(String(item.id), s, i)));
    }
  }
  const meas = tally("pomiary");
  for (const m of measurements) if (m && m.id != null) meas.add(String(m.id));
  [workouts, wexs, sets, planT, items, itemSets, meas].forEach((t) => t.report());
  return issues;
}
// Stage 4A.4 Part 2 (F-3, review P1): a SOFT-DELETED cloud row with the same identity as a record about to be
// uploaded. upsertByLegacyId would update that row without reviving it (deleted_at stays), the verification
// (live rows only) can then never pass and every retry fails after rows were written. So this is checked
// BEFORE the first cloud write; any collision stops the upload (tombstone vs live semantics = Stage 4A.5).
// Returns [{ table, count, sample }]; read errors throw (never "no collision" by guess).
async function v1DeletedRowCollisions(userId, ds, { migrationToken = null } = {}) {
  const keys = {
    exercises: new Set(), plans: new Set(), plan_items: new Set(), plan_item_sets: new Set(), workouts: new Set(),
    workout_exercises: new Set(), workout_sets: new Set(), measurements: new Set(), custom_fields: new Set(),
  };
  for (const e of Array.isArray(ds.exercises) ? ds.exercises : []) if (e && e.id != null) keys.exercises.add(String(e.id));
  for (const plan of Array.isArray(ds.plans) ? ds.plans : []) {
    if (!plan || plan.id == null) continue;
    keys.plans.add(String(plan.id));
    for (const item of Array.isArray(plan.exercises) ? plan.exercises : []) {
      if (!item || item.id == null) continue;
      keys.plan_items.add(String(item.id));
      getPlanItemSetsDetail(item).forEach((sd, i) => keys.plan_item_sets.add(v1PlanItemSetLegacyId(String(item.id), sd, i)));
    }
  }
  const history = Array.isArray(ds.history) ? ds.history : [];
  const ids = v1WorkoutLegacyIds(history);
  for (const session of history) {
    if (!session || session.id == null) continue;
    keys.workouts.add(String(session.id));
    (Array.isArray(session.exercises) ? session.exercises : []).forEach((wex, pos) => {
      if (!wex) return;
      const { legacyId, posLegacyId } = ids.exercise(session, pos, wex);
      keys.workout_exercises.add(legacyId);
      (Array.isArray(wex.sets) ? wex.sets : []).forEach((st, si) => st && keys.workout_sets.add(ids.set(posLegacyId, st, si)));
    });
  }
  for (const m of Array.isArray(ds.measurements) ? ds.measurements : []) if (m && m.id != null) keys.measurements.add(String(m.id));
  for (const f of Array.isArray(ds.customFields) ? ds.customFields : []) if (f && f.key) keys.custom_fields.add(String(f.key));
  const out = [];
  for (const [table, set] of Object.entries(keys)) {
    if (!set.size) continue;
    const remote = await fetchRemoteTable(table, userId, { migrationToken });
    const keyOf = (r) => String(table === "custom_fields" ? r.field_key : r.legacy_id);
    const hits = remote.filter((r) => r && !isLiveRemoteRow(r) && set.has(keyOf(r))).map(keyOf);
    if (hits.length) out.push({ table, count: hits.length, sample: hits.slice(0, 5) });
  }
  return out;
}
const DELETED_COLLISION_TEXT =
  "W chmurze tego konta są wcześniej usunięte rekordy o tych samych identyfikatorach co dane do wysłania (np. usunięte ćwiczenie lub parametr pomiaru). Takich danych nie można bezpiecznie wysłać bez łączenia — to osobny, kolejny etap. Nic nie zostało wysłane ani zmienione.";
function v1IntegrityIssuesText(issues) {
  const what = issues.map((i) => `${i.table} (${i.count})`).join(", ");
  return `Dane mają powtórzone identyfikatory (${what}), więc nie można ich bezpiecznie wysłać. Nic nie zostało wysłane do chmury.`;
}

// Upload preparation (4A.3 / 4A.4): a NORMALISED COPY of `ds` — never mutates the input. Keeps order,
// values, dates, exerciseId and plan links; only technical ids change:
//   • history: normalizeWorkoutIdentity with set re-identification ON (template / repeated set ids →
//     own id, old id kept as detailId) and repeated ex.id → new id after its first occurrence; an
//     exercise without an id gets one (so no new "-posN" row is ever created);
//   • plans: an item without an id gets one; a repeated item id or setsDetail id (after its first
//     occurrence, across all plans) gets a new one.
// Idempotent: a prepared dataset prepares to itself (changed = false). Workouts / plans / measurements
// without an id are NOT invented here — validation refuses them.
function prepareV1UploadDataset(ds) {
  const src = ds || {};
  const history0 = Array.isArray(src.history) ? src.history : [];
  const plans0 = Array.isArray(src.plans) ? src.plans : [];
  const hist = normalizeWorkoutIdentity(history0, plans0, { migrateExistingSets: true, reidentifyRepeatedExerciseIds: true });
  let plansChanged = false;
  // pass 1: plan item ids (missing / repeated after the first occurrence → new id)
  const seenItems = new Set();
  const plansWithItemIds = plans0.map((plan) => {
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.exercises)) return plan;
    let changedPlan = false;
    const exercises = plan.exercises.map((item) => {
      if (!item || typeof item !== "object") return item;
      if (item.id == null || item.id === "" || seenItems.has(String(item.id))) {
        changedPlan = true;
        const fresh = { ...item, id: newUuid() };
        seenItems.add(String(fresh.id));
        return fresh;
      }
      seenItems.add(String(item.id));
      return item;
    });
    return changedPlan ? { ...plan, exercises } : plan;
  });
  // pass 2: plan item set ids. The ids V1 synthesizes for items without setsDetail ("<item>-<i>") are
  // fixed, so they are reserved first (independent of plan order); an explicit setsDetail id that repeats
  // — or equals a reserved one — gets a new id.
  const isExplicit = (item) => item && typeof item === "object" && Array.isArray(item.setsDetail) && item.setsDetail.length > 0;
  const seenItemSets = new Set();
  for (const plan of plansWithItemIds) {
    for (const item of plan && Array.isArray(plan.exercises) ? plan.exercises : []) {
      if (item && typeof item === "object" && !isExplicit(item)) getPlanItemSetsDetail(item).forEach((sd, i) => seenItemSets.add(v1PlanItemSetLegacyId(String(item.id), sd, i)));
    }
  }
  const plans = plansWithItemIds.map((plan, pi) => {
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.exercises)) return plan;
    let changedPlan = plan !== plans0[pi];
    const exercises = plan.exercises.map((item) => {
      if (!isExplicit(item)) return item;
      let setsChanged = false;
      const setsDetail = item.setsDetail.map((sd, i) => {
        if (!sd || typeof sd !== "object") return sd;
        const lid = v1PlanItemSetLegacyId(String(item.id), sd, i);
        if (seenItemSets.has(lid)) {
          setsChanged = true;
          const fresh = { ...sd, id: newUuid() };
          seenItemSets.add(String(fresh.id));
          return fresh;
        }
        seenItemSets.add(lid);
        return sd;
      });
      if (!setsChanged) return item;
      changedPlan = true;
      return { ...item, setsDetail };
    });
    if (!changedPlan) return plan;
    plansChanged = true;
    return { ...plan, exercises };
  });
  const dataset = { ...src, history: hist.changed ? hist.history : history0, plans: plansChanged ? plans : plans0 };
  return { dataset, changed: hist.changed || plansChanged, historyChanged: hist.changed, plansChanged, stats: hist.stats };
}

// --- Per-collection migration functions. Each returns a map of old id -> new Supabase uuid. ---

async function migrateExercisesV1(userId, exercisesList, deviceId, beforeEachRow = null) {
  const idMap = {};
  for (const ex of exercisesList) {
    if (!ex || ex.id == null) continue;
    if (beforeEachRow) await beforeEachRow(); // Stage 4A.4: periodic session re-check (V1 upload)
    const legacyId = String(ex.id);
    const row = {
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
    idMap[legacyId] = await upsertByLegacyId("nextrep_exercises", userId, legacyId, row, deviceId);
  }
  return idMap;
}

async function migratePlansV1(userId, plansList, exerciseIdMap, deviceId, beforeEachRow = null) {
  const planIdMap = {};
  const planItemIdMap = {};
  for (const plan of plansList) {
    if (!plan || plan.id == null) continue;
    const planLegacyId = String(plan.id);
    const planId = await upsertByLegacyId("nextrep_plans", userId, planLegacyId, { name: plan.name || "" }, deviceId);
    planIdMap[planLegacyId] = planId;

    const items = Array.isArray(plan.exercises) ? plan.exercises : [];
    for (const item of items) {
      if (!item || item.id == null) continue;
      if (beforeEachRow) await beforeEachRow(); // Stage 4A.4: periodic session re-check (V1 upload)
      const itemLegacyId = String(item.id);
      const mappedExerciseId = item.exerciseId != null ? exerciseIdMap[String(item.exerciseId)] || null : null;
      // Etap 11: the same row the sync engine writes (rest_seconds left out when the item has none)
      const itemRow = buildPlanItemPayload(item, planId, mappedExerciseId);
      const planItemId = await upsertByLegacyId("nextrep_plan_items", userId, itemLegacyId, itemRow, deviceId);
      planItemIdMap[itemLegacyId] = planItemId;

      // setsDetail is the real source of truth; targetSets/targetReps are a legacy fallback the
      // app itself still uses (getPlanItemSetsDetail) when setsDetail is empty on old plans —
      // reusing that exact function here means a plan item never silently migrates with zero
      // series just because it predates setsDetail. This produces deterministic legacy ids
      // (based on the item's own id + index) so re-running the migration never duplicates them.
      const effectiveSets = getPlanItemSetsDetail(item);
      for (let i = 0; i < effectiveSets.length; i++) {
        const s = effectiveSets[i];
        const setLegacyId = v1PlanItemSetLegacyId(itemLegacyId, s, i);
        await upsertByLegacyId(
          "nextrep_plan_item_sets",
          userId,
          setLegacyId,
          {
            plan_item_id: planItemId,
            target: s.target || "",
            rir: s.rir || "",
          },
          deviceId
        );
      }
    }
  }
  return { planIdMap, planItemIdMap };
}

// Hotfix I-1 — backward compatibility: an older V1 run stored this workout exercise under
// "<workoutLegacyId>-posN". When the canonical row (legacy_id = ex.id) does not exist yet, that ONE
// historical row is re-keyed to ex.id (same row uuid, so its workout_sets stay attached) instead of a
// second row being created next to it. Only when it is unambiguous: exactly one such row, in the same
// workout and pointing at the same exercise. A canonical row that already exists wins and the
// historical row is left untouched; nothing is ever deleted here. Read errors throw (no guessing).
async function adoptV1PosWorkoutExercise(userId, canonicalLegacyId, posLegacyId, workoutId, mappedExerciseId) {
  const table = "nextrep_workout_exercises";
  const { data: canonical, error: canErr } = await v1Req(supabase.from(table).select("id")).eq("user_id", userId).eq("legacy_id", canonicalLegacyId).limit(1);
  if (canErr) throw new Error(`${table}: odczyt istniejącego rekordu nie powiódł się — ${canErr.message}`);
  if (canonical && canonical.length) return;
  const { data: old, error: oldErr } = await v1Req(supabase.from(table).select("id, workout_id, exercise_id")).eq("user_id", userId).eq("legacy_id", posLegacyId).limit(2);
  if (oldErr) throw new Error(`${table}: odczyt istniejącego rekordu nie powiódł się — ${oldErr.message}`);
  if (!old || old.length !== 1) return;
  const row = old[0];
  if (row.workout_id !== workoutId || (row.exercise_id ?? null) !== (mappedExerciseId ?? null)) return;
  const { error: updErr } = await v1Req(supabase.from(table).update({ legacy_id: canonicalLegacyId })).eq("id", row.id).eq("user_id", userId);
  if (updErr) throw new Error(`${table}: aktualizacja rekordu nie powiodła się — ${updErr.message}`);
}

async function migrateWorkoutsV1(userId, historyList, exerciseIdMap, planIdMap, deviceId, beforeEachWorkout = null) {
  const workoutIdMap = {};
  // Hotfix I-1: an ex.id is a usable identity only if it is unique in this history (old data may repeat
  // one across sessions — normalizeWorkoutIdentity only reports that); a repeated one keeps the old
  // "-posN" id, so one cloud row is never moved between workouts. Stage 4A.4: the derivation lives in
  // v1WorkoutLegacyIds, shared with the integrity gate and the verification.
  const legacyIds = v1WorkoutLegacyIds(historyList);
  for (const session of historyList) {
    if (!session || session.id == null) continue;
    if (beforeEachWorkout) await beforeEachWorkout(); // Stage 4A.4: session re-check per workout (V1 upload)
    const workoutLegacyId = String(session.id);
    const mappedPlanId = session.planId != null ? planIdMap[String(session.planId)] || null : null;
    // Etap 11: the same row the sync engine writes (summaries without a value left out)
    const workoutRow = buildWorkoutPayload(session, mappedPlanId);
    const workoutId = await upsertByLegacyId("nextrep_workouts", userId, workoutLegacyId, workoutRow, deviceId);
    workoutIdMap[workoutLegacyId] = workoutId;

    const exs = Array.isArray(session.exercises) ? session.exercises : [];
    for (let pos = 0; pos < exs.length; pos++) {
      const wex = exs[pos];
      if (!wex) continue;
      // Hotfix I-1: the identity of a workout exercise is its stable local session.exercises[].id —
      // the same legacy_id the sync engine pushes and matches on PULL. The old deterministic
      // "<workoutLegacyId>-posN" is only the fallback for an exercise without an id, and remains the
      // base of the legacy ids of id-less sets below (unchanged, so existing set rows keep theirs).
      const { legacyId: wexLegacyId, posLegacyId: wexPosLegacyId } = legacyIds.exercise(session, pos, wex);
      const mappedExerciseId = wex.exerciseId != null ? exerciseIdMap[String(wex.exerciseId)] || null : null;
      const wexRow = {
        workout_id: workoutId,
        exercise_id: mappedExerciseId,
        position: pos,
        name: wex.name || "",
        exercise_type: wex.type || "",
        sets_detail: Array.isArray(wex.setsDetail) ? wex.setsDetail : [],
      };
      if (wexLegacyId !== wexPosLegacyId) await adoptV1PosWorkoutExercise(userId, wexLegacyId, wexPosLegacyId, workoutId, mappedExerciseId);
      const workoutExerciseId = await upsertByLegacyId("nextrep_workout_exercises", userId, wexLegacyId, wexRow, deviceId);

      const sets = Array.isArray(wex.sets) ? wex.sets : [];
      for (let si = 0; si < sets.length; si++) {
        const s = sets[si];
        if (!s) continue;
        const setLegacyId = legacyIds.set(wexPosLegacyId, s, si);
        // Etap 11: the same row the sync engine writes. The TEXT columns (reps, duration, speed, incline,
        // distance, kcal, resistance, pace, level, floors, heart_rate) keep the text as entered — the old
        // Number(...) here turned e.g. a pace "5:30" into null (lost in the cloud, and the sync comparison then
        // saw the cloud as different from the device).
        await upsertByLegacyId("nextrep_workout_sets", userId, setLegacyId, buildWorkoutSetPayload(s, workoutExerciseId, si), deviceId);
      }
    }
  }
  return workoutIdMap;
}

async function migrateMeasurementsV1(userId, measurementsList, deviceId) {
  let count = 0;
  for (const m of measurementsList) {
    if (!m || m.id == null) continue;
    const legacyId = String(m.id);
    const { id, date, ...rest } = m;
    await upsertByLegacyId(
      "nextrep_measurements",
      userId,
      legacyId,
      {
        measurement_date: date || null,
        values: rest,
      },
      deviceId
    );
    count++;
  }
  return count;
}

async function migrateCustomFieldsV1(userId, customFieldsList, deviceId) {
  let count = 0;
  for (const f of customFieldsList) {
    if (!f || !f.key) continue;
    // nextrep_custom_fields has no legacy_id column — uses field_key as its stable identifier.
    await upsertCustomFieldByKey(
      userId,
      String(f.key),
      {
        label: f.label || "",
        unit: f.unit || "",
      },
      deviceId
    );
    count++;
  }
  return count;
}

async function migrateProfileV1(userId, displayName) {
  const { data: existing, error: selErr } = await v1Req(supabase.from("nextrep_profiles").select("user_id")).eq("user_id", userId).limit(1);
  if (selErr) throw new Error(`nextrep_profiles: odczyt nie powiódł się — ${selErr.message}`);
  if (existing && existing.length) {
    const { error: updErr } = await v1Req(supabase.from("nextrep_profiles").update({ display_name: displayName || "" })).eq("user_id", userId);
    if (updErr) throw new Error(`nextrep_profiles: aktualizacja nie powiodła się — ${updErr.message}`);
    return userId;
  }
  const { error: insErr } = await v1Req(supabase.from("nextrep_profiles").insert({ user_id: userId, display_name: displayName || "" }));
  if (insErr) throw new Error(`nextrep_profiles: dodanie nie powiodło się — ${insErr.message}`);
  return userId;
}

// Best-effort only: the exact columns of nextrep_devices were not specified, so this is not
// allowed to fail the whole migration if the schema doesn't match this guess. Any error here is
// caught by the caller and surfaced as a warning, not a migration failure.
async function migrateDeviceV1(userId, deviceId) {
  const { data: existing, error: selErr } = await supabase.from("nextrep_devices").select("id").eq("user_id", userId).eq("id", deviceId).limit(1);
  if (selErr) throw selErr;
  if (existing && existing.length) return existing[0].id;
  const { error: insErr } = await supabase.from("nextrep_devices").insert({ id: deviceId, user_id: userId });
  if (insErr) throw insErr;
  return deviceId;
}

// The 9 data tables covered by migration V1 — used by both the repair step and the extended
// verification step below, so the two always agree on exactly which tables are in scope.
const MIGRATION_V1_TABLES = [
  "nextrep_exercises",
  "nextrep_plans",
  "nextrep_plan_items",
  "nextrep_plan_item_sets",
  "nextrep_workouts",
  "nextrep_workout_exercises",
  "nextrep_workout_sets",
  "nextrep_measurements",
  "nextrep_custom_fields",
];

// Fixes records that were migrated before device_id started being written (the bug found via the
// earlier verification report). This is a plain UPDATE, scoped by `.is("device_id", null)` — it
// can only ever touch rows that currently have no device_id at all, so it can never overwrite a
// record's real origin, and because it only ever updates (never inserts) it can never create a
// duplicate. Running it again after everything is already filled in is a safe no-op: the `.is()`
// filter simply matches zero rows on the second run. Only ever acts on the given (already
// authenticated) userId's own rows.
async function repairMissingDeviceIdsV1(userId, deviceId) {
  const results = {};
  for (const table of MIGRATION_V1_TABLES) {
    const { error } = await v1Req(supabase.from(table).update({ device_id: deviceId })).eq("user_id", userId).is("device_id", null);
    if (error) throw new Error(`${table}: naprawa brakującego device_id nie powiodła się — ${error.message}`);
    results[table] = true;
  }
  return results;
}

// Stage 4A.4 Part 2 (F-3): a row is live when it is not soft-deleted. Verification only — tombstone
// semantics between two existing data sets belong to Stage 4A.5.
const isLiveRemoteRow = (r) => !!r && (r.deleted_at === null || r.deleted_at === undefined);
// --- Post-migration verification: compares LOCAL counts to REMOTE counts, per table. ---
async function verifyMigrationV1(userId, localEligible, deviceId) {
  // Existence check, not a totals check: for each table, does every legacy_id (or, for
  // customFields, every field_key) this device's eligible local records carry actually exist
  // among that table's remote rows for this user? Extra remote rows (from another device, or an
  // earlier test run) are explicitly fine and are never treated as a problem — only a local
  // record that's genuinely absent remotely blocks `completed`. Read-only throughout: only ever
  // SELECT, never insert/update/delete.
  const results = {};
  // Stage 4A.3: the remote rows are read with fetchRemoteTable (paginated, same user filter, stable
  // order, any page error = whole read fails) — a single response is capped at 1000 rows, which made
  // bigger accounts fail verification. What is compared did not change.
  const readAll = async (pullTable, table) => {
    try {
      return await fetchRemoteTable(pullTable, userId, { migrationToken: _v1MigrationToken });
    } catch (e) {
      throw new Error(`${table}: odczyt rekordów zdalnych nie powiódł się — ${(e && e.message) || e}`);
    }
  };
  const tableMap = [
    ["exercises", "nextrep_exercises", (x) => String(x.id), "exercises"],
    ["plans", "nextrep_plans", (x) => String(x.id), "plans"],
    ["history", "nextrep_workouts", (x) => String(x.id), "workouts"],
    ["measurements", "nextrep_measurements", (x) => String(x.id), "measurements"],
  ];

  const remoteRowsByKey = {};
  for (const [localKey, table, legacyIdOf, pullTable] of tableMap) {
    const localItems = localEligible[localKey] || [];
    const localLegacyIds = localItems.map(legacyIdOf);

    const remoteRows = await readAll(pullTable, table);
    remoteRowsByKey[localKey] = remoteRows;
    const count = remoteRows.length;

    // Stage 4A.4 Part 2 (F-3): a soft-deleted cloud row (deleted_at set) never counts as the live local record
    const remoteLegacyIds = new Set((remoteRows || []).filter(isLiveRemoteRow).map((r) => r.legacy_id));
    const missing = localLegacyIds.filter((lid) => !remoteLegacyIds.has(lid));

    results[localKey] = {
      table,
      localEligibleCount: localLegacyIds.length,
      remoteCount: count ?? (remoteRows ? remoteRows.length : 0),
      localRecordsFoundInRemote: localLegacyIds.length - missing.length,
      localRecordsMissingInRemote: missing.length,
      missingLegacyIdsSample: missing.slice(0, 10),
      allFound: missing.length === 0,
    };
  }

  // nextrep_custom_fields has no legacy_id column — field_key is its identifier instead, so this
  // table gets its own existence check rather than sharing the generic loop above. Same
  // existence-based logic, extra remote rows still never block completion.
  {
    const localItems = localEligible.customFields || [];
    const localFieldKeys = localItems.map((f) => String(f.key));

    const remoteRows = await readAll("custom_fields", "nextrep_custom_fields");
    const count = remoteRows.length;

    const remoteFieldKeys = new Set((remoteRows || []).filter(isLiveRemoteRow).map((r) => r.field_key)); // F-3
    const missing = localFieldKeys.filter((k) => !remoteFieldKeys.has(k));

    results.customFields = {
      table: "nextrep_custom_fields",
      localEligibleCount: localFieldKeys.length,
      remoteCount: count ?? (remoteRows ? remoteRows.length : 0),
      localRecordsFoundInRemote: localFieldKeys.length - missing.length,
      localRecordsMissingInRemote: missing.length,
      missingFieldKeysSample: missing.slice(0, 10),
      allFound: missing.length === 0,
    };
  }

  // Stage 4A.4 Part 1 (I-2): the child tables. A child counts as found only when a remote row with its
  // legacy id hangs under the remote row of its OWN parent (parent identity, not just existence): a set
  // that exists but sits under another workout exercise — or a plan item set under another item — is
  // missing. Legacy ids are derived exactly as V1 writes them (v1WorkoutLegacyIds / v1PlanItemSetLegacyId).
  {
    const byLegacy = (rows) => {
      const m = new Map();
      for (const r of rows || []) {
        if (!r || r.legacy_id == null || !isLiveRemoteRow(r)) continue; // F-3: only live rows (and live parents)
        const k = String(r.legacy_id);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(r);
      }
      return m;
    };
    // remote row ids of the parent with legacy id `parentLegacyId`
    const parentIds = (m, parentLegacyId) => new Set((m.get(String(parentLegacyId)) || []).map((r) => r.id));
    const rowUnder = (m, legacyId, parentCol, parentIdSet) => (m.get(String(legacyId)) || []).some((r) => parentIdSet.has(r[parentCol]));
    const childResult = (table, expected) => {
      const missing = expected.filter((e) => !e.found).map((e) => e.legacyId);
      return {
        table,
        localEligibleCount: expected.length,
        localRecordsFoundInRemote: expected.length - missing.length,
        localRecordsMissingInRemote: missing.length,
        missingLegacyIdsSample: missing.slice(0, 10),
        allFound: missing.length === 0,
      };
    };
    const workoutsM = byLegacy(remoteRowsByKey.history);
    const wexM = byLegacy(await readAll("workout_exercises", "nextrep_workout_exercises"));
    const setM = byLegacy(await readAll("workout_sets", "nextrep_workout_sets"));
    const history = localEligible.history || [];
    const ids = v1WorkoutLegacyIds(history);
    const wexExpected = [];
    const setExpected = [];
    for (const session of history) {
      const workoutRowIds = parentIds(workoutsM, String(session.id));
      (Array.isArray(session.exercises) ? session.exercises : []).forEach((wex, pos) => {
        if (!wex) return;
        const { legacyId, posLegacyId } = ids.exercise(session, pos, wex);
        wexExpected.push({ legacyId, found: rowUnder(wexM, legacyId, "workout_id", workoutRowIds) });
        const wexRowIds = new Set((wexM.get(legacyId) || []).filter((r) => workoutRowIds.has(r.workout_id)).map((r) => r.id));
        (Array.isArray(wex.sets) ? wex.sets : []).forEach((s, si) => {
          if (!s) return;
          const setLegacyId = ids.set(posLegacyId, s, si);
          setExpected.push({ legacyId: setLegacyId, found: rowUnder(setM, setLegacyId, "workout_exercise_id", wexRowIds) });
        });
      });
    }
    results.workoutExercises = childResult("nextrep_workout_exercises", wexExpected);
    results.workoutSets = childResult("nextrep_workout_sets", setExpected);

    const plansM = byLegacy(remoteRowsByKey.plans);
    const itemM = byLegacy(await readAll("plan_items", "nextrep_plan_items"));
    const itemSetM = byLegacy(await readAll("plan_item_sets", "nextrep_plan_item_sets"));
    const itemExpected = [];
    const itemSetExpected = [];
    for (const plan of localEligible.plans || []) {
      const planRowIds = parentIds(plansM, String(plan.id));
      for (const item of Array.isArray(plan.exercises) ? plan.exercises : []) {
        if (!item || item.id == null) continue;
        const itemLegacyId = String(item.id);
        itemExpected.push({ legacyId: itemLegacyId, found: rowUnder(itemM, itemLegacyId, "plan_id", planRowIds) });
        const itemRowIds = new Set((itemM.get(itemLegacyId) || []).filter((r) => planRowIds.has(r.plan_id)).map((r) => r.id));
        getPlanItemSetsDetail(item).forEach((s, i) => {
          const lid = v1PlanItemSetLegacyId(itemLegacyId, s, i);
          itemSetExpected.push({ legacyId: lid, found: rowUnder(itemSetM, lid, "plan_item_id", itemRowIds) });
        });
      }
    }
    results.planItems = childResult("nextrep_plan_items", itemExpected);
    results.planItemSets = childResult("nextrep_plan_item_sets", itemSetExpected);
  }

  // device_id / version integrity, across all 9 tables covered by migration V1. Missing
  // device_id or version is always a real problem (the repair step above should have already
  // fixed every NULL device_id) and blocks `completed`. A device_id that's simply different from
  // the CURRENT device is expected once more than one device has ever touched this account's data
  // — it's surfaced as information only, and never blocks `completed`.
  const deviceChecks = {};
  for (const table of MIGRATION_V1_TABLES) {
    const { count: missingDeviceId, error: devErr } = await v1Req(supabase.from(table).select("id", { count: "exact", head: true }))
      .eq("user_id", userId)
      .is("device_id", null);
    if (devErr) throw new Error(`${table}: sprawdzenie brakującego device_id nie powiodło się — ${devErr.message}`);

    const { count: missingVersion, error: verErr } = await v1Req(supabase.from(table).select("id", { count: "exact", head: true }))
      .eq("user_id", userId)
      .is("version", null);
    if (verErr) throw new Error(`${table}: sprawdzenie brakującej version nie powiodło się — ${verErr.message}`);

    let mismatchedDeviceId = 0;
    if (deviceId) {
      const { count, error: misErr } = await v1Req(supabase.from(table).select("id", { count: "exact", head: true }))
        .eq("user_id", userId)
        .not("device_id", "is", null)
        .neq("device_id", deviceId);
      if (misErr) throw new Error(`${table}: sprawdzenie niezgodnego device_id nie powiodło się — ${misErr.message}`);
      mismatchedDeviceId = count ?? 0;
    }

    deviceChecks[table] = {
      missingDeviceId: missingDeviceId ?? 0,
      missingVersion: missingVersion ?? 0,
      mismatchedDeviceId, // informational only — never blocks `completed`
    };
  }

  return { results, deviceChecks };
}

async function runMigrationV1(onProgress) {
  if (!supabase) return { success: false, error: "Konta nie są jeszcze skonfigurowane." };

  let user;
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    user = data?.session?.user;
  } catch (e) {
    return { success: false, error: "Nie udało się sprawdzić sesji logowania." };
  }
  if (!user) return { success: false, error: "Musisz być zalogowany, aby przenieść dane do konta." };
  // Stage 4A.3: the local data read below must be THIS account's namespace, and every status write
  // stays in it (statusUserId) even if the active workspace changes while the upload runs. Cloud rows
  // are written for user.id only (and RLS rejects them under another session).
  if (!isActiveNamespaceFor(user.id)) return { success: false, error: "Trwa wczytywanie danych konta — spróbuj ponownie za chwilę." };
  const statusUserId = user.id;

  setMigrationStatus("in_progress", {}, statusUserId);
  onProgress?.("preparing");

  const { errors: validationErrors, data: local } = await validateLocalDataForMigration();
  if (validationErrors.length) {
    setMigrationStatus("failed", { error: validationErrors.join(" ") }, statusUserId);
    return { success: false, error: `Dane lokalne są uszkodzone: ${validationErrors.join(" ")}` };
  }
  // Stage 4A.4 Part 1 (I-2): repeated identities would make upsertByLegacyId move one cloud row
  // between parents. Refused here — after validation, before the device row and before ANY cloud write.
  const integrityIssues = v1DatasetIntegrityIssues(local);
  if (integrityIssues.length) {
    const msg = v1IntegrityIssuesText(integrityIssues);
    setMigrationStatus("failed", { error: msg, integrityIssues }, statusUserId);
    return { success: false, error: msg, integrityIssues };
  }
  // Etap 11: values the cloud would refuse and that cannot be repaired → refused before ANY cloud write
  const dataBlockers = cloudUploadBlockers(local);
  if (dataBlockers.length) {
    const msg = cloudUploadBlockersText(dataBlockers);
    setMigrationStatus("failed", { error: msg, dataBlockers }, statusUserId);
    return { success: false, error: msg, dataBlockers };
  }

  const deviceId = getOrCreateDeviceId();
  if (!isActiveNamespaceFor(statusUserId)) {
    // the workspace changed while the local data was read — nothing has been sent
    setMigrationStatus("failed", { error: "Zmiana konta w trakcie przygotowania migracji." }, statusUserId);
    return { success: false, error: "Trwa wczytywanie danych konta — spróbuj ponownie za chwilę." };
  }

  try {
    // Moved to run FIRST: nextrep_exercises/plans/plan_items/plan_item_sets/workouts/
    // workout_exercises/workout_sets/measurements/custom_fields all have a foreign key on
    // device_id -> nextrep_devices.id, so that row must exist before any of those inserts are
    // attempted. Internals of migrateDeviceV1 and its error handling are unchanged — only the
    // position of this block moved.
    if (deviceId) {
      try {
        await migrateDeviceV1(user.id, deviceId);
      } catch (e) {
        console.error("nextrep_devices step failed (non-blocking)", e);
      }
    }

    // Stage 4A.4: the session is re-checked before every phase — after a logout / account switch no
    // further phase starts (RLS would reject the rows anyway; the app does not even send them).
    const assertSameSession = async () => {
      const now = await currentSessionUserId();
      if (now === user.id) return;
      throw new Error(now ? "Zmiana konta w trakcie wysyłania danych — wysyłanie zostało przerwane." : "Nie udało się potwierdzić sesji logowania — wysyłanie zostało przerwane. Spróbuj ponownie.");
    };
    let rowsSinceCheck = 0;
    const periodicSessionCheck = async () => {
      if (++rowsSinceCheck < 10) return;
      rowsSinceCheck = 0;
      await assertSameSession();
    };
    await assertSameSession();
    onProgress?.("exercises");
    const exerciseIdMap = await migrateExercisesV1(user.id, local.exercises, deviceId, periodicSessionCheck);

    await assertSameSession();
    onProgress?.("plans");
    const { planIdMap } = await migratePlansV1(user.id, local.plans, exerciseIdMap, deviceId, periodicSessionCheck);

    await assertSameSession();
    onProgress?.("history");
    await migrateWorkoutsV1(user.id, local.history, exerciseIdMap, planIdMap, deviceId, assertSameSession);

    await assertSameSession();
    onProgress?.("measurements");
    await migrateMeasurementsV1(user.id, local.measurements, deviceId);
    await assertSameSession();
    await migrateCustomFieldsV1(user.id, local.customFields, deviceId);
    await assertSameSession();
    await migrateProfileV1(user.id, local.userName);

    // Order per agreed design: migrate -> repair any leftover NULL device_id (e.g. from records
    // migrated before this fix existed) -> verify -> only then `completed`. A failure in the
    // repair step throws, lands in the catch block below, and correctly prevents `completed`.
    onProgress?.("checking");
    if (deviceId) {
      await assertSameSession();
      await repairMissingDeviceIdsV1(user.id, deviceId);
    }

    const localEligible = {
      exercises: local.exercises.filter((ex) => ex && ex.id != null),
      plans: local.plans.filter((p) => p && p.id != null),
      history: local.history.filter((s) => s && s.id != null),
      measurements: local.measurements.filter((m) => m && m.id != null),
      customFields: local.customFields.filter((f) => f && f.key),
    };
    const verification = await verifyMigrationV1(user.id, localEligible, deviceId);
    const allLocalRecordsFound = Object.values(verification.results).every((v) => v.allFound);
    const deviceIntegrityOk = Object.values(verification.deviceChecks).every(
      (v) => v.missingDeviceId === 0 && v.missingVersion === 0
    );

    if (!allLocalRecordsFound) {
      setMigrationStatus("failed", { error: "Część lokalnych rekordów nie została odnaleziona w Supabase.", verification }, statusUserId);
      return {
        success: false,
        error: "Migracja zakończona, ale część lokalnych rekordów nie została odnaleziona w Supabase (po legacy_id). Spróbuj ponownie.",
        verification,
      };
    }
    if (!deviceIntegrityOk) {
      setMigrationStatus("failed", { error: "Niektóre rekordy nadal nie mają device_id lub version po naprawie.", verification }, statusUserId);
      return { success: false, error: "Migracja zakończona, ale część rekordów nadal nie ma uzupełnionego device_id lub version. Spróbuj ponownie.", verification };
    }

    // Stage 4A.4 F-5 (Etap 6): under a server attempt the run is "completed" only after the server confirms it
    // (runV1UnderAttempt) — until then it is merely verified
    setMigrationStatus(_v1MigrationToken ? "verified" : "completed", { verification }, statusUserId);
    onProgress?.("done");
    return { success: true, verification, statusUserId };
  } catch (e) {
    setMigrationStatus("failed", { error: e?.message || "Nieznany błąd migracji." }, statusUserId);
    return { success: false, error: e?.message || "Nie udało się przenieść danych do konta." };
  }
}

// Stage 4A.3: the old manual "Przenieś dane do konta" stays only as a controlled REPAIR tool for an
// account that is already initialised with sync ON. It may never bypass source selection: no marker,
// a paused sync (the cloud holds other data — an upload would overwrite it), an unsettled cloud load /
// device upload, a workspace that isn't the session's, or any account operation in progress → BLOCKED,
// with nothing sent. The normal "device data → empty cloud" case is part of source selection itself.
async function manualMigrationBlocker() {
  const userId = await currentSessionUserId();
  if (!userId) return "Musisz być zalogowany, aby przenieść dane do konta.";
  if (!isActiveNamespaceFor(userId)) return "Trwa wczytywanie danych konta — spróbuj ponownie za chwilę.";
  if (isAccountInitBusy() || isSyncRunInProgress() || isSyncBootstrapInProgress()) return "Trwa inna operacja na danych tego konta — spróbuj ponownie za chwilę.";
  const m = getAccountInitMarker(userId);
  if (!m || m.status !== "ready") return "Najpierw wybierz źródło danych tego konta (Moje konto → „Wybierz ponownie źródło danych”).";
  if (m.syncPaused) return "Synchronizacja tego konta jest wstrzymana, bo w chmurze są inne dane niż na tym urządzeniu. Przeniesienie danych mogłoby je nadpisać — wybierz ponownie źródło danych.";
  return null;
}
// Stage 4A.4 F-5 (Etap 6): the repair tool never writes outside a server attempt either. An interrupted run of
// THIS device (record flow "manual", uploading / abandoned) is resumed with the SAME id; otherwise a new id is
// persisted before the start. While it runs every other device of the account is paused (server lock); the
// server refuses it when another attempt is open or the account holds data accepted as incomplete.
let _manualMigrationRunning = false;
async function runManualMigrationV1(onProgress) {
  if (_manualMigrationRunning) return { success: false, blocked: true, error: "Przenoszenie danych już trwa — poczekaj na jego zakończenie." };
  const blocked = await manualMigrationBlocker();
  if (blocked) return { success: false, blocked: true, error: blocked };
  _manualMigrationRunning = true;
  _accountInitBusy = true; // no source-selection step may start while the tool writes this account
  try {
    const userId = await currentSessionUserId();
    const deviceId = getOrCreateDeviceId();
    if (!userId || !deviceId || !isActiveNamespaceFor(userId)) return { success: false, blocked: true, error: "Trwa wczytywanie danych konta — spróbuj ponownie za chwilę." };
    // Etap 11: unrepairable local values stop the tool BEFORE its server attempt (nothing locked, nothing sent)
    const prev = getMigrationAttemptRecord(userId);
    const resumeOwn = !!(prev && prev.flow === "manual" && prev.deviceId === deviceId && prev.userId === userId && (prev.status === "uploading" || prev.status === "abandoned" || prev.status === "starting"));
    // (damaged local data is refused here too — before, the attempt was taken and V1 then failed with zero writes)
    const { errors: localErrors, data: localData } = await validateLocalDataForMigration();
    if (localErrors.length) return { success: false, blocked: true, error: `Dane lokalne są uszkodzone: ${localErrors.join(" ")}` };
    const dataBlockers = cloudUploadBlockers(localData);
    if (dataBlockers.length) return { success: false, blocked: true, dataBlockers, error: cloudUploadBlockersText(dataBlockers, { resuming: resumeOwn }) };
    const acq = await acquireFlowAttempt({ userId, deviceId, kind: "device_upload", flow: "manual", attemptId: resumeOwn ? migrationAttemptIdFrom(prev.attemptId) : newUuid() });
    if (isOwnCompletedAttempt(acq, deviceId)) return { success: true, alreadyCompleted: true };
    if (!acq.ok) return { success: false, blocked: acq.reason !== "closed", migration: acq.reason, closed: acq.reason === "closed", error: acq.error };
    if ((await currentSessionUserId()) !== userId || !isActiveNamespaceFor(userId)) return { success: false, error: "Zmiana konta w trakcie przenoszenia danych — nic nie zostało wysłane." };
    const up = await runV1UnderAttempt({ userId, deviceId, attemptId: acq.attemptId, onProgress });
    if (!up.ok) return { success: false, closed: !!up.closed, attemptOpen: !up.closed, error: up.error };
    return { success: true, verification: up.verification };
  } finally {
    _accountInitBusy = false;
    _manualMigrationRunning = false;
  }
}
// The interrupted manual run of THIS device (its attempt is still open on the server) — for the account screen.
function getOpenManualAttempt(userId) {
  const r = getMigrationAttemptRecord(userId);
  return r && r.flow === "manual" && r.userId === userId && (r.status === "uploading" || r.status === "abandoned" || r.status === "starting") ? r : null;
}

/* ---------------------------------------------------------------------- */
/* Sync Engine — Krok 7: fundament (kolejka, retry, online/offline,        */
/* debounce, status). NIE implementuje jeszcze prawdziwego push/pull ani  */
/* automatycznego rozwiązywania konfliktów — to zostanie podłączone w      */
/* kolejnym kroku. Nic tutaj nie jest jeszcze wpięte w CRUD aplikacji:     */
/* żadne z istniejących updateExercises/updatePlans/... nie wywołuje       */
/* enqueueSyncChange() na tym etapie. localStorage danych treningowych     */
/* oraz migracja V1 pozostają całkowicie poza zasięgiem tego modułu.      */
/* ---------------------------------------------------------------------- */

