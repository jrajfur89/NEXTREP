const NETWORK_ERROR_TEXT = "Nie można połączyć się z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.";
// Error text for the auth / account screens: a friendly network message, known texts translated.
function authErrorText(error) {
  if (isNetworkError(error)) return NETWORK_ERROR_TEXT;
  // Stage 4A.4 F-5: the server lock of a migration attempt — never shown as a raw code
  const mk = migrationErrorKind(error);
  if (mk === "in_progress") return MIGRATION_TEXTS.locked;
  if (mk === "closed") return MIGRATION_TEXTS.closedElsewhere;
  if (mk === "timeout") return MIGRATION_TEXTS.busy;
  const msg = String((error && error.message) || error || "");
  if (msg === "Invalid login credentials") return "Nieprawidłowy e-mail lub hasło.";
  return msg || "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.";
}

let _accountInitBusy = false; // a cloud load / reset is writing this account's namespace
function isAccountInitBusy() {
  return _accountInitBusy;
}
function getAccountInitMarker(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey("account_init", userId));
    const m = raw ? JSON.parse(raw) : null;
    return m && typeof m === "object" ? m : null;
  } catch {
    return null;
  }
}
function setAccountInitMarker(userId, marker) {
  localStorage.setItem(getStorageKey("account_init", userId), JSON.stringify({ ...marker, at: new Date().toISOString() }));
}
function clearAccountInitMarker(userId) {
  try {
    localStorage.removeItem(getStorageKey("account_init", userId));
  } catch {}
}
// Sync (runSync + bootstrap) may only touch an account that has chosen its data source and
// whose sync isn't paused by that choice.
// Stage 4A.3: the statuses the app knows how to continue from; anything else is treated like no marker.
const ACCOUNT_INIT_STATUSES = new Set(["ready", "pending_cloud_confirm", "loading_cloud", "uploading_device", "migrating_guest"]); // Stage 4A.4: + migrating_guest
function isKnownAccountInitStatus(status) {
  return ACCOUNT_INIT_STATUSES.has(status);
}
function isAccountSyncAllowed(userId) {
  const m = getAccountInitMarker(userId);
  return !!m && m.status === "ready" && !m.syncPaused;
}

// =====================================================================================
// Stage 4A.4 F-5 — SERVER MIGRATION ATTEMPTS (client side of SQL v3 + read guard C v2)
// Every V1 upload (guest → account, device → empty cloud, the manual V1 tool) runs as ONE server attempt
// in public.nextrep_migration_attempts. While it is `uploading` or `abandoned` the server refuses every
// write of the account (NR001) and every data read (read guard C, NR001) — except requests carrying the
// attempt's id in the header x-nextrep-migration-attempt (the uploading device). A closed attempt's id
// gets NR002. The attempt id is created and PERSISTED locally before the start RPC (so a crash / retry
// reuses it — the RPC is idempotent), and the account is "ready" only after the server confirmed
// `completed` for exactly that id, which the client asks for only after the full V1 verification.
//   local record (account namespace) migration_attempt = { attemptId, userId, deviceId, kind, flow,
//                  status (last known server status), startedAt, updatedAt } — no user data
// The token is set per request (setHeader) — never on the shared client — and only by V1 code.
// =====================================================================================
const MIGRATION_ATTEMPT_HEADER = "x-nextrep-migration-attempt";
const MIGRATION_ATTEMPT_KEY = "migration_attempt";
const MIGRATION_BLOCKING_STATUSES = new Set(["uploading", "abandoned"]);
// bounded retries of an RPC that hit the statement timeout (start() waits for in-flight writes of the
// account — 8 s on Supabase) and the pause between gated sync retries while the account is locked.
// Mutable object: tests shorten the delays.
const MIGRATION_TIMING = { rpcRetryDelaysMs: [1000, 2000, 4000], pausedRetryMs: 60000, inactiveNoticeMs: 24 * 60 * 60 * 1000 };
const MIGRATION_TEXTS = {
  inProgressHere: "Trwa przenoszenie danych z tego urządzenia na konto — synchronizacja jest wstrzymana do jego zakończenia.",
  inProgressOther: "Na innym urządzeniu trwa przenoszenie danych na to konto — synchronizacja jest wstrzymana do jego zakończenia. Dane na tym urządzeniu są bezpieczne.",
  abandoned: "Przenoszenie danych na to konto zostało przerwane i nie jest jeszcze rozstrzygnięte. Dopóki nie zostanie dokończone albo świadomie zamknięte, konto jest zablokowane (dane w chmurze mogą być niekompletne). Dane na tym urządzeniu są bezpieczne.",
  checkFailed: "Nie udało się sprawdzić, czy synchronizacja tego konta jest bezpieczna, dlatego jest wstrzymana. Dane na tym urządzeniu są bezpieczne — spróbuj ponownie później.",
  locked: "Trwa albo zostało przerwane przenoszenie danych na to konto, więc operacja jest teraz wstrzymana. Dane na tym urządzeniu są bezpieczne i nie zostały zmienione.",
  partialDevice: "Część danych z tego urządzenia jest już w chmurze, a wysyłanie nie zostało dokończone. Konto pozostaje zablokowane, dopóki nie dokończysz wysyłania albo świadomie nie przyjmiesz niekompletnych danych w chmurze. Dane na tym urządzeniu nie zostały zmienione.",
  acceptFailed: "Nie udało się zapisać decyzji na serwerze, więc nic nie zostało zmienione. Spróbuj ponownie po połączeniu z internetem.",
  unavailable: "Serwer nie obsługuje jeszcze bezpiecznego przenoszenia danych, więc nie zostało ono rozpoczęte. Nic nie zostało wysłane.",
  busy: "Konto jest teraz zajęte zapisem z innego urządzenia — spróbuj ponownie za chwilę. Nic nie zostało wysłane.",
  otherAttempt: "Na innym urządzeniu trwa (albo zostało przerwane) przenoszenie danych na to konto, więc nie można teraz rozpocząć kolejnego. Nic nie zostało wysłane.",
  incompleteAccepted: "Dane w chmurze tego konta zostały świadomie przyjęte jako niekompletne. Kolejne przenoszenie danych jest zablokowane do czasu łączenia danych (kolejny etap). Nic nie zostało wysłane.",
  closedElsewhere: "Przenoszenie zostało zamknięte na innym urządzeniu, więc to urządzenie przestało wysyłać dane. Dane na tym urządzeniu nie zostały zmienione.",
  closedIncomplete: "Przenoszenie zostało zamknięte na innym urządzeniu — dane w chmurze przyjęto jako niekompletne. To urządzenie przestało wysyłać dane; dane na nim nie zostały zmienione.",
  completeFailed: "Dane zostały wysłane i sprawdzone, ale nie udało się potwierdzić zakończenia przenoszenia na serwerze. Konto nie zostało jeszcze oznaczone jako gotowe — ponów, żeby dokończyć.",
  notYours: "Nie można dokończyć tego przenoszenia na tym urządzeniu. Nic nie zostało wysłane.",
  network: "Nie można połączyć się z serwerem. Nic nie zostało wysłane — spróbuj ponownie po połączeniu z internetem.",
  error: "Nie udało się rozpocząć bezpiecznego przenoszenia danych. Nic nie zostało wysłane.",
};

function getMigrationAttemptRecord(userId) {
  const r = readNamespaceJson(MIGRATION_ATTEMPT_KEY, userId);
  return r && typeof r === "object" && !Array.isArray(r) && r.attemptId ? r : null;
}
// Written and read back (a record that was not stored would let a crash lose the attempt id). → bool
function setMigrationAttemptRecord(userId, rec) {
  try {
    const k = getStorageKey(MIGRATION_ATTEMPT_KEY, userId);
    const raw = JSON.stringify({ ...rec, updatedAt: new Date().toISOString() });
    localStorage.setItem(k, raw);
    return localStorage.getItem(k) === raw;
  } catch (e) {
    console.error("setMigrationAttemptRecord failed", e);
    return false;
  }
}
// the record is only ever updated for the SAME attempt (a status write never revives / swaps another one)
function noteMigrationAttemptStatus(userId, attemptId, status) {
  if (status === "accepted_incomplete") noteIncompleteAccepted(userId, attemptId);
  const r = getMigrationAttemptRecord(userId);
  if (r && r.attemptId === attemptId && status && r.status !== status) setMigrationAttemptRecord(userId, { ...r, status });
}
// Stage 4A.4 F-5 (Etap 8, M2): a durable local note that the cloud data of this account was accepted as
// INCOMPLETE (no user data in it). Separate from the attempt record, which a later attempt may replace — so
// the permanent warning survives offline and is never swapped for another status. Written whenever the
// server shows an accepted_incomplete attempt; never removed by the app (only with the whole account).
const INCOMPLETE_ACCEPTED_KEY = "incomplete_accepted";
function getIncompleteAcceptedNote(userId) {
  if (!userId) return null;
  const n = readNamespaceJson(INCOMPLETE_ACCEPTED_KEY, userId);
  return n && typeof n === "object" && !Array.isArray(n) && n.attemptId ? n : null;
}
function noteIncompleteAccepted(userId, attemptId) {
  if (!userId || !attemptId) return;
  try {
    const cur = getIncompleteAcceptedNote(userId);
    if (cur && cur.attemptId === attemptId) return;
    localStorage.setItem(getStorageKey(INCOMPLETE_ACCEPTED_KEY, userId), JSON.stringify({ attemptId, at: new Date().toISOString() }));
  } catch {}
}

// NR001 / NR002 / 57014 / missing SQL / network, from a PostgREST error OR from an Error whose message
// carries it (V1 wraps errors as "<table>: … — <message>").
function migrationErrorKind(error) {
  if (!error) return null;
  const code = String(error.code || "");
  const msg = String(error.message || error || "");
  if (code === "NR001" || /migration_in_progress/.test(msg)) return "in_progress";
  if (code === "NR002" || /migration_attempt_closed/.test(msg)) return "closed";
  if (code === "57014" || /statement timeout/i.test(msg)) return "timeout";
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code) || /could not find the (function|table)/i.test(msg)) return "unavailable";
  if (isNetworkError(error)) return "network";
  return null;
}
async function migrationRpc(fn, args) {
  for (let i = 0; ; i++) {
    let r;
    try {
      r = await supabase.rpc(fn, args);
    } catch (e) {
      r = { data: null, error: e };
    }
    if (!r || !r.error) return { data: r ? r.data : null, error: null };
    if (migrationErrorKind(r.error) !== "timeout" || i >= MIGRATION_TIMING.rpcRetryDelaysMs.length) return { data: null, error: r.error };
    await new Promise((res) => setTimeout(res, MIGRATION_TIMING.rpcRetryDelaysMs[i]));
  }
}
function migrationRpcFailure(error) {
  const msg = String((error && error.message) || error || "");
  if (/active_attempt_exists/.test(msg)) return { reason: "other_attempt", error: MIGRATION_TEXTS.otherAttempt };
  if (/incomplete_data_accepted/.test(msg)) return { reason: "incomplete_accepted", error: MIGRATION_TEXTS.incompleteAccepted };
  if (/attempt_not_yours/.test(msg)) return { reason: "not_yours", error: MIGRATION_TEXTS.notYours };
  const kind = migrationErrorKind(error);
  if (kind === "timeout") return { reason: "busy", error: MIGRATION_TEXTS.busy };
  if (kind === "unavailable") return { reason: "unavailable", error: MIGRATION_TEXTS.unavailable };
  if (kind === "network") return { reason: "network", error: MIGRATION_TEXTS.network };
  return { reason: "error", error: MIGRATION_TEXTS.error };
}
// the server column is uuid — an id that is not one (an old browser's fallback, a damaged marker) is never sent
const MIGRATION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isMigrationUuid = (v) => typeof v === "string" && MIGRATION_UUID_RE.test(v);
const migrationAttemptIdFrom = (...candidates) => candidates.find(isMigrationUuid) || newUuid();
const migrationClosedText = (row) => (row && row.status === "accepted_incomplete" ? MIGRATION_TEXTS.closedIncomplete : MIGRATION_TEXTS.closedElsewhere);
// Start (idempotent for the same id) — or resume an `abandoned` attempt of THIS device. → { ok: true, row }
// with row.status "uploading" of this device, or { ok: false, reason, row?, error }:
//   other_attempt | incomplete_accepted | not_yours | closed (row: completed / cancelled / accepted_incomplete /
//   abandoned elsewhere) | unavailable (SQL missing) | busy (57014 after the bounded retries) | network | error
async function acquireMigrationAttempt({ userId, deviceId, kind, attemptId }) {
  if (!supabase || !userId || !deviceId || !isMigrationUuid(attemptId)) return { ok: false, reason: "error", error: MIGRATION_TEXTS.error };
  const start = await migrationRpc("nextrep_migration_attempt_start", { p_attempt_id: attemptId, p_device_id: deviceId, p_kind: kind, p_app_version: BACKUP_APP_VERSION });
  if (start.error) return { ok: false, ...migrationRpcFailure(start.error) };
  let row = start.data;
  if (!row || row.attempt_id !== attemptId || row.user_id !== userId) return { ok: false, reason: "error", error: MIGRATION_TEXTS.error };
  if (row.status === "abandoned" && row.device_id === deviceId) {
    const res = await migrationRpc("nextrep_migration_attempt_resume", { p_attempt_id: attemptId, p_device_id: deviceId });
    if (res.error) return { ok: false, ...migrationRpcFailure(res.error) };
    row = res.data;
  }
  if (row && row.attempt_id === attemptId && row.status === "uploading" && row.device_id === deviceId) return { ok: true, row };
  return { ok: false, reason: "closed", row: row || null, error: migrationClosedText(row) };
}
// numbers only — what the V1 verification found (never user data)
function migrationVerifiedCounts(verification) {
  const out = {};
  for (const [k, v] of Object.entries((verification && verification.results) || {})) out[k] = Number((v && v.localRecordsFoundInRemote) || 0);
  return out;
}
// Only after the FULL V1 verification. ok only when the server confirms `completed` for exactly this id.
async function completeMigrationAttempt({ userId, attemptId, deviceId, verification }) {
  const r = await migrationRpc("nextrep_migration_attempt_complete", { p_attempt_id: attemptId, p_device_id: deviceId, p_verified_counts: migrationVerifiedCounts(verification) });
  if (r.error) return { ok: false, ...migrationRpcFailure(r.error), error: MIGRATION_TEXTS.completeFailed };
  const row = r.data;
  if (row && row.attempt_id === attemptId && row.user_id === userId && row.status === "completed") return { ok: true, row };
  // no row / another account's answer (session changed meanwhile): unknown — the attempt may still be open
  if (!row || row.attempt_id !== attemptId || row.user_id !== userId) return { ok: false, reason: "error", row: null, error: MIGRATION_TEXTS.completeFailed };
  return { ok: false, reason: "closed", row, error: migrationClosedText(row) };
}
// Ending an attempt this device owns: `cancelled` ONLY when the server confirms zero writes of it; with
// writes the safe way is `abandoned` (the account stays locked until resumed or consciously accepted).
// → { ok, status: "cancelled" | "abandoned" | <other server status> | "missing", row } or { ok: false, reason, error }
async function endOwnMigrationAttempt({ attemptId, deviceId }) {
  const c = await migrationRpc("nextrep_migration_attempt_cancel", { p_attempt_id: attemptId, p_device_id: deviceId });
  if (c.error) return { ok: false, ...migrationRpcFailure(c.error) };
  const row = c.data;
  if (!row) return { ok: true, status: "missing", row: null }; // the start never reached the server
  if (row.status === "uploading" && row.device_id === deviceId) {
    const a = await migrationRpc("nextrep_migration_attempt_abandon", { p_attempt_id: attemptId, p_device_id: deviceId });
    if (a.error) return { ok: false, ...migrationRpcFailure(a.error) };
    return { ok: true, status: a.data ? a.data.status : "missing", row: a.data || null };
  }
  return { ok: true, status: row.status, row };
}
// Any device of the account, abandoned / uploading attempt with ZERO server-counted writes → cancelled.
async function cancelEmptyMigrationAttempt({ attemptId, deviceId }) {
  const c = await migrationRpc("nextrep_migration_attempt_cancel", { p_attempt_id: attemptId, p_device_id: deviceId });
  if (c.error) return { ok: false, ...migrationRpcFailure(c.error) };
  return { ok: !!c.data && c.data.status === "cancelled", status: c.data ? c.data.status : "missing", row: c.data || null };
}
// The conscious acceptance of incomplete cloud data (after an explicit confirmation in the UI). Terminal:
// the attempt never becomes `completed`, the old uploader is stopped (NR002), no new V1 may start.
async function acceptIncompleteMigrationAttempt({ attemptId, deviceId }) {
  const r = await migrationRpc("nextrep_migration_attempt_accept_incomplete", { p_attempt_id: attemptId, p_device_id: deviceId });
  if (r.error) return { ok: false, ...migrationRpcFailure(r.error) };
  return { ok: !!r.data && r.data.status === "accepted_incomplete", status: r.data ? r.data.status : "missing", row: r.data || null };
}

// The server view of the account's attempts — read before any sync, fail closed on ANY error (missing
// table included: the client is deployed only after SQL v3). The table is never behind the read guard.
//   { ok: true, blocking: row|null (uploading/abandoned), acceptedIncomplete: row|null, own: bool }
//   { ok: false, reason: "unavailable" | "network" | "error" }
let _migrationGate = null;
const _migrationGateListeners = new Set();
function getLastMigrationGate(userId) {
  return _migrationGate && _migrationGate.userId === userId ? _migrationGate : null;
}
function onMigrationGateChange(cb) {
  _migrationGateListeners.add(cb);
  return () => _migrationGateListeners.delete(cb);
}
function noteMigrationGate(gate) {
  _migrationGate = gate;
  _migrationGateListeners.forEach((cb) => {
    try {
      cb(gate);
    } catch {}
  });
}
const MIGRATION_GATE_COLUMNS = "attempt_id, device_id, kind, status, started_at, updated_at, last_write_at, writes_count, abandoned_at, resolved_at, resolved_by_device, resume_count";
async function readMigrationGate(userId) {
  const fail = (reason, error) => {
    const g = { ok: false, userId, reason, error: error || null, checkedAt: Date.now() };
    noteMigrationGate(g);
    return g;
  };
  if (!supabase || !userId) return fail("unavailable");
  let res;
  try {
    // all statuses, newest change first: besides the lock it yields a stamp of the latest change, so a PULL can
    // tell that an attempt started AND ended while it was reading (a blocking attempt or one accepted as
    // incomplete can never be pushed out of this window: no new attempt can start while one exists)
    res = await supabase.from("nextrep_migration_attempts").select(MIGRATION_GATE_COLUMNS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(100);
  } catch (e) {
    return fail(migrationErrorKind(e) === "network" ? "network" : "error", e);
  }
  if (!res || res.error) {
    const k = res ? migrationErrorKind(res.error) : null;
    return fail(k === "unavailable" ? "unavailable" : k === "network" ? "network" : "error", res && res.error);
  }
  if (!Array.isArray(res.data)) return fail("error");
  const rows = res.data;
  const blocking = rows.find((r) => r && MIGRATION_BLOCKING_STATUSES.has(r.status)) || null;
  const acceptedIncomplete = rows.find((r) => r && r.status === "accepted_incomplete") || null;
  let deviceId = null;
  try {
    deviceId = localStorage.getItem(getStorageKey("device_id", userId));
  } catch {}
  const top = rows[0] || null;
  const stamp = `${rows.length}|${top ? `${top.attempt_id}:${top.status}:${top.updated_at}` : ""}`;
  if (acceptedIncomplete) noteIncompleteAccepted(userId, acceptedIncomplete.attempt_id);
  const gate = { ok: true, userId, blocking, acceptedIncomplete, own: !!(blocking && deviceId && blocking.device_id === deviceId), stamp, checkedAt: Date.now() };
  noteMigrationGate(gate);
  return gate;
}
// Last activity of an attempt, and whether the 24-hour notice applies (information only — time never
// changes the status or releases the lock).
function migrationLastActivity(row) {
  if (!row) return null;
  const t = [row.last_write_at, row.updated_at, row.started_at].map((x) => Date.parse(x || "")).filter((n) => Number.isFinite(n));
  return t.length ? new Date(Math.max(...t)).toISOString() : null;
}
function migrationInactiveLong(row, now = Date.now()) {
  const last = migrationLastActivity(row);
  return !!last && now - Date.parse(last) >= MIGRATION_TIMING.inactiveNoticeMs;
}

// The V1 token: set ONLY around one V1 run (withV1MigrationToken) and applied ONLY by V1 code (v1Req) —
// per request, never on the shared client, so sync / PULL / other requests can never carry it.
let _v1MigrationToken = null;
function v1Req(builder) {
  return _v1MigrationToken ? builder.setHeader(MIGRATION_ATTEMPT_HEADER, _v1MigrationToken) : builder;
}
function withMigrationToken(builder, token) {
  return token ? builder.setHeader(MIGRATION_ATTEMPT_HEADER, token) : builder;
}
async function withV1MigrationToken(token, fn) {
  if (_v1MigrationToken) throw new Error("Inne przenoszenie danych jest już w toku na tym urządzeniu.");
  _v1MigrationToken = token || null;
  try {
    return await fn();
  } finally {
    _v1MigrationToken = null;
  }
}

// Start / resume the server attempt of one flow ("device" | "guest" | "manual"). The id is written to the
// local record (and, through persistId, to the flow's own marker) and read back BEFORE every start RPC.
// An attempt that another device `cancelled` (server-confirmed: zero writes — nothing of it is in the
// cloud) is replaced by a NEW id once; the flow's cloud checks run again after this anyway.
async function acquireFlowAttempt({ userId, deviceId, kind, flow, attemptId, persistId = () => true }) {
  let id = attemptId;
  // Etap 8 (M2): the record as it was before this call — a start the server definitely refused created
  // nothing, so the record goes back exactly to it (an accepted_incomplete record is never turned into "starting")
  // taken at the start of EACH round (after a cancelled attempt was noted), and put back only while the record
  // is still the "starting" one this call wrote — never over a newer record of another tab / flow
  let recordBefore = null;
  const restoreRecord = (writtenId) => {
    try {
      const k = getStorageKey(MIGRATION_ATTEMPT_KEY, userId);
      const cur = getMigrationAttemptRecord(userId);
      if (!cur || cur.attemptId !== writtenId || cur.status !== "starting") return;
      if (recordBefore == null) localStorage.removeItem(k);
      else localStorage.setItem(k, recordBefore);
    } catch {}
  };
  for (let round = 0; round < 2; round++) {
    try {
      recordBefore = localStorage.getItem(getStorageKey(MIGRATION_ATTEMPT_KEY, userId));
    } catch {
      recordBefore = null;
    }
    const prev = getMigrationAttemptRecord(userId);
    const startedAt = prev && prev.attemptId === id ? prev.startedAt : new Date().toISOString();
    if (!persistId(id) || !setMigrationAttemptRecord(userId, { attemptId: id, userId, deviceId, kind, flow, status: prev && prev.attemptId === id ? prev.status || "starting" : "starting", startedAt })) {
      return { ok: false, reason: "error", attemptId: id, error: "Nie udało się zapisać stanu przenoszenia na tym urządzeniu, więc nie zostało ono rozpoczęte. Nic nie zostało wysłane." };
    }
    const acq = await acquireMigrationAttempt({ userId, deviceId, kind, attemptId: id });
    if (acq.ok) {
      noteMigrationAttemptStatus(userId, id, "uploading");
      return { ...acq, attemptId: id };
    }
    if (acq.reason === "closed" && acq.row) noteMigrationAttemptStatus(userId, id, acq.row.status);
    if (acq.reason === "closed" && acq.row && acq.row.status === "cancelled" && round === 0) {
      id = newUuid();
      continue;
    }
    if (MIGRATION_START_REFUSED.has(acq.reason)) restoreRecord(id);
    return { ...acq, attemptId: id };
  }
  return { ok: false, reason: "error", attemptId: id, error: MIGRATION_TEXTS.error };
}
// definite refusals: the start RPC answered and created NOTHING on the server
const MIGRATION_START_REFUSED = new Set(["other_attempt", "incomplete_accepted", "unavailable", "not_yours"]);
// The current server row of an attempt of this account (touch returns it in any status). null = unknown.
async function readOwnMigrationAttempt({ attemptId, deviceId }) {
  const r = await migrationRpc("nextrep_migration_attempt_touch", { p_attempt_id: attemptId, p_device_id: deviceId });
  return r.error ? null : r.data || null;
}
// V1 under the attempt's token, then `complete` — asked for ONLY after the full V1 verification passed, and
// successful ONLY when the server answers `completed` for exactly this id. A write refused with NR002 (the
// attempt was closed elsewhere) stops V1 at once (it throws on the first refused row).
async function runV1UnderAttempt({ userId, deviceId, attemptId, onProgress }) {
  let result;
  try {
    result = await withV1MigrationToken(attemptId, () => runMigrationV1(onProgress));
  } catch (e) {
    result = { success: false, error: (e && e.message) || String(e) };
  }
  if (!result || !result.success) {
    const err = (result && result.error) || "";
    if (migrationErrorKind({ message: err }) === "closed") {
      const row = await readOwnMigrationAttempt({ attemptId, deviceId });
      if (row) noteMigrationAttemptStatus(userId, attemptId, row.status);
      return { ok: false, closed: true, row, error: migrationClosedText(row) };
    }
    return { ok: false, error: err ? authErrorText(err) : "Nie udało się wysłać danych do chmury." };
  }
  const c = await completeMigrationAttempt({ userId, attemptId, deviceId, verification: result.verification });
  if (!c.ok) {
    if (c.row) noteMigrationAttemptStatus(userId, attemptId, c.row.status);
    if (result.statusUserId !== undefined) setMigrationStatus("verified", { error: c.error, verification: result.verification }, result.statusUserId); // rows are in the cloud, not confirmed
    return { ok: false, closed: c.reason === "closed", row: c.row || null, error: c.error };
  }
  noteMigrationAttemptStatus(userId, attemptId, "completed");
  if (result.statusUserId !== undefined) setMigrationStatus("completed", { verification: result.verification, attemptId }, result.statusUserId);
  return { ok: true, verification: result.verification };
}
// The server already confirmed `completed` for THIS device's attempt (the app stopped before finishing locally)?
// Asked BEFORE purely local resume checks, so a finished upload is never blocked by them. Unknown → false.
async function ownAttemptCompletedOnServer(userId, attemptId, deviceId) {
  if (!isMigrationUuid(attemptId) || !deviceId) return false;
  const row = await readOwnMigrationAttempt({ attemptId, deviceId });
  const done = !!(row && row.attempt_id === attemptId && row.user_id === userId && row.device_id === deviceId && row.status === "completed");
  if (done) noteMigrationAttemptStatus(userId, attemptId, "completed");
  return done;
}
// a server answer "completed" for THIS device's attempt (e.g. the app was killed right after the RPC):
// the verified upload already happened — nothing is uploaded again
const isOwnCompletedAttempt = (acq, deviceId) => !!(acq && acq.reason === "closed" && acq.row && acq.row.status === "completed" && acq.row.device_id === deviceId);

// I2: the app no longer has a built-in exercise list (the old 68 were removed and nothing is seeded),
// so no exercise is "built-in": every exercise counts as the person's own data. For the dormant cloud
// paths this is the conservative reading — an account still holding old built-in rows is non-empty.
const BUILT_IN_EXERCISES = Object.freeze([]);

// "Has data" = something the user actually created. Technical keys (sync queue/meta/conflicts,
// migration statuses, device id, the init marker) never count, and neither did the old built-in
// exercises (BUILT_IN_EXERCISES — empty since I2).
const ACCOUNT_DATA_NAMES = ["exercises", "plans", "history", "measurements", "custom_fields", "user_name", "active_workout_draft", "pro_status", "pro_hints"];
const ACCOUNT_SYNC_TECH_NAMES = ["sync_queue", "sync_meta", "sync_conflicts"];
function hasLocalAccountData(userId) {
  const read = (name) => {
    try {
      const raw = localStorage.getItem(getStorageKey(name, userId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const count = (v) => (Array.isArray(v) ? v.length : 0);
  const defaults = new Set(BUILT_IN_EXERCISES.map((e) => String(e.id)));
  const exercises = read("exercises");
  const un = read("user_name");
  const details = {
    history: count(read("history")),
    plans: count(read("plans")),
    measurements: count(read("measurements")),
    customFields: count(read("custom_fields")),
    customExercises: Array.isArray(exercises) ? exercises.filter((e) => e && !defaults.has(String(e.id))).length : 0,
    userName: typeof un === "string" && un.trim() !== "",
    activeDraft: read("active_workout_draft") != null,
  };
  const hasData = details.history + details.plans + details.measurements + details.customFields + details.customExercises > 0 || details.userName || details.activeDraft;
  return { hasData, details };
}

// Light cloud check: limit(1) per table (+ only legacy_id of exercises, to ignore the default
// atlas pushed by the V1 migration). Throws on ANY error — a network failure is "unknown",
// never "empty".
// Stage 4A.3 option ignoreDeviceId: rows written by THAT device (an interrupted upload of this
// device's own data) don't count; rows of any other device — or without a device — do. With it,
// a profile name equal to localUserName doesn't count either (the upload wrote it).
// Stage 4A.4 option editedBuiltIns: a built-in (default-atlas) exercise row whose content differs from
// the atlas counts too — an edit synced from another device is account data a guest migration would
// overwrite. Unedited built-in rows (e.g. left by an interrupted upload) still don't count.
const exerciseRowMatchesDefault = (row, d) => {
  // `d` = the normalised default exercise
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return (
    same(row.name || "", d.name || "") && same(row.category || [], d.category) && same(row.equipment || [], d.equipment) &&
    !!row.is_time_based === !!d.isTimeBased && !!row.is_sets_only === !!d.isSetsOnly && !!row.is_cardio === !!d.isCardio &&
    (row.device_type || "") === (d.deviceType || "") && (row.video_url || "") === (d.videoUrl || "") && (row.notes || "") === (d.notes || "")
  );
};
// Stage 4A.4 Part 2 option onlyDeviceId (F-5): ONLY rows written by that device count — "did this device's
// interrupted upload leave data in the cloud?". The profile (no device column) is not counted then.
// Stage 4A.4 F-5 (Etap 6) option migrationToken: the id of THIS device's active server attempt — the read
// guard lets only that attempt read the account while it uploads (re-check after start, resume).
async function checkCloudAccountData(userId, { ignoreDeviceId = null, localUserName = "", editedBuiltIns = false, onlyDeviceId = null, migrationToken = null } = {}) {
  if (!supabase) throw new Error("Supabase nie jest skonfigurowane.");
  // Without ignoreDeviceId: one query. With it: rows of other devices + rows without a device.
  const variants = (build0) => {
    const build = () => withMigrationToken(build0(), migrationToken);
    return onlyDeviceId ? [build().eq("device_id", onlyDeviceId)] : ignoreDeviceId ? [build().neq("device_id", ignoreDeviceId), build().is("device_id", null)] : [build()];
  };
  const one = async (table) => {
    for (const q of variants(() => supabase.from(table).select("id").eq("user_id", userId).is("deleted_at", null))) {
      const { data, error } = await q.limit(1);
      if (error) throw new Error(error.message || `błąd odczytu ${table}`);
      if (Array.isArray(data) && data.length > 0) return true;
    }
    return false;
  };
  const workouts = await one("nextrep_workouts");
  const plans = await one("nextrep_plans");
  const measurements = await one("nextrep_measurements");
  const customFields = await one("nextrep_custom_fields");
  const defaults = new Set(BUILT_IN_EXERCISES.map((e) => String(e.id)));
  let customExercises = false;
  const defaultsById = new Map(BUILT_IN_EXERCISES.map((e) => [String(e.id), normalizeExercise(e)]));
  const exCols = editedBuiltIns ? "legacy_id, name, category, equipment, is_time_based, is_sets_only, is_cardio, device_type, video_url, notes" : "legacy_id";
  for (const q of variants(() => supabase.from("nextrep_exercises").select(exCols).eq("user_id", userId).is("deleted_at", null))) {
    const { data: exRows, error: exErr } = await q;
    if (exErr) throw new Error(exErr.message || "błąd odczytu nextrep_exercises");
    const counts = (r) =>
      r && r.legacy_id != null && (!defaults.has(String(r.legacy_id)) || (editedBuiltIns && !exerciseRowMatchesDefault(r, defaultsById.get(String(r.legacy_id)))));
    if ((exRows || []).some(counts)) customExercises = true;
  }
  if (editedBuiltIns && !customExercises) {
    // Stage 4A.4 Part 2 (F-3): an exercise DELETED in this account (soft-deleted row) is account data too —
    // an upload would update that row without reviving it, and the verification would never pass.
    for (const q of variants(() => supabase.from("nextrep_exercises").select("legacy_id").eq("user_id", userId).not("deleted_at", "is", null))) {
      const { data: delRows, error: delErr } = await q.limit(1);
      if (delErr) throw new Error(delErr.message || "błąd odczytu nextrep_exercises");
      if (Array.isArray(delRows) && delRows.length > 0) customExercises = true;
    }
  }
  let displayName = false;
  if (!onlyDeviceId) {
    const { data: prof, error: profErr } = await withMigrationToken(supabase.from("nextrep_profiles").select("display_name"), migrationToken).eq("user_id", userId).limit(1);
    if (profErr) throw new Error(profErr.message || "błąd odczytu nextrep_profiles");
    const cloudName = Array.isArray(prof) && prof[0] && typeof prof[0].display_name === "string" ? prof[0].display_name.trim() : "";
    displayName = cloudName !== "" && !(ignoreDeviceId && cloudName === String(localUserName || "").trim());
  }
  const details = { workouts, plans, measurements, customFields, customExercises, displayName };
  return { hasData: Object.values(details).some(Boolean), details };
}

// Every data + sync-technical key of the account's namespace (device id, migration statuses and
// the init marker are kept). Never touches other namespaces, the guest, backups or Supabase.
function accountNamespaceKeys(userId) {
  return [...ACCOUNT_DATA_NAMES, ...ACCOUNT_SYNC_TECH_NAMES].map((n) => getStorageKey(n, userId));
}
function snapshotAccountNamespace(userId) {
  const snap = {};
  for (const k of accountNamespaceKeys(userId)) snap[k] = localStorage.getItem(k);
  return snap;
}
function restoreAccountNamespace(snap) {
  for (const [k, v] of Object.entries(snap)) {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
}
function clearAccountNamespace(userId) {
  for (const k of accountNamespaceKeys(userId)) localStorage.removeItem(k);
}
// Stage 4A.2: after a SUCCESSFUL server-side account deletion nothing of that account stays on
// the device — its whole workspace (data + sync queue/meta/conflicts via clearAccountNamespace,
// init marker, cloud-restore pointer, device id, migration statuses) and its backups. The guest
// workspace, other accounts and device-level keys (onboarding, migration markers) are untouched.
function purgeDeletedAccountData(userId) {
  if (userId == null || userId === "") return false;
  const ns = getLocalDataNamespace(userId);
  if (ns === "guest") return false;
  clearAccountNamespace(userId);
  clearAccountInitMarker(userId);
  clearLastCloudRestorePointer(userId);
  for (const name of ["device_id", "migration_v1_status", "migration_workout_identity", "guest_partial_upload", "migration_attempt", "incomplete_accepted"]) {
    try {
      localStorage.removeItem(getStorageKey(name, userId));
    } catch {}
  }
  saveBackupList(loadBackupList().filter((b) => backupOwnerNamespace(b) !== ns));
  // Stage 4A.4: a guest migration bound to the deleted account no longer blocks the guest data
  // (the guest data itself and its BEFORE_GUEST_MIGRATION backup belong to the guest and stay).
  const gm = getGuestMigrationMarker();
  if (gm && gm.targetUserId === userId) clearGuestMigrationMarker();
  return true;
}
const stillSameAccount = async (userId, expectedRefUserId) =>
  getActiveDataNamespace() === getLocalDataNamespace(userId) && expectedRefUserId() === userId && (await currentSessionUserId()) === userId;

// Stage 4A.3: a destructive source-selection step (cloud load, empty start, device upload) must not
// overlap a sync pass that already started — runSync()'s lock and the sync_meta bootstrap are the
// only writers that could still be busy. New runs are already refused by isAccountSyncAllowed(); this
// waits for the in-flight ones. false = still busy after the timeout → the caller does nothing.
const SOURCE_SELECTION_SYNC_WAIT_MS = 30000;
async function waitForSyncIdle(timeoutMs = SOURCE_SELECTION_SYNC_WAIT_MS) {
  const startedAt = Date.now();
  while (isSyncRunInProgress() || isSyncBootstrapInProgress()) {
    if (Date.now() - startedAt >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
}
const SYNC_STILL_RUNNING_TEXT = "Synchronizacja nadal trwa — spróbuj ponownie za chwilę. Dane nie zostały zmienione.";

// Stage 4A.3: what "Wczytaj z chmury" / "Zacznij od pustych danych" would destroy that no backup
// holds — a started workout (draft), changes not sent yet (sync queue) and unresolved sync
// conflicts. While any of them exists the operation is refused; nothing is merged (that is Stage
// 4A.5). Technical sync_meta alone never blocks: it doesn't represent unsent data.
// operation: "cloud" (load from the cloud) | "empty" (start with empty data).
const CLOUD_RESTORE_OPEN_CONFLICT_STATUSES = new Set(["pending", "resolved_pending_push"]);
function cloudRestoreBlocker(userId, operation = "cloud") {
  const what = operation === "empty" ? "rozpoczęciem od pustych danych" : "wczytaniem danych z chmury";
  const action = operation === "empty" ? "Rozpoczęcie od pustych danych" : "Wczytanie danych z chmury";
  const read = (name) => {
    try {
      const raw = localStorage.getItem(getStorageKey(name, userId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  if (localStorage.getItem(getStorageKey("active_workout_draft", userId)) != null) {
    return {
      reason: "draft",
      message:
        `Masz rozpoczęty trening. Zakończ, przerwij lub porzuć go przed ${what} — ta operacja usunęłaby go z tego urządzenia. Wybierz dane z urządzenia, zakończ lub porzuć trening, a potem w „Moje konto” wybierz ponownie źródło danych.`,
    };
  }
  const queue = read("sync_queue");
  const unsent = Array.isArray(queue) ? queue.filter(Boolean).length : 0;
  if (unsent > 0) {
    return {
      reason: "queue",
      count: unsent,
      message: `Na tym urządzeniu są zmiany, które nie zostały jeszcze wysłane do chmury (${unsent}). ${action} usunęłoby je, dlatego jest zablokowane. Dane nie zostały zmienione.`,
    };
  }
  const conflicts = read("sync_conflicts");
  const open = Array.isArray(conflicts) ? conflicts.filter((c) => c && CLOUD_RESTORE_OPEN_CONFLICT_STATUSES.has(c.status)).length : 0;
  if (open > 0) {
    return {
      reason: "conflicts",
      count: open,
      message: `Na tym urządzeniu są nierozwiązane konflikty synchronizacji (${open}). ${action} usunęłoby je, dlatego jest zablokowane. Dane nie zostały zmienione.`,
    };
  }
  return null;
}

// ---- "Wczytaj z urządzenia" after "Wczytaj z chmury" (Stage 4A.2 fix) ----
// Loading the cloud replaces the namespace's content, so afterwards the namespace no longer holds
// the device's version. The pre-load state lives in a BEFORE_CLOUD_RESTORE backup (existing backup
// system + metadata), and a pointer remembers it together with a fingerprint of the data right
// after the cloud load. "Wczytaj z urządzenia" restores that backup only while the data is still
// exactly what the cloud load produced (i.e. the last operation WAS the cloud load) and the backup
// demonstrably belongs to this account and namespace. Otherwise the current local data is used.
const BEFORE_CLOUD_RESTORE_KIND = "BEFORE_CLOUD_RESTORE";
function accountDataFingerprint(userId) {
  let h = 2166136261; // FNV-1a over the account's data keys
  for (const name of ACCOUNT_DATA_NAMES) {
    const v = `${name}=${localStorage.getItem(getStorageKey(name, userId)) ?? "∅"};`;
    for (let i = 0; i < v.length; i++) {
      h ^= v.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h.toString(16);
}
function getLastCloudRestorePointer(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey("last_cloud_restore", userId));
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}
// Written by loadAccountFromCloud right after a successful load (backupId = the device snapshot, or
// null when the device had no data — "noSnapshot"). The fingerprint of the loaded state is added by
// fixLastCloudRestoreFingerprint() once the app has reloaded that state (normalisations included).
function setLastCloudRestorePointer(userId, backupId) {
  localStorage.setItem(
    getStorageKey("last_cloud_restore", userId),
    JSON.stringify({ backupId: backupId || null, noSnapshot: !backupId, userId, namespace: getLocalDataNamespace(userId), createdAt: new Date().toISOString(), postFingerprint: null })
  );
}
function fixLastCloudRestoreFingerprint(userId) {
  const p = getLastCloudRestorePointer(userId);
  if (!p || p.postFingerprint) return;
  localStorage.setItem(getStorageKey("last_cloud_restore", userId), JSON.stringify({ ...p, postFingerprint: accountDataFingerprint(userId) }));
}
function clearLastCloudRestorePointer(userId) {
  try {
    localStorage.removeItem(getStorageKey("last_cloud_restore", userId));
  } catch {}
}
// What "Wczytaj z urządzenia" must do right now. Every identity check is explicit — never by reason
// name alone. status:
//   "none"        — no unsettled cloud load: the namespace's current data IS the device data
//   "ok"          — restore `snapshot` (exactly the state from before the last cloud load)
//   "no_snapshot" — the device had no data before the cloud load: there is nothing to go back to
//   "changed"     — data changed since the cloud load: the old snapshot is no longer "the last state"
//   "invalid"     — pointer / snapshot missing, damaged or not this account's
function resolveDeviceSnapshot(userId) {
  const p = getLastCloudRestorePointer(userId);
  const marker = getAccountInitMarker(userId);
  const unsettledCloud = !!(marker && (marker.status === "pending_cloud_confirm" || marker.status === "loading_cloud")); // Stage 4A.3: an interrupted load is unsettled too
  if (!p) return { status: unsettledCloud ? "invalid" : "none" };
  const ns = getLocalDataNamespace(userId);
  if (p.userId !== userId || p.namespace !== ns) return { status: "invalid" };
  if (p.noSnapshot) return { status: "no_snapshot" };
  if (!p.backupId) return { status: "invalid" };
  if (p.postFingerprint && p.postFingerprint !== accountDataFingerprint(userId)) return { status: "changed" };
  const b = loadBackupList().find((x) => x && x.backupId === p.backupId);
  if (!b || b.kind !== BEFORE_CLOUD_RESTORE_KIND || b.reason !== "before-restore" || b.userId !== userId || b.namespace !== ns || !b.data) return { status: "invalid" };
  if (Date.parse(b.createdAt) > Date.parse(p.createdAt)) return { status: "invalid" };
  return { status: "ok", snapshot: b };
}
const DEVICE_SNAPSHOT_ERRORS = {
  no_snapshot: "Przed wczytaniem z chmury na tym urządzeniu nie było danych tego konta — nie ma czego przywrócić. Aktualne dane nie zostały zmienione.",
  changed: "Dane zmieniły się po wczytaniu z chmury, więc kopia sprzed wczytania nie jest już ostatnim stanem urządzenia. Aktualne dane nie zostały zmienione — kopię znajdziesz w „Kopii zapasowej”.",
  invalid: "Nie znaleziono bezpiecznej kopii danych z urządzenia. Aktualne dane nie zostały zmienione.",
};
function findDeviceSnapshotBeforeCloudRestore(userId) {
  const r = resolveDeviceSnapshot(userId);
  return r.status === "ok" ? r.snapshot : null;
}
// Put the device snapshot back: clear the namespace's data + sync technical keys (so nothing of the
// cloud version is left mixed in), restore the snapshot through the existing restoreFromSnapshot.
// Nothing is sent anywhere; the caller keeps sync paused.
function restoreDeviceSnapshot(userId, snapshot) {
  if (getActiveDataNamespace() !== getLocalDataNamespace(userId) || !snapshot || snapshot.namespace !== getActiveDataNamespace()) return false;
  const before = snapshotAccountNamespace(userId);
  clearAccountNamespace(userId);
  if (!restoreFromSnapshot(snapshot)) {
    restoreAccountNamespace(before);
    return false;
  }
  clearLastCloudRestorePointer(userId);
  return true;
}

// "Zacznij od pustych danych": backup → clear ONLY this account's local namespace. Nothing is
// sent to the cloud and nothing is deleted there.
async function startAccountEmpty(userId, currentRefUserId, cloudHasData) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  // Stage 4A.3: no sync pass that already started may still be writing this namespace.
  if (!(await waitForSyncIdle())) return { ok: false, error: SYNC_STILL_RUNNING_TEXT };
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  // Stage 4A.3: a draft / unsent queue / open conflicts are not in the before-reset backup.
  const blocker = cloudRestoreBlocker(userId, "empty");
  if (blocker) return { ok: false, blocked: blocker.reason, error: blocker.message };
  _accountInitBusy = true;
  try {
    if (hasLocalAccountData(userId).hasData) createBackupSnapshot("before-reset", { force: true });
    clearAccountNamespace(userId);
    clearLastCloudRestorePointer(userId);
    const incompleteNote = getIncompleteAcceptedNote(userId);
    setAccountInitMarker(userId, { status: "ready", source: "empty", syncPaused: !!cloudHasData, ...(cloudHasData && incompleteNote ? { pausedReason: "incomplete_accepted", incompleteAccepted: incompleteNote.attemptId } : {}) });
    return { ok: true };
  } finally {
    _accountInitBusy = false;
  }
}

// "Wczytaj dane z chmury": the EXISTING sync PULL + APPLY, run on an emptied namespace so every
// cloud record is applied (with its version meta, so later sync continues cleanly). The previous
// local state is kept in memory (and in a backup) and put back on ANY failure or if the account
// changes meanwhile — a failed cloud load never loses local data.
//
// Stage 4A.3 hardening:
//  - waits for a sync pass that already started (waitForSyncIdle) and re-checks session, account,
//    namespace and the init marker afterwards — any change cancels without touching anything;
//  - refuses while a started workout, unsent changes or unresolved conflicts exist (cloudRestoreBlocker);
//  - BEFORE the namespace is cleared, persists marker { status: "loading_cloud", backupId, ... } and the
//    restore pointer, so a refresh / killed PWA mid-load is recognised on the next start: the partly
//    written data is never taken for device data, and the user can retry or go back (resumable).
//  - a retry of an interrupted load reuses the SAME before-restore backup (idempotent): the partial
//    cloud data on the device is never backed up as if it were the device's own data.
async function loadAccountFromCloud(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (!(await waitForSyncIdle())) return { ok: false, error: SYNC_STILL_RUNNING_TEXT };
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const markerNow = getAccountInitMarker(userId);
  if (markerNow && markerNow.status === "ready") return { ok: false, alreadyReady: true }; // decided meanwhile (e.g. another tab)
  const resuming = !!(markerNow && markerNow.status === "loading_cloud" && markerNow.userId === userId && markerNow.namespace === getLocalDataNamespace(userId));
  const blocker = cloudRestoreBlocker(userId);
  if (blocker) return { ok: false, blocked: blocker.reason, error: blocker.message };
  // Stage 4A.4 F-5 (Etap 6): never load while the account is locked by a migration attempt (or its state is
  // unknown) — checked BEFORE the first destructive step; nothing is changed when it fails
  const gate = await readMigrationGate(userId);
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (!gate.ok) return { ok: false, blocked: "migration_check", error: MIGRATION_TEXTS.checkFailed };
  if (gate.blocking) return { ok: false, blocked: "migration", error: MIGRATION_TEXTS.locked };
  _accountInitBusy = true;
  const markerKey = getStorageKey("account_init", userId);
  const pointerKey = getStorageKey("last_cloud_restore", userId);
  const before = snapshotAccountNamespace(userId);
  const markerBefore = localStorage.getItem(markerKey);
  const pointerBefore = localStorage.getItem(pointerKey);
  // A first attempt that fails gives back everything (data, marker, pointer). A failed RETRY of an
  // interrupted load gives back the data it found and keeps "loading_cloud": still unsettled.
  const giveBack = () => {
    restoreAccountNamespace(before);
    if (resuming) return;
    if (markerBefore == null) localStorage.removeItem(markerKey);
    else localStorage.setItem(markerKey, markerBefore);
    if (pointerBefore == null) localStorage.removeItem(pointerKey);
    else localStorage.setItem(pointerKey, pointerBefore);
  };
  try {
    let backupId = null;
    if (resuming) {
      backupId = markerNow.backupId || null;
      if (!getLastCloudRestorePointer(userId)) setLastCloudRestorePointer(userId, backupId);
    } else {
      if (hasLocalAccountData(userId).hasData) {
        const deviceSnapshot = createBackupSnapshot("before-restore", { force: true, meta: { kind: BEFORE_CLOUD_RESTORE_KIND, userId, source: "cloud-restore" } });
        if (!deviceSnapshot) return { ok: false, error: "Nie udało się utworzyć kopii danych z urządzenia — dane z chmury nie zostały wczytane." };
        backupId = deviceSnapshot.backupId;
      }
      // Persistent "in progress" state — written BEFORE the first destructive step.
      setLastCloudRestorePointer(userId, backupId);
      setAccountInitMarker(userId, { status: "loading_cloud", source: "cloud", syncPaused: true, userId, namespace: getLocalDataNamespace(userId), backupId, noSnapshot: !backupId });
    }
    const deviceSnapshot = backupId ? { backupId } : null;
    clearAccountNamespace(userId);
    let pull;
    try {
      pull = await pullRemoteChanges();
    } catch (e) {
      pull = { success: false, error: (e && e.message) || String(e) };
    }
    if (!(await stillSameAccount(userId, currentRefUserId))) {
      giveBack();
      return { ok: false, discarded: true };
    }
    if (!pull || !pull.success) {
      giveBack();
      return { ok: false, error: (pull && pull.error) || "Nie udało się pobrać danych z chmury." };
    }
    // F-5: the same server state as before the read — otherwise the copy may mix states → nothing applied
    const gateAfter = await readMigrationGate(userId);
    if (!gateAfter.ok || gateAfter.blocking || gateAfter.stamp !== gate.stamp) {
      giveBack();
      return { ok: false, error: gateAfter.ok && !gateAfter.blocking ? "Dane konta zmieniły się w trakcie pobierania — spróbuj ponownie." : gateAfter.ok ? MIGRATION_TEXTS.locked : MIGRATION_TEXTS.checkFailed };
    }
    let apply;
    try {
      apply = await applyRemoteChanges(pull);
    } catch (e) {
      apply = { success: false, error: (e && e.message) || String(e) };
    }
    if (!apply || !apply.success) {
      giveBack();
      return { ok: false, error: (apply && apply.error) || "Nie udało się zapisać danych z chmury." };
    }
    // Transitional state: the cloud copy is loaded, the device snapshot is kept, and the user can still
    // go back to it. Not "ready" → runSync / bootstrap stay off (isAccountSyncAllowed), so nothing can
    // change the loaded state until the user settles it on the confirmation step.
    setLastCloudRestorePointer(userId, deviceSnapshot ? deviceSnapshot.backupId : null);
    setAccountInitMarker(userId, { status: "pending_cloud_confirm", source: "cloud", syncPaused: true });
    return { ok: true, applied: apply.applied || {}, deviceSnapshotId: deviceSnapshot ? deviceSnapshot.backupId : null };
  } catch (e) {
    giveBack();
    return { ok: false, error: (e && e.message) || String(e) };
  } finally {
    _accountInitBusy = false;
  }
}

// Stage 4A.3: an interrupted cloud load whose device had NO data before it (nothing to restore):
// "go back" = drop the partly written cloud data and decide the source again. Only this account's
// namespace is touched; nothing is sent anywhere.
async function abandonInterruptedCloudLoad(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const m = getAccountInitMarker(userId);
  if (!m || m.status !== "loading_cloud") return { ok: false, discarded: true };
  _accountInitBusy = true;
  try {
    clearAccountNamespace(userId);
    clearLastCloudRestorePointer(userId);
    clearAccountInitMarker(userId);
    return { ok: true };
  } finally {
    _accountInitBusy = false;
  }
}

// Stage 4A.3: "Wczytaj z urządzenia" while the cloud was found EMPTY — the device data becomes the
// account's data and is uploaded with the existing migration V1 (upsert by legacy_id, the same rows
// and format the sync engine uses; nothing in localStorage is changed by it). Immediately before the
// upload the cloud is checked again: if it is no longer empty nothing is uploaded and the caller
// returns to the source choice. BEFORE the first cloud write a persistent marker
// { status: "uploading_device", userId, namespace, deviceId } is stored, so a failed or killed upload
// is recognised (also after a restart): a retry then ignores the rows THIS device wrote
// (ignoreDeviceId) and upserts the rest (idempotent), while rows of any other device still stop it.
// The caller sets "ready" only after { ok: true } — a failed upload never leaves a "ready" account.
async function uploadAccountDataToEmptyCloud(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (!(await waitForSyncIdle())) return { ok: false, error: SYNC_STILL_RUNNING_TEXT };
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const markerNow = getAccountInitMarker(userId);
  if (markerNow && markerNow.status === "ready") return { ok: false, alreadyReady: true };
  const ns = getLocalDataNamespace(userId);
  const resuming = !!(markerNow && markerNow.status === "uploading_device" && markerNow.userId === userId && markerNow.namespace === ns && markerNow.deviceId);
  const deviceId = resuming ? markerNow.deviceId : getOrCreateDeviceId();
  if (!deviceId) return { ok: false, error: MIGRATION_TEXTS.error };
  // Stage 4A.4 F-5 (Etap 6): the server attempt id lives in the "uploading_device" marker (written + read back
  // before every start). A RESUMED upload takes its attempt FIRST — while it is uploading / abandoned only
  // its own id may read this account (read guard), so every check below carries it.
  const persistId = (id) => {
    const m = getAccountInitMarker(userId);
    if (!m || m.status !== "uploading_device" || m.deviceId !== deviceId) return false;
    if (m.serverAttemptId !== id) setAccountInitMarker(userId, { ...m, serverAttemptId: id });
    return (getAccountInitMarker(userId) || {}).serverAttemptId === id;
  };
  let token = null;
  if (resuming) {
    if (await ownAttemptCompletedOnServer(userId, markerNow.serverAttemptId, deviceId)) {
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      return { ok: true, alreadyCompleted: true }; // verified + confirmed earlier — nothing is uploaded again
    }
    // purely local refusals (F-1 / F-2 / I-2) come BEFORE the server attempt — a resume that cannot happen
    // never locks the account
    const localCheck = prepareAccountDatasetForUpload(userId, { resuming: true });
    if (!localCheck.ok) return { ok: false, resumeUnsafe: !!localCheck.resumeUnsafe, integrityIssues: localCheck.integrityIssues, dataBlockers: localCheck.dataBlockers, error: localCheck.error };
    const acq = await acquireFlowAttempt({ userId, deviceId, kind: "device_upload", flow: "device", attemptId: migrationAttemptIdFrom(markerNow.serverAttemptId), persistId });
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    if (isOwnCompletedAttempt(acq, deviceId)) return { ok: true, alreadyCompleted: true };
    if (!acq.ok) return { ok: false, migration: acq.reason, closed: acq.reason === "closed", row: acq.row || null, error: acq.error };
    token = acq.attemptId;
  }
  let cloud;
  try {
    cloud = await checkCloudAccountData(userId, resuming ? { ignoreDeviceId: deviceId, localUserName: readAccountUserName(userId), migrationToken: token } : {});
  } catch (e) {
    return { ok: false, error: authErrorText(e) };
  }
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (cloud.hasData) {
    // someone else's data is in the cloud now: stop, never overwrite, decide the source again
    if (resuming) {
      // F-5: the server attempt ends FIRST (cancelled when it wrote nothing) — never a lock without its marker
      const end = await endOwnMigrationAttempt({ attemptId: token, deviceId });
      if (!end.ok) return { ok: false, error: end.error };
      noteMigrationAttemptStatus(userId, token, end.status);
      if (end.status === "abandoned" || end.status === "uploading") return { ok: false, partial: true, row: end.row, error: MIGRATION_TEXTS.partialDevice };
      clearAccountInitMarker(userId);
    }
    return { ok: false, cloudChanged: true, cloud };
  }
  _accountInitBusy = true;
  try {
    // Stage 4A.4 Part 1 (I-2 / F-1): the account data is uploaded as a prepared copy with unique
    // identities (backup first, then written back to this account's namespace). Resuming an upload that
    // an older version started is refused when preparation would change identities — see the helper.
    // Stage 4A.4 Part 2 (F-3): soft-deleted cloud rows with the same identities → stop before any write
    const toUpload = readMigratableDataset(userId);
    if (!toUpload.malformed.length && !toUpload.shapeErrors.length) {
      let collisions;
      try {
        collisions = await v1DeletedRowCollisions(userId, prepareV1UploadDataset(toUpload).dataset, { migrationToken: token });
      } catch (e) {
        return { ok: false, error: authErrorText(e) };
      }
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      if (collisions.length) return { ok: false, deletedCollisions: collisions, error: DELETED_COLLISION_TEXT };
    }
    const prep = prepareAccountDatasetForUpload(userId, { resuming });
    if (!prep.ok) return { ok: false, resumeUnsafe: !!prep.resumeUnsafe, integrityIssues: prep.integrityIssues, dataBlockers: prep.dataBlockers, error: prep.error };
    if (!resuming) {
      const attemptId = newUuid();
      setAccountInitMarker(userId, { status: "uploading_device", source: "device", syncPaused: true, userId, namespace: ns, deviceId, serverAttemptId: attemptId, startedAt: new Date().toISOString() });
      const acq = await acquireFlowAttempt({ userId, deviceId, kind: "device_upload", flow: "device", attemptId, persistId });
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true }; // marker stays: resumable, the attempt (if any) wrote nothing
      if (!acq.ok) {
        // a definite refusal created nothing on the server and nothing was sent → back to the state before;
        // an unknown outcome (network, timeout) keeps the marker so the attempt can be resumed or ended
        if (MIGRATION_START_REFUSED.has(acq.reason)) clearAccountInitMarker(userId);
        return { ok: false, migration: acq.reason, error: acq.error };
      }
      token = acq.attemptId;
      // the start waited for every in-flight write of the account — check again WITH the attempt's id
      let recheck;
      try {
        recheck = await checkCloudAccountData(userId, { migrationToken: token });
      } catch (e) {
        return { ok: false, error: authErrorText(e) }; // marker + attempt stay → "upload interrupted" (retry / back)
      }
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      if (recheck.hasData) {
        const end = await endOwnMigrationAttempt({ attemptId: token, deviceId });
        if (!end.ok) return { ok: false, error: end.error };
        noteMigrationAttemptStatus(userId, token, end.status);
        clearAccountInitMarker(userId);
        return { ok: false, cloudChanged: true, cloud: recheck };
      }
    }
    const up = await runV1UnderAttempt({ userId, deviceId, attemptId: token });
    if (!up.ok) return { ok: false, closed: !!up.closed, row: up.row || null, error: up.error };
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: authErrorText(e) };
  } finally {
    _accountInitBusy = false;
  }
}
// Stage 4A.4 F-5 (Etap 6): "Wróć do wyboru źródła danych" after an interrupted / failed device upload. The
// server attempt ends first: `cancelled` when the server confirms it wrote nothing (then the marker goes and
// the source is decided again); with writes it becomes `abandoned` — the account stays locked and the user
// finishes the upload or consciously accepts the incomplete cloud data. A closed attempt (completed /
// cancelled / accepted elsewhere) locks nothing any more. Nothing local is changed except the marker.
async function abandonInterruptedDeviceUpload(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const m = getAccountInitMarker(userId);
  if (!m || m.status !== "uploading_device") return { ok: false, discarded: true };
  if (m.serverAttemptId && m.deviceId) {
    const end = await endOwnMigrationAttempt({ attemptId: m.serverAttemptId, deviceId: m.deviceId });
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    if (!end.ok) return { ok: false, error: end.error };
    noteMigrationAttemptStatus(userId, m.serverAttemptId, end.status);
    if (end.status === "abandoned" || end.status === "uploading") return { ok: false, partial: true, row: end.row, error: MIGRATION_TEXTS.partialDevice };
    if (end.status === "completed" && end.row && end.row.device_id === m.deviceId) return { ok: false, completed: true }; // verified + confirmed — the caller finishes (no re-upload)
  }
  if ((getAccountInitMarker(userId) || {}).serverAttemptId !== m.serverAttemptId) return { ok: false, discarded: true }; // changed meanwhile
  clearAccountInitMarker(userId);
  return { ok: true };
}
// Stage 4A.4 F-5 (Etap 6): the explicit, confirmed acceptance of an incomplete upload of THIS device's attempt
// (any flow). Terminal on the server; the local marker of the flow is settled by the caller. → { ok, error }
async function acceptIncompleteOwnUpload(userId, currentRefUserId, { attemptId, deviceId }) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (!attemptId || !deviceId) return { ok: false, error: MIGRATION_TEXTS.acceptFailed };
  const r = await acceptIncompleteMigrationAttempt({ attemptId, deviceId });
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (r.ok) {
    noteMigrationAttemptStatus(userId, attemptId, "accepted_incomplete");
    return { ok: true, status: "accepted_incomplete" };
  }
  if (r.status === "accepted_incomplete" || r.status === "cancelled") return { ok: true, status: r.status }; // already settled (e.g. on another device) — nothing to lock any more
  return { ok: false, status: r.status, error: r.error || MIGRATION_TEXTS.acceptFailed };
}
// Device flow: the user confirmed (two steps in the UI) that the incomplete cloud data of THIS device's
// interrupted upload is accepted. Server first; only then the marker changes — the device keeps all its
// data, the account is "ready" and normal sync resumes (server policy after accepted_incomplete; no new V1
// may start; the permanent "incomplete" note stays). An attempt another device cancelled (server: zero writes) wrote nothing — the source is
// simply decided again.
async function acceptIncompleteDeviceUpload(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const m = getAccountInitMarker(userId);
  if (!m || m.status !== "uploading_device" || !m.serverAttemptId || !m.deviceId) return { ok: false, discarded: true };
  const r = await acceptIncompleteOwnUpload(userId, currentRefUserId, { attemptId: m.serverAttemptId, deviceId: m.deviceId });
  if (!r.ok) return r;
  const now = getAccountInitMarker(userId);
  if (!now || now.status !== "uploading_device" || now.serverAttemptId !== m.serverAttemptId) return { ok: false, discarded: true };
  if (r.status === "cancelled") {
    clearAccountInitMarker(userId);
    return { ok: true, recheck: true };
  }
  // the server accepted the incomplete cloud data (terminal; no new V1): normal sync resumes as its policy allows.
  // The device keeps ALL its data; rows that never reached the cloud stay here (nothing is deleted).
  setAccountInitMarker(userId, { status: "ready", source: "device", syncPaused: false, incompleteAccepted: m.serverAttemptId });
  return { ok: true };
}
// Stage 4A.4 F-5 (Etap 8, M1): the account's cloud data was accepted as INCOMPLETE (no new upload may ever
// start — 4A.5 merges later). "Używaj danych z urządzenia": this device keeps working with ITS data — ready /
// device with sync PAUSED, so nothing is sent or pulled and nothing local or in the cloud changes; the server
// status stays accepted_incomplete. Checked against the server first (fail closed: no marker on any doubt).
async function useDeviceDataAfterIncompleteAccepted(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (!(await waitForSyncIdle())) return { ok: false, error: SYNC_STILL_RUNNING_TEXT };
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const m = getAccountInitMarker(userId);
  if (m && m.status === "ready") return { ok: false, alreadyReady: true };
  if (m && isKnownAccountInitStatus(m.status)) return { ok: false, error: "Na tym urządzeniu trwa inna operacja na danych tego konta — najpierw ją dokończ albo zamknij." };
  if (!hasLocalAccountData(userId).hasData) return { ok: false, error: "Na tym urządzeniu nie ma danych tego konta." };
  const gate = await readMigrationGate(userId);
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  if (!gate.ok) return { ok: false, error: MIGRATION_TEXTS.checkFailed };
  if (gate.blocking) return { ok: false, migration: "in_progress", error: MIGRATION_TEXTS.locked };
  if (!gate.acceptedIncomplete) return { ok: false, notAccepted: true };
  const now = getAccountInitMarker(userId);
  if (now && isKnownAccountInitStatus(now.status)) return { ok: false, discarded: true }; // changed meanwhile
  setAccountInitMarker(userId, { status: "ready", source: "device", syncPaused: true, pausedReason: "incomplete_accepted", incompleteAccepted: gate.acceptedIncomplete.attempt_id });
  return { ok: true };
}
function readAccountUserName(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey("user_name", userId));
    const v = raw ? JSON.parse(raw) : "";
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

// =====================================================================================
// Stage 4A.4 Part 1 — EXPLICIT-NAMESPACE HELPERS
// Read / write the data of ONE given namespace (userId; null = guest) without activating it, without
// touching the sync queue/meta, the draft, local PRO or any technical key. Used by the upload
// preparation and by the guest → account migration below.
// =====================================================================================
const MIGRATABLE_DATA_NAMES = ["exercises", "plans", "history", "measurements", "custom_fields", "user_name"];
function readNamespaceJson(name, userId) {
  try {
    const raw = localStorage.getItem(getStorageKey(name, userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // same reading as everywhere else in the app (damaged JSON → no value)
  }
}
// Stage 4A.4 Part 2 (F-2): one stored value, classified explicitly —
//   { state: "missing" }            key absent (or empty string)
//   { state: "valid", value }       parsed JSON
//   { state: "malformed", raw }     the key exists but is not valid JSON — NEVER read as "no data"
function readNamespaceEntry(name, userId) {
  const raw = localStorage.getItem(getStorageKey(name, userId));
  if (raw == null || raw === "") return { state: "missing" };
  try {
    return { state: "valid", value: JSON.parse(raw) };
  } catch {
    return { state: "malformed", raw };
  }
}
// { exercises, plans, history, measurements, customFields, userName, present, shapeErrors, malformed, damage }.
// Fail-closed reading for migration: a malformed value (malformed) or a value of the wrong type
// (shapeErrors) is reported, never replaced by [] / "" — callers stop. `damage` additionally lists
// collections with entries V1 cannot carry (not an object / without its identity). Nothing is repaired.
function readMigratableDataset(userId) {
  const shapeErrors = [];
  const malformed = [];
  const present = {};
  const read = (name) => {
    const e = readNamespaceEntry(name, userId);
    if (e.state === "malformed") malformed.push(name);
    present[name] = e.state === "valid" && e.value != null;
    return e.state === "valid" ? e.value : null;
  };
  const arr = (name) => {
    const v = read(name);
    if (v == null) return [];
    if (!Array.isArray(v)) {
      shapeErrors.push(name);
      present[name] = false;
      return [];
    }
    return v;
  };
  const un = read("user_name");
  if (un != null && typeof un !== "string") {
    shapeErrors.push("user_name");
    present.user_name = false;
  }
  const ds = {
    exercises: arr("exercises"),
    plans: arr("plans"),
    history: arr("history"),
    measurements: arr("measurements"),
    customFields: arr("custom_fields"),
    userName: typeof un === "string" ? un : "",
    present,
    shapeErrors,
    malformed,
  };
  const bad = (list, ok) => list.some((x) => !ok(x));
  const obj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const entryErrors = [];
  if (bad(ds.history, (x) => obj(x) && x.id)) entryErrors.push("history");
  if (bad(ds.plans, (x) => obj(x) && x.id)) entryErrors.push("plans");
  if (bad(ds.measurements, (x) => obj(x) && x.id)) entryErrors.push("measurements");
  if (bad(ds.exercises, (x) => obj(x) && x.id != null && x.id !== "")) entryErrors.push("exercises");
  if (bad(ds.customFields, (x) => obj(x) && x.key)) entryErrors.push("custom_fields");
  ds.damage = [...malformed.map((n) => ({ name: n, reason: "malformed" })), ...shapeErrors.map((n) => ({ name: n, reason: "wrong_type" })), ...entryErrors.map((n) => ({ name: n, reason: "bad_entries" }))];
  return ds;
}
const MIGRATABLE_DATA_LABELS = { exercises: "ćwiczenia", plans: "plany", history: "historia treningów", measurements: "pomiary", custom_fields: "własne parametry pomiarów", user_name: "nazwa" };
const damageText = (damage) => [...new Set(damage.map((d) => MIGRATABLE_DATA_LABELS[d.name] || d.name))].join(", ");
// Records without the id V1 needs — the same rule as validateLocalDataForMigration.
function migratableDatasetIdErrors(ds) {
  return (ds.damage || []).filter((d) => d.reason === "bad_entries").map((d) => d.name);
}
// Writes [name, value] pairs into the namespace of `userId`, confirms every write by reading it back,
// and on ANY failure puts back exactly what was there before (also keys that did not exist). → bool.
function writeNamespaceEntries(userId, entries) {
  const before = entries.map(([name]) => [getStorageKey(name, userId), localStorage.getItem(getStorageKey(name, userId))]);
  try {
    for (const [name, value] of entries) {
      const k = getStorageKey(name, userId);
      const raw = JSON.stringify(value);
      localStorage.setItem(k, raw);
      if (localStorage.getItem(k) !== raw) throw new Error(`zapis ${name} nie został potwierdzony`);
    }
    return true;
  } catch (e) {
    console.error("writeNamespaceEntries failed", e);
    for (const [k, v] of before) {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {}
    }
    return false;
  }
}
// FNV-1a over the raw stored values of the migratable data of one namespace (draft / PRO excluded).
function migratableDataFingerprint(userId) {
  let h = 2166136261;
  for (const name of MIGRATABLE_DATA_NAMES) {
    const v = `${name}=${localStorage.getItem(getStorageKey(name, userId)) ?? "∅"};`;
    for (let i = 0; i < v.length; i++) {
      h ^= v.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h.toString(16);
}

// Stage 4A.3 device upload (and the resume of a guest migration): the account's own data is prepared
// (prepareV1UploadDataset) and the prepared copy written back to its namespace BEFORE the upload —
// with a backup of the original first — so the local data and the cloud rows carry the same ids.
// F-1: an upload that is being RESUMED may already have rows in the cloud written with the old ids
// (e.g. started by a version without this preparation). Changing ids now would leave those rows as
// orphans that the next PULL brings back as duplicates → refused: nothing written locally or remotely,
// the marker stays "interrupted", the user can go back to the source choice.
function prepareAccountDatasetForUpload(userId, { resuming = false } = {}) {
  const ds = readMigratableDataset(userId);
  // Stage 4A.4 Part 2 (F-2): a malformed value was read as "no data" before — it would have been uploaded
  // as empty. Malformed or wrong-type values stop the upload; nothing is repaired or removed.
  if (ds.malformed.length || ds.shapeErrors.length) {
    return { ok: false, damaged: true, error: `Dane na urządzeniu są uszkodzone (${damageText(ds.damage.filter((d) => d.reason !== "bad_entries"))}), więc nie można ich wysłać. Nic nie zostało zmienione ani wysłane.` };
  }
  const prep = prepareV1UploadDataset(ds);
  const integrityIssues = v1DatasetIntegrityIssues(prep.dataset);
  if (integrityIssues.length) return { ok: false, integrityIssues, error: v1IntegrityIssuesText(integrityIssues) };
  // Etap 11: data the cloud would refuse and that cannot be repaired without inventing it → no start / resume
  const dataBlockers = cloudUploadBlockers(prep.dataset);
  if (dataBlockers.length) return { ok: false, dataBlockers, error: cloudUploadBlockersText(dataBlockers, { resuming }) };
  if (!prep.changed) return { ok: true, changed: false };
  if (resuming) {
    return {
      ok: false,
      resumeUnsafe: true,
      error: "Przerwanego wysyłania nie można bezpiecznie dokończyć, bo dane wymagają uporządkowania identyfikatorów. Nic nie zostało zmienione — wróć do wyboru źródła danych.",
    };
  }
  if (!isActiveNamespaceFor(userId)) return { ok: false, error: "Trwa wczytywanie danych konta — spróbuj ponownie za chwilę." };
  const snap = createBackupSnapshot("before-migration", { force: true });
  if (!snap) return { ok: false, error: "Nie udało się utworzyć kopii zapasowej przed wysłaniem danych. Nic nie zostało zmienione." };
  const entries = [];
  if (prep.historyChanged) entries.push(["history", prep.dataset.history]);
  if (prep.plansChanged) entries.push(["plans", prep.dataset.plans]);
  if (!writeNamespaceEntries(userId, entries)) return { ok: false, error: "Nie udało się przygotować danych do wysłania. Nic nie zostało zmienione." };
  return { ok: true, changed: true, backupId: snap.backupId };
}

// =====================================================================================
// Stage 4A.4 Part 1 — GUEST → ACCOUNT MIGRATION (guest data → a GENUINELY EMPTY account only)
// Model: COPY → UPLOAD → VERIFY. The guest workspace is the source and stays byte-for-byte untouched
// (only the technical marker `guest_migration` is written there); nothing is merged (Stage 4A.5).
//   guest marker   nextrep_guest_guest_migration_v1 = { status: "migrating", targetUserId, fingerprint,
//                  backupId, attemptId, startedAt, accountReadyAt? }  — no user data
//   account marker account_init = { status: "migrating_guest", source: "guest", syncPaused: true, userId,
//                  namespace, deviceId, backupId, fingerprint, attemptId, phase: "copying"|"uploading",
//                  startedAt } — not "ready": sync stays off until the upload is verified
// The account becomes ready/guest only after V1 + the full parent/child verification succeeded.
// Not migrated: the active workout draft (stays guest), local PRO (never moves), sync/technical keys.
// =====================================================================================
const BEFORE_GUEST_MIGRATION_KIND = "BEFORE_GUEST_MIGRATION";
const GUEST_MIGRATION_BACKUP_KEEP = 2;
const GUEST_MIGRATION_TEXTS = {
  busy: "Przenoszenie danych już trwa — poczekaj na jego zakończenie.",
  otherAccount: "Dane z trybu bez logowania są właśnie przenoszone na inne konto, więc nie można ich teraz przenieść na to konto. Nic nie zostało zmienione.",
  notEmpty: "To konto ma już swoje dane, więc dane z trybu bez logowania nie zostały przeniesione. Nic nie zostało zmienione.",
  cloudChanged: "Na koncie w chmurze pojawiły się dane, więc nic nie zostało przeniesione ani wysłane. Dane z trybu bez logowania są nietknięte.",
  nothing: "W trybie bez logowania nie ma danych do przeniesienia.",
  damaged: "Przenoszenie zostało zatrzymane, bo część danych w trybie bez logowania jest uszkodzona. Nic nie zostało przeniesione ani wysłane — dane na tym urządzeniu pozostają bez zmian.",
  backupFailed: "Nie udało się utworzyć kopii zapasowej danych z trybu bez logowania, więc przenoszenie nie zostało rozpoczęte. Nic nie zostało zmienione.",
  copyFailed: "Nie udało się zapisać danych na koncie na tym urządzeniu. Nic nie zostało wysłane, dane z trybu bez logowania są nietknięte.",
  noBackup: "Nie znaleziono kopii zapasowej tego przenoszenia, więc nie można go bezpiecznie dokończyć. Wróć bez przenoszenia i spróbuj od nowa.",
  guestChanged: "Dane w trybie bez logowania zmieniły się od rozpoczęcia przenoszenia, więc nie można go dokończyć. Wróć bez przenoszenia i spróbuj od nowa.",
  resumeMismatch: "Nie można bezpiecznie dokończyć przerwanego przenoszenia. Wróć bez przenoszenia i spróbuj od nowa.",
  partial: "Część danych z tego przenoszenia jest już w chmurze, więc nie można go po prostu cofnąć. Dokończ przenoszenie albo świadomie zacznij konto bez tych danych — niekompletna kopia w chmurze nie zostanie użyta jako zwykłe dane konta.",
  partialUnknown: "Nie udało się sprawdzić, czy część danych trafiła już do chmury, więc przenoszenia nie można teraz cofnąć. Spróbuj ponownie po połączeniu z internetem albo dokończ przenoszenie.",
};
function getGuestMigrationMarker() {
  const m = readNamespaceJson("guest_migration", null);
  return m && typeof m === "object" && !Array.isArray(m) ? m : null;
}
function setGuestMigrationMarker(marker) {
  localStorage.setItem(getStorageKey("guest_migration", null), JSON.stringify(marker));
}
function clearGuestMigrationMarker() {
  try {
    localStorage.removeItem(getStorageKey("guest_migration", null));
  } catch {}
}
// Stage 4A.4 Part 2 (F-4): does the guest marker bind the guest data to a transfer of ANOTHER account?
// The marker protects against copying the same guest data into several accounts, so it is never released
// by age. null = not bound for `userId` (no marker, released, or this account's own); otherwise
// { status, targetUserId, unverifiable } — a marker that cannot be read / has no target blocks everyone.
//   status: "migrating" (unfinished) | "abandoned_partial" | "completed" (moved to that account) | …
function guestMarkerBinding(userId) {
  const e = readNamespaceEntry("guest_migration", null);
  if (e.state === "missing") return null;
  const m = e.state === "valid" ? e.value : null;
  if (m && typeof m === "object" && !Array.isArray(m) && m.status === "released") return null;
  if (!m || typeof m !== "object" || Array.isArray(m) || !m.targetUserId) return { status: "unknown", targetUserId: null, unverifiable: true };
  if (m.targetUserId === userId) return null;
  return { status: String(m.status || "unknown"), targetUserId: m.targetUserId, unverifiable: false };
}
// F-4, the ONLY way to unbind: an explicit decision of the user signed in now (another account than the
// marker's). Covers an unfinished / abandoned / completed transfer of the other account, a deleted other
// account, a damaged marker — none of them can be verified from here. The guest data and backups are not
// touched; the marker keeps (without user data) what it was released from.
function releaseGuestMigrationBinding(userId) {
  const binding = guestMarkerBinding(userId);
  if (!binding || !userId) return { ok: false };
  if (_guestMigrationRunning) return { ok: false, busy: true, error: GUEST_MIGRATION_TEXTS.busy };
  const e = readNamespaceEntry("guest_migration", null);
  const prev = e.state === "valid" && e.value && typeof e.value === "object" ? e.value : null;
  setGuestMigrationMarker({
    status: "released",
    releasedAt: new Date().toISOString(),
    releasedFor: userId,
    releasedFrom: prev ? { status: prev.status || null, targetUserId: prev.targetUserId || null, attemptId: prev.attemptId || null, backupId: prev.backupId || null } : { unverifiable: true },
  });
  return { ok: true };
}
// Guest data worth offering: history, plans, measurements, custom fields, custom exercises (not the
// default atlas). A name, an unfinished workout (draft), PRO or technical keys alone never count.
function guestHasMigratableData() {
  const ds = readMigratableDataset(null);
  const defaults = new Set(BUILT_IN_EXERCISES.map((e) => String(e.id)));
  const details = {
    history: ds.history.length,
    plans: ds.plans.length,
    measurements: ds.measurements.length,
    customFields: ds.customFields.length,
    customExercises: ds.exercises.filter((e) => e && !defaults.has(String(e.id))).length,
  };
  // F-2: damaged collections are reported (the offer screen then explains why nothing can be moved)
  return { hasData: Object.values(details).some((n) => n > 0), details, damage: ds.damage, draft: readNamespaceJson("active_workout_draft", null) != null };
}
// Retention: the GUEST_MIGRATION_BACKUP_KEEP newest guest-migration backups, plus `keepBackupId` and the
// one the guest marker refers to. Other kinds / namespaces are never touched.
function pruneGuestMigrationBackups(list, keepBackupId = null) {
  const isGm = (b) => b && b.kind === BEFORE_GUEST_MIGRATION_KIND;
  const keep = new Set(
    list
      .filter(isGm)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
      .slice(0, GUEST_MIGRATION_BACKUP_KEEP)
      .map((b) => b.backupId)
  );
  if (keepBackupId) keep.add(keepBackupId);
  const gm = getGuestMigrationMarker();
  if (gm && gm.backupId) keep.add(gm.backupId);
  if (gm && gm.releasedFrom && gm.releasedFrom.backupId) keep.add(gm.releasedFrom.backupId); // F-4: still documents the released transfer
  return list.filter((b) => !isGm(b) || keep.has(b.backupId));
}
// The ORIGINAL guest data (exactly as stored — not the prepared copy), read explicitly from the guest
// namespace whatever namespace is active. No PRO, no draft. null = not saved (caller stops).
function createGuestMigrationBackup({ targetUserId, fingerprint, attemptId }) {
  try {
    const ds = readMigratableDataset(null);
    const data = {
      exercises: ds.present.exercises ? ds.exercises : null,
      plans: ds.present.plans ? ds.plans : null,
      history: ds.present.history ? ds.history : null,
      measurements: ds.present.measurements ? ds.measurements : null,
      customFields: ds.present.custom_fields ? ds.customFields : null,
      userName: ds.present.user_name ? ds.userName : null,
    };
    const snapshot = {
      backupId: uid(),
      createdAt: new Date().toISOString(),
      appVersion: BACKUP_APP_VERSION,
      formatVersion: 1,
      reason: "before-guest-migration",
      namespace: getLocalDataNamespace(null),
      kind: BEFORE_GUEST_MIGRATION_KIND,
      targetUserId,
      fingerprint,
      attemptId,
      data,
    };
    const list = pruneGuestMigrationBackups([...loadBackupList(), snapshot], snapshot.backupId);
    if (!saveBackupList(list)) return null;
    return loadBackupList().some((b) => b && b.backupId === snapshot.backupId) ? snapshot : null;
  } catch (e) {
    console.error("createGuestMigrationBackup failed", e);
    return null;
  }
}
function findGuestMigrationBackup(backupId) {
  return loadBackupList().find((b) => b && b.backupId === backupId && b.kind === BEFORE_GUEST_MIGRATION_KIND && b.namespace === getLocalDataNamespace(null)) || null;
}
// What is written into the account namespace: the prepared copy of the migratable collections that
// exist in the guest. The guest name only when the account has none (never overwritten).
function guestMigrationEntries(prepared, { includeUserName }) {
  const d = prepared.dataset;
  const p = prepared.present || {};
  const entries = [];
  // the exercise list the guest app actually showed: a missing or empty list means the default atlas
  // (before I2: the old built-in list; since I2: an empty list) — without it the uploaded history would lose its
  // exercise links (exercise_id = null)
  entries.push(["exercises", p.exercises && Array.isArray(d.exercises) && d.exercises.length ? d.exercises : BUILT_IN_EXERCISES.map(normalizeExercise)]);
  if (p.plans) entries.push(["plans", d.plans]);
  if (p.history) entries.push(["history", d.history]);
  if (p.measurements) entries.push(["measurements", d.measurements]);
  if (p.custom_fields) entries.push(["custom_fields", d.customFields]);
  if (includeUserName && typeof d.userName === "string" && d.userName.trim() !== "") entries.push(["user_name", d.userName]);
  return entries;
}
// Removes from the account namespace only what a guest migration can have written there (the migratable
// collections) plus the sync technical keys — the account's local PRO and device id stay.
function clearGuestMigrationCopy(userId) {
  for (const name of [...MIGRATABLE_DATA_NAMES, ...ACCOUNT_SYNC_TECH_NAMES]) {
    try {
      localStorage.removeItem(getStorageKey(name, userId));
    } catch {}
  }
}

// "Genuinely empty" for a guest migration is stricter than hasLocalAccountData (Stage 4A.3): the copy
// replaces the account's local exercise list and the upload overwrites cloud exercise rows, so an EDITED
// built-in exercise, unsent changes or open sync conflicts of the account also make it non-empty here.
function accountLocalBlocksGuestMigration(userId) {
  if (hasLocalAccountData(userId).hasData) return true;
  if (getGuestPartialNote(userId)) return true; // F-5: an incomplete earlier transfer is in this account's cloud
  const queue = readNamespaceJson("sync_queue", userId);
  if (Array.isArray(queue) && queue.some(Boolean)) return true;
  const conflicts = readNamespaceJson("sync_conflicts", userId);
  if (Array.isArray(conflicts) && conflicts.some((c) => c && CLOUD_RESTORE_OPEN_CONFLICT_STATUSES.has(c.status))) return true;
  const exercises = readNamespaceJson("exercises", userId);
  if (exercises != null && !Array.isArray(exercises)) return true;
  if (Array.isArray(exercises)) {
    const defaults = new Map(BUILT_IN_EXERCISES.map((e) => [String(e.id), JSON.stringify(normalizeExercise(e))]));
    for (const e of exercises) {
      if (!e || typeof e !== "object") return true;
      const d = defaults.get(String(e.id));
      if (d == null || JSON.stringify(normalizeExercise(e)) !== d) return true;
    }
  }
  return false;
}
// The cloud side of the same rule (also edited built-in exercise rows; resume: only other devices' rows).
function guestMigrationCloudOptions(resuming, deviceId, userId) {
  return resuming ? { ignoreDeviceId: deviceId, localUserName: readAccountUserName(userId), editedBuiltIns: true } : { editedBuiltIns: true };
}

// Foreign data appeared in the cloud: the attempt ends (no merge, no overwrite). If it had already reached
// the upload phase on an earlier run, rows of this attempt may be in the cloud next to the foreign data —
// F-5: the account keeps a note so they are never presented as normal data, and the guest data stays bound.
function endAttemptAfterForeignData(userId, m, mayHaveUploaded) {
  const uploaded = !!(mayHaveUploaded && m && m.status === "migrating_guest");
  clearGuestMigrationCopy(userId);
  clearAccountInitMarker(userId);
  const gm = getGuestMigrationMarker();
  if (uploaded) {
    localStorage.setItem(getStorageKey(GUEST_PARTIAL_NOTE, userId), JSON.stringify({ deviceId: m.deviceId || null, attemptId: m.attemptId || null, backupId: m.backupId || null, at: new Date().toISOString() }));
    if (gm && gm.targetUserId === userId && gm.attemptId === m.attemptId) setGuestMigrationMarker({ ...gm, status: "abandoned_partial", abandonedAt: new Date().toISOString() });
  } else if (gm && gm.targetUserId === userId && (!m || gm.attemptId === m.attemptId)) {
    clearGuestMigrationMarker();
  }
}

// =====================================================================================
// Stage 4A.4 Part 2 — SAFE GUEST CLEANUP (decision D1)
// After a verified migration the moved, FINISHED guest data (history, plans, measurements, custom fields,
// exercises) may be removed from the guest workspace — only when everything is certain:
//   account ready/guest (verified upload) · completed marker of THIS account · current guest fingerprint
//   = the migrated one (nothing new since) · the attempt's BEFORE_GUEST_MIGRATION backup exists, belongs to
//   it and holds exactly the values being removed.
// Never removed: the unfinished workout (draft), guest PRO, the guest name, the backup, technical keys.
// With a draft the exercise list stays (the draft may use a custom exercise). Any doubt → no cleanup; the
// account stays correctly migrated. A failed cleanup is retried later as cleanup only — never a re-upload.
//   marker.cleanup: "pending" | "done" | "skipped_changed" | "skipped_unverified" | "failed"
// =====================================================================================
const GUEST_CLEANUP_NAMES = [["history", "history"], ["plans", "plans"], ["measurements", "measurements"], ["custom_fields", "customFields"], ["exercises", "exercises"]];
// Retry of a pending / failed cleanup when the migrated account opens — cleanup only, never an upload.
async function retryPendingGuestCleanup(userId, currentRefUserId) {
  if (_guestMigrationRunning) return { status: "busy" };
  const gm = getGuestMigrationMarker();
  if (!gm || gm.status !== "completed" || gm.targetUserId !== userId || !(gm.cleanup === "pending" || gm.cleanup === "failed")) return { status: "not_applicable" };
  _guestMigrationRunning = true;
  try {
    return await cleanupMigratedGuestData(userId, currentRefUserId);
  } finally {
    _guestMigrationRunning = false;
  }
}
async function cleanupMigratedGuestData(userId, currentRefUserId) {
  const gm = getGuestMigrationMarker();
  if (!gm || gm.status !== "completed" || gm.targetUserId !== userId) return { status: "not_applicable" };
  if (gm.cleanup === "done" || gm.cleanup === "skipped_changed") return { status: gm.cleanup };
  const setCleanup = (cleanup, extra = {}) => {
    const now = getGuestMigrationMarker();
    if (now && now.status === "completed" && now.attemptId === gm.attemptId && now.targetUserId === userId) setGuestMigrationMarker({ ...now, cleanup, cleanupAt: new Date().toISOString(), ...extra });
    return { status: cleanup };
  };
  if (!(await stillSameAccount(userId, currentRefUserId))) return { status: "not_now" }; // retried later
  const acc = getAccountInitMarker(userId);
  if (!acc || acc.status !== "ready" || acc.source !== "guest") return setCleanup("skipped_unverified");
  // Stage 4A.4 F-5 (Etap 6): the server confirmed `completed` for exactly this migration's attempt (recorded
  // when the complete RPC answered) — otherwise nothing of the guest is removed
  if (gm.serverAttemptId) {
    const rec = getMigrationAttemptRecord(userId);
    if (!rec || rec.attemptId !== gm.serverAttemptId || rec.status !== "completed" || rec.userId !== userId) return setCleanup("skipped_unverified");
  }
  if (migratableDataFingerprint(null) !== gm.fingerprint) return setCleanup("skipped_changed"); // new / changed guest data: keep everything
  const b = findGuestMigrationBackup(gm.backupId);
  if (!b || b.attemptId !== gm.attemptId || b.targetUserId !== userId || b.fingerprint !== gm.fingerprint || !b.data || typeof b.data !== "object") return setCleanup("skipped_unverified");
  const keepExercises = readNamespaceEntry("active_workout_draft", null).state !== "missing";
  const plan = [];
  for (const [name, field] of GUEST_CLEANUP_NAMES) {
    if (name === "exercises" && keepExercises) continue;
    const raw = localStorage.getItem(getStorageKey(name, null));
    if (raw == null) continue;
    // the backup must hold exactly what is removed — otherwise this category stays
    if (b.data[field] == null || JSON.stringify(b.data[field]) !== raw) return setCleanup("skipped_unverified");
    plan.push([getStorageKey(name, null), raw, name]);
  }
  try {
    for (const [k] of plan) localStorage.removeItem(k);
    for (const [k] of plan) if (localStorage.getItem(k) != null) throw new Error("usunięcie nie zostało potwierdzone");
  } catch (e) {
    for (const [k, raw] of plan) {
      try {
        if (localStorage.getItem(k) == null) localStorage.setItem(k, raw);
      } catch {}
    }
    return setCleanup("failed", { cleanupError: String((e && e.message) || e) });
  }
  return setCleanup("done", { cleaned: plan.map((p) => p[2]), keptExercises: keepExercises });
}

let _guestMigrationRunning = false; // one guest migration at a time in this tab (double tap, two starts)
function isGuestMigrationRunning() {
  return _guestMigrationRunning;
}

// Guest → genuinely empty account. Returns { ok: true } or { ok: false, <reason>, error }.
// Reasons without any write: discarded (account / session changed), busy, alreadyReady, blocked
// ("guest_other_account" | "not_empty" | "cloud_changed" | "nothing" | "damaged" | "integrity" |
// "backup_failed"), error (network). Once the markers exist, a failure leaves "migrating_guest" in
// place (retry or abandon); the account is never "ready" before the verified upload.
async function migrateGuestToEmptyAccount(userId, currentRefUserId) {
  if (_guestMigrationRunning) return { ok: false, busy: true, error: GUEST_MIGRATION_TEXTS.busy };
  _guestMigrationRunning = true;
  try {
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    if (!(await waitForSyncIdle())) return { ok: false, error: SYNC_STILL_RUNNING_TEXT };
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    const ns = getLocalDataNamespace(userId);
    const markerNow = getAccountInitMarker(userId);
    if (markerNow && markerNow.status === "ready") return { ok: false, alreadyReady: true };
    // another source-selection state of this account (cloud load, device upload …) is never taken over;
    // an unknown / damaged marker counts as no marker (as everywhere in 4A.3) and is replaced below
    if (markerNow && isKnownAccountInitStatus(markerNow.status) && markerNow.status !== "migrating_guest") return { ok: false, blocked: "not_empty", error: GUEST_MIGRATION_TEXTS.notEmpty };
    const resuming = !!(markerNow && markerNow.status === "migrating_guest");
    let serverDone = false;
    const gm = getGuestMigrationMarker();
    if (guestMarkerBinding(userId)) return { ok: false, blocked: "guest_other_account", error: GUEST_MIGRATION_TEXTS.otherAccount };
    if (resuming) {
      const consistent =
        markerNow.userId === userId && markerNow.namespace === ns && markerNow.attemptId && markerNow.backupId && markerNow.deviceId &&
        (markerNow.phase === "copying" || markerNow.phase === "uploading") &&
        gm && gm.attemptId === markerNow.attemptId && gm.backupId === markerNow.backupId;
      if (!consistent) return { ok: false, resumeUnsafe: true, error: GUEST_MIGRATION_TEXTS.resumeMismatch };
      // F-5 (Etap 6): an upload the server already confirmed as `completed` is only finalized (below)
      serverDone = markerNow.phase === "uploading" && (await ownAttemptCompletedOnServer(userId, markerNow.serverAttemptId, markerNow.deviceId));
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      if (!serverDone && !findGuestMigrationBackup(markerNow.backupId)) return { ok: false, resumeUnsafe: true, error: GUEST_MIGRATION_TEXTS.noBackup };
    }
    // Fresh checks — the result shown on the offer screen is never trusted on its own.
    if (!resuming && accountLocalBlocksGuestMigration(userId)) return { ok: false, blocked: "not_empty", error: GUEST_MIGRATION_TEXTS.notEmpty };
    const deviceId = resuming ? markerNow.deviceId : getOrCreateDeviceId();
    if (!deviceId) return { ok: false, error: GUEST_MIGRATION_TEXTS.copyFailed };

    // Stage 4A.4 F-5 (Etap 6): the server attempt. Its id (first: the guest attempt id) is kept in the
    // "migrating_guest" marker, written and read back before every start RPC.
    const persistId = (id) => {
      const m = getAccountInitMarker(userId);
      if (!m || m.status !== "migrating_guest" || m.deviceId !== deviceId) return false;
      if (m.serverAttemptId !== id) setAccountInitMarker(userId, { ...m, serverAttemptId: id });
      return (getAccountInitMarker(userId) || {}).serverAttemptId === id;
    };
    // the account becomes ready only here — after the server confirmed `completed` for this attempt
    const finalize = async (attemptIdLocal, fingerprintLocal, backupIdLocal, serverAttemptId) => {
      setAccountInitMarker(userId, { status: "ready", source: "guest", syncPaused: false });
      // Stage 4A.4 Part 2: the completed marker — this guest data (fingerprint) is now in this account.
      // It keeps the guest data bound to it (F-4) and protects the backup; no user data in it.
      let cleanupStatus = "not_started"; // the completed marker could not be written → nothing was cleaned
      try {
        const gmNow = getGuestMigrationMarker();
        if (gmNow && gmNow.attemptId === attemptIdLocal && gmNow.targetUserId === userId) {
          setGuestMigrationMarker({ status: "completed", targetUserId: userId, fingerprint: fingerprintLocal, backupId: backupIdLocal, attemptId: attemptIdLocal, serverAttemptId, startedAt: gmNow.startedAt || null, completedAt: new Date().toISOString(), cleanup: "pending" });
        }
        // D1: cleanup of the moved guest data — never a condition of the account's success
        cleanupStatus = "failed";
        cleanupStatus = (await cleanupMigratedGuestData(userId, currentRefUserId)).status;
      } catch (e) {
        console.error("guest cleanup after migration failed", e); // the account is ready; cleanup is retried later
      }
      return { ok: true, cleanup: cleanupStatus, draftKept: readNamespaceEntry("active_workout_draft", null).state !== "missing" };
    };
    let token = null;
    if (resuming && serverDone) {
      _accountInitBusy = true;
      try {
        return await finalize(markerNow.attemptId, markerNow.fingerprint, markerNow.backupId, markerNow.serverAttemptId);
      } finally {
        _accountInitBusy = false;
      }
    }
    if (resuming) {
      // purely local refusals first — a resume that cannot happen never locks the account
      if (markerNow.phase !== "uploading") {
        const guest = readMigratableDataset(null);
        if (guest.damage.length) return { ok: false, blocked: "damaged", damage: guest.damage, error: `${GUEST_MIGRATION_TEXTS.damaged} Uszkodzone: ${damageText(guest.damage)}.` };
        if (migratableDataFingerprint(null) !== markerNow.fingerprint) return { ok: false, resumeUnsafe: true, error: GUEST_MIGRATION_TEXTS.guestChanged };
        // Etap 11: an upload bound to fail is not resumed either (the attempt is not taken)
        const dataBlockers = cloudUploadBlockers(prepareV1UploadDataset(guest).dataset);
        if (dataBlockers.length) return { ok: false, blocked: "invalid_data", dataBlockers, error: cloudUploadBlockersText(dataBlockers, { resuming: true }) };
      } else {
        const localCheck = prepareAccountDatasetForUpload(userId, { resuming: true });
        if (!localCheck.ok) return { ok: false, resumeUnsafe: !!localCheck.resumeUnsafe, integrityIssues: localCheck.integrityIssues, dataBlockers: localCheck.dataBlockers, error: localCheck.error };
      }
      const acq = await acquireFlowAttempt({ userId, deviceId, kind: "guest_to_account", flow: "guest", attemptId: migrationAttemptIdFrom(markerNow.serverAttemptId, markerNow.attemptId), persistId });
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      if (isOwnCompletedAttempt(acq, deviceId) && markerNow.phase === "uploading") {
        _accountInitBusy = true;
        try {
          return await finalize(markerNow.attemptId, markerNow.fingerprint, markerNow.backupId, acq.attemptId);
        } finally {
          _accountInitBusy = false;
        }
      }
      if (!acq.ok) return { ok: false, migration: acq.reason, closed: acq.reason === "closed", row: acq.row || null, error: acq.error };
      token = acq.attemptId;
    }
    // F-5: ends this device's server attempt (cancelled when it wrote nothing) BEFORE local markers go
    const endServerAttempt = async () => {
      if (!token) return { ok: true, status: "missing" };
      const end = await endOwnMigrationAttempt({ attemptId: token, deviceId });
      if (end.ok) noteMigrationAttemptStatus(userId, token, end.status);
      return end;
    };
    let cloud;
    try {
      cloud = await checkCloudAccountData(userId, { ...guestMigrationCloudOptions(resuming, deviceId, userId), migrationToken: token });
    } catch (e) {
      return { ok: false, error: authErrorText(e) };
    }
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    if (cloud.hasData && !resuming) return { ok: false, blocked: "cloud_changed", cloud, error: GUEST_MIGRATION_TEXTS.cloudChanged };

    _accountInitBusy = true;
    try {
      if (cloud.hasData) {
        // resuming, and data of ANOTHER device appeared meanwhile: never overwrite / merge — drop our local
        // copy (the account had nothing before it), end the attempt, decide the source again.
        const end = await endServerAttempt();
        if (!end.ok) return { ok: false, error: end.error };
        if (end.status === "abandoned" || end.status === "uploading") return { ok: false, partial: true, error: GUEST_MIGRATION_TEXTS.partial };
        endAttemptAfterForeignData(userId, markerNow, markerNow.phase === "uploading");
        return { ok: false, blocked: "cloud_changed", cloud, error: GUEST_MIGRATION_TEXTS.cloudChanged };
      }
      const phase = resuming ? markerNow.phase : null;
      let attemptId = resuming ? markerNow.attemptId : newUuid();
      let backupId = resuming ? markerNow.backupId : null;
      let fingerprint = resuming ? markerNow.fingerprint : null;
      if (!resuming || phase !== "uploading") {
        // (Re)build the account copy from the guest: a first attempt, or a restart before the copy was confirmed.
        const guest = readMigratableDataset(null);
        if (guest.damage.length) return { ok: false, blocked: "damaged", damage: guest.damage, error: `${GUEST_MIGRATION_TEXTS.damaged} Uszkodzone: ${damageText(guest.damage)}.` };
        if (!guestHasMigratableData().hasData) return { ok: false, blocked: "nothing", error: GUEST_MIGRATION_TEXTS.nothing };
        const currentFingerprint = migratableDataFingerprint(null);
        if (resuming && currentFingerprint !== fingerprint) return { ok: false, resumeUnsafe: true, error: GUEST_MIGRATION_TEXTS.guestChanged };
        fingerprint = currentFingerprint;
        const prepared = { ...prepareV1UploadDataset(guest), present: guest.present };
        const integrityIssues = v1DatasetIntegrityIssues(prepared.dataset);
        if (integrityIssues.length) return { ok: false, blocked: "integrity", integrityIssues, error: v1IntegrityIssuesText(integrityIssues) };
        // Etap 11: unrepairable values stop here — before the backup, the markers and the server attempt
        const dataBlockers = cloudUploadBlockers(prepared.dataset);
        if (dataBlockers.length) return { ok: false, blocked: "invalid_data", dataBlockers, error: cloudUploadBlockersText(dataBlockers) };
        // F-3 (review P1): soft-deleted cloud rows with the same identities → stop before the backup / any write
        let collisions;
        try {
          // the exercise list V1 will really upload (the default atlas when the guest has none — guestMigrationEntries)
          const ex = prepared.present && prepared.present.exercises && prepared.dataset.exercises.length ? prepared.dataset.exercises : BUILT_IN_EXERCISES.map(normalizeExercise);
          collisions = await v1DeletedRowCollisions(userId, { ...prepared.dataset, exercises: ex }, { migrationToken: token });
        } catch (e) {
          return { ok: false, error: authErrorText(e) };
        }
        if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
        if (collisions.length) return { ok: false, blocked: "deleted_collision", deletedCollisions: collisions, error: DELETED_COLLISION_TEXT };
        if (!resuming) {
          const backup = createGuestMigrationBackup({ targetUserId: userId, fingerprint, attemptId });
          if (!backup) return { ok: false, blocked: "backup_failed", error: GUEST_MIGRATION_TEXTS.backupFailed };
          backupId = backup.backupId;
          const startedAt = new Date().toISOString();
          setGuestMigrationMarker({ status: "migrating", targetUserId: userId, fingerprint, backupId, attemptId, startedAt });
          const serverId = migrationAttemptIdFrom(attemptId);
          setAccountInitMarker(userId, { status: "migrating_guest", source: "guest", syncPaused: true, userId, namespace: ns, deviceId, backupId, fingerprint, attemptId, serverAttemptId: serverId, phase: "copying", startedAt });
          // F-5: the server attempt starts BEFORE the copy is written and before any cloud write
          const acq = await acquireFlowAttempt({ userId, deviceId, kind: "guest_to_account", flow: "guest", attemptId: serverId, persistId });
          if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true }; // markers stay: resumable (nothing written)
          if (!acq.ok) {
            // a definite refusal created nothing on the server and nothing was copied or sent → the state before
            if (MIGRATION_START_REFUSED.has(acq.reason)) {
              clearAccountInitMarker(userId);
              const gmNow = getGuestMigrationMarker();
              if (gmNow && gmNow.targetUserId === userId && gmNow.attemptId === attemptId) clearGuestMigrationMarker();
            }
            return { ok: false, migration: acq.reason, error: acq.error };
          }
          token = acq.attemptId;
        } else {
          clearGuestMigrationCopy(userId); // an unconfirmed copy from the interrupted attempt
        }
        if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
        const includeUserName = readAccountUserName(userId).trim() === "" && !(cloud.details && cloud.details.displayName);
        if (!writeNamespaceEntries(userId, guestMigrationEntries(prepared, { includeUserName }))) {
          // the attempt wrote nothing in the cloud — it ends first (server-confirmed cancel), then the markers
          const end = await endServerAttempt();
          if (!end.ok || (end.status !== "cancelled" && end.status !== "missing")) return { ok: false, blocked: "copy_failed", error: GUEST_MIGRATION_TEXTS.copyFailed };
          clearGuestMigrationCopy(userId);
          clearAccountInitMarker(userId);
          clearGuestMigrationMarker();
          return { ok: false, blocked: "copy_failed", error: GUEST_MIGRATION_TEXTS.copyFailed };
        }
        const m = getAccountInitMarker(userId);
        setAccountInitMarker(userId, { ...m, phase: "uploading" });
      } else {
        // The confirmed copy is uploaded as it is. It was prepared before the first upload; if it would
        // still change, rows already sent could be orphaned (F-1) → refuse.
        const prep = prepareAccountDatasetForUpload(userId, { resuming: true });
        if (!prep.ok) return { ok: false, resumeUnsafe: !!prep.resumeUnsafe, integrityIssues: prep.integrityIssues, dataBlockers: prep.dataBlockers, error: prep.error };
        let collisions;
        try {
          collisions = await v1DeletedRowCollisions(userId, readMigratableDataset(userId), { migrationToken: token });
        } catch (e) {
          return { ok: false, error: authErrorText(e) };
        }
        if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
        if (collisions.length) return { ok: false, deletedCollisions: collisions, error: DELETED_COLLISION_TEXT };
      }
      // Re-check the cloud right before the first cloud write (after the start, WITH the attempt's id): only this
      // attempt's own device rows may be there.
      let recheck;
      try {
        recheck = await checkCloudAccountData(userId, { ...guestMigrationCloudOptions(resuming, deviceId, userId), migrationToken: token });
      } catch (e) {
        return { ok: false, error: authErrorText(e) };
      }
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      if (recheck.hasData) {
        const end = await endServerAttempt();
        if (!end.ok) return { ok: false, error: end.error };
        if (end.status === "abandoned" || end.status === "uploading") return { ok: false, partial: true, error: GUEST_MIGRATION_TEXTS.partial };
        endAttemptAfterForeignData(userId, getAccountInitMarker(userId), resuming && phase === "uploading");
        return { ok: false, blocked: "cloud_changed", cloud: recheck, error: GUEST_MIGRATION_TEXTS.cloudChanged };
      }
      const up = await runV1UnderAttempt({ userId, deviceId, attemptId: token });
      if (!up.ok) return { ok: false, closed: !!up.closed, row: up.row || null, error: up.error };
      if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
      return await finalize(attemptId, fingerprint, backupId, token);
    } finally {
      _accountInitBusy = false;
    }
  } catch (e) {
    return { ok: false, error: authErrorText(e) };
  } finally {
    _guestMigrationRunning = false;
  }
}

// "Wróć bez przenoszenia": ends an unfinished guest migration of THIS account — but only while that can be
// undone completely. Only the copy written into the account namespace is removed (the account was empty
// before); the guest data, the backup and the cloud are never touched.
// Stage 4A.4 Part 2 (F-5): once the attempt reached the upload phase, rows of THIS attempt's device may be
// in the cloud. They are never deleted (no heuristic cloud deletes) — and never left behind as if they
// were the account's normal, complete data. So:
//   • nothing of this device's attempt in the cloud (checked: data rows + edited built-in exercises,
//     only rows with the attempt's device id)  → full reset, the offer can come again;
//   • rows found, or the check is impossible (offline / error) → NOTHING changes; { partial: true | "unknown" }
//     — the user finishes the transfer, or consciously starts without it (startAccountWithoutGuestPartial).
async function abandonGuestMigration(userId, currentRefUserId) {
  if (_guestMigrationRunning) return { ok: false, busy: true, error: GUEST_MIGRATION_TEXTS.busy };
  _guestMigrationRunning = true; // single flight: no migration / retry may start while this runs
  try {
    return await abandonGuestMigrationUnlocked(userId, currentRefUserId);
  } finally {
    _guestMigrationRunning = false;
  }
}
async function abandonGuestMigrationUnlocked(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const m = getAccountInitMarker(userId);
  if (!m || m.status !== "migrating_guest") return { ok: false, discarded: true };
  if (m.serverAttemptId && m.deviceId) {
    // Stage 4A.4 F-5 (Etap 6): the SERVER decides — `cancelled` only when it confirms that this attempt wrote
    // nothing; with writes the attempt becomes `abandoned` (account locked until finished or consciously
    // accepted) and nothing local changes. Unreachable server → nothing changes either ("unknown").
    const end = await endOwnMigrationAttempt({ attemptId: m.serverAttemptId, deviceId: m.deviceId });
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    if (!end.ok) return { ok: false, partial: "unknown", error: GUEST_MIGRATION_TEXTS.partialUnknown };
    noteMigrationAttemptStatus(userId, m.serverAttemptId, end.status);
    // the server already confirmed `completed` for this device's attempt (the app stopped before finishing
    // locally): nothing is undone — the caller finishes the migration (resume → finalize, no re-upload)
    if (end.status === "completed" && end.row && end.row.device_id === m.deviceId) return { ok: false, completed: true };
    if (end.status !== "cancelled" && end.status !== "missing") return { ok: false, partial: true, serverStatus: end.status, error: GUEST_MIGRATION_TEXTS.partial };
    if ((getAccountInitMarker(userId) || {}).serverAttemptId !== m.serverAttemptId) return { ok: false, discarded: true }; // changed meanwhile
  } else if (m.phase !== "copying") {
    let own;
    try {
      own = m.deviceId ? await checkCloudAccountData(userId, { onlyDeviceId: m.deviceId, editedBuiltIns: true }) : null;
    } catch (e) {
      own = null;
    }
    if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
    if (!own) return { ok: false, partial: "unknown", error: GUEST_MIGRATION_TEXTS.partialUnknown };
    if (own.hasData) return { ok: false, partial: true, error: GUEST_MIGRATION_TEXTS.partial };
    if ((getAccountInitMarker(userId) || {}).attemptId !== m.attemptId) return { ok: false, discarded: true }; // changed meanwhile
  }
  _accountInitBusy = true;
  try {
    clearGuestMigrationCopy(userId);
    clearAccountInitMarker(userId);
    const gm = getGuestMigrationMarker();
    if (gm && gm.targetUserId === userId && (!m.attemptId || gm.attemptId === m.attemptId)) clearGuestMigrationMarker();
    return { ok: true };
  } finally {
    _accountInitBusy = false;
  }
}

// F-5, the conscious way out after a partial upload: the account goes on WITHOUT the local copy of the guest data
// (the guest data itself + its backup stay in guest mode). Stage 4A.4 F-5 (Etap 6): when the SERVER confirmed
// the acceptance (accepted_incomplete — terminal, never `completed`, no new V1), normal sync resumes as the
// server policy allows: the account uses what the cloud holds, flagged permanently as incomplete. Only a legacy
// transfer without a server attempt (nothing for the server to know) keeps sync PAUSED (ready/empty, syncPaused).
// a note `guest_partial_upload` (no user data) remembers on this device that the cloud holds an incomplete
// transfer, so a later source choice never presents it as normal data. The guest data stays bound to this
// account's attempt (guest marker "abandoned_partial") — another account needs an explicit release (F-4).
const GUEST_PARTIAL_NOTE = "guest_partial_upload";
function getGuestPartialNote(userId) {
  const n = readNamespaceJson(GUEST_PARTIAL_NOTE, userId);
  return n && typeof n === "object" && !Array.isArray(n) ? n : null;
}
async function startAccountWithoutGuestPartial(userId, currentRefUserId) {
  if (_guestMigrationRunning) return { ok: false, busy: true, error: GUEST_MIGRATION_TEXTS.busy };
  _guestMigrationRunning = true;
  try {
    return await startAccountWithoutGuestPartialUnlocked(userId, currentRefUserId);
  } finally {
    _guestMigrationRunning = false;
  }
}
async function startAccountWithoutGuestPartialUnlocked(userId, currentRefUserId) {
  if (!(await stillSameAccount(userId, currentRefUserId))) return { ok: false, discarded: true };
  const m = getAccountInitMarker(userId);
  if (!m || m.status !== "migrating_guest" || m.phase === "copying") return { ok: false, discarded: true };
  let serverAccepted = false;
  if (m.serverAttemptId && m.deviceId) {
    // Stage 4A.4 F-5 (Etap 6): the explicit (UI-confirmed) acceptance of the incomplete cloud data — on the
    // server FIRST (terminal; never `completed`; no new V1 afterwards). Refused / unreachable → nothing changes.
    const acc = await acceptIncompleteOwnUpload(userId, currentRefUserId, { attemptId: m.serverAttemptId, deviceId: m.deviceId });
    if (!acc.ok) return { ok: false, discarded: !!acc.discarded, error: acc.error };
    const now = getAccountInitMarker(userId);
    if (!now || now.status !== "migrating_guest" || now.serverAttemptId !== m.serverAttemptId) return { ok: false, discarded: true };
    serverAccepted = acc.status === "accepted_incomplete";
  }
  _accountInitBusy = true;
  try {
    localStorage.setItem(getStorageKey(GUEST_PARTIAL_NOTE, userId), JSON.stringify({ deviceId: m.deviceId || null, attemptId: m.attemptId || null, backupId: m.backupId || null, at: new Date().toISOString() }));
    clearGuestMigrationCopy(userId);
    if (serverAccepted) setAccountInitMarker(userId, { status: "ready", source: "cloud", syncPaused: false, incompleteAccepted: m.serverAttemptId });
    else setAccountInitMarker(userId, { status: "ready", source: "empty", syncPaused: true });
    const gm = getGuestMigrationMarker();
    if (gm && gm.targetUserId === userId && gm.attemptId === m.attemptId) setGuestMigrationMarker({ ...gm, status: "abandoned_partial", abandonedAt: new Date().toISOString() });
    return { ok: true };
  } finally {
    _accountInitBusy = false;
  }
}

// Local PRO (Stage 4A.2): pro_status / pro_hints now live in each namespace. The old global
// values are copied ONCE — and only into the namespace that inherited the old global data in
// Stage 4A.1 — so nobody loses local PRO and no other account inherits it. Old keys stay.
const LOCAL_PRO_MIGRATION_KEY = "nextrep_local_pro_migration_v1";
function migrateLegacyProOnce() {
  try {
    if (localStorage.getItem(LOCAL_PRO_MIGRATION_KEY)) return;
    const nsMig = getLocalNamespaceMigration();
    if (!nsMig || nsMig.status !== "completed") return; // retried after the namespace copy succeeded
    const copied = [];
    for (const [name, legacyKey] of [["pro_status", "trainapp_pro_status_v1"], ["pro_hints", "trainapp_pro_hints_v1"]]) {
      const raw = localStorage.getItem(legacyKey);
      const target = `nextrep_${nsMig.target}_${name}_v1`;
      if (raw != null && localStorage.getItem(target) == null) {
        localStorage.setItem(target, raw);
        copied.push(name);
      }
    }
    localStorage.setItem(LOCAL_PRO_MIGRATION_KEY, JSON.stringify({ status: "completed", target: nsMig.target, copied, at: new Date().toISOString() }));
  } catch {}
}


