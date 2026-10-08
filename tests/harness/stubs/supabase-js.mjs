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
    const rows = (s.tables[this.table] = s.tables[this.table] || []);
    const match = (r) => this.filters.every((f) => f(r));
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
      if (s.failNetwork) return { data: null, error: netError() };
      const h = s.rpc[fn];
      return h ? h(args) : { data: null, error: { message: `rpc ${fn} not stubbed` } };
    },
  };
}
