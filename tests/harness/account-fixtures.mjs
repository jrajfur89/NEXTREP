// Stage 4A.3 fixtures: account data + matching "cloud" rows produced by the app's OWN migration V1
// (so the rows have exactly the shape the sync engine reads). No network — the fake Supabase only.
import { loadApp, resetStorage } from "./load-app.mjs";
import { quiet } from "./fixtures.mjs";

export const UA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
export const UB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
export const key = (userId, name) => (userId ? `nextrep_user_${userId}_${name}_v1` : `nextrep_guest_${name}_v1`);

export const historySession = (id, planName, weight = "100", date = "2026-10-01T10:00:00.000Z") => ({
  id,
  date,
  planId: null,
  planName,
  exercises: [{ id: `we-${id}`, exerciseId: "bench_press", name: "Wyciskanie", type: "weight", sets: [{ id: `s-${id}`, weight, reps: "8", rir: "" }] }],
});

// Local data of one account, as raw localStorage entries (key → JSON string).
export function accountEntries(userId, { history = [], userName = "", extra = {} } = {}) {
  const out = { [key(userId, "history")]: JSON.stringify(history) };
  if (userName) out[key(userId, "user_name")] = JSON.stringify(userName);
  for (const [name, v] of Object.entries(extra)) out[key(userId, name)] = typeof v === "string" ? v : JSON.stringify(v);
  return out;
}

// Cloud tables for `userId` holding `history` (+ the default atlas, profile name), built by running
// runMigrationV1 against the fake. Leaves storage / fake reset afterwards.
export async function cloudTablesFor(userId, { history = [], userName = "", deviceId = null } = {}) {
  const A = await loadApp();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  const S = globalThis.__nrSupabase;
  S.session = { user: { id: userId } };
  A.activateDataNamespace(userId);
  if (deviceId) localStorage.setItem(A.getStorageKey("device_id", userId), deviceId);
  localStorage.setItem(A.getStorageKey("history", userId), JSON.stringify(history));
  if (userName) localStorage.setItem(A.getStorageKey("user_name", userId), JSON.stringify(userName));
  const r = await quiet(() => A.runMigrationV1());
  if (!r.success) throw new Error(`fixture migration failed: ${r.error}`);
  const tables = JSON.parse(JSON.stringify(S.tables));
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  return tables;
}

// Every localStorage entry as a plain object (byte-for-byte comparisons).
export function storageDump() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out[k] = localStorage.getItem(k);
  }
  return out;
}
export const cloudWrites = (S) => S.calls.filter((c) => c.kind === "table" && ["insert", "update", "upsert", "delete"].includes(c.op));
