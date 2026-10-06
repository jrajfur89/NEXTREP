// Sync queue helpers (local part of the sync engine) — new suite written 2026-10-06.
// SCOPE NOTE: this is NOT the old full sync-engine harness (push/pull against a Supabase fake with
// seeded data, bootstrap meta, conflicts). That harness was lost in the environment reset and is
// not part of this suite — see tests/README.md ("Czego ten zestaw nie obejmuje").
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";

let A;
const UA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const UB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
before(async () => {
  A = await loadApp();
});
beforeEach(() => {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.activateDataNamespace(UA);
});

describe("enqueueSyncChange", () => {
  test("creates a pending entry", async () => {
    const e = await quiet(() => A.enqueueSyncChange({ table: "workouts", recordId: "w1", operation: A.SYNC_OPERATIONS[0], version: 1, deviceId: "d" }));
    assert.equal(e.status, "pending");
    assert.equal(e.attempts, 0);
    assert.equal(A.loadSyncQueue().length, 1);
  });
  test("dedup by table+recordId while active: one row carrying the newest version", async () => {
    await quiet(() => {
      A.enqueueSyncChange({ table: "exercises", recordId: "abc", operation: A.SYNC_OPERATIONS[0], version: 3 });
      A.enqueueSyncChange({ table: "exercises", recordId: "abc", operation: A.SYNC_OPERATIONS[0], version: 4 });
      A.enqueueSyncChange({ table: "exercises", recordId: "abc", operation: A.SYNC_OPERATIONS[0], version: 5 });
      A.enqueueSyncChange({ table: "plans", recordId: "abc", operation: A.SYNC_OPERATIONS[0], version: 1 });
    });
    const q = A.loadSyncQueue();
    assert.equal(q.length, 2);
    assert.equal(q.find((x) => x.table === "exercises").version, 5);
  });
  test("invalid arguments are rejected (null), queue unchanged", async () => {
    const orig = console.error;
    console.error = () => {};
    try {
      const r = await quiet(() => A.enqueueSyncChange({ table: "workouts", recordId: "w", operation: "explode" }));
      assert.equal(r, null);
      assert.equal(A.loadSyncQueue().length, 0);
    } finally {
      console.error = orig;
    }
  });
  test("queue is per account namespace", async () => {
    await quiet(() => A.enqueueSyncChange({ table: "workouts", recordId: "w1", operation: A.SYNC_OPERATIONS[0] }));
    A.activateDataNamespace(UB);
    assert.equal(A.loadSyncQueue().length, 0);
    A.activateDataNamespace(UA);
    assert.equal(A.loadSyncQueue().length, 1);
  });
  test("corrupt queue JSON → empty queue, no throw", () => {
    const orig = console.error;
    console.error = () => {};
    try {
      globalThis.localStorage.setItem(A.getStorageKey("sync_queue"), "{broken");
      assert.deepEqual(A.loadSyncQueue(), []);
    } finally {
      console.error = orig;
    }
  });
});

describe("classification, backoff, ordering", () => {
  test("classifySyncError → 6 kinds", () => {
    assert.equal(A.classifySyncError(null), "unknown");
    assert.equal(A.classifySyncError(new TypeError("Failed to fetch")), "network");
    assert.equal(A.classifySyncError({ status: 401, message: "x" }), "auth");
    assert.equal(A.classifySyncError({ status: 409, message: "dup" }), "conflict");
    assert.equal(A.classifySyncError({ status: 422, message: "bad" }), "validation");
    assert.equal(A.classifySyncError({ status: 503, message: "down" }), "server");
    assert.equal(A.classifySyncError({ status: 418, message: "teapot" }), "unknown");
  });
  test("retry backoff 2s, 5s, 15s, 30s, then 60s", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(A.getRetryDelayMs), [2000, 5000, 15000, 30000, 60000, 60000]);
  });
  test("dependency order: parents before children, unknown tables last", () => {
    const q = ["workout_sets", "zzz", "workouts", "plans", "exercises", "workout_exercises", "profile"].map((table) => ({ table }));
    assert.deepEqual(A.sortQueueByDependencyOrder(q).map((x) => x.table), ["profile", "exercises", "plans", "workouts", "workout_exercises", "workout_sets", "zzz"]);
  });
  test("every sync table maps to a nextrep_* Supabase table", () => {
    for (const t of A.SYNC_TABLE_ORDER) assert.match(A.SYNC_TABLE_TO_SUPABASE[t], /^nextrep_/);
  });
  test("active workout draft is never part of cloud sync fields", () => {
    const fields = JSON.stringify(A.CLOUD_SYNC_FIELDS);
    assert.doesNotMatch(fields, /active_workout_draft|activeWorkoutDraft/);
  });
});
