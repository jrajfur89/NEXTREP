// In-memory fake of @supabase/supabase-js for tests. NEVER contacts a real Supabase project.
//
// Control it from a test through globalThis.__nrSupabase (created on first createClient):
//   __nrSupabase.session        — current auth session object or null (default null = logged out)
//   __nrSupabase.tables[name]   — array of rows for a table (default: empty)
//   __nrSupabase.rpc[fn]        — (args) => ({ data, error }) handler for supabase.rpc(fn)
//   __nrSupabase.failNetwork    — true → every call rejects/returns a "Failed to fetch" error
//   __nrSupabase.calls          — log of every call: { kind, table|fn, op, args }
//   __nrSupabase.reset()        — back to defaults
//
// Supported query-builder subset (what index.html uses): select, insert, update, upsert, delete,
// eq, neq, is, match, not, limit, order, in, gte, lte, gt, lt, range, single, maybeSingle.
// Filters eq/neq/is/match/in/gte/lte/gt/lt are applied; order/range/not are recorded only.

function state() {
  if (!globalThis.__nrSupabase) {
    const s = {
      session: null,
      tables: {},
      rpc: {},
      failNetwork: false,
      calls: [],
      authListeners: [],
      reset() {
        s.session = null;
        s.tables = {};
        s.rpc = {};
        s.failNetwork = false;
        s.calls = [];
        s.authListeners = [];
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

const netError = () => Object.assign(new TypeError("Failed to fetch"), { name: "TypeError" });

class Query {
  constructor(table) {
    this.table = table;
    this.op = "select";
    this.payload = null;
    this.filters = [];
    this.limitN = null;
    this.singleMode = null;
  }
  _log(op, args) {
    state().calls.push({ kind: "table", table: this.table, op, args });
    return this;
  }
  select(cols) { if (this.op === "select") this.op = "select"; this.cols = cols; return this._log("select", [cols]); }
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
  not(...a) { return this._log("not", a); }
  order(...a) { return this._log("order", a); }
  range(...a) { return this._log("range", a); }
  limit(n) { this.limitN = n; return this._log("limit", [n]); }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  _exec() {
    const s = state();
    if (s.failNetwork) return { data: null, error: netError() };
    const rows = (s.tables[this.table] = s.tables[this.table] || []);
    const match = (r) => this.filters.every((f) => f(r));
    let data = null;
    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out = list.map((r) => ({ id: r.id || `fake-${Math.random().toString(36).slice(2)}`, ...r }));
      rows.push(...out);
      data = out;
    } else if (this.op === "update") {
      data = rows.filter(match).map((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      data = rows.filter(match);
      s.tables[this.table] = rows.filter((r) => !match(r));
    } else {
      data = rows.filter(match);
    }
    if (this.limitN != null) data = data.slice(0, this.limitN);
    if (this.singleMode) {
      if (data.length === 0) return this.singleMode === "maybe" ? { data: null, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      data = data[0];
    }
    return { data, error: null, count: Array.isArray(data) ? data.length : data ? 1 : 0 };
  }
  then(res, rej) {
    return Promise.resolve().then(() => this._exec()).then(res, rej);
  }
}

export function createClient(url, key) {
  const s = state();
  s.calls.push({ kind: "createClient", args: [url, typeof key] });
  const auth = {
    async getSession() {
      s.calls.push({ kind: "auth", op: "getSession" });
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
