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

// ---- F-5 ------------------------------------------------------------------------------------------
const failOnce = (table) => {
  let failed = false;
  S.queryHook = (q) => {
    if (!failed && q.table === table && (q.op === "insert" || q.op === "update")) {
      failed = true;
      return { message: "Failed to fetch" };
    }
    return null;
  };
};
const counts = () => ["nextrep_exercises", "nextrep_plans", "nextrep_plan_items", "nextrep_plan_item_sets", "nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_measurements", "nextrep_custom_fields"].map((t) => rows(t).length);
function restart(userId = UA) {
  A.__testState.resetActiveDataNamespace();
  A.__testState.resetAccountInitBusy();
  S.session = { user: { id: userId } };
  refUser = userId;
  S.queryHook = null;
  A.activateDataNamespace(userId);
}

describe("F-5 — a partial upload is never left behind as normal account data", () => {
  test("partial → abandon → nothing reset; restart → still the unfinished attempt (not ready, sync off), guest intact", async () => {
    seedGuest();
    const guestBefore = guestDump();
    failOnce("nextrep_workout_sets");
    await migrate();
    assert.ok(rows("nextrep_workouts").length > 0, "rows of this attempt are in the cloud");
    const cloudBefore = clone(S.tables);
    const r = await quiet(() => A.abandonGuestMigration(UA, ref));
    assert.equal(r.partial, true);
    assert.deepEqual(S.tables, cloudBefore, "no cloud delete / write");
    restart();
    assert.equal(marker().status, "migrating_guest");
    assert.equal(A.isAccountSyncAllowed(UA), false);
    assert.deepEqual(guestDump(), guestBefore);
  });

  test("partial → abandon while offline (own-rows check impossible) → partial 'unknown', nothing changed", async () => {
    seedGuest();
    failOnce("nextrep_workout_sets");
    await migrate();
    S.queryHook = (q) => (q.op === "select" ? { message: "Failed to fetch" } : null); // cloud unreachable, session known
    const r = await quiet(() => A.abandonGuestMigration(UA, ref));
    S.queryHook = null;
    assert.equal(r.partial, "unknown");
    assert.equal(marker().status, "migrating_guest");
    assert.ok(localStorage.getItem(key(UA, "history")), "copy kept");
  });

  test("partial → 'start without' → ready/empty with sync PAUSED + note; the incomplete rows are never pulled; the account can't be offered the guest data again", async () => {
    seedGuest();
    failOnce("nextrep_workout_sets");
    await migrate();
    await quiet(() => A.abandonGuestMigration(UA, ref));
    const r = await quiet(() => A.startAccountWithoutGuestPartial(UA, ref));
    assert.equal(r.ok, true);
    assert.deepEqual({ ...marker(), at: undefined }, { status: "ready", source: "empty", syncPaused: true, at: undefined });
    assert.equal(A.isAccountSyncAllowed(UA), false, "sync paused: nothing of the partial cloud comes in");
    const note = A.getGuestPartialNote(UA);
    assert.ok(note && note.deviceId && note.attemptId);
    assert.deepEqual(Object.keys(note).sort(), ["at", "attemptId", "backupId", "deviceId"], "no user data in the note");
    const sync = await quiet(() => A.runSync());
    assert.equal(localStorage.getItem(key(UA, "history")), null, `nothing pulled (${JSON.stringify(sync && sync.skipped)})`);
    assert.equal(A.accountLocalBlocksGuestMigration(UA), true, "no new guest migration into this account");
    assert.equal(readJson(GM_KEY).status, "abandoned_partial", "guest data stays bound to this account's attempt");
  });

  test("partial → retry → success; repeated failing retries keep the cloud row counts stable", async () => {
    seedGuest();
    failOnce("nextrep_workout_sets");
    await migrate();
    for (const t of ["nextrep_measurements", "nextrep_custom_fields", "nextrep_workout_exercises"]) {
      failOnce(t);
      const r = await migrate();
      assert.equal(r.ok, false);
    }
    S.queryHook = null;
    const ok = await migrate();
    assert.equal(ok.ok, true, ok.error);
    const once = counts();
    for (let i = 0; i < 3; i++) await quiet(() => A.runMigrationV1());
    assert.deepEqual(counts(), once, "stable counts");
    assert.deepEqual(rows("nextrep_workouts").map((x) => x.legacy_id).sort(), ["g1", "g2"]);
    assert.equal(rows("nextrep_workout_sets").length, 4);
  });

  test("partial → abandon → account B logs in on this device: nothing written for B or A, guest data bound to A's attempt", async () => {
    seedGuest();
    failOnce("nextrep_workout_sets");
    await migrate();
    await quiet(() => A.abandonGuestMigration(UA, ref));
    const cloudBefore = clone(S.tables);
    restart(UB);
    S.calls = [];
    const r = await migrate(UB);
    assert.equal(r.blocked, "guest_other_account");
    assert.equal(cloudWrites(S).length, 0);
    assert.deepEqual(S.tables, cloudBefore);
    assert.equal(A.getAccountInitMarker(UB), null);
    assert.equal(A.getAccountInitMarker(UA).status, "migrating_guest", "A's attempt untouched");
  });
});

// ---- F-4 ------------------------------------------------------------------------------------------
describe("F-4 — guest marker bound to another account: never released by age, only by an explicit decision", () => {
  const setGm = (v) => localStorage.setItem(GM_KEY, typeof v === "string" ? v : JSON.stringify(v));
  for (const status of ["migrating", "abandoned_partial", "completed"]) {
    test(`A's '${status}' marker binds the guest data for B (even years old); A itself is not blocked by it`, () => {
      setGm({ status, targetUserId: UA, attemptId: "a1", backupId: "b1", startedAt: "2020-01-01T00:00:00.000Z" });
      assert.deepEqual(A.guestMarkerBinding(UB), { status, targetUserId: UA, unverifiable: false });
      assert.equal(A.guestMarkerBinding(UA), null);
    });
  }
  test("a damaged marker or one without a target cannot be verified → binds EVERY account", () => {
    setGm("{broken");
    assert.equal(A.guestMarkerBinding(UA).unverifiable, true);
    assert.equal(A.guestMarkerBinding(UB).unverifiable, true);
    setGm({ status: "migrating" });
    assert.equal(A.guestMarkerBinding(UB).unverifiable, true);
  });
  test("B → migration refused (zero writes) until B explicitly releases; then B migrates; A's old attempt can't resume or write", async () => {
    seedGuest();
    failOnce("nextrep_workout_sets");
    await migrate(); // A: unfinished, partial rows in A's cloud
    const aRows = clone(S.tables);
    restart(UB);
    S.calls = [];
    assert.equal((await migrate(UB)).blocked, "guest_other_account");
    assert.equal(cloudWrites(S).length, 0);
    const rel = A.releaseGuestMigrationBinding(UB);
    assert.equal(rel.ok, true);
    const gm = readJson(GM_KEY);
    assert.equal(gm.status, "released");
    assert.equal(gm.releasedFrom.targetUserId, UA);
    assert.ok(!("history" in gm) && !("data" in gm), "no user data in the marker");
    const r = await migrate(UB);
    assert.equal(r.ok, true, r.error);
    assert.equal(readJson(GM_KEY).targetUserId, UB);
    assert.ok(rows("nextrep_workouts").some((x) => x.user_id === UB));
    // A comes back: its attempt is no longer the guest's — no resume, no write
    const before = clone(S.tables);
    restart(UA);
    S.calls = [];
    const ra = await migrate(UA);
    assert.equal(ra.ok, false);
    assert.equal(cloudWrites(S).length, 0);
    assert.deepEqual(S.tables, before);
    assert.ok(aRows.nextrep_workouts.every((x) => x.user_id === UA), "A's rows were only ever A's");
  });
  test("A deleted on another device (cannot be verified here) → B stays bound until it releases explicitly", async () => {
    seedGuest();
    setGm({ status: "completed", targetUserId: "deleted-elsewhere-user", attemptId: "z", backupId: "y" });
    restart(UB);
    assert.equal((await migrate(UB)).blocked, "guest_other_account");
    assert.ok(A.guestMarkerBinding(UB));
  });
  test("release is refused when nothing binds this account and while a migration runs", async () => {
    assert.equal(A.releaseGuestMigrationBinding(UA).ok, false, "no marker");
    setGm({ status: "migrating", targetUserId: UA, attemptId: "a" });
    assert.equal(A.releaseGuestMigrationBinding(UA).ok, false, "own marker is not 'another account'");
  });
});

// ---- F-3 ------------------------------------------------------------------------------------------
describe("F-3 — a soft-deleted cloud row never verifies a live local record", () => {
  const PLAN = [{ id: "p1", name: "P", exercises: [{ id: "i1", exerciseId: "bench_press", setsDetail: [{ id: "x1" }, { id: "x2" }] }] }];
  const H = [{ id: "w1", date: "2026-10-01T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: "bench_press", type: "weight", sets: [st("a1", 1, 1), st("a2", 1, 1)] }] }];
  async function uploaded() {
    localStorage.setItem(key(UA, "history"), JSON.stringify(H));
    localStorage.setItem(key(UA, "plans"), JSON.stringify(PLAN));
    localStorage.setItem(key(UA, "measurements"), JSON.stringify([{ id: "m1", date: "2026-10-01", weight: 80 }]));
    localStorage.setItem(key(UA, "custom_fields"), JSON.stringify([{ key: "biceps", label: "Biceps", unit: "cm" }]));
    localStorage.setItem(key(UA, "exercises"), JSON.stringify([...A.DEFAULT_EXERCISES.map(A.normalizeExercise), { id: "c1", name: "Moje" }]));
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, true, r.error);
    return {
      history: H,
      plans: PLAN,
      measurements: [{ id: "m1" }],
      customFields: [{ key: "biceps" }],
      exercises: [...A.DEFAULT_EXERCISES, { id: "c1" }],
    };
  }
  const del = (table, match) => {
    const row = rows(table).find(match);
    assert.ok(row, `row in ${table}`);
    row.deleted_at = "2026-10-05T10:00:00.000Z";
  };
  const cases = [
    ["workout", "nextrep_workouts", (r) => r.legacy_id === "w1", "history"],
    ["workout exercise", "nextrep_workout_exercises", (r) => r.legacy_id === "e1", "workoutExercises"],
    ["set", "nextrep_workout_sets", (r) => r.legacy_id === "a2", "workoutSets"],
    ["plan", "nextrep_plans", (r) => r.legacy_id === "p1", "plans"],
    ["plan item", "nextrep_plan_items", (r) => r.legacy_id === "i1", "planItems"],
    ["plan item set", "nextrep_plan_item_sets", (r) => r.legacy_id === "x2", "planItemSets"],
    ["measurement", "nextrep_measurements", (r) => r.legacy_id === "m1", "measurements"],
    ["custom field", "nextrep_custom_fields", (r) => r.field_key === "biceps", "customFields"],
    ["custom exercise", "nextrep_exercises", (r) => r.legacy_id === "c1", "exercises"],
  ];
  for (const [name, table, match, resultKey] of cases) {
    test(`live local ${name} + deleted cloud row → not found; a V1 re-run (which does not revive it) is not 'completed'`, async () => {
      const eligible = await uploaded();
      del(table, match);
      const v = await quiet(() => A.verifyMigrationV1(UA, eligible, A.getOrCreateDeviceId()));
      assert.equal(v.results[resultKey].allFound, false, resultKey);
      const r = await quiet(() => A.runMigrationV1());
      assert.equal(r.success, false);
      assert.notEqual(A.getMigrationStatus().status, "completed");
    });
  }
  test("a deleted PARENT makes its live children unverifiable too (set under a deleted workout exercise)", async () => {
    const eligible = await uploaded();
    del("nextrep_workout_exercises", (r) => r.legacy_id === "e1");
    const v = await quiet(() => A.verifyMigrationV1(UA, eligible, A.getOrCreateDeviceId()));
    assert.equal(v.results.workoutSets.allFound, false);
  });
  test("pagination: with a server cap of 2 rows per response a deleted set on a later page is still detected", async () => {
    const many = [{ id: "w1", date: "2026-10-01T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: "bench_press", type: "weight", sets: Array.from({ length: 7 }, (_, i) => st(`m${i}`, 1, 1)) }] }];
    localStorage.setItem(key(UA, "history"), JSON.stringify(many));
    assert.equal((await quiet(() => A.runMigrationV1())).success, true);
    S.maxRows = 2;
    del("nextrep_workout_sets", (r) => r.legacy_id === "m6");
    const v = await quiet(() => A.verifyMigrationV1(UA, { history: many, plans: [], measurements: [], customFields: [], exercises: [] }, A.getOrCreateDeviceId()));
    assert.deepEqual(v.results.workoutSets.missingLegacyIdsSample, ["m6"]);
  });
  test("guest flow: a built-in exercise DELETED in the account's cloud makes it non-empty (no stuck migration)", async () => {
    seedGuest();
    const n = A.normalizeExercise(A.DEFAULT_EXERCISES[0]);
    S.tables.nextrep_exercises = [{ id: "r", user_id: UA, legacy_id: String(n.id), name: n.name, category: n.category, equipment: n.equipment, device_id: "other", version: 2, deleted_at: "2026-10-01T00:00:00.000Z" }];
    S.calls = [];
    const r = await migrate();
    assert.equal(r.blocked, "cloud_changed");
    assert.equal(cloudWrites(S).length, 0);
  });
});
