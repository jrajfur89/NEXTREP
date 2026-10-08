// Stage 4A.4 Part 2 — hardening of guest → account migration: F-2 damaged guest JSON, F-5 partial cloud
// after abandon, F-4 guest marker bound to another account, F-3 deleted cloud rows in verification, safe
// guest cleanup + completed marker, retry / restart / abandon. REAL production functions, in-memory fake
// Supabase (no network, no RLS, no UNIQUE).
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, UB, key, cloudWrites } from "../harness/account-fixtures.mjs";

let A;
let S;
const clone = (v) => JSON.parse(JSON.stringify(v));
const readJson = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const GM_KEY = key(null, "guest_migration");
let refUser = UA;
const ref = () => refUser;
before(async () => {
  A = await loadApp();
});
function setup(userId = UA) {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.__testState.resetAccountInitBusy();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: userId } };
  refUser = userId;
  A.activateDataNamespace(userId);
}
beforeEach(() => setup());

const st = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const SD = [{ id: "sd1", target: "8-10", rir: "" }, { id: "sd2", target: "8-10", rir: "" }];
export const GUEST = {
  history: [
    { id: "g1", date: "2026-10-01T10:00:00.000Z", planId: "gp1", planName: "Gość", exercises: [{ id: "ge-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 60, 8), st("sd2", 60, 8)] }] },
    { id: "g2", date: "2026-10-03T10:00:00.000Z", planId: "gp1", planName: "Gość", exercises: [{ id: "ge-2", exerciseId: "custom-ex-1", name: "Moje", type: "weight", setsDetail: SD, sets: [st("sd1", 20, 12), st("sd2", 20, 12)] }] },
  ],
  plans: [{ id: "gp1", name: "Gość", exercises: [{ id: "gi1", exerciseId: "bench_press", setsDetail: SD }] }],
  measurements: [{ id: "gm1", date: "2026-10-02", weight: 80 }],
  custom_fields: [{ key: "biceps", label: "Biceps", unit: "cm" }],
  user_name: "Gosia",
};
function seedGuest({ draft = true, pro = true, raw = {} } = {}) {
  const exercises = [...A.DEFAULT_EXERCISES.map(A.normalizeExercise), { id: "custom-ex-1", name: "Moje", category: ["Klatka"], equipment: ["Sztanga"] }];
  for (const [name, v] of Object.entries({ ...GUEST, exercises })) localStorage.setItem(key(null, name), JSON.stringify(v));
  for (const [name, v] of Object.entries(raw)) localStorage.setItem(key(null, name), v); // raw strings (may be broken)
  if (draft) localStorage.setItem(key(null, "active_workout_draft"), JSON.stringify({ version: 1, blocks: [], plan: { name: "DRAFT-G" } }));
  if (pro) localStorage.setItem(key(null, "pro_status"), JSON.stringify({ manualPro: true, adUnlockExpiresAt: null }));
}
// every guest key except the technical migration marker, byte for byte
function guestDump() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("nextrep_guest_") && k !== GM_KEY) out[k] = localStorage.getItem(k);
  }
  return out;
}
const rows = (t) => S.tables[t] || [];
const migrate = (userId = UA) => quiet(() => A.migrateGuestToEmptyAccount(userId, ref));
const marker = (u = UA) => A.getAccountInitMarker(u);
const gmBackups = () => A.loadBackupList().filter((b) => b.kind === "BEFORE_GUEST_MIGRATION");

describe("F-2 — damaged guest data stops the migration (fail closed)", () => {
  const cases = [
    ["corrupt history", { history: '[{"id":"g1",' }],
    ["corrupt plans", { plans: "{not json" }],
    ["corrupt measurements", { measurements: "[1,2" }],
    ["corrupt custom fields", { custom_fields: "}{" }],
    ["corrupt exercises", { exercises: '[{"id":"bench_press"' }],
    ["corrupt user name", { user_name: "Gosia" }], // stored without JSON quotes = not valid JSON
    ["wrong-shape history (object)", { history: JSON.stringify({ g1: GUEST.history[0] }) }],
    ["wrong-shape plans (string)", { plans: JSON.stringify("plany") }],
    ["wrong-shape measurements (number)", { measurements: "42" }],
    ["wrong-shape user name (array)", { user_name: JSON.stringify(["Gosia"]) }],
    ["history entries that are not records", { history: JSON.stringify([1, 2]) }],
    ["exercise entries without id", { exercises: JSON.stringify([{ name: "X" }]) }],
    ["custom field entries without key", { custom_fields: JSON.stringify([{ label: "X" }]) }],
  ];
  for (const [name, raw] of cases) {
    test(`${name} → not migrated: zero cloud writes, not ready, guest bytes (incl. the damaged value) preserved`, async () => {
      seedGuest({ raw });
      const guestBefore = guestDump();
      S.calls = [];
      const r = await migrate();
      assert.notEqual(r.ok, true);
      assert.equal(r.blocked, "damaged", r.error);
      assert.match(r.error, /uszkodzon/);
      assert.equal(cloudWrites(S).length, 0, "zero cloud writes");
      assert.notEqual((marker() || {}).status, "ready");
      assert.equal(marker(), null, "no attempt started");
      assert.deepEqual(guestDump(), guestBefore, "guest data untouched — the damaged value is still there");
      assert.equal(localStorage.getItem(GM_KEY), null);
      assert.equal(gmBackups().length, 0);
      assert.equal(localStorage.getItem(key(UA, "history")), null, "nothing copied into the account");
    });
  }

  test("only a damaged history (nothing else) is still reported — never treated as 'no guest data'", () => {
    localStorage.setItem(key(null, "history"), "[{broken");
    const g = A.guestHasMigratableData();
    assert.equal(g.hasData, false);
    assert.deepEqual(g.damage, [{ name: "history", reason: "malformed" }]);
  });

  test("reader distinguishes missing / valid / malformed", () => {
    assert.deepEqual(A.readNamespaceEntry("history", null), { state: "missing" });
    localStorage.setItem(key(null, "history"), "[]");
    assert.deepEqual(A.readNamespaceEntry("history", null), { state: "valid", value: [] });
    localStorage.setItem(key(null, "history"), "[");
    assert.equal(A.readNamespaceEntry("history", null).state, "malformed");
  });

  test("4A.3 (Part 1 path): a malformed account history stops the device upload instead of uploading it as empty", async () => {
    localStorage.setItem(key(UA, "history"), '[{"id":"w1"');
    localStorage.setItem(key(UA, "plans"), JSON.stringify(GUEST.plans));
    S.calls = [];
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r.ok, false);
    assert.match(r.error, /uszkodzone/);
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(marker(), null);
    assert.equal(localStorage.getItem(key(UA, "history")), '[{"id":"w1"', "damaged value kept for diagnosis");
  });
});
