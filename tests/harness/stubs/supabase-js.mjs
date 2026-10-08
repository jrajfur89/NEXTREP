// In-memory fake of @supabase/supabase-js for tests. NEVER contacts a real Supabase project.
//
// Control it from a test through globalThis.__nrSupabase (created on first createClient):
//   __nrSupabase.session        — current auth session object or null (default null = logged out)
//   __nrSupabase.tables[name]   — array of rows for a table (default: empty)
//   __nrSupabase.rpc[fn]        — (args) => ({ data, error }) handler for supabase.rpc(fn)
//   __nrSupabase.failNetwork    — true → every call rejects/returns a "Failed to fetch" error
//   __nrSupabase.calls          — log of every call: { kind, table|fn, op, args }
//   __nrSupabase.holdGetSession — true → getSession() stays pending (like the SDK retrying an
//                                 expired-token refresh while offline) until releaseGetSession()
//   __nrSupabase.queryHook      — optional (query) => error|null, called before every table query
//                                 executes (e.g. fail one page of a paginated read)
//   __nrSupabase.maxRows        — optional server-side cap on rows per read (like PostgREST max_rows)
//   __nrSupabase.queryGate      — optional async (query) => void, awaited before a table query
//                                 executes (pause a query deterministically until the test lets go)
//   __nrSupabase.reset()        — back to defaults
//
// Supported query-builder subset (what index.html uses): select, insert, update, upsert, delete,
// eq, neq, is, match, not, limit, order, in, gte, lte, gt, lt, range, single, maybeSingle.
// Filters eq/neq/is/match/in/gte/lte/gt/lt are applied; order (one column) and range (offset
// window) are applied to reads; select(cols, { count: "exact" }) returns the total before range.
// `not(col, "is", null)` is applied; other `not` forms are recorded only.
//
// Stage 4A.4 F-5 (Etap 6): a faithful in-memory model of the server side of SQL v3 + read guard C v2:
//   __nrSupabase.tables.nextrep_migration_attempts — attempt rows (readable through .from() like any table)
//   rpc nextrep_migration_attempt_{start,resume,complete,abandon,cancel,accept_incomplete,touch} — v3 rules
//   write lock on the 10 data tables (NR001 / NR002, writes_count) and read guard C (NR001 on SELECT)
//   — both driven by the request header x-nextrep-migration-attempt (setHeader on the builder)
//   __nrSupabase.headerLog      — [{ table|fn, op, token }] every executed request with its migration token
//   __nrSupabase.rpcFail[fn]    — queue of errors returned (and consumed) before the handler runs (e.g. 57014)
//   __nrSupabase.f5Missing      — true → attempts table / RPCs do not exist (PGRST205 / PGRST202), like a
//                                 database without SQL v3
//   __nrSupabase.f5Server=false — turns the whole F-5 model off
// With no attempt rows the model changes nothing (accounts without markers behave exactly as before).

function state() {
  if (!globalThis.__nrSupabase) {
    const s = {
      session: null,
      tables: {},
      rpc: {},
      failNetwork: false,
      calls: [],
      authListeners: [],
      holdGetSession: false,
      pendingGetSession: [],
      queryHook: null,
      queryGate: null,
      maxRows: null,
      headerLog: [],
      rpcFail: {},
      f5Missing: false,
      f5Server: true,
      releaseGetSession(session = null) {
        const waiting = s.pendingGetSession;
        s.pendingGetSession = [];
        waiting.forEach((resolve) => resolve({ data: { session }, error: null }));
      },
      reset() {
        s.session = null;
        s.tables = {};
        s.rpc = {};
        s.failNetwork = false;
        s.calls = [];
        s.authListeners = [];
        s.holdGetSession = false;
        s.pendingGetSession = [];
        s.queryHook = null;
        s.queryGate = null;
        s.maxRows = null;
        s.headerLog = [];
        s.rpcFail = {};
        s.f5Missing = false;
        s.f5Server = true;
      },
      emitAuth(event, session) {
        s.session = session;
        s.authListeners.forEach((cb) => cb(event, session));
      },
    };
    globalThis.__nrSupabase = s;
  }
  return globalThis.__nrSupabase;
}

// Column defaults of the real schema (version DEFAULT 1, updated_at DEFAULT now(), deleted_at NULL on
// the versioned nextrep_* data tables) — so rows inserted through the fake look like real rows.
const VERSIONED_TABLES = new Set(["nextrep_exercises", "nextrep_plans", "nextrep_plan_items", "nextrep_plan_item_sets", "nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_measurements", "nextrep_custom_fields"]);
function dbDefaults(table) {
  if (!VERSIONED_TABLES.has(table)) return {};
  return { version: 1, updated_at: new Date().toISOString(), deleted_at: null };
}

const netError = () => Object.assign(new TypeError("Failed to fetch"), { name: "TypeError" });

// ---------------- Stage 4A.4 F-5: server model (SQL v3 + read guard C v2) ----------------
const F5_HEADER = "x-nextrep-migration-attempt";
const F5_LOCKED_TABLES = new Set(["nextrep_exercises", "nextrep_plans", "nextrep_plan_items", "nextrep_plan_item_sets", "nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_measurements", "nextrep_custom_fields", "nextrep_profiles"]);
const F5_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const f5Err = (code, message, details = null, hint = null) => ({ code, message, details, hint });
const f5Attempts = (s) => (s.tables.nextrep_migration_attempts = s.tables.nextrep_migration_attempts || []);
const f5Uid = (s) => (s.session && s.session.user && s.session.user.id) || null;
const f5Token = (headers) => {
  const v = headers && headers[F5_HEADER];
  return typeof v === "string" && F5_UUID.test(v) ? v.toLowerCase() : null;
};
const f5Blocking = (s, userId) => f5Attempts(s).find((a) => a.user_id === userId && (a.status === "uploading" || a.status === "abandoned")) || null;
const nowIso = () => new Date().toISOString();
// the guard trigger: every status change sets its own timestamp, updated_at always moves
function f5Transition(a, status, extra = {}) {
  Object.assign(a, extra, { status, updated_at: nowIso() });
  if (status === "completed") a.completed_at = nowIso();
  if (status === "abandoned") a.abandoned_at = nowIso();
  if (status === "cancelled") a.cancelled_at = nowIso();
  if (status === "accepted_incomplete") a.resolved_at = nowIso();
  if (status === "uploading") a.last_resumed_at = nowIso();
}
// write lock trigger: { error } → the statement fails; otherwise count `rows` authorised writes
function f5WriteLock(s, table, targetUser, headers, rows) {
  if (s.f5Server === false || s.f5Missing || !F5_LOCKED_TABLES.has(table) || !targetUser) return null;
  const caller = f5Uid(s);
  if (caller && targetUser !== caller) return null; // RLS rejects it; the trigger reveals nothing
  const token = f5Token(headers);
  if (token) {
    const t = f5Attempts(s).find((a) => a.attempt_id === token);
    if (t && t.user_id === targetUser && t.status !== "uploading") return f5Err("NR002", "migration_attempt_closed", null, "This upload attempt is no longer active; stop uploading and re-read its status.");
  }
  const b = f5Blocking(s, targetUser);
  if (!b) return null;
  if (b.status === "abandoned") return f5Err("NR001", "migration_in_progress", "state=abandoned", "An interrupted upload of this account is not resolved yet; writes are paused until it is.");
  if (token !== b.attempt_id) return f5Err("NR001", "migration_in_progress", "state=uploading", "Another device of this account is uploading data; writes are paused until it ends.");
  if (rows > 0) {
    b.writes_count += rows;
    b.last_write_at = nowIso();
    b.updated_at = nowIso();
  }
  return null;
}
// read guard C v2 (pre-request): GET/HEAD on the 10 tables of an account with a blocking attempt
function f5ReadGuard(s, table, headers) {
  if (s.f5Server === false || s.f5Missing || !F5_LOCKED_TABLES.has(table)) return null;
  const caller = f5Uid(s);
  if (!caller) return null;
  const b = f5Blocking(s, caller);
  if (!b) return null;
  if (b.status === "uploading" && f5Token(headers) === b.attempt_id) return null;
  return f5Err("NR001", "migration_in_progress", `state=${b.status}`, "Data of this account is being uploaded by another device (or an interrupted upload is unresolved); reads are paused.");
}
const F5_RPC = {
  nextrep_migration_attempt_start(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    if (!a.p_attempt_id || !a.p_device_id) return { data: null, error: f5Err("22004", "attempt and device required") };
    if (!["guest_to_account", "device_upload"].includes(a.p_kind)) return { data: null, error: f5Err("22023", "invalid kind") };
    const list = f5Attempts(s);
    const found = list.find((r) => r.attempt_id === a.p_attempt_id);
    if (found) {
      if (found.user_id !== uid || found.device_id !== a.p_device_id || found.kind !== a.p_kind) return { data: null, error: f5Err("P0001", "attempt_not_yours") };
      return { data: { ...found }, error: null };
    }
    const blocking = f5Blocking(s, uid);
    if (blocking) return { data: null, error: f5Err("P0001", "active_attempt_exists", `state=${blocking.status}`) };
    if (list.some((r) => r.user_id === uid && r.status === "accepted_incomplete")) return { data: null, error: f5Err("P0001", "incomplete_data_accepted") };
    const row = {
      attempt_id: a.p_attempt_id, user_id: uid, device_id: a.p_device_id, kind: a.p_kind, status: "uploading", started_at: nowIso(), updated_at: nowIso(),
      completed_at: null, abandoned_at: null, cancelled_at: null, resolved_at: null, resolved_by_device: null, resume_count: 0, last_resumed_at: null,
      writes_count: 0, last_write_at: null, verified_counts: null, app_version: a.p_app_version ? String(a.p_app_version).slice(0, 40) : null,
    };
    list.push(row);
    return { data: { ...row }, error: null };
  },
  nextrep_migration_attempt_resume(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    const r = f5Attempts(s).find((x) => x.attempt_id === a.p_attempt_id && x.user_id === uid);
    if (r && r.device_id === a.p_device_id && r.status === "abandoned") {
      r.resume_count += 1;
      f5Transition(r, "uploading");
    }
    return { data: r ? { ...r } : null, error: null };
  },
  nextrep_migration_attempt_complete(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    if (!a.p_verified_counts || typeof a.p_verified_counts !== "object" || Array.isArray(a.p_verified_counts)) return { data: null, error: f5Err("22004", "verified counts required") };
    const r = f5Attempts(s).find((x) => x.attempt_id === a.p_attempt_id && x.user_id === uid);
    if (r && r.device_id === a.p_device_id && r.status === "uploading") f5Transition(r, "completed", { verified_counts: a.p_verified_counts });
    return { data: r ? { ...r } : null, error: null };
  },
  nextrep_migration_attempt_abandon(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    const r = f5Attempts(s).find((x) => x.attempt_id === a.p_attempt_id && x.user_id === uid);
    if (r && r.device_id === a.p_device_id && r.status === "uploading") f5Transition(r, "abandoned");
    return { data: r ? { ...r } : null, error: null };
  },
  nextrep_migration_attempt_cancel(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    if (!a.p_device_id) return { data: null, error: f5Err("22004", "device required") };
    const r = f5Attempts(s).find((x) => x.attempt_id === a.p_attempt_id && x.user_id === uid);
    if (r && r.writes_count === 0 && ((r.status === "uploading" && r.device_id === a.p_device_id) || r.status === "abandoned")) f5Transition(r, "cancelled");
    return { data: r ? { ...r } : null, error: null };
  },
  nextrep_migration_attempt_accept_incomplete(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    if (!a.p_device_id) return { data: null, error: f5Err("22004", "device required") };
    const r = f5Attempts(s).find((x) => x.attempt_id === a.p_attempt_id && x.user_id === uid);
    if (r && (r.status === "uploading" || r.status === "abandoned")) f5Transition(r, "accepted_incomplete", { resolved_by_device: a.p_device_id });
    return { data: r ? { ...r } : null, error: null };
  },
  nextrep_migration_attempt_touch(s, a) {
    const uid = f5Uid(s);
    if (!uid) return { data: null, error: f5Err("28000", "not authenticated") };
    const r = f5Attempts(s).find((x) => x.attempt_id === a.p_attempt_id && x.user_id === uid);
    if (r && r.device_id === a.p_device_id && r.status === "uploading") r.updated_at = nowIso();
    return { data: r ? { ...r } : null, error: null };
  },
};

class Query {
  constructor(table) {
    this.table = table;
    this.op = "select";
    this.payload = null;
    this.filters = [];
    this.limitN = null;
    this.singleMode = null;
    this.orderBy = null;
    this.rangeWin = null;
    this.countMode = null;
    this.headers = {};
  }
  // postgrest-js PostgrestBuilder.setHeader (per request; never shared with other queries)
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
    return this;
  }
  _log(op, args) {
    state().calls.push({ kind: "table", table: this.table, op, args });
    return this;
  }
  select(cols, opts) { if (this.op === "select") this.op = "select"; this.cols = cols; if (opts && opts.count) this.countMode = opts.count; return this._log("select", opts ? [cols, opts] : [cols]); }
  insert(rows) { this.op = "insert"; this.payload = rows; return this._log("insert", [rows]); }
  update(patch) { this.op = "update"; this.payload = patch; return this._log("update", [patch]); }
  upsert(rows, opts) { this.op = "upsert"; this.payload = rows; return this._log("upsert", [rows, opts]); }
  delete() { this.op = "delete"; return this._log("delete", []); }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this._log("eq", [c, v]); }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this._log("neq", [c, v]); }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this._log("is", [c, v]); }
  in(c, vs) { this.filters.push((r) => (vs || []).includes(r[c])); return this._log("in", [c, vs]); }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this._log("gte", [c, v]); }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this._log("lte", [c, v]); }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this._log("gt", [c, v]); }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this._log("lt", [c, v]); }
  match(obj) { this.filters.push((r) => Object.entries(obj || {}).every(([k, v]) => r[k] === v)); return this._log("match", [obj]); }
  // Stage 4A.4 Part 2: `not(col, "is", null)` (the only form index.html uses) is applied; other forms recorded only.
  not(c, op, v) {
    if (op === "is" && v === null) this.filters.push((r) => r[c] != null);
    return this._log("not", [c, op, v]);
  }
  order(col, opts) { this.orderBy = { col, asc: !(opts && opts.ascending === false) }; return this._log("order", [col, opts]); }
  range(from, to) { this.rangeWin = [from, to]; return this._log("range", [from, to]); }
  limit(n) { this.limitN = n; return this._log("limit", [n]); }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  _exec() {
    const s = state();
    if (s.failNetwork) return { data: null, error: netError() };
    if (s.queryHook) {
      const hookError = s.queryHook(this);
      if (hookError) return { data: null, error: hookError };
    }
    s.headerLog.push({ table: this.table, op: this.op, token: this.headers[F5_HEADER] ?? null });
    if (this.table === "nextrep_migration_attempts") {
      if (s.f5Missing) return { data: null, error: f5Err("PGRST205", "Could not find the table 'public.nextrep_migration_attempts' in the schema cache"), status: 404 };
      if (this.op !== "select") return { data: null, error: f5Err("42501", "permission denied for table nextrep_migration_attempts"), status: 403 };
    }
    // Stage 4A.4 F-5: read guard C (selects) and the v3 write lock (inserts / updates / upserts / deletes)
    if (this.op === "select") {
      const rg = f5ReadGuard(s, this.table, this.headers);
      if (rg) return { data: null, error: rg, status: 400 };
    } else {
      const existing = s.tables[this.table] || [];
      const list = this.op === "insert" || this.op === "upsert" ? (Array.isArray(this.payload) ? this.payload : [this.payload]) : null;
      const affected = list ? list.length : existing.filter((r) => this.filters.every((f) => f(r))).length;
      const target = list ? list[0] && list[0].user_id : f5Uid(s);
      if (affected > 0 || list) {
        const wl = f5WriteLock(s, this.table, target, this.headers, affected);
        if (wl) return { data: null, error: wl, status: 400 };
      }
    }
    const rows = (s.tables[this.table] = s.tables[this.table] || []);
    const match = this.table === "nextrep_migration_attempts" ? (r) => r.user_id === f5Uid(s) && this.filters.every((f) => f(r)) : (r) => this.filters.every((f) => f(r)); // RLS: own attempts only
    let data = null;
    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out = list.map((r) => ({ id: r.id || `fake-${Math.random().toString(36).slice(2)}`, ...dbDefaults(this.table), ...r }));
      rows.push(...out);
      data = out;
    } else if (this.op === "update") {
      data = rows.filter(match).map((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      data = rows.filter(match);
      s.tables[this.table] = rows.filter((r) => !match(r));
    } else {
      data = rows.filter(match);
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        data = [...data].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1)));
      }
    }
    const totalBeforeWindow = Array.isArray(data) ? data.length : 0;
    if (this.op === "select" && this.rangeWin) data = data.slice(this.rangeWin[0], this.rangeWin[1] + 1);
    if (this.limitN != null) data = data.slice(0, this.limitN);
    if (this.op === "select" && s.maxRows != null && Array.isArray(data)) data = data.slice(0, s.maxRows);
    if (this.singleMode) {
      if (data.length === 0) return this.singleMode === "maybe" ? { data: null, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      data = data[0];
    }
    if (this.countMode) return { data, error: null, count: totalBeforeWindow };
    return { data, error: null, count: Array.isArray(data) ? data.length : data ? 1 : 0 };
  }
  then(res, rej) {
    return Promise.resolve()
      .then(async () => {
        const gate = state().queryGate;
        if (gate) await gate(this);
        return this._exec();
      })
      .then(res, rej);
  }
}

export function createClient(url, key) {
  const s = state();
  s.calls.push({ kind: "createClient", args: [url, typeof key] });
  const auth = {
    async getSession() {
      s.calls.push({ kind: "auth", op: "getSession" });
      if (s.holdGetSession) return new Promise((resolve) => s.pendingGetSession.push(resolve));
      if (s.failNetwork) return { data: { session: null }, error: netError() };
      return { data: { session: s.session }, error: null };
    },
    onAuthStateChange(cb) {
      s.authListeners.push(cb);
      return { data: { subscription: { unsubscribe() { s.authListeners = s.authListeners.filter((x) => x !== cb); } } } };
    },
    async signInWithPassword(args) {
      s.calls.push({ kind: "auth", op: "signInWithPassword", args: [{ email: args && args.email }] });
      if (s.failNetwork) return { data: null, error: Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 }) };
      return { data: null, error: { message: "Invalid login credentials" } };
    },
    async signUp() { s.calls.push({ kind: "auth", op: "signUp" }); return { data: null, error: { message: "signUp disabled in tests" } }; },
    async signOut() { s.calls.push({ kind: "auth", op: "signOut" }); s.emitAuth("SIGNED_OUT", null); return { error: null }; },
    async resetPasswordForEmail() { s.calls.push({ kind: "auth", op: "resetPasswordForEmail" }); return { data: null, error: null }; },
    async updateUser() { s.calls.push({ kind: "auth", op: "updateUser" }); return { data: null, error: null }; },
  };
  return {
    auth,
    from(table) {
      return new Query(table);
    },
    async rpc(fn, args) {
      s.calls.push({ kind: "rpc", fn, args });
      s.headerLog.push({ fn, op: "rpc", token: null });
      if (s.failNetwork) return { data: null, error: netError() };
      const queued = s.rpcFail && Array.isArray(s.rpcFail[fn]) && s.rpcFail[fn].length ? s.rpcFail[fn].shift() : null;
      if (queued) return typeof queued === "function" ? queued(args) : { data: null, error: queued };
      const h = s.rpc[fn];
      if (h) return h(args);
      if (F5_RPC[fn] && s.f5Server !== false) {
        if (s.f5Missing) return { data: null, error: f5Err("PGRST202", `Could not find the function public.${fn} in the schema cache`) };
        return F5_RPC[fn](s, args || {});
      }
      return { data: null, error: { message: `rpc ${fn} not stubbed` } };
    },
  };
}
