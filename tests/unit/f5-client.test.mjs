// Stage 4A.4 F-5 (Etap 6) — client of the server migration attempts (SQL v3 + read guard C v2).
// REAL production functions against the in-memory server model of the fake Supabase (write lock NR001 /
// NR002 with writes_count, read guard NR001, the 7 RPCs). "Another device" is modelled the way it reaches
// the server: its own device id, its own RPC calls and its own token on its writes (the server is shared).
import { test, describe, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, UB, key, historySession, cloudWrites, cloudTablesFor } from "../harness/account-fixtures.mjs";

let A;
let S;
const ref = () => UA;
const DEV_A = "d0000000-0000-4000-8000-00000000000a";
const DEV_B = "d0000000-0000-4000-8000-00000000000b";
const LOCKED = new Set(["nextrep_exercises", "nextrep_plans", "nextrep_plan_items", "nextrep_plan_item_sets", "nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_measurements", "nextrep_custom_fields", "nextrep_profiles"]);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const attempts = () => S.tables.nextrep_migration_attempts || [];
const rows = (t) => S.tables[t] || [];
const marker = () => A.getAccountInitMarker(UA);
const record = () => A.getMigrationAttemptRecord(UA);
const counts = () => Object.fromEntries([...LOCKED].map((t) => [t, rows(t).length]));
const net = () => Object.assign(new TypeError("Failed to fetch"), { name: "TypeError" });
const timeoutErr = () => ({ code: "57014", message: "canceling statement due to statement timeout" });
const savedTiming = {};

before(async () => {
  A = await loadApp();
  Object.assign(savedTiming, A.MIGRATION_TIMING, { rpcRetryDelaysMs: [...A.MIGRATION_TIMING.rpcRetryDelaysMs] });
});
function setup({ history = [historySession("hA", "A-DATA"), historySession("hB", "B-DATA", "90", "2026-10-02T10:00:00.000Z")] } = {}) {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.__testState.resetAccountInitBusy();
  A.cancelAllScheduledSyncRetries();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: UA } };
  A.activateDataNamespace(UA);
  localStorage.setItem(key(UA, "device_id"), DEV_A);
  localStorage.setItem(key(UA, "history"), JSON.stringify(history));
  A.MIGRATION_TIMING.rpcRetryDelaysMs = [1, 1, 1];
  A.MIGRATION_TIMING.pausedRetryMs = 60000;
}
beforeEach(() => setup());
afterEach(() => {
  A.cancelAllScheduledSyncRetries();
  Object.assign(A.MIGRATION_TIMING, savedTiming, { rpcRetryDelaysMs: [...savedTiming.rpcRetryDelaysMs] });
});

// ---- the other device B of the same account, as the server sees it ----
const B = {
  async start(id = "e0000000-0000-4000-8000-0000000000b1", kind = "device_upload") {
    const r = await A.supabase.rpc("nextrep_migration_attempt_start", { p_attempt_id: id, p_device_id: DEV_B, p_kind: kind, p_app_version: "test" });
    return r;
  },
  rpc(fn, id) {
    return A.supabase.rpc(`nextrep_migration_attempt_${fn}`, { p_attempt_id: id, p_device_id: DEV_B });
  },
  write(id, legacyId = "b-row") {
    return A.supabase.from("nextrep_measurements").upsert({ user_id: UA, legacy_id: legacyId, device_id: DEV_B, date: "2026-10-05", data: {} }).setHeader("x-nextrep-migration-attempt", id);
  },
};
const B_ID = "e0000000-0000-4000-8000-0000000000b1";

// pause the first data write of a V1 run until released
function pauseFirstWrite(table = "nextrep_workouts") {
  let release;
  let reached;
  const reachedP = new Promise((r) => (reached = r));
  const p = new Promise((r) => (release = r));
  let done = false;
  S.queryGate = async (q) => {
    if (!done && q.table === table && q.op !== "select") {
      done = true;
      reached();
      await p;
    }
  };
  return { release, reached: reachedP };
}
// a V1 run whose first `n` writes succeed, then the network breaks (like a killed connection)
function breakAfterWrites(n) {
  let seen = 0;
  S.queryHook = (q) => {
    if (LOCKED.has(q.table) && q.op !== "select") {
      seen++;
      if (seen > n) return net();
    }
    return null;
  };
}
const upload = () => quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));

describe("A/B — attempt id persisted before start; token on EVERY V1 read and write", () => {
  test("device → empty cloud: id in the marker + record before the start RPC; every locked request after start carries it", async () => {
    let seenAtStart = null;
    S.rpc.nextrep_migration_attempt_start = undefined;
    const origStart = S.rpcFail;
    S.rpcFail.nextrep_migration_attempt_start = [
      (args) => {
        seenAtStart = { marker: A.getAccountInitMarker(UA), record: A.getMigrationAttemptRecord(UA), args };
        return { data: null, error: timeoutErr() }; // first call times out → bounded retry with the SAME id
      },
    ];
    const r = await upload();
    assert.equal(r.ok, true, r.error);
    assert.ok(origStart);
    const id = seenAtStart.args.p_attempt_id;
    assert.equal(seenAtStart.marker.serverAttemptId, id, "marker holds the id before the first start RPC");
    assert.equal(seenAtStart.record.attemptId, id, "record holds the id before the first start RPC");
    assert.equal(attempts().length, 1, "one attempt after a timed-out start + retry");
    assert.equal(attempts()[0].attempt_id, id);
    assert.equal(attempts()[0].status, "completed");
    assert.ok(attempts()[0].writes_count > 0);
    assert.ok(attempts()[0].verified_counts && typeof attempts()[0].verified_counts === "object");
    const log = S.headerLog;
    const startIdx = log.findIndex((e) => e.fn === "nextrep_migration_attempt_start" && true);
    const completeIdx = log.findIndex((e) => e.fn === "nextrep_migration_attempt_complete");
    assert.ok(startIdx >= 0 && completeIdx > startIdx);
    const between = log.slice(startIdx, completeIdx).filter((e) => e.table && LOCKED.has(e.table));
    assert.ok(between.some((e) => e.op === "select"), "reads (checks, verification, pagination) happen under the attempt");
    assert.ok(between.some((e) => e.op !== "select"), "writes happen under the attempt");
    assert.deepEqual(between.filter((e) => e.token !== id), [], "no locked read or write without the token");
    assert.equal(record().status, "completed");
    assert.equal(A._v1MigrationToken, null, "the token never outlives the run");
  });

  test("the token never leaks into sync: a sync pass after the upload sends no token", async () => {
    const r = await upload();
    assert.equal(r.ok, true, r.error);
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const from = S.headerLog.length;
    A.enqueueSyncChange({ table: "workouts", recordId: "hA", operation: "upsert", version: 2, deviceId: DEV_A });
    const s = await quiet(() => A.runSync());
    assert.equal(s.started, true, s.message);
    assert.deepEqual(S.headerLog.slice(from).filter((e) => e.token), [], "no request of sync carries a migration token");
  });

  test("manual repair tool: same token discipline; resumed with the SAME id after an interruption", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    breakAfterWrites(2);
    const r1 = await quiet(() => A.runManualMigrationV1());
    assert.equal(r1.success, false);
    assert.equal(r1.attemptOpen, true);
    const id = record().attemptId;
    assert.equal(attempts()[0].status, "uploading", "the interrupted run keeps the account locked");
    assert.equal(A.getOpenManualAttempt(UA).attemptId, id);
    S.queryHook = null;
    const from = S.headerLog.length;
    const r2 = await quiet(() => A.runManualMigrationV1());
    assert.equal(r2.success, true, r2.error);
    assert.equal(attempts().length, 1);
    assert.equal(attempts()[0].attempt_id, id, "same attempt id");
    assert.equal(attempts()[0].status, "completed");
    const locked = S.headerLog.slice(from).filter((e) => e.table && LOCKED.has(e.table));
    assert.ok(locked.length > 0);
    assert.deepEqual(locked.filter((e) => e.token !== id), []);
    assert.equal(A.getOpenManualAttempt(UA), null);
  });

  test("guest → account: every locked request after the start carries the attempt token", async () => {
    resetStorage();
    A.__testState.resetActiveDataNamespace();
    S = globalThis.__nrSupabase;
    S.session = { user: { id: UA } };
    localStorage.setItem(key(null, "history"), JSON.stringify([historySession("g1", "GUEST")]));
    A.activateDataNamespace(UA);
    localStorage.setItem(key(UA, "device_id"), DEV_A);
    const r = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r.ok, true, r.error);
    const id = marker().serverAttemptId || record().attemptId;
    assert.equal(attempts()[0].attempt_id, id);
    assert.equal(attempts()[0].kind, "guest_to_account");
    const log = S.headerLog;
    const startIdx = log.findIndex((e) => e.fn === "nextrep_migration_attempt_start");
    const completeIdx = log.findIndex((e) => e.fn === "nextrep_migration_attempt_complete");
    const between = log.slice(startIdx, completeIdx).filter((e) => e.table && LOCKED.has(e.table));
    assert.ok(between.length > 0);
    assert.deepEqual(between.filter((e) => e.token !== id), []);
  });
});

describe("C — complete only after verification; ready only after a confirmed `completed`", () => {
  test("complete fails (network) → not ok, attempt still uploading; retry completes without duplicates", async () => {
    S.rpcFail.nextrep_migration_attempt_complete = [{ message: "Failed to fetch" }];
    const r1 = await upload();
    assert.equal(r1.ok, false, "a failed complete is never success");
    assert.equal(marker().status, "uploading_device");
    assert.equal(attempts()[0].status, "uploading");
    const after1 = counts();
    const r2 = await upload();
    assert.equal(r2.ok, true, r2.error);
    assert.deepEqual(counts(), after1, "the retry adds no row");
    assert.equal(attempts().length, 1);
    assert.equal(attempts()[0].status, "completed");
  });
  test("complete answered `completed` but the app died before reading it → on restart: own completed, no re-upload", async () => {
    let completed = false;
    S.rpcFail.nextrep_migration_attempt_complete = [
      (args) => {
        const r = A.supabase; // run the real handler, then lose the answer
        completed = true;
        const row = attempts().find((a) => a.attempt_id === args.p_attempt_id);
        row.status = "completed";
        return { data: null, error: net() };
      },
    ];
    const r1 = await upload();
    assert.ok(completed);
    assert.equal(r1.ok, false);
    A.__testState.resetAccountInitBusy(); // "restart"
    const writesBefore = cloudWrites(S).length;
    const r2 = await upload();
    assert.equal(r2.ok, true, r2.error);
    assert.equal(r2.alreadyCompleted, true);
    assert.equal(cloudWrites(S).length, writesBefore, "nothing uploaded again");
  });
  test("a failing verification never calls complete", async () => {
    // rows written but the verification read of workouts returns nothing → V1 fails before complete
    let wrote = false;
    S.queryHook = (q) => {
      if (q.table === "nextrep_workouts" && q.op !== "select") wrote = true;
      return wrote && q.table === "nextrep_workouts" && q.op === "select" ? { message: "boom" } : null;
    };
    const r = await upload();
    assert.equal(r.ok, false);
    assert.equal(S.headerLog.filter((e) => e.fn === "nextrep_migration_attempt_complete").length, 0);
    assert.equal(attempts()[0].status, "uploading");
  });
});

describe("D — resume / abandon / cancel", () => {
  test("network break mid-upload → 'back' makes it abandoned (writes>0, account locked) → resume on the owner device with the SAME id → completed, no duplicates", async () => {
    const clean = await (async () => {
      const r = await upload();
      assert.equal(r.ok, true);
      const c = counts();
      setup();
      return c;
    })();
    breakAfterWrites(3);
    const r1 = await upload();
    assert.equal(r1.ok, false);
    const id = marker().serverAttemptId;
    S.queryHook = null;
    const ab = await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    assert.equal(ab.ok, false);
    assert.equal(ab.partial, true);
    assert.equal(attempts()[0].status, "abandoned");
    assert.equal(marker().status, "uploading_device", "marker kept — the upload can be finished");
    // other devices are locked out (reads and writes)
    S.session = { user: { id: UA } };
    const read = await A.supabase.from("nextrep_workouts").select("id").eq("user_id", UA);
    assert.equal(read.error && read.error.code, "NR001");
    const r2 = await upload();
    assert.equal(r2.ok, true, r2.error);
    assert.equal(attempts().length, 1);
    assert.equal(attempts()[0].attempt_id, id);
    assert.equal(attempts()[0].resume_count, 1);
    assert.equal(attempts()[0].status, "completed");
    assert.deepEqual(counts(), clean, "the resumed upload has exactly the rows of a clean one");
  });
  test("resume of an abandoned attempt is refused on another device (same id)", async () => {
    breakAfterWrites(2);
    await upload();
    S.queryHook = null;
    await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    const id = attempts()[0].attempt_id;
    const r = await quiet(() => A.acquireMigrationAttempt({ userId: UA, deviceId: DEV_B, kind: "device_upload", attemptId: id }));
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not_yours");
    assert.equal(attempts()[0].status, "abandoned");
  });
  test("cancel with ZERO server-counted writes → cancelled, marker cleared, account unlocked", async () => {
    breakAfterWrites(0);
    const r1 = await upload();
    assert.equal(r1.ok, false);
    assert.equal(attempts()[0].writes_count, 0);
    S.queryHook = null;
    const ab = await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    assert.equal(ab.ok, true, ab.error);
    assert.equal(attempts()[0].status, "cancelled");
    assert.equal(marker(), null);
    const g = await A.readMigrationGate(UA);
    assert.equal(g.ok, true);
    assert.equal(g.blocking, null);
  });
  test("cancel is refused after writes (any device): the attempt stays, nothing is unlocked", async () => {
    breakAfterWrites(2);
    await upload();
    S.queryHook = null;
    const id = attempts()[0].attempt_id;
    const own = await quiet(() => A.cancelEmptyMigrationAttempt({ attemptId: id, deviceId: DEV_A }));
    assert.equal(own.ok, false);
    assert.equal(attempts()[0].status, "uploading");
    await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    const other = await quiet(() => A.cancelEmptyMigrationAttempt({ attemptId: id, deviceId: DEV_B }));
    assert.equal(other.ok, false);
    assert.equal(attempts()[0].status, "abandoned");
  });
  test("an abandoned attempt with zero writes can be cancelled by ANY device", async () => {
    await B.start(B_ID);
    await B.rpc("abandon", B_ID);
    const r = await quiet(() => A.cancelEmptyMigrationAttempt({ attemptId: B_ID, deviceId: DEV_A }));
    assert.equal(r.ok, true);
    assert.equal(attempts()[0].status, "cancelled");
  });
});

describe("E — accepted_incomplete", () => {
  test("own partial upload accepted (explicit) → ready, normal sync resumes (server policy), never `completed`; no new V1; device data kept", async () => {
    breakAfterWrites(3);
    await upload();
    S.queryHook = null;
    await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    const localBefore = localStorage.getItem(key(UA, "history"));
    const r = await quiet(() => A.acceptIncompleteDeviceUpload(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.equal(attempts()[0].status, "accepted_incomplete");
    assert.deepEqual([marker().status, marker().source, marker().syncPaused], ["ready", "device", false]);
    assert.ok(marker().incompleteAccepted);
    assert.equal(localStorage.getItem(key(UA, "history")), localBefore, "device data unchanged");
    const g = await A.readMigrationGate(UA);
    assert.equal(g.ok, true);
    assert.equal(g.blocking, null, "accepted data does not lock the account");
    assert.ok(g.acceptedIncomplete);
    // normal sync runs: nothing of the device is lost, no conflict, the device keeps rows the cloud lacks
    const s1 = await quiet(() => A.runSync());
    A.cancelAllScheduledSyncRetries();
    assert.equal(s1.started, true, s1.message);
    assert.equal(s1.pullSuccess, true);
    assert.equal(localStorage.getItem(key(UA, "history")), localBefore, "device data unchanged by the resumed sync");
    assert.equal(A.getPendingConflictCount(), 0);
    assert.equal(A.getMigrationStatus().status !== "completed", true, "never shown as completed");
    const writes = cloudWrites(S).length;
    const m = await quiet(() => A.runManualMigrationV1());
    assert.equal(m.success, false);
    assert.equal(m.migration, "incomplete_accepted");
    assert.equal(cloudWrites(S).length, writes, "no new V1 write");
  });
  test("stale uploader: accepted on device B while A uploads → A stops at its next write (NR002), never ready", async () => {
    const p = pauseFirstWrite("nextrep_workouts");
    const run = upload();
    await p.reached;
    const id = attempts()[0].attempt_id;
    const acc = await B.rpc("accept_incomplete", id);
    assert.equal(acc.data.status, "accepted_incomplete");
    const workoutsBefore = rows("nextrep_workouts").length;
    p.release();
    const r = await run;
    assert.equal(r.ok, false);
    assert.equal(r.closed, true);
    assert.equal(r.row && r.row.status, "accepted_incomplete");
    assert.equal(rows("nextrep_workouts").length, workoutsBefore, "no write after the close");
    assert.equal(record().status, "accepted_incomplete");
    assert.notEqual((marker() || {}).status, "ready");
    // "back to source selection": the closed attempt locks nothing — the marker can go
    const back = await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    assert.equal(back.ok, true, back.error);
    assert.equal(marker(), null);
  });
});

describe("Two devices / two concurrent attempts", () => {
  test("B uploading → A: sync paused (queue kept), manual tool refused, fresh upload refused — zero writes from A", async () => {
    await B.start(B_ID);
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    A.enqueueSyncChange({ table: "workouts", recordId: "hA", operation: "upsert", version: 1, deviceId: DEV_A });
    const queueBefore = localStorage.getItem(key(UA, "sync_queue"));
    const s = await quiet(() => A.runSync());
    assert.equal(s.skipped, true);
    assert.equal(s.reason, "migration_in_progress");
    assert.equal(localStorage.getItem(key(UA, "sync_queue")), queueBefore, "the queue is kept as it is");
    const m = await quiet(() => A.runManualMigrationV1());
    assert.equal(m.success, false);
    assert.equal(m.migration, "other_attempt");
    A.clearAccountInitMarker(UA);
    const u = await upload();
    assert.equal(u.ok, false);
    assert.equal(marker(), null, "nothing started, nothing left behind");
    assert.equal(cloudWrites(S).filter((c) => c.args && JSON.stringify(c.args).includes(DEV_A)).length, 0);
    assert.equal(attempts().length, 1);
  });
  test("two devices start at once: exactly one attempt wins, the other device writes nothing", async () => {
    const p = pauseFirstWrite("nextrep_workouts");
    const runA = upload();
    await p.reached; // A holds the attempt and is about to write
    const b = await B.start(B_ID);
    assert.equal(b.error && b.error.message, "active_attempt_exists");
    const bw = await B.write(B_ID);
    assert.equal(bw.error && bw.error.code, "NR001", "B's write without the active token is refused");
    p.release();
    const r = await runA;
    assert.equal(r.ok, true, r.error);
    assert.equal(attempts().filter((a) => a.status === "completed").length, 1);
    assert.equal(rows("nextrep_measurements").filter((x) => x.device_id === DEV_B).length, 0);
  });
  test("B abandoned (writes) → A sync reports the abandoned lock; a SELECT error / missing table fails closed", async () => {
    await B.start(B_ID);
    await B.write(B_ID);
    await B.rpc("abandon", B_ID);
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const s = await quiet(() => A.runSync());
    assert.equal(s.reason, "migration_abandoned");
    S.queryHook = (q) => (q.table === "nextrep_migration_attempts" ? { message: "boom" } : null);
    const s2 = await quiet(() => A.runSync());
    assert.equal(s2.reason, "migration_check_failed");
    S.queryHook = null;
    S.tables.nextrep_migration_attempts = [];
    S.f5Missing = true;
    const s3 = await quiet(() => A.runSync());
    assert.equal(s3.reason, "migration_check_failed", "missing table → never 'ready to sync'");
  });
});

describe("Sync gate — NR001 / NR002 / 57014 / retries", () => {
  test("a lock appearing during PUSH (NR001): item kept (failed), no further push, PULL skipped, retry after the paused delay", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    A.enqueueSyncChange({ table: "workouts", recordId: "hA", operation: "upsert", version: 1, deviceId: DEV_A });
    A.enqueueSyncChange({ table: "workouts", recordId: "hB", operation: "upsert", version: 1, deviceId: DEV_A });
    let started = false;
    S.queryGate = async (q) => {
      if (!started && q.table === "nextrep_workouts" && q.op !== "select") {
        started = true;
        await B.start(B_ID); // B takes the account right before A's first push reaches the server
      }
    };
    const s = await quiet(() => A.runSync());
    assert.equal(s.reason, "migration_in_progress");
    assert.equal(s.pullSuccess, false);
    const q = JSON.parse(localStorage.getItem(key(UA, "sync_queue")));
    assert.equal(q.length, 2, "nothing removed");
    assert.ok(q.some((it) => it.status === "failed"));
    assert.equal(rows("nextrep_workouts").length, 0);
  });
  test("a retry never bypasses the gate: locked → the push function is not called, the item stays and is rescheduled", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const e = A.enqueueSyncChange({ table: "workouts", recordId: "hA", operation: "upsert", version: 1, deviceId: DEV_A });
    const itemId = (e && (e.id || (e.item && e.item.id))) || JSON.parse(localStorage.getItem(key(UA, "sync_queue")))[0].id;
    A.updateSyncQueueItem(itemId, { status: "failed" });
    await B.start(B_ID);
    let called = 0;
    const r = await quiet(() => A.runGatedSyncRetry(itemId, async () => called++));
    assert.equal(r.ok, false);
    assert.equal(r.reason, "migration_locked");
    assert.equal(called, 0);
    assert.equal(JSON.parse(localStorage.getItem(key(UA, "sync_queue"))).length, 1);
    // unlocked → the same retry pushes
    await B.rpc("cancel", B_ID);
    const r2 = await quiet(() => A.runGatedSyncRetry(itemId, async () => called++));
    assert.equal(r2.ok, true);
    assert.equal(called, 1);
  });
  test("retry on an account that is not ready (marker missing / paused) is refused", async () => {
    const e = A.enqueueSyncChange({ table: "workouts", recordId: "hA", operation: "upsert", version: 1, deviceId: DEV_A });
    const itemId = JSON.parse(localStorage.getItem(key(UA, "sync_queue")))[0].id;
    A.updateSyncQueueItem(itemId, { status: "failed" });
    let called = 0;
    const r = await quiet(() => A.runGatedSyncRetry(itemId, async () => called++));
    assert.equal(r.reason, "not_allowed");
    assert.equal(called, 0);
    assert.ok(e !== undefined);
  });
  test("a lock appearing between PULL and APPLY: nothing pulled is applied (control: without it the row arrives)", async () => {
    const cloud = await cloudTablesFor(UA, { history: [historySession("hC", "C-OTHER-DEVICE")], deviceId: DEV_B });
    const run = async (lockBeforeApply) => {
      setup();
      S.tables = JSON.parse(JSON.stringify(cloud));
      localStorage.setItem(key(UA, "device_id"), DEV_A);
      A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
      let reads = 0;
      S.queryGate = async (q) => {
        if (q.table === "nextrep_migration_attempts") {
          reads++;
          if (lockBeforeApply && reads === 2) await B.start(B_ID); // the second gate read = the check before APPLY
        }
      };
      const s = await quiet(() => A.runSync());
      return { s, ids: (JSON.parse(localStorage.getItem(key(UA, "history"))) || []).map((h) => h.id).sort() };
    };
    const control = await run(false);
    assert.equal(control.s.pullSuccess, true, control.s.message);
    assert.ok(control.ids.includes("hC"), "control: the pulled workout is applied");
    const locked = await run(true);
    assert.equal(locked.s.pullSuccess, false);
    assert.deepEqual(locked.ids, ["hA", "hB"], "nothing pulled is applied");
  });
  test("57014 on start: bounded backoff with the SAME id; exhausted → busy, marker kept (no new id), a later retry reuses the id", async () => {
    S.rpcFail.nextrep_migration_attempt_start = [timeoutErr(), timeoutErr(), timeoutErr(), timeoutErr()];
    const r1 = await upload();
    assert.equal(r1.ok, false);
    assert.equal(r1.migration, "busy");
    const ids = S.calls.filter((c) => c.fn === "nextrep_migration_attempt_start").map((c) => c.args.p_attempt_id);
    assert.equal(ids.length, 4, "1 + 3 bounded retries");
    assert.equal(new Set(ids).size, 1, "never a new attempt id");
    assert.equal(marker().serverAttemptId, ids[0]);
    const r2 = await upload();
    assert.equal(r2.ok, true, r2.error);
    assert.equal(attempts().length, 1);
    assert.equal(attempts()[0].attempt_id, ids[0]);
  });
  test("missing SQL (PGRST202): nothing started, nothing written, the device is back to the state before", async () => {
    S.f5Missing = true;
    const r = await upload();
    assert.equal(r.ok, false);
    assert.equal(r.migration, "unavailable");
    assert.equal(marker(), null);
    assert.equal(cloudWrites(S).length, 0);
  });
  test("network break at the start RPC: unknown outcome → marker kept with the id; retry continues the same attempt", async () => {
    S.rpcFail.nextrep_migration_attempt_start = [{ message: "Failed to fetch" }];
    const r1 = await upload();
    assert.equal(r1.ok, false);
    assert.equal(r1.migration, "network");
    const id = marker().serverAttemptId;
    assert.ok(id);
    assert.equal(cloudWrites(S).length, 0);
    const r2 = await upload();
    assert.equal(r2.ok, true, r2.error);
    assert.equal(attempts()[0].attempt_id, id);
  });
});

describe("Accounts without markers / old client / other account", () => {
  test("no attempt rows: sync works exactly as before and no request carries a token", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    A.enqueueSyncChange({ table: "workouts", recordId: "hA", operation: "upsert", version: 1, deviceId: DEV_A });
    const s = await quiet(() => A.runSync());
    assert.equal(s.started, true, s.message);
    assert.equal(s.pushed, 1);
    assert.equal(s.pullSuccess, true);
    assert.deepEqual(S.headerLog.filter((e) => e.token), []);
  });
  test("old client (no token) during a lock: its writes and reads are refused (NR001); without a lock they work", async () => {
    const free = await A.supabase.from("nextrep_measurements").upsert({ user_id: UA, legacy_id: "old-1", date: "2026-10-01", data: {} });
    assert.equal(free.error, null);
    await B.start(B_ID);
    const w = await A.supabase.from("nextrep_measurements").upsert({ user_id: UA, legacy_id: "old-2", date: "2026-10-01", data: {} });
    assert.equal(w.error && w.error.code, "NR001");
    const rd = await A.supabase.from("nextrep_measurements").select("id").eq("user_id", UA);
    assert.equal(rd.error && rd.error.code, "NR001");
  });
  test("another account's lock never affects this account", async () => {
    S.session = { user: { id: UB } };
    await A.supabase.rpc("nextrep_migration_attempt_start", { p_attempt_id: B_ID, p_device_id: DEV_B, p_kind: "device_upload", p_app_version: "t" });
    S.session = { user: { id: UA } };
    const g = await A.readMigrationGate(UA);
    assert.equal(g.ok, true);
    assert.equal(g.blocking, null);
    const r = await upload();
    assert.equal(r.ok, true, r.error);
  });
  test("guest cleanup after a migration requires the record's `completed` for the same attempt", async () => {
    resetStorage();
    A.__testState.resetActiveDataNamespace();
    S = globalThis.__nrSupabase;
    S.session = { user: { id: UA } };
    localStorage.setItem(key(null, "history"), JSON.stringify([historySession("g1", "GUEST")]));
    A.activateDataNamespace(UA);
    localStorage.setItem(key(UA, "device_id"), DEV_A);
    S.rpcFail.nextrep_migration_attempt_complete = [{ message: "Failed to fetch" }];
    const r = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r.ok, false, "complete failed → not migrated");
    assert.ok(localStorage.getItem(key(null, "history")), "guest data intact");
    assert.notEqual(marker().status, "ready");
  });
});

describe("Independent review fixes", () => {
  test("local V1 status is `completed` only after the server's completed (verified meanwhile; a failed complete never shows done)", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    S.rpcFail.nextrep_migration_attempt_complete = [{ message: "Failed to fetch" }];
    const r1 = await quiet(() => A.runManualMigrationV1());
    assert.equal(r1.success, false);
    assert.equal(A.getMigrationStatus().status, "verified");
    assert.equal(A.isHistoryCloudLinked(), true, "uploaded rows still count as linked");
    const r2 = await quiet(() => A.runManualMigrationV1());
    assert.equal(r2.success, true, r2.error);
    assert.equal(A.getMigrationStatus().status, "completed");
  });
  test("accepted elsewhere during the read-only verification → complete refused, local status never `completed`", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    let done = false;
    S.rpcFail.nextrep_migration_attempt_complete = [
      async (args) => {
        done = true;
        await B.rpc("accept_incomplete", args.p_attempt_id);
        return A.supabase.rpc("nextrep_migration_attempt_complete", args);
      },
    ];
    const r = await quiet(() => A.runManualMigrationV1());
    assert.ok(done);
    assert.equal(r.success, false);
    assert.equal(r.closed, true);
    assert.notEqual(A.getMigrationStatus().status, "completed");
  });
  test("complete answered for another account (session switched) → unknown, not `closed`; the attempt stays resumable", async () => {
    const r = await quiet(() => A.completeMigrationAttempt({ userId: UA, attemptId: B_ID, deviceId: DEV_A, verification: { results: {} } }));
    assert.equal(r.ok, false);
    assert.equal(r.reason, "error");
  });
  test("device 'back' after the server already completed this device's attempt → finish, never re-decide", async () => {
    S.rpcFail.nextrep_migration_attempt_complete = [
      (args) => {
        const row = attempts().find((a) => a.attempt_id === args.p_attempt_id);
        row.status = "completed";
        return { data: null, error: net() };
      },
    ];
    await upload();
    const ab = await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    assert.equal(ab.completed, true);
    assert.equal(marker().status, "uploading_device", "marker kept for the finishing step");
    const fin = await upload();
    assert.equal(fin.ok, true);
    assert.equal(fin.alreadyCompleted, true);
  });
  test("guest 'back' after the server already completed the attempt → completed (finish), never 'partial'", async () => {
    resetStorage();
    A.__testState.resetActiveDataNamespace();
    S = globalThis.__nrSupabase;
    S.session = { user: { id: UA } };
    localStorage.setItem(key(null, "history"), JSON.stringify([historySession("g1", "GUEST")]));
    A.activateDataNamespace(UA);
    localStorage.setItem(key(UA, "device_id"), DEV_A);
    S.rpcFail.nextrep_migration_attempt_complete = [
      (args) => {
        attempts().find((a) => a.attempt_id === args.p_attempt_id).status = "completed";
        return { data: null, error: net() };
      },
    ];
    const r1 = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r1.ok, false);
    const ab = await quiet(() => A.abandonGuestMigration(UA, ref));
    assert.equal(ab.completed, true);
    assert.ok(localStorage.getItem(key(null, "history")), "guest data untouched");
    const r2 = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r2.ok, true, r2.error);
    assert.equal(marker().status, "ready");
  });
  test("server-completed attempt + a purely local resume refusal (backup gone) → still finalized, never a loop", async () => {
    resetStorage();
    A.__testState.resetActiveDataNamespace();
    S = globalThis.__nrSupabase;
    S.session = { user: { id: UA } };
    localStorage.setItem(key(null, "history"), JSON.stringify([historySession("g1", "GUEST")]));
    A.activateDataNamespace(UA);
    localStorage.setItem(key(UA, "device_id"), DEV_A);
    S.rpcFail.nextrep_migration_attempt_complete = [
      (args) => {
        attempts().find((a) => a.attempt_id === args.p_attempt_id).status = "completed";
        return { data: null, error: net() };
      },
    ];
    assert.equal((await quiet(() => A.migrateGuestToEmptyAccount(UA, ref))).ok, false);
    A.saveBackupList(A.loadBackupList().filter((b) => b.kind !== "BEFORE_GUEST_MIGRATION")); // the local resume check would refuse now
    const writes = cloudWrites(S).length;
    const r = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.equal(marker().status, "ready");
    assert.equal(cloudWrites(S).length, writes, "nothing uploaded again");
  });
  test("an attempt that starts AND completes while sync is pulling → nothing pulled is applied", async () => {
    const cloud = await cloudTablesFor(UA, { history: [historySession("hC", "C-OTHER-DEVICE")], deviceId: DEV_B });
    setup();
    S.tables = JSON.parse(JSON.stringify(cloud));
    localStorage.setItem(key(UA, "device_id"), DEV_A);
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    let fired = false;
    S.queryGate = async (q) => {
      if (!fired && q.table === "nextrep_workout_sets" && q.op === "select") {
        fired = true;
        await B.start(B_ID);
        await B.rpc("complete", B_ID).catch(() => {});
        await A.supabase.rpc("nextrep_migration_attempt_complete", { p_attempt_id: B_ID, p_device_id: DEV_B, p_verified_counts: {} });
      }
    };
    const s = await quiet(() => A.runSync());
    assert.ok(fired);
    assert.equal(attempts()[0].status, "completed");
    assert.equal(s.pullSuccess, false);
    assert.deepEqual(JSON.parse(localStorage.getItem(key(UA, "history"))).map((h) => h.id).sort(), ["hA", "hB"]);
  });
  test("cloud load: refused BEFORE any local change while locked; a state change during the read gives everything back", async () => {
    const cloud = await cloudTablesFor(UA, { history: [historySession("hC", "C")], deviceId: DEV_B });
    setup();
    S.tables = JSON.parse(JSON.stringify(cloud));
    localStorage.setItem(key(UA, "device_id"), DEV_A);
    await B.start(B_ID);
    const before = JSON.stringify(Object.entries(localStorage));
    const r1 = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.equal(r1.ok, false);
    assert.equal(r1.blocked, "migration");
    assert.equal(JSON.stringify(Object.entries(localStorage)), before, "nothing changed locally");
    await B.rpc("cancel", B_ID);
    let fired = false;
    S.queryGate = async (q) => {
      if (!fired && q.table === "nextrep_workouts" && q.op === "select") {
        fired = true;
        const id2 = "e0000000-0000-4000-8000-0000000000b2";
        await B.start(id2);
        await A.supabase.rpc("nextrep_migration_attempt_cancel", { p_attempt_id: id2, p_device_id: DEV_B });
      }
    };
    const hist = localStorage.getItem(key(UA, "history"));
    const r2 = await quiet(() => A.loadAccountFromCloud(UA, ref));
    assert.ok(fired);
    assert.equal(r2.ok, false);
    assert.equal(localStorage.getItem(key(UA, "history")), hist, "device data given back");
    assert.equal(marker(), null);
  });
});

describe("Etap 8 — M1 / M2 / M3", () => {
  // the account's cloud holds only what an interrupted upload wrote, accepted as incomplete on device B
  async function acceptedIncompleteOnServer({ withRow = false } = {}) {
    await B.start(B_ID);
    if (withRow) await B.write(B_ID, "b-partial");
    const r = await B.rpc("accept_incomplete", B_ID);
    assert.equal(r.data.status, "accepted_incomplete");
  }
  const localDump = () => JSON.stringify(Object.keys(localStorage).filter((k) => !k.endsWith("_account_init_v1") && !k.endsWith("_incomplete_accepted_v1")).sort().map((k) => [k, localStorage.getItem(k)]));

  test("M1: 'use device data' → ready/device with sync PAUSED; no cloud write, local data and server status unchanged — also after a restart", async () => {
    await acceptedIncompleteOnServer();
    const cloud = await quiet(() => A.checkCloudAccountData(UA));
    assert.equal(cloud.hasData, false, "the data check alone would call this cloud empty");
    const before = localDump();
    const writes0 = cloudWrites(S).length;
    const r = await quiet(() => A.useDeviceDataAfterIncompleteAccepted(UA, ref));
    assert.equal(r.ok, true, r.error);
    const m = marker();
    assert.deepEqual([m.status, m.source, m.syncPaused, m.pausedReason, m.incompleteAccepted], ["ready", "device", true, "incomplete_accepted", B_ID]);
    assert.equal(localDump(), before, "no local data changed");
    assert.equal(cloudWrites(S).length, writes0, "nothing written to the cloud");
    assert.equal(attempts()[0].status, "accepted_incomplete", "server status unchanged");
    assert.equal(A.isAccountSyncAllowed(UA), false);
    const s1 = await quiet(() => A.runSync());
    assert.equal(s1.skipped, true);
    assert.equal(s1.reason, "account_sync_paused");
    // restart
    A.__testState.resetAccountInitBusy();
    A.__testState.resetActiveDataNamespace();
    A.activateDataNamespace(UA);
    const s2 = await quiet(() => A.runSync());
    assert.equal(s2.reason, "account_sync_paused");
    const v1 = await quiet(() => A.runManualMigrationV1());
    assert.equal(v1.success, false);
    assert.equal(v1.blocked, true, "the repair tool refuses a paused account");
    assert.equal(cloudWrites(S).length, writes0, "still nothing written after the restart");
    assert.equal(localDump(), before);
    assert.equal(A.getIncompleteAcceptedNote(UA).attemptId, B_ID);
  });
  test("M1: refused (no marker) when the server does not confirm the acceptance, when it is unreadable, or while an attempt blocks", async () => {
    const r0 = await quiet(() => A.useDeviceDataAfterIncompleteAccepted(UA, ref));
    assert.equal(r0.notAccepted, true);
    assert.equal(marker(), null);
    await acceptedIncompleteOnServer();
    S.queryHook = (q) => (q.table === "nextrep_migration_attempts" ? { message: "Failed to fetch" } : null);
    const r1 = await quiet(() => A.useDeviceDataAfterIncompleteAccepted(UA, ref));
    assert.equal(r1.ok, false);
    assert.equal(marker(), null, "fail closed");
    S.queryHook = null;
    A.setAccountInitMarker(UA, { status: "uploading_device", source: "device", syncPaused: true, userId: UA, namespace: A.getLocalDataNamespace(UA), deviceId: DEV_A });
    const r2 = await quiet(() => A.useDeviceDataAfterIncompleteAccepted(UA, ref));
    assert.equal(r2.ok, false, "another operation of this account is never taken over");
    assert.equal(marker().status, "uploading_device");
  });
  test("M2: a refused new start never turns the record into 'starting'; the durable note survives offline", async () => {
    await acceptedIncompleteOnServer({ withRow: true });
    await A.readMigrationGate(UA);
    // this device's record of the accepted attempt (e.g. accepted on this device)
    A.setMigrationAttemptRecord(UA, { attemptId: B_ID, userId: UA, deviceId: DEV_A, kind: "device_upload", flow: "device", status: "accepted_incomplete", startedAt: "2026-10-08T22:00:00.000Z" });
    const raw = localStorage.getItem(key(UA, "migration_attempt"));
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const m = await quiet(() => A.runManualMigrationV1());
    assert.equal(m.success, false);
    assert.equal(m.migration, "incomplete_accepted");
    assert.equal(localStorage.getItem(key(UA, "migration_attempt")), raw, "record restored byte for byte");
    A.clearAccountInitMarker(UA);
    const u = await upload();
    assert.equal(u.ok, false);
    assert.equal(localStorage.getItem(key(UA, "migration_attempt")), raw);
    assert.equal(marker(), null);
    // offline: the gate cannot be read, the note still says what happened
    S.failNetwork = true;
    const g = await A.readMigrationGate(UA);
    assert.equal(g.ok, false);
    assert.equal(A.getIncompleteAcceptedNote(UA).attemptId, B_ID);
    S.failNetwork = false;
  });
  test("M2: with no previous record a refused start leaves no record at all", async () => {
    await acceptedIncompleteOnServer();
    const u = await upload();
    assert.equal(u.ok, false);
    assert.equal(u.migration, "incomplete_accepted");
    assert.equal(localStorage.getItem(key(UA, "migration_attempt")), null);
  });
  test("M3: computeSyncStatus never reports a paused sync as up to date", () => {
    const user = { id: UA };
    assert.equal(A.computeSyncStatus({ authUser: user, isOnline: true, queue: [] }).kind, "upToDate");
    const p = A.computeSyncStatus({ authUser: user, isOnline: true, queue: [{ status: "pending" }], paused: "incomplete_accepted" });
    assert.deepEqual([p.kind, p.reason, p.pendingCount], ["paused", "incomplete_accepted", 1]);
    assert.equal(A.computeSyncStatus({ authUser: user, isOnline: false, queue: [], paused: "other_data" }).kind, "paused");
  });
});

describe("Etap 8 — review follow-ups", () => {
  test("a paused account never sends the whole-data copy ('Zapisz dane w chmurze')", async () => {
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: true, pausedReason: "incomplete_accepted", incompleteAccepted: B_ID });
    const r = await quiet(() => A.saveDataToCloud());
    assert.ok(r.error && /wstrzymana/.test(r.error));
    assert.equal(cloudWrites(S).length, 0);
  });
  test("M2: cancelled → new id → refused: the record is not rolled back over the noted 'cancelled'", async () => {
    const OLD = "e0000000-0000-4000-8000-0000000000a1";
    A.setMigrationAttemptRecord(UA, { attemptId: OLD, userId: UA, deviceId: DEV_A, kind: "device_upload", flow: "manual", status: "uploading", startedAt: "2026-10-08T22:00:00.000Z" });
    S.tables.nextrep_migration_attempts = [{ attempt_id: OLD, user_id: UA, device_id: DEV_A, kind: "device_upload", status: "cancelled", started_at: new Date().toISOString(), updated_at: new Date().toISOString(), writes_count: 0, resume_count: 0 }];
    await B.start(B_ID); // another device holds the account → the new id is refused (other_attempt)
    const acq = await quiet(() => A.acquireFlowAttempt({ userId: UA, deviceId: DEV_A, kind: "device_upload", flow: "manual", attemptId: OLD }));
    assert.equal(acq.ok, false);
    assert.equal(acq.reason, "other_attempt");
    const rec = record();
    assert.equal(rec.attemptId, OLD);
    assert.equal(rec.status, "cancelled", "the server-confirmed status stays");
    assert.equal(A.getOpenManualAttempt(UA), null);
  });
  test("M2: a refused start never overwrites a newer record written meanwhile (another tab)", async () => {
    await B.start(B_ID);
    const NEWER = { attemptId: "e0000000-0000-4000-8000-0000000000c1", userId: UA, deviceId: DEV_A, kind: "device_upload", flow: "device", status: "uploading", startedAt: "2026-10-08T22:00:00.000Z" };
    let fired = false;
    S.rpcFail.nextrep_migration_attempt_start = [
      (args) => {
        fired = true;
        A.setMigrationAttemptRecord(UA, NEWER); // the other tab wins the record before this answer arrives
        return { data: null, error: { code: "P0001", message: "active_attempt_exists" } };
      },
    ];
    const acq = await quiet(() => A.acquireFlowAttempt({ userId: UA, deviceId: DEV_A, kind: "device_upload", flow: "device", attemptId: "e0000000-0000-4000-8000-0000000000d1" }));
    assert.ok(fired);
    assert.equal(acq.ok, false);
    assert.equal(record().attemptId, NEWER.attemptId, "the newer record stays");
  });
});
