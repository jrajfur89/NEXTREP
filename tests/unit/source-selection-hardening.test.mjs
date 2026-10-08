// Stage 4A.3 — account source selection, hardening part 1 (helpers, fake Supabase, no network).
// P1-3: paginated cloud reads (fetchRemoteTable).
// P1-2: "Wczytaj z chmury" refused while a draft / unsent queue / open conflicts exist.
// P2-1: destructive source steps wait for a sync pass that already started; account change → cancel.
// P2-2: persistent "loading_cloud" state before the namespace is cleared; idempotent retry; rollback.
// P1-1: device data → confirmed-empty cloud is uploaded (migration V1), re-checked right before.
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, UB, key, historySession, cloudTablesFor, storageDump, cloudWrites } from "../harness/account-fixtures.mjs";

let A;
let S;
const ls = () => globalThis.localStorage;
const clone = (v) => JSON.parse(JSON.stringify(v));
const readJson = (k) => {
  const raw = ls().getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const ids = (list) => (Array.isArray(list) ? list.map((s) => s.id).sort() : list);
const ref = () => UA;
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  A = await loadApp();
});
// fresh storage + fake; session = A; A's namespace active
function setup({ tables = null } = {}) {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: UA } };
  if (tables) S.tables = clone(tables);
  A.activateDataNamespace(UA);
}
beforeEach(() => setup());

// gate: pauses the first table query matching `match` until release() — deterministic "in flight"
function gateOn(match) {
  let hit;
  let release;
  const reached = new Promise((r) => (hit = r));
  const released = new Promise((r) => (release = r));
  let used = false;
  S.queryGate = async (q) => {
    if (used || !match(q)) return;
    used = true;
    hit();
    await released;
  };
  return { reached, release };
}

describe("P1-3 — fetchRemoteTable pagination", () => {
  const rows = (n, userId, prefix = "ws") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${String(i).padStart(5, "0")}`, user_id: userId, legacy_id: `l${i}`, version: 1, deleted_at: null }));

  test("2345 rows (>1000) are all fetched, in pages, only this user's", async () => {
    S.tables.nextrep_workout_sets = [...rows(2345, UA), ...rows(50, UB, "other")];
    const got = await A.fetchRemoteTable("workout_sets", UA);
    assert.equal(got.length, 2345);
    assert.equal(new Set(got.map((r) => r.id)).size, 2345, "no duplicates");
    assert.ok(got.every((r) => r.user_id === UA), "user isolation kept");
    const ranges = S.calls.filter((c) => c.table === "nextrep_workout_sets" && c.op === "range");
    assert.equal(ranges.length, Math.ceil(2345 / A.REMOTE_FETCH_PAGE_SIZE), "one request per page, no extra empty page");
    assert.ok(S.calls.some((c) => c.table === "nextrep_workout_sets" && c.op === "eq" && c.args[0] === "user_id" && c.args[1] === UA));
    assert.ok(S.calls.some((c) => c.table === "nextrep_workout_sets" && c.op === "order" && c.args[0] === "id"));
  });

  test("a server cap smaller than the page size (max_rows 300) still returns everything", async () => {
    S.maxRows = 300;
    S.tables.nextrep_workouts = rows(1234, UA, "w");
    const got = await A.fetchRemoteTable("workouts", UA);
    assert.equal(got.length, 1234);
  });

  test("tombstones are still returned (deleted_at is not filtered — PULL needs them)", async () => {
    S.tables.nextrep_plans = [...rows(3, UA, "p"), { id: "p-dead", user_id: UA, legacy_id: "x", version: 2, deleted_at: "2026-10-01T00:00:00Z" }];
    const got = await A.fetchRemoteTable("plans", UA);
    assert.equal(got.length, 4);
  });

  test("profiles (no id column) are ordered by user_id", async () => {
    S.tables.nextrep_profiles = [{ user_id: UA, display_name: "Ania" }];
    const got = await A.fetchRemoteTable("profiles", UA);
    assert.equal(got.length, 1);
    assert.ok(S.calls.some((c) => c.table === "nextrep_profiles" && c.op === "order" && c.args[0] === "user_id"));
  });

  test("an error on a later page fails the WHOLE fetch (no partial table)", async () => {
    S.tables.nextrep_workout_sets = rows(1600, UA);
    S.queryHook = (q) => (q.table === "nextrep_workout_sets" && q.rangeWin && q.rangeWin[0] >= 1000 ? { message: "boom page 3" } : null);
    await assert.rejects(() => A.fetchRemoteTable("workout_sets", UA), (e) => e && e.message === "boom page 3");
  });

  test("pullRemoteChanges (normal sync and cloud load) sees all >1000 rows", async () => {
    S.tables.nextrep_workout_sets = rows(1500, UA);
    const pull = await quiet(() => A.pullRemoteChanges());
    assert.equal(pull.success, true);
    assert.equal(pull.tables.workout_sets.fetched, 1500);
  });
});

describe("P1-2 — cloud load refused while it would destroy un-backed-up data", () => {
  let cloud;
  before(async () => {
    cloud = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD")] });
  });
  async function attempt(extraEntries) {
    setup({ tables: cloud });
    ls().setItem(key(UA, "history"), JSON.stringify([historySession("hD", "DEVICE")]));
    for (const [k, v] of Object.entries(extraEntries)) ls().setItem(k, v);
    const dumpBefore = storageDump();
    const callsBefore = S.calls.length;
    const r = await quiet(() => A.loadAccountFromCloud(UA, ref));
    return { r, dumpBefore, newCalls: S.calls.slice(callsBefore) };
  }
  const assertUntouched = ({ r, dumpBefore, newCalls }, reason) => {
    assert.equal(r.ok, false);
    assert.equal(r.blocked, reason);
    assert.ok(r.error && r.error.length > 20, "a clear message");
    assert.deepEqual(storageDump(), dumpBefore, "every key byte-for-byte unchanged (no clear, no backup, no marker)");
    assert.equal(newCalls.filter((c) => c.kind === "table").length, 0, "no cloud read or write at all");
  };

  test("active workout draft → blocked; draft, namespace and marker untouched", async () => {
    const draft = JSON.stringify({ version: 1, savedAt: "2026-10-07T08:00:00.000Z", blocks: [{ items: [] }], plan: { id: "P1", name: "Push" } });
    const res = await attempt({ [key(UA, "active_workout_draft")]: draft });
    assertUntouched(res, "draft");
    assert.equal(ls().getItem(key(UA, "active_workout_draft")), draft);
    assert.match(res.r.error, /rozpoczęty trening/);
  });

  test("unsent sync queue → blocked; queue untouched", async () => {
    const queue = JSON.stringify([{ id: "q1", table: "workouts", recordId: "hD", operation: "upsert", version: 2, status: "pending" }]);
    const res = await attempt({ [key(UA, "sync_queue")]: queue });
    assertUntouched(res, "queue");
    assert.equal(ls().getItem(key(UA, "sync_queue")), queue);
  });

  test("unresolved sync conflict (pending / resolved_pending_push) → blocked; conflicts untouched", async () => {
    for (const status of ["pending", "resolved_pending_push"]) {
      const conflicts = JSON.stringify([{ id: "c1", table: "workouts", recordId: "hD", status }]);
      const res = await attempt({ [key(UA, "sync_conflicts")]: conflicts });
      assertUntouched(res, "conflicts");
      assert.equal(ls().getItem(key(UA, "sync_conflicts")), conflicts);
    }
  });

  test("empty queue / no open conflicts / sync_meta only → the cloud load runs", async () => {
    const { r } = await attempt({
      [key(UA, "sync_queue")]: "[]",
      [key(UA, "sync_conflicts")]: JSON.stringify([{ id: "old", table: "workouts", recordId: "x", status: "finalized" }]),
      [key(UA, "sync_meta")]: JSON.stringify({ "workouts:hD": { version: 1 } }),
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(A.getAccountInitMarker(UA).status, "pending_cloud_confirm");
    assert.deepEqual(ids(readJson(key(UA, "history"))), ["hC"]);
  });
});

describe("P2-1 — no destructive step while a sync pass is still writing", () => {
  let cloud;
  before(async () => {
    cloud = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD")] });
  });
  function syncingAccount() {
    setup({ tables: cloud });
    ls().setItem(key(UA, "history"), JSON.stringify([historySession("hD", "DEVICE")]));
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false }); // a sync pass may start
  }

  test("waitForSyncIdle: false while runSync / bootstrap is in flight, true once done", async () => {
    syncingAccount();
    const g = gateOn((q) => q.table === "nextrep_workouts");
    const syncP = quiet(() => A.runSync());
    await g.reached;
    assert.equal(A.isSyncRunInProgress(), true);
    assert.equal(await A.waitForSyncIdle(120), false);
    g.release();
    await syncP;
    assert.equal(await A.waitForSyncIdle(120), true);
    // the bootstrap alone (it also runs outside runSync) counts too
    S.tables = clone(cloud);
    const g2 = gateOn((q) => q.table === "nextrep_workouts");
    const bootP = quiet(() => A.bootstrapSyncMetaForExistingData());
    await g2.reached;
    assert.equal(A.isSyncBootstrapInProgress(), true);
    assert.equal(await A.waitForSyncIdle(120), false);
    g2.release();
    await bootP;
    assert.equal(A.isSyncBootstrapInProgress(), false);
  });

  test("runSync A in flight → re-choose → cloud load WAITS, sync finishes, guards re-checked, then load runs", async () => {
    syncingAccount();
    const g = gateOn((q) => q.table === "nextrep_workouts");
    let syncEndedAt = null;
    const syncP = quiet(() => A.runSync()).then((r) => {
      syncEndedAt = Date.now();
      return r;
    });
    await g.reached;
    A.clearAccountInitMarker(UA); // "Wybierz ponownie źródło danych"
    const loadP = quiet(() => A.loadAccountFromCloud(UA, ref));
    await tick(250);
    // still waiting: nothing destroyed, no backup, no "loading_cloud"
    assert.equal(A.isSyncRunInProgress(), true);
    assert.deepEqual(ids(readJson(key(UA, "history"))), ["hD"]);
    assert.equal(A.getAccountInitMarker(UA), null);
    assert.equal(A.loadBackupList().length, 0);
    g.release();
    await syncP;
    const r = await loadP;
    assert.equal(r.ok, true, r.error);
    const backup = A.loadBackupList().find((b) => b.kind === "BEFORE_CLOUD_RESTORE");
    assert.ok(backup, "before-restore backup created");
    assert.ok(Date.parse(backup.createdAt) >= syncEndedAt, "backup taken only after the sync pass ended");
    assert.ok(ids(backup.data.history).includes("hD"));
    assert.equal(A.getAccountInitMarker(UA).status, "pending_cloud_confirm");
    assert.deepEqual(ids(readJson(key(UA, "history"))), ["hC"]);
  });

  test("runSync A in flight → account/workspace changes while waiting → cloud load cancelled, nothing cleared", async () => {
    syncingAccount();
    const g = gateOn((q) => q.table === "nextrep_workouts");
    const syncP = quiet(() => A.runSync());
    await g.reached;
    A.clearAccountInitMarker(UA);
    const historyBefore = ls().getItem(key(UA, "history"));
    const loadP = quiet(() => A.loadAccountFromCloud(UA, ref));
    await tick(120);
    // the user switches to account B meanwhile
    S.session = { user: { id: UB } };
    A.activateDataNamespace(UB);
    g.release();
    await syncP;
    const r = await loadP;
    assert.equal(r.ok, false);
    assert.equal(r.discarded, true);
    assert.equal(ls().getItem(key(UA, "history")), historyBefore, "A's data not cleared / replaced");
    assert.equal(A.getAccountInitMarker(UA), null, "no loading_cloud marker");
    assert.equal(ls().getItem(key(UA, "last_cloud_restore")), null);
    assert.equal(A.loadBackupList().filter((b) => b.kind === "BEFORE_CLOUD_RESTORE").length, 0);
    assert.equal(ls().getItem(key(UB, "history")), null, "nothing written into B");
  });
});

describe("P2-2 — resumable cloud load", () => {
  let cloud;
  before(async () => {
    cloud = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD"), historySession("hC2", "CLOUD2")] });
  });

  test("the persistent state is written BEFORE the namespace is cleared", async () => {
    setup({ tables: cloud });
    ls().setItem(key(UA, "history"), JSON.stringify([historySession("hD", "DEVICE")]));
    let seen = null;
    S.queryGate = async (q) => {
      if (seen || q.table === "nextrep_migration_attempts") return; // F-5: the lock check reads first (nothing changed yet)
      // first cloud DATA read of the load = right after clearAccountNamespace
      seen = { marker: A.getAccountInitMarker(UA), pointer: readJson(key(UA, "last_cloud_restore")), history: ls().getItem(key(UA, "history")), backups: A.loadBackupList() };
    };
    const r = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.equal(seen.marker.status, "loading_cloud");
    assert.equal(seen.marker.userId, UA);
    assert.equal(seen.marker.namespace, A.getLocalDataNamespace(UA));
    assert.ok(seen.marker.backupId);
    assert.equal(seen.pointer.backupId, seen.marker.backupId);
    assert.equal(seen.history, null, "namespace already cleared at that point");
    const b = seen.backups.find((x) => x.backupId === seen.marker.backupId);
    assert.deepEqual(ids(b.data.history), ["hD"], "the backup it references holds the device data");
  });

  test("first attempt fails → data, marker and pointer all given back", async () => {
    setup({ tables: cloud });
    ls().setItem(key(UA, "history"), JSON.stringify([historySession("hD", "DEVICE")]));
    S.queryHook = (q) => (q.table === "nextrep_workouts" ? { message: "network down" } : null);
    const r = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.equal(r.ok, false);
    assert.deepEqual(ids(readJson(key(UA, "history"))), ["hD"]);
    assert.equal(A.getAccountInitMarker(UA), null);
    assert.equal(ls().getItem(key(UA, "last_cloud_restore")), null);
  });

  function interruptedState({ partialHistory = [historySession("hC", "CLOUD")], withSnapshot = true } = {}) {
    setup({ tables: cloud });
    const ns = A.getLocalDataNamespace(UA);
    const createdAt = new Date(Date.now() - 60000).toISOString();
    if (withSnapshot) {
      ls().setItem("nextrep_backup_list_v1", JSON.stringify([{ backupId: "bk1", createdAt, appVersion: "x", formatVersion: 1, reason: "before-restore", namespace: ns, kind: "BEFORE_CLOUD_RESTORE", userId: UA, source: "cloud-restore", data: { history: [historySession("hD", "DEVICE")], plans: [], exercises: null, measurements: [], customFields: [], userName: "", proStatus: null, proHints: null } }]));
    }
    ls().setItem(key(UA, "last_cloud_restore"), JSON.stringify({ backupId: withSnapshot ? "bk1" : null, noSnapshot: !withSnapshot, userId: UA, namespace: ns, createdAt: new Date(Date.now() - 30000).toISOString(), postFingerprint: null }));
    ls().setItem(key(UA, "account_init"), JSON.stringify({ status: "loading_cloud", source: "cloud", syncPaused: true, userId: UA, namespace: ns, backupId: withSnapshot ? "bk1" : null, noSnapshot: !withSnapshot }));
    if (partialHistory) ls().setItem(key(UA, "history"), JSON.stringify(partialHistory));
  }

  test("retry of an interrupted load reuses the SAME backup (idempotent) and settles at pending_cloud_confirm", async () => {
    interruptedState();
    assert.equal(A.resolveDeviceSnapshot(UA).status, "ok", "the device snapshot stays reachable while interrupted");
    const r = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.equal(A.loadBackupList().length, 1, "no new backup of the partial data");
    assert.equal(readJson(key(UA, "last_cloud_restore")).backupId, "bk1");
    assert.equal(A.getAccountInitMarker(UA).status, "pending_cloud_confirm");
    assert.deepEqual(ids(readJson(key(UA, "history"))), ["hC", "hC2"]);
    // a second retry from pending is not offered, but loading again from here is still safe
    assert.equal(A.resolveDeviceSnapshot(UA).status, "ok");
  });

  test("a failed retry keeps the interrupted state (marker loading_cloud, pointer, data as found)", async () => {
    interruptedState();
    const before = storageDump();
    S.queryHook = (q) => (q.table === "nextrep_workouts" ? { message: "still down" } : null);
    const r = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.equal(r.ok, false);
    assert.equal(A.getAccountInitMarker(UA).status, "loading_cloud");
    assert.deepEqual(storageDump(), before);
  });

  test("interrupted without a device snapshot → abandon drops the partial data and the marker", async () => {
    interruptedState({ withSnapshot: false });
    assert.equal(A.resolveDeviceSnapshot(UA).status, "no_snapshot");
    const r = await A.abandonInterruptedCloudLoad(UA, ref);
    assert.equal(r.ok, true);
    assert.equal(ls().getItem(key(UA, "history")), null);
    assert.equal(A.getAccountInitMarker(UA), null);
    assert.equal(ls().getItem(key(UA, "last_cloud_restore")), null);
    assert.equal(A.isAccountSyncAllowed(UA), false);
  });

  test("while interrupted, sync stays off and the partial data never counts as an initialised account", async () => {
    interruptedState();
    assert.equal(A.isAccountSyncAllowed(UA), false);
    const r = await quiet(() => A.runSync());
    assert.equal(r.started, false);
    assert.equal(cloudWrites(S).length, 0);
  });
});

describe("P1-1 — device data → confirmed-empty cloud is uploaded", () => {
  function deviceAccount() {
    ls().setItem(key(UA, "history"), JSON.stringify([historySession("hD1", "DEVICE"), historySession("hD2", "DEVICE2")]));
    ls().setItem(key(UA, "user_name"), JSON.stringify("Ania"));
  }
  const dataKeys = () => Object.fromEntries(["history", "user_name", "plans", "measurements", "custom_fields", "exercises"].map((n) => [n, ls().getItem(key(UA, n))]));
  const cloudWorkoutIds = () => (S.tables.nextrep_workouts || []).map((r) => r.legacy_id).sort();

  const uploadingMarker = (deviceId) => ({ status: "uploading_device", source: "device", syncPaused: true, userId: UA, namespace: A.getLocalDataNamespace(UA), deviceId, startedAt: "2026-10-07T08:00:00.000Z" });

  test("local + empty cloud → full upload, local data unchanged; marker stays 'uploading_device' until the caller confirms", async () => {
    deviceAccount();
    const before = dataKeys();
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(cloudWorkoutIds(), ["hD1", "hD2"]);
    assert.equal(S.tables.nextrep_workout_sets.length, 2);
    assert.equal(S.tables.nextrep_profiles[0].display_name, "Ania");
    assert.deepEqual(dataKeys(), before, "local data is the safety copy — untouched");
    const m = A.getAccountInitMarker(UA);
    assert.equal(m.status, "uploading_device", "never 'ready' from the helper — the caller sets it after ok");
    assert.equal(A.isAccountSyncAllowed(UA), false);
  });

  test("the uploading marker (user, namespace, device) is persisted BEFORE the first cloud write", async () => {
    deviceAccount();
    let markerAtFirstWrite = "unset";
    S.queryGate = async (q) => {
      if (markerAtFirstWrite === "unset" && ["insert", "update", "upsert"].includes(q.op)) markerAtFirstWrite = A.getAccountInitMarker(UA);
    };
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.equal(markerAtFirstWrite.status, "uploading_device");
    assert.equal(markerAtFirstWrite.userId, UA);
    assert.equal(markerAtFirstWrite.namespace, A.getLocalDataNamespace(UA));
    assert.equal(markerAtFirstWrite.deviceId, A.getOrCreateDeviceId());
  });

  test("upload error → local intact, marker 'uploading_device' (never ready); retry ignores this device's own partial rows and completes", async () => {
    deviceAccount();
    const before = dataKeys();
    S.queryHook = (q) => (q.table === "nextrep_workout_sets" && q.op === "insert" ? { message: "insert failed" } : null);
    const r1 = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r1.ok, false);
    assert.ok(r1.error);
    assert.deepEqual(dataKeys(), before);
    assert.equal(A.getAccountInitMarker(UA).status, "uploading_device");
    assert.ok((S.tables.nextrep_workouts || []).length > 0, "a partial upload reached the cloud");
    // Stage 4A.4 F-5 (Etap 6): while the attempt is open a plain check (no attempt id) is refused by the server
    // read guard — the partial rows are never read as account data…
    await assert.rejects(() => A.checkCloudAccountData(UA), /migration_in_progress/);
    // …with the attempt's own id the check sees "data" (our own partial rows)
    assert.equal((await A.checkCloudAccountData(UA, { migrationToken: A.getAccountInitMarker(UA).serverAttemptId })).hasData, true);
    // …the retry (marker present) doesn't count them and finishes the upload
    S.queryHook = null;
    const r2 = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r2.ok, true, r2.error);
    assert.deepEqual(cloudWorkoutIds(), ["hD1", "hD2"], "idempotent: no duplicate rows");
    assert.equal(S.tables.nextrep_workout_sets.length, 2);
  });

  test("cloud no longer empty right before the upload → nothing uploaded or overwritten, no marker", async () => {
    deviceAccount();
    S.tables.nextrep_workouts = [{ id: "w-other", user_id: UA, legacy_id: "hOther", device_id: "other-device", version: 3, deleted_at: null }];
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r.ok, false);
    assert.equal(r.cloudChanged, true);
    assert.equal(r.cloud.hasData, true);
    assert.equal(cloudWrites(S).length, 0, "no insert / update / upsert at all");
    assert.deepEqual(cloudWorkoutIds(), ["hOther"]);
    assert.equal(A.getAccountInitMarker(UA), null);
  });

  test("resumed upload refuses rows of ANOTHER device (or without a device) and returns to the choice", async () => {
    deviceAccount();
    const myDevice = A.getOrCreateDeviceId();
    for (const deviceId of ["other-device", null]) {
      S.calls.length = 0;
      ls().setItem(key(UA, "account_init"), JSON.stringify(uploadingMarker(myDevice)));
      S.tables.nextrep_plans = [{ id: "p-x", user_id: UA, legacy_id: "pX", device_id: deviceId, version: 1, deleted_at: null }];
      const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
      assert.equal(r.cloudChanged, true, `device ${deviceId}`);
      assert.equal(cloudWrites(S).length, 0);
      assert.equal(A.getAccountInitMarker(UA), null, "upload abandoned → normal source choice");
    }
  });

  describe("restart during the device upload", () => {
    test("killed BEFORE the first write (marker only) → resume uploads everything → ok", async () => {
      deviceAccount();
      ls().setItem(key(UA, "account_init"), JSON.stringify(uploadingMarker(A.getOrCreateDeviceId())));
      const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(cloudWorkoutIds(), ["hD1", "hD2"]);
    });

    test("killed AFTER a partial upload → own rows don't block, the rest is upserted, no duplicates, local intact", async () => {
      deviceAccount();
      const before = dataKeys();
      // first attempt dies after the exercises + first workout reached the cloud (simulated kill: the gate never opens)
      let writes = 0;
      S.queryGate = async (q) => {
        if (q.table === "nextrep_workout_exercises" && q.op === "insert" && ++writes === 1) await new Promise(() => {});
      };
      quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref)); // never settles — the "killed" app
      for (let i = 0; i < 50 && !writes; i++) await tick(10);
      assert.equal(writes, 1, "the upload stopped mid-way");
      const partial = clone(S.tables);
      const marker = A.getAccountInitMarker(UA);
      assert.equal(marker.status, "uploading_device");
      // "restart": same storage + cloud, fresh module state for the in-flight flags
      A.__testState.resetAccountInitBusy();
      S.queryGate = null;
      S.tables = partial;
      assert.ok((partial.nextrep_workouts || []).length >= 1, "some own rows are in the cloud");
      const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(cloudWorkoutIds(), ["hD1", "hD2"]);
      assert.equal(S.tables.nextrep_workouts.length, 2, "idempotent upsert — no duplicate workouts");
      assert.deepEqual(dataKeys(), before);
    });

    test("account switch while the resumed upload waits → cancelled, nothing sent, A's marker kept", async () => {
      deviceAccount();
      ls().setItem(key(UA, "account_init"), JSON.stringify(uploadingMarker(A.getOrCreateDeviceId())));
      const g = gateOn((q) => q.table === "nextrep_workouts" && q.op === "select");
      const p = quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
      await g.reached; // the cloud re-check is in flight
      S.session = { user: { id: UB } };
      A.activateDataNamespace(UB);
      g.release();
      const r = await p;
      assert.equal(r.discarded, true);
      assert.equal(cloudWrites(S).length, 0);
      assert.equal(A.getAccountInitMarker(UA).status, "uploading_device", "A's unfinished upload is still recognisable");
      assert.equal(ls().getItem(key(UB, "account_init")), null);
    });
  });

  test("guest data is never part of the upload", async () => {
    deviceAccount();
    ls().setItem(key(null, "history"), JSON.stringify([historySession("gG1", "GUEST")]));
    ls().setItem(key(null, "user_name"), JSON.stringify("Gość"));
    const guestBefore = ls().getItem(key(null, "history"));
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(cloudWorkoutIds(), ["hD1", "hD2"]);
    assert.equal(S.tables.nextrep_profiles[0].display_name, "Ania");
    assert.equal(ls().getItem(key(null, "history")), guestBefore);
  });

  test("session/account changed → discarded before anything is sent", async () => {
    deviceAccount();
    S.session = { user: { id: UB } };
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
    assert.equal(r.discarded, true);
    assert.equal(cloudWrites(S).length, 0);
  });
});
