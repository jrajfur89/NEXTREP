// Stage 4A.4 Part 1 (rebuilt) — guest → GENUINELY EMPTY account: detection, backup + retention, markers,
// copy, cloud re-check, V1 + verification, ready/guest only after full success, retry / restart / abandon,
// account switch, guest immutability, draft and PRO exclusion, profile name. REAL production functions,
// in-memory fake Supabase (no network, no RLS, no UNIQUE).
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
function setup() {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.__testState.resetAccountInitBusy();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: UA } };
  refUser = UA;
  A.activateDataNamespace(UA);
}
beforeEach(() => setup());

const st = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const SD = [{ id: "sd1", target: "8-10", rir: "" }, { id: "sd2", target: "8-10", rir: "" }];
// Guest data as the app stores it — including an old-shape repeat (template set ids reused in two workouts).
const GUEST = {
  history: [
    { id: "g1", date: "2026-10-01T10:00:00.000Z", planId: "gp1", planName: "Gość", exercises: [{ id: "ge-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 60, 8), st("sd2", 60, 8)] }] },
    { id: "g2", date: "2026-10-03T10:00:00.000Z", planId: "gp1", planName: "Gość", exercises: [{ id: "ge-2", exerciseId: "custom-ex-1", name: "Moje", type: "weight", setsDetail: SD, sets: [st("sd1", 20, 12), st("sd2", 20, 12)] }] },
  ],
  plans: [{ id: "gp1", name: "Gość", exercises: [{ id: "gi1", exerciseId: "bench_press", setsDetail: SD }] }],
  measurements: [{ id: "gm1", date: "2026-10-02", weight: 80 }],
  custom_fields: [{ key: "biceps", label: "Biceps", unit: "cm" }],
  user_name: "Gosia",
};
function seedGuest({ withExercises = true, draft = true, pro = true, extra = {} } = {}) {
  const exercises = withExercises ? [...A.DEFAULT_EXERCISES, { id: "custom-ex-1", name: "Moje", category: ["Klatka"], equipment: ["Sztanga"] }] : null;
  const all = { ...GUEST, ...(exercises ? { exercises } : {}), ...extra };
  for (const [name, v] of Object.entries(all)) localStorage.setItem(key(null, name), JSON.stringify(v));
  if (draft) localStorage.setItem(key(null, "active_workout_draft"), JSON.stringify({ version: 1, blocks: [], plan: { name: "DRAFT-G" } }));
  if (pro) localStorage.setItem(key(null, "pro_status"), JSON.stringify({ manualPro: true, adUnlockExpiresAt: null }));
}
// every guest key except the technical migration marker (byte-for-byte)
function guestDump() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("nextrep_guest_") && k !== GM_KEY) out[k] = localStorage.getItem(k);
  }
  return out;
}

// Stage 4A.4 Part 2 (D1): after a SUCCESSFUL migration the migrated, finished guest data is cleaned up
// (history, plans, measurements, custom fields; exercises only without a draft). Everything else stays
// byte for byte: draft, PRO, name, technical keys.
function afterCleanup(dump) {
  const out = { ...dump };
  const hasDraft = Object.keys(out).some((k) => k === "nextrep_guest_active_workout_draft_v1");
  for (const n of ["history", "plans", "measurements", "custom_fields", ...(hasDraft ? [] : ["exercises"])]) delete out[`nextrep_guest_${n}_v1`];
  return out;
}
const accountDataKeys = () => {
  const out = {};
  for (const n of ["exercises", "plans", "history", "measurements", "custom_fields", "user_name", "active_workout_draft", "pro_status", "pro_hints", "sync_queue", "sync_meta"]) {
    const v = localStorage.getItem(key(UA, n));
    if (v != null) out[n] = v;
  }
  return out;
};
const rows = (t) => S.tables[t] || [];
const migrate = (userId = UA) => quiet(() => A.migrateGuestToEmptyAccount(userId, ref));
const setIdsOf = (h) => h.flatMap((s) => s.exercises.flatMap((ex) => ex.sets.map((x) => String(x.id))));
const gmBackups = () => A.loadBackupList().filter((b) => b.kind === "BEFORE_GUEST_MIGRATION");
const marker = () => A.getAccountInitMarker(UA);

describe("detection — what counts as guest data to offer", () => {
  const cases = [
    ["history", { history: [GUEST.history[0]] }, true],
    ["plans", { plans: GUEST.plans }, true],
    ["measurements", { measurements: GUEST.measurements }, true],
    ["custom fields", { custom_fields: GUEST.custom_fields }, true],
    ["a custom exercise", { exercises: [...A_DEFAULTS(), { id: "c1", name: "X" }] }, true],
    ["only the default atlas", { exercises: "DEFAULTS" }, false],
    ["a name only", { user_name: "Gosia" }, false],
    ["an unfinished workout only", { active_workout_draft: { version: 1, blocks: [] } }, false],
    ["local PRO only", { pro_status: { manualPro: true } }, false],
    ["technical keys only", { sync_queue: [{ id: "q" }], sync_meta: { "workouts:x": 1 }, device_id: "d" }, false],
  ];
  function A_DEFAULTS() {
    return [];
  }
  for (const [name, data, expected] of cases) {
    test(`${name} → ${expected}`, () => {
      for (const [n, v] of Object.entries(data)) localStorage.setItem(key(null, n), JSON.stringify(v === "DEFAULTS" ? A.DEFAULT_EXERCISES : n === "exercises" ? [...A.DEFAULT_EXERCISES, ...v] : v));
      assert.equal(A.guestHasMigratableData().hasData, expected);
    });
  }
  test("an EDITED default atlas exercise alone is not offered (known limit, 4A.5)", () => {
    const edited = A.DEFAULT_EXERCISES.map((e, i) => (i === 0 ? { ...e, notes: "zmienione" } : e));
    localStorage.setItem(key(null, "exercises"), JSON.stringify(edited));
    assert.equal(A.guestHasMigratableData().hasData, false);
  });
});

describe("success path — guest → empty account", () => {
  test("copy + upload + verification → ready/guest; account data = prepared copy; guest byte-for-byte unchanged", async () => {
    seedGuest();
    const guestBefore = guestDump();
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(guestDump(), afterCleanup(guestBefore), "guest workspace: only the migrated finished data removed (D1); draft, PRO, name byte-for-byte");
    assert.deepEqual(marker(), { ...marker(), status: "ready", source: "guest", syncPaused: false });
    const h = readJson(key(UA, "history"));
    assert.deepEqual(h.map((s) => [s.id, s.date, s.planId]), GUEST.history.map((s) => [s.id, s.date, s.planId]));
    assert.equal(new Set(setIdsOf(h)).size, 4, "the repeated set ids were made unique in the account copy");
    assert.deepEqual(readJson(key(UA, "plans")).map((p) => p.id), ["gp1"]);
    assert.deepEqual(readJson(key(UA, "measurements")), GUEST.measurements);
    assert.deepEqual(readJson(key(UA, "custom_fields")), GUEST.custom_fields);
    assert.equal(readJson(key(UA, "user_name")), "Gosia", "empty account takes the guest name");
    assert.ok(readJson(key(UA, "exercises")).some((e) => e.id === "custom-ex-1"));
    assert.equal(localStorage.getItem(key(UA, "active_workout_draft")), null, "the draft is NOT migrated");
    assert.equal(localStorage.getItem(key(UA, "pro_status")), null, "guest local PRO is NOT migrated");
    // cloud = account copy, identities + parents intact, no '-posN'
    assert.deepEqual(rows("nextrep_workouts").map((x) => x.legacy_id).sort(), ["g1", "g2"]);
    assert.deepEqual(rows("nextrep_workout_sets").map((x) => x.legacy_id).sort(), setIdsOf(h).sort());
    assert.equal(rows("nextrep_workout_exercises").filter((x) => /-pos\d+/.test(x.legacy_id)).length, 0);
    assert.equal(rows("nextrep_profiles")[0].display_name, "Gosia");
    assert.ok(rows("nextrep_workouts").every((x) => x.user_id === UA));
    const gm = readJson(GM_KEY);
    assert.equal(gm.targetUserId, UA);
    // Stage 4A.4 Part 2: the completed marker (replaces Part 1's accountReadyAt) — still no user data
    assert.equal(gm.status, "completed");
    assert.ok(gm.completedAt);
    assert.deepEqual(Object.keys(gm).sort(), ["attemptId", "backupId", "cleaned", "cleanup", "cleanupAt", "completedAt", "fingerprint", "keptExercises", "serverAttemptId", "startedAt", "status", "targetUserId"], "no user data in the marker");
    // Stage 4A.4 F-5 (Etap 6): the server attempt of exactly this migration is `completed`
    assert.match(gm.serverAttemptId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(S.tables.nextrep_migration_attempts.map((a) => [a.attempt_id, a.status, a.kind]), [[gm.serverAttemptId, "completed", "guest_to_account"]]);
    assert.equal(A.getMigrationStatus().status, "completed");
    assert.equal(r.ok && A.getMigrationStatus().verification.results.workoutSets.allFound, true, "child verification ran");
  });

  test("BEFORE_GUEST_MIGRATION backup: guest namespace, ORIGINAL data, target / fingerprint / attempt, no PRO, no draft", async () => {
    seedGuest();
    const fp = A.migratableDataFingerprint(null);
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
    const [b] = gmBackups();
    assert.ok(b);
    assert.equal(b.namespace, "guest");
    assert.equal(b.reason, "before-guest-migration");
    assert.equal(b.targetUserId, UA);
    assert.equal(b.fingerprint, fp);
    assert.equal(b.attemptId, readJson(GM_KEY).attemptId);
    assert.deepEqual(b.data.history, GUEST.history, "original (unprepared) guest history");
    assert.deepEqual(b.data.plans, GUEST.plans);
    assert.equal(b.data.userName, "Gosia");
    assert.ok(!("proStatus" in b.data) && !("proHints" in b.data), "no PRO in the backup");
    assert.ok(!JSON.stringify(b.data).includes("DRAFT-G"), "no draft in the backup");
  });

  test("ordering: at the FIRST cloud write the backup, both markers and the confirmed account copy already exist", async () => {
    seedGuest();
    let seen = null;
    S.queryHook = (q) => {
      if (!seen && ["insert", "update", "upsert", "delete"].includes(q.op)) {
        seen = { backup: gmBackups().length, gm: readJson(GM_KEY), acc: marker(), history: readJson(key(UA, "history")) };
      }
      return null;
    };
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
    assert.equal(seen.backup, 1);
    assert.equal(seen.gm.status, "migrating");
    assert.equal(seen.acc.status, "migrating_guest");
    assert.equal(seen.acc.phase, "uploading");
    assert.deepEqual(Object.keys(seen.acc).sort(), ["at", "attemptId", "backupId", "deviceId", "fingerprint", "namespace", "phase", "serverAttemptId", "source", "startedAt", "status", "syncPaused", "userId"]);
    // Stage 4A.4 F-5 (Etap 6): the server attempt was already `uploading` at the first cloud write
    assert.equal(seen.acc.serverAttemptId, seen.acc.attemptId, "the guest attempt id doubles as the server attempt id");
    assert.equal(seen.acc.backupId, seen.gm.backupId);
    assert.equal(seen.acc.attemptId, seen.gm.attemptId);
    assert.equal(seen.history.length, 2, "account copy complete before the upload");
    assert.equal(seen.acc.syncPaused, true, "sync was off during the upload (not ready, paused)");
  });
});

describe("refusals — nothing written anywhere", () => {
  async function refused(expectBlocked) {
    const guestBefore = guestDump();
    const accBefore = accountDataKeys();
    S.calls = [];
    const r = await migrate();
    assert.equal(r.ok, false);
    if (expectBlocked) assert.equal(r.blocked, expectBlocked, r.error);
    assert.equal(cloudWrites(S).length, 0, "zero cloud writes");
    assert.deepEqual(guestDump(), guestBefore, "guest unchanged");
    assert.deepEqual(accountDataKeys(), accBefore, "account data unchanged");
    assert.equal(gmBackups().length, 0, "no backup");
    assert.equal(localStorage.getItem(GM_KEY), null, "no guest marker");
    assert.notEqual((marker() || {}).status, "ready");
    return r;
  }
  test("account has local data → not_empty", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "history"), JSON.stringify([{ ...GUEST.history[0], id: "own" }]));
    await refused("not_empty");
  });
  test("account has a local name only → not_empty (name never overwritten)", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "user_name"), JSON.stringify("Konto"));
    await refused("not_empty");
    assert.equal(readJson(key(UA, "user_name")), "Konto");
  });
  test("cloud has another device's workout → cloud_changed", async () => {
    seedGuest();
    S.tables.nextrep_workouts = [{ id: "x", user_id: UA, legacy_id: "foreign", device_id: "other", deleted_at: null }];
    await refused("cloud_changed");
  });
  test("cloud profile has a display name (D4) → cloud_changed, name kept", async () => {
    seedGuest();
    S.tables.nextrep_profiles = [{ user_id: UA, display_name: "Konto w chmurze" }];
    await refused("cloud_changed");
    assert.equal(rows("nextrep_profiles")[0].display_name, "Konto w chmurze");
  });
  test("guest data bound to ANOTHER account's migration → guest_other_account", async () => {
    seedGuest();
    localStorage.setItem(GM_KEY, JSON.stringify({ status: "migrating", targetUserId: UB, attemptId: "x", backupId: "y" }));
    const gm = localStorage.getItem(GM_KEY);
    S.calls = [];
    const r = await migrate();
    assert.equal(r.blocked, "guest_other_account");
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(localStorage.getItem(GM_KEY), gm, "B's marker untouched");
  });
  test("guest data of the wrong type → damaged (never replaced by [])", async () => {
    seedGuest({ extra: { history: { not: "an array" } } });
    await refused("damaged");
  });
  test("integrity problem that preparation cannot fix (repeated workout ids) → integrity", async () => {
    seedGuest({ extra: { history: [GUEST.history[0], { ...GUEST.history[1], id: "g1" }] } });
    const r = await refused("integrity");
    assert.match(r.error, /powtórzone identyfikatory/);
  });
  test("backup cannot be saved → backup_failed", async () => {
    seedGuest();
    const proto = Object.getPrototypeOf(localStorage);
    const orig = proto.setItem;
    proto.setItem = function (k, v) {
      if (k === "nextrep_backup_list_v1") throw new Error("QuotaExceededError");
      return orig.call(this, k, v);
    };
    try {
      await refused("backup_failed");
    } finally {
      proto.setItem = orig;
    }
  });
  test("only a name / only a draft in the guest → nothing", async () => {
    localStorage.setItem(key(null, "user_name"), JSON.stringify("Gosia"));
    localStorage.setItem(key(null, "active_workout_draft"), JSON.stringify({ version: 1, blocks: [] }));
    await refused("nothing");
  });
  test("session / account changed before the start → discarded", async () => {
    seedGuest();
    refUser = null;
    const r = await refused();
    assert.equal(r.discarded, true);
  });
});

describe("cloud changes between the first check and the first upload (TOCTOU)", () => {
  test("foreign data appears after the copy → stop: no upload, account copy removed, markers cleared, guest intact, not ready", async () => {
    seedGuest();
    const guestBefore = guestDump();
    S.queryHook = (q) => {
      const m = A.getAccountInitMarker(UA);
      if (q.table === "nextrep_workouts" && q.op === "select" && m && m.phase === "uploading" && !rows("nextrep_workouts").length) {
        S.tables.nextrep_workouts = [{ id: "f", user_id: UA, legacy_id: "foreign", device_id: "other-device", deleted_at: null }];
      }
      return null;
    };
    S.calls = [];
    const r = await migrate();
    assert.equal(r.ok, false);
    assert.equal(r.blocked, "cloud_changed");
    assert.equal(cloudWrites(S).length, 0, "nothing uploaded, nothing overwritten");
    assert.deepEqual(rows("nextrep_workouts").map((x) => x.legacy_id), ["foreign"]);
    assert.deepEqual(accountDataKeys(), {}, "the local copy was removed again");
    assert.equal(marker(), null);
    assert.equal(localStorage.getItem(GM_KEY), null);
    assert.deepEqual(guestDump(), guestBefore);
    assert.equal(gmBackups().length, 1, "the backup stays");
  });
});

describe("failure, retry, restart, abandon", () => {
  const failSetsOnce = () => {
    let failed = false;
    S.queryHook = (q) => {
      if (!failed && q.table === "nextrep_workout_sets" && q.op === "insert") {
        failed = true;
        return { message: "Failed to fetch" };
      }
      return null;
    };
  };
  const counts = () => ["nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_plans", "nextrep_plan_items", "nextrep_plan_item_sets", "nextrep_measurements", "nextrep_custom_fields", "nextrep_exercises"].map((t) => rows(t).length);

  test("partial upload fails → migrating_guest stays (never ready), guest intact → retry resumes → ready/guest, no duplicate rows", async () => {
    seedGuest();
    const guestBefore = guestDump();
    failSetsOnce();
    const r1 = await migrate();
    assert.equal(r1.ok, false);
    assert.equal(marker().status, "migrating_guest");
    assert.equal(marker().phase, "uploading");
    assert.equal(A.isAccountSyncAllowed(UA), false);
    assert.deepEqual(guestDump(), guestBefore);
    const copy = localStorage.getItem(key(UA, "history"));
    S.queryHook = null;
    const r2 = await migrate();
    assert.equal(r2.ok, true, r2.error);
    assert.equal(marker().status, "ready");
    assert.equal(localStorage.getItem(key(UA, "history")), copy, "the resume uploads the SAME copy (stable ids)");
    const once = counts();
    assert.deepEqual(rows("nextrep_workout_sets").map((x) => x.legacy_id).sort(), setIdsOf(JSON.parse(copy)).sort());
    // a further repair run of V1 creates nothing new
    await quiet(() => A.runMigrationV1());
    assert.deepEqual(counts(), once);
    assert.deepEqual(guestDump(), afterCleanup(guestBefore));
    assert.equal(gmBackups().length, 1, "the retry reuses the attempt's backup");
  });

  test("restart during the upload (app killed) → resume after restart → ready/guest", async () => {
    seedGuest();
    const guestBefore = guestDump();
    failSetsOnce();
    await migrate();
    // "restart": module state gone, same storage + cloud
    A.__testState.resetActiveDataNamespace();
    A.__testState.resetAccountInitBusy();
    A.activateDataNamespace(UA);
    S.queryHook = null;
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(guestDump(), afterCleanup(guestBefore));
  });

  test("restart while COPYING (copy unconfirmed, nothing uploaded) → the copy is rebuilt from the unchanged guest → ready/guest", async () => {
    seedGuest();
    const guestBefore = guestDump();
    const fp = A.migratableDataFingerprint(null);
    const b = A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: fp, attemptId: "att-1" });
    localStorage.setItem(GM_KEY, JSON.stringify({ status: "migrating", targetUserId: UA, fingerprint: fp, backupId: b.backupId, attemptId: "att-1", startedAt: "2026-10-07T10:00:00.000Z" }));
    A.setAccountInitMarker(UA, { status: "migrating_guest", source: "guest", syncPaused: true, userId: UA, namespace: `user_${UA}`, deviceId: A.getOrCreateDeviceId(), backupId: b.backupId, fingerprint: fp, attemptId: "att-1", phase: "copying", startedAt: "2026-10-07T10:00:00.000Z" });
    localStorage.setItem(key(UA, "history"), JSON.stringify([GUEST.history[0]])); // half-written copy
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
    assert.equal(readJson(key(UA, "history")).length, 2, "complete copy");
    assert.equal(readJson(key(UA, "measurements")).length, 1);
    assert.equal(gmBackups().length, 1, "no second backup");
    assert.deepEqual(guestDump(), afterCleanup(guestBefore));
  });

  test("restart while copying, but the guest changed meanwhile → refused, nothing written", async () => {
    seedGuest();
    const fp = A.migratableDataFingerprint(null);
    const b = A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: fp, attemptId: "att-1" });
    localStorage.setItem(GM_KEY, JSON.stringify({ status: "migrating", targetUserId: UA, fingerprint: fp, backupId: b.backupId, attemptId: "att-1" }));
    A.setAccountInitMarker(UA, { status: "migrating_guest", source: "guest", syncPaused: true, userId: UA, namespace: `user_${UA}`, deviceId: A.getOrCreateDeviceId(), backupId: b.backupId, fingerprint: fp, attemptId: "att-1", phase: "copying" });
    localStorage.setItem(key(null, "measurements"), JSON.stringify([...GUEST.measurements, { id: "gm2", date: "2026-10-05" }]));
    S.calls = [];
    const r = await migrate();
    assert.equal(r.ok, false);
    assert.equal(r.resumeUnsafe, true);
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(marker().status, "migrating_guest");
  });

  // Stage 4A.4 Part 2 (F-5): after rows reached the cloud, "abandon" no longer resets silently — the user
  // finishes, or consciously starts without the data (rows stay, sync paused). Full reset only without rows.
  test("abandon after a failed upload WITH rows in the cloud → nothing reset (partial); conscious 'start without' → copy removed, guest + backup + account PRO kept", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "pro_status"), JSON.stringify({ manualPro: false, adUnlockExpiresAt: 123 }));
    const accountPro = localStorage.getItem(key(UA, "pro_status"));
    const guestBefore = guestDump();
    failSetsOnce();
    await migrate();
    const r = await quiet(() => A.abandonGuestMigration(UA, ref));
    assert.equal(r.ok, false);
    assert.equal(r.partial, true);
    assert.equal(marker().status, "migrating_guest", "nothing reset");
    const w = await quiet(() => A.startAccountWithoutGuestPartial(UA, ref));
    assert.equal(w.ok, true);
    for (const n of ["history", "plans", "measurements", "custom_fields", "user_name", "exercises"]) assert.equal(localStorage.getItem(key(UA, n)), null, `${n} removed`);
    assert.equal(localStorage.getItem(key(UA, "pro_status")), accountPro, "the account's own local PRO untouched");
    assert.deepEqual(guestDump(), guestBefore);
    assert.equal(gmBackups().length, 1, "backup kept");
  });

  test("abandon after a failure BEFORE any data row reached the cloud → full reset: copy removed, markers cleared, account PRO kept", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "pro_status"), JSON.stringify({ manualPro: false, adUnlockExpiresAt: 123 }));
    const accountPro = localStorage.getItem(key(UA, "pro_status"));
    const guestBefore = guestDump();
    S.queryHook = (q) => (q.table === "nextrep_exercises" && q.op === "insert" ? { message: "Failed to fetch" } : null);
    await migrate();
    S.queryHook = null;
    const r = await quiet(() => A.abandonGuestMigration(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.equal(marker(), null);
    assert.equal(localStorage.getItem(GM_KEY), null);
    for (const n of ["history", "plans", "measurements", "custom_fields", "user_name", "exercises"]) assert.equal(localStorage.getItem(key(UA, n)), null, `${n} removed`);
    assert.equal(localStorage.getItem(key(UA, "pro_status")), accountPro);
    assert.deepEqual(guestDump(), guestBefore);
    assert.equal(gmBackups().length, 1, "backup kept");
  });

  test("abandon is refused while the migration is running, and for another account / no attempt", async () => {
    seedGuest();
    assert.equal((await quiet(() => A.abandonGuestMigration(UA, ref))).ok, false, "no attempt → nothing to abandon");
    let release;
    S.queryGate = (q) => (q.table === "nextrep_workout_sets" && q.op === "insert" ? new Promise((r) => (release = r)) : null);
    const running = migrate();
    while (!release) await new Promise((r) => setTimeout(r, 5));
    const ab = await quiet(() => A.abandonGuestMigration(UA, ref));
    assert.equal(ab.busy, true);
    S.queryGate = null;
    release();
    assert.equal((await running).ok, true);
  });
});

describe("'genuinely empty' also covers edits of built-in exercises, unsent changes and open conflicts", () => {
  const editedDefault = () => A.DEFAULT_EXERCISES.map((e, i) => (i === 0 ? { ...A.normalizeExercise(e), notes: "moja technika" } : A.normalizeExercise(e)));
  test("account with an edited built-in exercise (local) → not_empty, its list untouched", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "exercises"), JSON.stringify(editedDefault()));
    const raw = localStorage.getItem(key(UA, "exercises"));
    S.calls = [];
    const r = await migrate();
    assert.equal(r.blocked, "not_empty");
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(localStorage.getItem(key(UA, "exercises")), raw);
  });
  test("account whose local list is just the seeded default atlas → still empty (migration runs)", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "exercises"), JSON.stringify(A.DEFAULT_EXERCISES.map(A.normalizeExercise)));
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
  });
  test("account with unsent changes or open sync conflicts → not_empty", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "sync_queue"), JSON.stringify([{ id: "q1", table: "exercises", recordId: "bench_press", operation: "upsert" }]));
    assert.equal((await migrate()).blocked, "not_empty");
    localStorage.removeItem(key(UA, "sync_queue"));
    localStorage.setItem(key(UA, "sync_conflicts"), JSON.stringify([{ id: "c1", status: "pending" }]));
    assert.equal((await migrate()).blocked, "not_empty");
  });
  const builtInRow = (e, extra = {}) => {
    const n = A.normalizeExercise(e);
    return { id: `row-${n.id}`, user_id: UA, legacy_id: String(n.id), name: n.name, category: n.category, equipment: n.equipment, is_time_based: n.isTimeBased, is_sets_only: n.isSetsOnly, is_cardio: n.isCardio, device_type: n.deviceType, video_url: n.videoUrl, notes: n.notes, device_id: "other", version: 1, deleted_at: null, ...extra };
  };
  test("cloud holds UNEDITED built-in exercise rows only (e.g. left by an interrupted upload) → still empty, migration runs", async () => {
    seedGuest();
    S.tables.nextrep_exercises = A.DEFAULT_EXERCISES.slice(0, 3).map((e) => builtInRow(e));
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
  });
  test("cloud holds an EDITED built-in exercise row from another device → cloud_changed, row untouched", async () => {
    seedGuest();
    S.tables.nextrep_exercises = [builtInRow(A.DEFAULT_EXERCISES[0], { notes: "edycja z telefonu" })];
    const before = clone(S.tables.nextrep_exercises);
    S.calls = [];
    const r = await migrate();
    assert.equal(r.blocked, "cloud_changed");
    assert.equal(cloudWrites(S).length, 0);
    assert.deepEqual(S.tables.nextrep_exercises, before);
  });
});

describe("exercise links of the uploaded history", () => {
  for (const [name, exercises] of [["no exercise list stored", undefined], ["an empty exercise list", []]]) {
    test(`guest with ${name} → the account gets the default atlas the guest app showed; workout exercises keep exercise_id`, async () => {
      seedGuest({ withExercises: false, extra: exercises ? { exercises } : {} });
      const r = await migrate();
      assert.equal(r.ok, true, r.error);
      const accEx = readJson(key(UA, "exercises"));
      assert.ok(accEx.some((e) => e.id === "bench_press"));
      const bench = rows("nextrep_exercises").find((x) => x.legacy_id === "bench_press");
      const wex = rows("nextrep_workout_exercises").find((x) => x.legacy_id === "ge-1");
      assert.equal(wex.exercise_id, bench.id, "workout exercise linked to its exercise row");
    });
  }
});

describe("resume safety", () => {
  test("phase 'uploading' with a copy that would still change ids (F-1 on the guest path) → refused, zero writes", async () => {
    seedGuest();
    const fp = A.migratableDataFingerprint(null);
    const b = A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: fp, attemptId: "att-9" });
    localStorage.setItem(GM_KEY, JSON.stringify({ status: "migrating", targetUserId: UA, fingerprint: fp, backupId: b.backupId, attemptId: "att-9" }));
    A.setAccountInitMarker(UA, { status: "migrating_guest", source: "guest", syncPaused: true, userId: UA, namespace: `user_${UA}`, deviceId: A.getOrCreateDeviceId(), backupId: b.backupId, fingerprint: fp, attemptId: "att-9", phase: "uploading" });
    localStorage.setItem(key(UA, "history"), JSON.stringify(GUEST.history)); // an UNPREPARED copy (template set ids)
    const raw = localStorage.getItem(key(UA, "history"));
    S.calls = [];
    const r = await migrate();
    assert.equal(r.ok, false);
    assert.equal(r.resumeUnsafe, true);
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(localStorage.getItem(key(UA, "history")), raw);
    assert.equal(marker().status, "migrating_guest");
  });
  for (const phase of [undefined, "verifying", "weird"]) {
    test(`a migrating_guest marker with phase ${phase} is never treated as 'copying' (no rebuilt copy, no write)`, async () => {
      seedGuest();
      const fp = A.migratableDataFingerprint(null);
      const b = A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: fp, attemptId: "att-8" });
      localStorage.setItem(GM_KEY, JSON.stringify({ status: "migrating", targetUserId: UA, fingerprint: fp, backupId: b.backupId, attemptId: "att-8" }));
      A.setAccountInitMarker(UA, { status: "migrating_guest", source: "guest", syncPaused: true, userId: UA, namespace: `user_${UA}`, deviceId: A.getOrCreateDeviceId(), backupId: b.backupId, fingerprint: fp, attemptId: "att-8", phase });
      S.calls = [];
      const r = await migrate();
      assert.equal(r.resumeUnsafe, true);
      assert.equal(cloudWrites(S).length, 0);
      assert.equal(localStorage.getItem(key(UA, "history")), null);
    });
  }
});

describe("account switch, multi-start", () => {
  test("session switches to B DURING the V1 upload → no further phase is sent", async () => {
    seedGuest();
    S.queryHook = (q) => {
      if (q.table === "nextrep_exercises" && q.op === "insert") S.session = { user: { id: UB } }; // logout / B during the upload
      return null;
    };
    const r = await migrate();
    assert.equal(r.ok, false);
    assert.notEqual(marker().status, "ready");
    const after = S.calls.filter((c) => c.kind === "table" && ["insert", "update"].includes(c.op) && ["nextrep_plans", "nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_measurements", "nextrep_custom_fields", "nextrep_profiles"].includes(c.table));
    assert.equal(after.length, 0, "plans / workouts / measurements / profile never sent after the switch");
  });
  test("session switches DURING the exercises phase → at most a few more exercise rows, nothing after", async () => {
    seedGuest();
    let switchedAt = null;
    S.queryHook = (q) => {
      if (switchedAt == null && q.table === "nextrep_exercises" && q.op === "insert") {
        S.session = { user: { id: UB } };
        switchedAt = S.calls.length;
      }
      return null;
    };
    const r = await migrate();
    assert.equal(r.ok, false);
    const later = S.calls.slice(switchedAt).filter((c) => c.kind === "table" && ["insert", "update"].includes(c.op));
    assert.ok(later.every((c) => c.table === "nextrep_exercises"), "no other table written after the switch");
    assert.ok(later.length <= 10, `periodic check stops the phase (${later.length} more exercise writes)`);
  });
  test("session switches DURING the workouts phase → the next workout and every later phase are not sent", async () => {
    seedGuest();
    let switchedAt = null;
    S.queryHook = (q) => {
      if (switchedAt == null && q.table === "nextrep_workout_sets" && q.op === "insert") {
        S.session = { user: { id: UB } };
        switchedAt = S.calls.length;
      }
      return null;
    };
    const r = await migrate();
    assert.equal(r.ok, false);
    const later = S.calls.slice(switchedAt).filter((c) => c.kind === "table" && ["insert", "update"].includes(c.op));
    assert.ok(!later.some((c) => c.table === "nextrep_workouts"), "the second workout is not started");
    assert.ok(!later.some((c) => ["nextrep_measurements", "nextrep_custom_fields", "nextrep_profiles"].includes(c.table)), "no later phase");
    assert.ok(!later.some((c) => c.op === "update" && c.args && c.args[0] && "device_id" in c.args[0]), "no device_id repair");
    assert.ok(later.length <= 2, `only the rest of the workout in flight (${later.length} writes)`);
  });

  test("A → B right before the first upload → stops (discarded): nothing uploaded, nothing in B, A stays resumable", async () => {
    seedGuest();
    let switched = false;
    S.queryGate = async (q) => {
      const m = A.getAccountInitMarker(UA);
      if (!switched && m && m.phase === "uploading" && q.op === "select") {
        switched = true;
        S.session = { user: { id: UB } };
        refUser = UB;
      }
    };
    S.calls = [];
    const r = await migrate();
    assert.equal(r.ok, false);
    assert.equal(r.discarded, true);
    assert.equal(cloudWrites(S).length, 0, "no cloud write under any session");
    for (let i = 0; i < localStorage.length; i++) assert.ok(!localStorage.key(i).includes(UB), `nothing written for B (${localStorage.key(i)})`);
    assert.equal(marker().status, "migrating_guest", "A's attempt is recognisable for A");
    assert.notEqual(marker().status, "ready");
  });

  test("double start (two taps) → the second is refused as busy; one attempt, one backup, stable rows", async () => {
    seedGuest();
    const [r1, r2] = await Promise.all([migrate(), migrate()]);
    assert.equal([r1, r2].filter((r) => r.ok).length, 1);
    assert.equal([r1, r2].filter((r) => r.busy).length, 1);
    assert.equal(gmBackups().length, 1);
    assert.equal(rows("nextrep_workouts").length, 2);
  });

  test("an unknown / damaged account marker counts as no marker (the migration replaces it, never 'ready' by itself)", async () => {
    seedGuest();
    localStorage.setItem(key(UA, "account_init"), JSON.stringify({ status: "weird" }));
    const r = await migrate();
    assert.equal(r.ok, true, r.error);
    assert.equal(marker().status, "ready");
  });

  test("another 4A.3 state of this account (e.g. an interrupted device upload) is never taken over", async () => {
    seedGuest();
    A.setAccountInitMarker(UA, { status: "uploading_device", userId: UA, namespace: `user_${UA}`, deviceId: "d" });
    S.calls = [];
    const r = await migrate();
    assert.equal(r.blocked, "not_empty");
    assert.equal(cloudWrites(S).length, 0);
  });
});

describe("backup retention (deterministic timestamps — T-1)", () => {
  const stamp = (i) => new Date(Date.UTC(2026, 9, 1, 10, i)).toISOString();
  function seedBackups() {
    const list = [
      { backupId: "gm-old-1", kind: "BEFORE_GUEST_MIGRATION", namespace: "guest", reason: "before-guest-migration", createdAt: stamp(1), data: {} },
      { backupId: "gm-old-2", kind: "BEFORE_GUEST_MIGRATION", namespace: "guest", reason: "before-guest-migration", createdAt: stamp(2), data: {} },
      { backupId: "gm-old-3", kind: "BEFORE_GUEST_MIGRATION", namespace: "guest", reason: "before-guest-migration", createdAt: stamp(3), data: {} },
      { backupId: "bcr-a", kind: "BEFORE_CLOUD_RESTORE", namespace: `user_${UA}`, userId: UA, reason: "before-restore", createdAt: stamp(0), data: {} },
      { backupId: "auto-b", namespace: `user_${UB}`, reason: "auto", createdAt: stamp(0), data: {} },
    ];
    localStorage.setItem("nextrep_backup_list_v1", JSON.stringify(list));
  }
  test("2 newest + the new one stay; other kinds / namespaces untouched", () => {
    seedGuest();
    seedBackups();
    const b = A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: "f", attemptId: "a" });
    assert.ok(b);
    const ids = A.loadBackupList().map((x) => x.backupId);
    assert.ok(ids.includes(b.backupId), "the new backup is never pruned");
    assert.ok(ids.includes("gm-old-3") && !ids.includes("gm-old-1"));
    assert.ok(ids.includes("bcr-a") && ids.includes("auto-b"));
    assert.equal(ids.filter((id) => id.startsWith("gm-old")).length, 1, "with the new one: 2 newest kept (new + gm-old-3)");
  });
  test("the backup the guest marker refers to (active migration) is kept even when older", () => {
    seedGuest();
    seedBackups();
    localStorage.setItem(GM_KEY, JSON.stringify({ status: "migrating", targetUserId: UA, backupId: "gm-old-1", attemptId: "z" }));
    A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: "f", attemptId: "a" });
    assert.ok(A.loadBackupList().some((x) => x.backupId === "gm-old-1"));
  });
  test("ordinary guest backups beyond BACKUP_LIMIT never push the guest-migration backup out", () => {
    seedGuest();
    const b = A.createGuestMigrationBackup({ targetUserId: UA, fingerprint: "f", attemptId: "a" });
    A.activateDataNamespace(null);
    for (let i = 0; i < 15; i++) A.createBackupSnapshot("manual", { force: true });
    assert.ok(A.loadBackupList().some((x) => x.backupId === b.backupId));
  });
});

describe("account deletion", () => {
  test("deleting the account the guest data was bound to releases the guest marker; guest data and backup stay", async () => {
    seedGuest();
    await migrate();
    const guestBefore = guestDump();
    A.purgeDeletedAccountData(UA);
    assert.equal(localStorage.getItem(GM_KEY), null);
    assert.deepEqual(guestDump(), guestBefore);
    assert.equal(gmBackups().length, 1);
  });
  test("deleting ANOTHER account keeps the marker", async () => {
    seedGuest();
    await migrate();
    A.purgeDeletedAccountData(UB);
    assert.ok(localStorage.getItem(GM_KEY));
  });
});
