// Stage 4A.3 — account source selection, hardening part 2 (helpers, fake Supabase, no network).
// P1-4: the old "Przenieś dane do konta" is a guarded repair tool (runManualMigrationV1).
// P2-4: retention of BEFORE_CLOUD_RESTORE backups (per namespace, active one protected).
// Start empty: refused while a draft / unsent queue / open conflicts exist.
// V1 namespace safety: a migration started for A never writes its status into B.
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, UB, key, historySession, storageDump, cloudWrites } from "../harness/account-fixtures.mjs";

let A;
let S;
const ls = () => globalThis.localStorage;
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const ref = () => UA;
const ready = (syncPaused = false) => ({ status: "ready", source: "device", syncPaused });

before(async () => {
  A = await loadApp();
});
function setup() {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.__testState.resetAccountInitBusy();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: UA } };
  A.activateDataNamespace(UA);
  ls().setItem(key(UA, "history"), JSON.stringify([historySession("hA", "A-DATA")]));
}
beforeEach(setup);

describe("P1-4 — 'Przenieś dane do konta' only as a guarded repair tool", () => {
  test("ready + sync ON + this account's namespace → allowed (rows written for this user)", async () => {
    A.setAccountInitMarker(UA, ready(false));
    const r = await quiet(() => A.runManualMigrationV1());
    assert.equal(r.success, true, r.error);
    assert.ok((S.tables.nextrep_workouts || []).every((row) => row.user_id === UA));
    assert.deepEqual((S.tables.nextrep_workouts || []).map((row) => row.legacy_id), ["hA"]);
  });

  async function assertBlocked(prepare, why) {
    setup();
    prepare();
    const dump = storageDump();
    const r = await quiet(() => A.runManualMigrationV1());
    assert.equal(r.success, false, why);
    assert.equal(r.blocked, true, why);
    assert.ok(r.error && r.error.length > 10, `${why}: a clear reason`);
    assert.equal(cloudWrites(S).length, 0, `${why}: zero cloud writes`);
    assert.deepEqual(storageDump(), dump, `${why}: no local change (not even a migration status)`);
    return r;
  }

  test("no marker → blocked", async () => {
    const r = await assertBlocked(() => {}, "no marker");
    assert.match(r.error, /źródło danych/);
  });
  test("syncPaused → blocked", async () => {
    const r = await assertBlocked(() => A.setAccountInitMarker(UA, ready(true)), "paused");
    assert.match(r.error, /wstrzymana/);
  });
  test("source selection still open (loading_cloud / pending_cloud_confirm / uploading_device / unknown) → blocked", async () => {
    for (const status of ["loading_cloud", "pending_cloud_confirm", "uploading_device", "weird"]) {
      await assertBlocked(() => A.setAccountInitMarker(UA, { status, source: "cloud", syncPaused: true }), status);
    }
  });
  test("session is another account (A's namespace active) → blocked", async () => {
    await assertBlocked(() => {
      A.setAccountInitMarker(UA, ready(false));
      A.setAccountInitMarker(UB, ready(false));
      S.session = { user: { id: UB } };
    }, "account mismatch");
  });
  test("guest namespace active → blocked", async () => {
    await assertBlocked(() => {
      A.setAccountInitMarker(UA, ready(false));
      A.activateDataNamespace(null);
      ls().setItem(key(null, "history"), JSON.stringify([historySession("gG", "GUEST")]));
    }, "guest namespace");
  });
  test("not logged in → blocked", async () => {
    await assertBlocked(() => {
      A.setAccountInitMarker(UA, ready(false));
      S.session = null;
    }, "no session");
  });
  test("an account operation / sync pass in progress → blocked", async () => {
    setup();
    A.setAccountInitMarker(UA, ready(false));
    let release;
    let hit;
    const reached = new Promise((r) => (hit = r));
    S.queryGate = async (q) => {
      if (q.table === "nextrep_workouts" && !release) {
        hit();
        await new Promise((r) => (release = r));
      }
    };
    const syncP = quiet(() => A.runSync());
    await reached;
    const callsBefore = S.calls.length;
    const r = await quiet(() => A.runManualMigrationV1());
    assert.equal(r.blocked, true);
    assert.equal(S.calls.slice(callsBefore).filter((c) => ["insert", "update", "upsert"].includes(c.op)).length, 0);
    release();
    await syncP;
  });
});

describe("P2-4 — BEFORE_CLOUD_RESTORE retention", () => {
  const backup = (id, ns, kind, at, extra = {}) => ({ backupId: id, createdAt: at, appVersion: "x", formatVersion: 1, reason: kind ? "before-restore" : "before-reset", namespace: ns, ...(kind ? { kind } : {}), data: { history: [] }, ...extra });
  const nsA = () => A.getLocalDataNamespace(UA);
  const nsB = () => A.getLocalDataNamespace(UB);
  const list = () => A.loadBackupList();
  const idsOf = (pred) => list().filter(pred).map((b) => b.backupId).sort();
  async function snapA() {
    await tick(5); // distinct createdAt
    return A.createBackupSnapshot("before-restore", { force: true, meta: { kind: "BEFORE_CLOUD_RESTORE", userId: UA, source: "cloud-restore" } });
  }
  function seedOthers() {
    A.saveBackupList([
      backup("b1", nsB(), "BEFORE_CLOUD_RESTORE", "2026-01-01T00:00:00Z", { userId: UB }),
      backup("b2", nsB(), "BEFORE_CLOUD_RESTORE", "2026-01-02T00:00:00Z", { userId: UB }),
      backup("b3", nsB(), "BEFORE_CLOUD_RESTORE", "2026-01-03T00:00:00Z", { userId: UB }),
      backup("g1", "guest", "BEFORE_CLOUD_RESTORE", "2026-01-01T00:00:00Z"),
      backup("aReset", nsA(), null, "2026-01-01T00:00:00Z"),
    ]);
  }

  test("three restore backups of A → the two newest stay; B, guest and other kinds untouched", async () => {
    seedOthers();
    const s1 = await snapA();
    const s2 = await snapA();
    const s3 = await snapA();
    const mine = idsOf((b) => b.kind === "BEFORE_CLOUD_RESTORE" && b.namespace === nsA());
    assert.deepEqual(mine, [s2.backupId, s3.backupId].sort(), "only the 2 newest of A");
    assert.ok(!mine.includes(s1.backupId));
    assert.deepEqual(idsOf((b) => b.namespace === nsB()), ["b1", "b2", "b3"], "B never pruned by A");
    assert.deepEqual(idsOf((b) => b.namespace === "guest"), ["g1"]);
    assert.deepEqual(idsOf((b) => b.backupId === "aReset"), ["aReset"], "other kind untouched");
  });

  test("the backup a loading / pending cloud load refers to is protected (marker and pointer)", async () => {
    for (const via of ["marker", "pointer"]) {
      setup();
      seedOthers();
      const s1 = await snapA();
      if (via === "marker") A.setAccountInitMarker(UA, { status: "loading_cloud", source: "cloud", syncPaused: true, userId: UA, namespace: nsA(), backupId: s1.backupId });
      else A.setLastCloudRestorePointer(UA, s1.backupId);
      const s2 = await snapA();
      const s3 = await snapA();
      const mine = idsOf((b) => b.kind === "BEFORE_CLOUD_RESTORE" && b.namespace === nsA());
      assert.deepEqual(mine, [s1.backupId, s2.backupId, s3.backupId].sort(), `${via}: the referenced one survives with the 2 newest`);
      if (via === "pointer") assert.equal(A.resolveDeviceSnapshot(UA).status, "ok", "the protected snapshot still resolves");
    }
  });
  test("device clock moved back: the snapshot being created is never pruned, and a cloud load can still go back to it", async () => {
    setup();
    const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
    A.saveBackupList([1, 2].map((i) => backup(`future${i}`, nsA(), "BEFORE_CLOUD_RESTORE", future(i), { userId: UA })));
    const s = await snapA();
    assert.ok(list().some((b) => b.backupId === s.backupId), "the new snapshot is persisted");
    assert.equal(list().filter((b) => b.kind === "BEFORE_CLOUD_RESTORE" && b.namespace === nsA()).length, 3, "2 'newest' by timestamp + the one just created");
    // end to end: a cloud load in that state keeps a restorable device snapshot
    setup();
    A.saveBackupList([1, 2].map((i) => backup(`future${i}`, nsA(), "BEFORE_CLOUD_RESTORE", future(i), { userId: UA })));
    S.tables.nextrep_workouts = [];
    const r = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.equal(r.ok, true, r.error);
    const snap = A.resolveDeviceSnapshot(UA);
    assert.equal(snap.status, "ok", "the device data can still be restored");
    assert.deepEqual(snap.snapshot.data.history.map((x) => x.id), ["hA"]);
  });
});

describe("Zacznij od pustych danych — refused while it would destroy un-backed-up data", () => {
  async function attempt(entries) {
    setup();
    for (const [k, v] of Object.entries(entries)) ls().setItem(k, v);
    const dump = storageDump();
    const r = await quiet(() => A.startAccountEmpty(UA, ref, false));
    return { r, dump };
  }
  const assertBlocked = ({ r, dump }, reason) => {
    assert.equal(r.ok, false);
    assert.equal(r.blocked, reason);
    assert.match(r.error, /pustych danych|Rozpoczęcie od pustych danych/);
    assert.deepEqual(storageDump(), dump, "no clear, no marker, no backup — byte-for-byte");
  };
  test("active workout draft → blocked, draft kept", async () => {
    const draft = JSON.stringify({ version: 1, blocks: [] });
    const res = await attempt({ [key(UA, "active_workout_draft")]: draft });
    assertBlocked(res, "draft");
    assert.equal(ls().getItem(key(UA, "active_workout_draft")), draft);
  });
  test("pending sync queue → blocked, queue kept", async () => {
    const q = JSON.stringify([{ id: "q1", table: "workouts", recordId: "hA", operation: "upsert", status: "failed" }]);
    assertBlocked(await attempt({ [key(UA, "sync_queue")]: q }), "queue");
    assert.equal(ls().getItem(key(UA, "sync_queue")), q);
  });
  test("conflict pending → blocked", async () => {
    assertBlocked(await attempt({ [key(UA, "sync_conflicts")]: JSON.stringify([{ id: "c1", status: "pending" }]) }), "conflicts");
  });
  test("conflict resolved_pending_push → blocked", async () => {
    assertBlocked(await attempt({ [key(UA, "sync_conflicts")]: JSON.stringify([{ id: "c1", status: "resolved_pending_push" }]) }), "conflicts");
  });
  test("technical sync_meta only → allowed (clears this account, marker empty)", async () => {
    const { r } = await attempt({ [key(UA, "sync_meta")]: JSON.stringify({ "workouts:hA": { version: 1 } }), [key(UA, "sync_queue")]: "[]" });
    assert.equal(r.ok, true, r.error);
    assert.equal(ls().getItem(key(UA, "history")), null);
    assert.equal(A.getAccountInitMarker(UA).source, "empty");
  });
});

describe("V1 namespace safety", () => {
  test("migration started for A, workspace switches to B mid-way → status and data only in A, never in B", async () => {
    let release;
    let hit;
    const reached = new Promise((r) => (hit = r));
    S.queryGate = async (q) => {
      if (q.table === "nextrep_workouts" && q.op === "insert" && !release) {
        hit();
        await new Promise((r) => (release = r));
      }
    };
    const p = quiet(() => A.runMigrationV1());
    await reached;
    assert.equal(JSON.parse(ls().getItem(key(UA, "migration_v1_status"))).status, "in_progress");
    // switch to B while A's upload waits
    S.session = { user: { id: UB } };
    A.activateDataNamespace(UB);
    const bBefore = Object.keys(storageDump()).filter((k) => k.startsWith(`nextrep_user_${UB}_`));
    release();
    await p;
    const bAfter = Object.keys(storageDump()).filter((k) => k.startsWith(`nextrep_user_${UB}_`));
    assert.deepEqual(bAfter, bBefore, "nothing written into B's namespace");
    assert.equal(ls().getItem(key(UB, "migration_v1_status")), null);
    assert.notEqual(JSON.parse(ls().getItem(key(UA, "migration_v1_status"))).status, "in_progress", "A's own status was finalised in A");
    for (const [table, rows] of Object.entries(S.tables)) {
      for (const row of rows) assert.notEqual(row.user_id, UB, `${table}: no row written for B`);
    }
  });

  test("V1 refuses to start when the active namespace is not the session account's (no cloud write)", async () => {
    A.activateDataNamespace(null); // guest active, session A
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, false);
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(ls().getItem(key(null, "migration_v1_status")), null);
  });
});

describe("before-restore — identity checks (account / namespace)", () => {
  const at = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  function seed({ pointer = {}, backupExtra = {} } = {}) {
    setup();
    const nsA = A.getLocalDataNamespace(UA);
    A.saveBackupList([{ backupId: "bk1", createdAt: at(60000), appVersion: "x", formatVersion: 1, reason: "before-restore", namespace: nsA, kind: "BEFORE_CLOUD_RESTORE", userId: UA, source: "cloud-restore", data: { history: [historySession("hD", "DEVICE")] }, ...backupExtra }]);
    ls().setItem(key(UA, "last_cloud_restore"), JSON.stringify({ backupId: "bk1", noSnapshot: false, userId: UA, namespace: nsA, createdAt: at(30000), postFingerprint: null, ...pointer }));
    A.setAccountInitMarker(UA, { status: "pending_cloud_confirm", source: "cloud", syncPaused: true });
  }
  test("matching account + namespace → ok, and restore puts the device data back", async () => {
    seed();
    const r = A.resolveDeviceSnapshot(UA);
    assert.equal(r.status, "ok");
    assert.equal(A.restoreDeviceSnapshot(UA, r.snapshot), true);
    assert.deepEqual(JSON.parse(ls().getItem(key(UA, "history"))).map((s) => s.id), ["hD"]);
    assert.equal(ls().getItem(key(UA, "last_cloud_restore")), null);
  });
  test("pointer or backup of another account / namespace → invalid (never restored)", async () => {
    const nsB = A.getLocalDataNamespace(UB);
    for (const variant of [{ pointer: { userId: UB } }, { pointer: { namespace: nsB } }, { backupExtra: { userId: UB } }, { backupExtra: { namespace: nsB } }, { backupExtra: { kind: undefined } }]) {
      seed(variant);
      assert.equal(A.resolveDeviceSnapshot(UA).status, "invalid", JSON.stringify(variant));
    }
  });
  test("restoreDeviceSnapshot refuses while another workspace is active — nothing changes", async () => {
    seed();
    const r = A.resolveDeviceSnapshot(UA);
    A.activateDataNamespace(UB);
    const dump = storageDump();
    assert.equal(A.restoreDeviceSnapshot(UA, r.snapshot), false);
    assert.deepEqual(storageDump(), dump);
  });
});

describe("F3 — V1 verification reads all pages", () => {
  const nsRows = (n, userId, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${String(i).padStart(5, "0")}`, user_id: userId, legacy_id: `${prefix}${i}`, device_id: "dev", version: 1, deleted_at: null }));
  const local = (n, prefix) => ({ exercises: [], plans: [], history: Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` })), measurements: [], customFields: [] });

  test(">1000 workouts with a server cap of 1000 → every local record found", async () => {
    S.maxRows = 1000; // like Supabase max_rows
    S.tables.nextrep_workouts = nsRows(1234, UA, "w");
    const v = await A.verifyMigrationV1(UA, local(1234, "w"), "dev");
    assert.equal(v.results.history.allFound, true, JSON.stringify(v.results.history.missingLegacyIdsSample));
    assert.equal(v.results.history.remoteCount, 1234);
    assert.ok(S.calls.filter((c) => c.table === "nextrep_workouts" && c.op === "range").length >= 3, "read in pages");
  });

  test("server cap lower than the page size (300) → still all found", async () => {
    S.maxRows = 300;
    S.tables.nextrep_measurements = nsRows(1100, UA, "m");
    const v = await A.verifyMigrationV1(UA, { ...local(0, "x"), measurements: Array.from({ length: 1100 }, (_, i) => ({ id: `m${i}` })) }, "dev");
    assert.equal(v.results.measurements.allFound, true);
    assert.equal(v.results.measurements.remoteCount, 1100);
  });

  test("an error on a later page → verification fails (never a partial success)", async () => {
    S.tables.nextrep_workouts = nsRows(1200, UA, "w");
    S.queryHook = (q) => (q.table === "nextrep_workouts" && q.rangeWin && q.rangeWin[0] >= 1000 ? { message: "page 3 failed" } : null);
    await assert.rejects(() => A.verifyMigrationV1(UA, local(1200, "w"), "dev"), /nextrep_workouts: odczyt rekordów zdalnych nie powiódł się — page 3 failed/);
  });

  test("rows of another user never count as found", async () => {
    S.tables.nextrep_workouts = nsRows(5, UB, "w"); // same legacy ids, other user
    const v = await A.verifyMigrationV1(UA, local(5, "w"), "dev");
    assert.equal(v.results.history.allFound, false);
    assert.equal(v.results.history.localRecordsMissingInRemote, 5);
  });

  test("end to end: V1 upload of 1100 workouts under a 1000-row server cap → success", async () => {
    const many = Array.from({ length: 1100 }, (_, i) => historySession(`h${i}`, "BULK", "50", new Date(Date.UTC(2023, 0, 1) + i * 3600000).toISOString()));
    ls().setItem(key(UA, "history"), JSON.stringify(many));
    S.maxRows = 1000;
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, true, r.error);
    assert.equal(r.verification.results.history.remoteCount, 1100);
    assert.equal(S.tables.nextrep_workouts.length, 1100);
  });
});
