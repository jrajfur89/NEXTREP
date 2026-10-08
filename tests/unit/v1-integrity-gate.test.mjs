// Stage 4A.4 Part 1 (rebuilt) — I-2 integrity gate, upload preparation, parent/child verification and
// F-1 (resume of an upload started without preparation). REAL production functions against the in-memory
// fake Supabase (no network). The fake has no UNIQUE constraints and no RLS — what is checked here is the
// behaviour of the app's own code (legacy ids it writes, rows it finds).
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, key, cloudWrites } from "../harness/account-fixtures.mjs";

let A;
let S;
const clone = (v) => JSON.parse(JSON.stringify(v));
const readJson = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
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
}
beforeEach(() => setup());

const st = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const SD = [
  { id: "sd1", target: "8-10", rir: "" },
  { id: "sd2", target: "8-10", rir: "" },
];
// Two workouts of the same plan whose sets REUSE the plan's setsDetail ids (old data shape) — the same
// set ids "sd1"/"sd2" under two different workouts — and a repeated workout-exercise id.
const DUP_HISTORY = [
  { id: "w1", date: "2026-10-01T10:00:00.000Z", planId: null, planName: "P", exercises: [{ id: "we-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 80, 8), st("sd2", 80, 8)] }] },
  { id: "w2", date: "2026-10-04T10:00:00.000Z", planId: null, planName: "P", exercises: [{ id: "we-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 80, 10), st("sd2", 80, 9)] }] },
];
const isPos = (lid) => /-pos\d+/.test(String(lid));
const rows = (t) => S.tables[t] || [];
const setIdsOf = (h) => h.flatMap((s) => s.exercises.flatMap((ex) => ex.sets.map((x) => String(x.id))));
const wexIdsOf = (h) => h.flatMap((s) => s.exercises.map((ex) => String(ex.id)));
function semantics(history) {
  const norm = history.map(A.normalizeHistorySession);
  const last = norm[norm.length - 1];
  return {
    sessions: norm.map((s) => ({ id: s.id, date: s.date, ex: s.exercises.map((ex) => ({ exerciseId: ex.exerciseId, sets: ex.sets.map((x) => [x.weight, x.reps]) })) })),
    volume: norm.map((s) => s.exercises.reduce((v, ex) => v + A.computeSessionVolume(ex.sets, ex.type), 0)),
    analysis: last.exercises.map((ex) => {
      const r = A.analyzeSessionExercise(norm, last, ex);
      return r && { status: r.status, message: r.message, suggestedWeight: r.suggestedWeight };
    }),
  };
}
async function pullApply() {
  A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
  await quiet(() => A.bootstrapSyncMetaForExistingData());
  const pull = await quiet(() => A.pullRemoteChanges());
  assert.equal(pull.success, true, pull.error);
  const apply = await quiet(() => A.applyRemoteChanges(pull));
  assert.equal(apply.success, true, apply.error);
  return apply;
}

describe("I-2 gate in runMigrationV1 — fail closed before the first cloud write", () => {
  const cases = [
    ["set ids repeated under two workouts", { history: DUP_HISTORY.map((s) => ({ ...s, exercises: s.exercises.map((ex, i) => ({ ...ex, id: `${s.id}-ex${i}` })) })) }, "serie treningów"],
    ["workout ids repeated", { history: [{ ...DUP_HISTORY[0], exercises: [] }, { ...DUP_HISTORY[1], id: "w1", exercises: [] }] }, "treningi"],
    ["set ids differing only by type (1 vs \"1\")", { history: [{ id: "w1", date: "2026-10-01T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: "bench_press", type: "weight", sets: [{ id: 1, weight: "1", reps: "1" }] }, { id: "e2", exerciseId: "bench_press", type: "weight", sets: [{ id: "1", weight: "1", reps: "1" }] }] }] }, "serie treningów"],
    ["plan ids repeated", { plans: [{ id: "p1", name: "A", exercises: [] }, { id: "p1", name: "B", exercises: [] }] }, "plany"],
    ["plan item ids repeated across plans", { plans: [{ id: "p1", name: "A", exercises: [{ id: "i1", exerciseId: "bench_press", setsDetail: [{ id: "x1" }] }] }, { id: "p2", name: "B", exercises: [{ id: "i1", exerciseId: "bench_press", setsDetail: [{ id: "x2" }] }] }] }, "pozycje planów"],
    ["plan item set ids repeated across items", { plans: [{ id: "p1", name: "A", exercises: [{ id: "i1", exerciseId: "bench_press", setsDetail: [{ id: "x1" }] }, { id: "i2", exerciseId: "bench_press", setsDetail: [{ id: "x1" }] }] }] }, "serie planów"],
    ["synthesized plan item set id collides with an explicit one", { plans: [{ id: "p1", name: "A", exercises: [{ id: "i1", exerciseId: "bench_press", targetSets: 2 }, { id: "i2", exerciseId: "bench_press", setsDetail: [{ id: "i1-0" }] }] }] }, "serie planów"],
    ["measurement ids repeated", { measurements: [{ id: "m1", date: "2026-10-01", weight: 80 }, { id: "m1", date: "2026-10-02", weight: 81 }] }, "pomiary"],
  ];
  for (const [name, data, table] of cases) {
    test(name, async () => {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(key(UA, k), JSON.stringify(v));
      S.calls = [];
      const r = await quiet(() => A.runMigrationV1());
      assert.equal(r.success, false);
      assert.ok(r.integrityIssues.some((i) => i.table === table), `reported: ${JSON.stringify(r.integrityIssues)}`);
      assert.match(r.error, /powtórzone identyfikatory/);
      assert.equal(cloudWrites(S).length, 0, "no cloud write at all (not even the device row)");
      assert.equal(A.getMigrationStatus().status, "failed");
    });
  }

  test("a repeated ex.id is NOT a collision for V1 (I-1: both fall back to their own '-posN' row) — unchanged", async () => {
    const h = clone(DUP_HISTORY).map((s, i) => ({ ...s, exercises: s.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((x) => ({ ...x, id: `${x.id}-${i}` })) })) }));
    assert.deepEqual(A.v1DatasetIntegrityIssues({ history: h }), []);
  });

  test("clean data passes the gate and uploads as before", async () => {
    const h = [{ id: "w1", date: "2026-10-01T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: "bench_press", type: "weight", sets: [st("a", 1, 1), st("b", 1, 1)] }] }];
    localStorage.setItem(key(UA, "history"), JSON.stringify(h));
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, true, r.error);
    assert.equal(rows("nextrep_workout_sets").length, 2);
  });
});

describe("upload preparation (prepareV1UploadDataset)", () => {
  const PLANS = [
    { id: "p1", name: "A", exercises: [{ exerciseId: "bench_press", setsDetail: [{ id: "x1", target: "8" }] }, { id: "i2", exerciseId: "squat_barbell", setsDetail: [{ id: "x2", target: "5" }] }] },
    { id: "p2", name: "Kopia A", exercises: [{ id: "i2", exerciseId: "squat_barbell", setsDetail: [{ id: "x2", target: "5" }, { id: "x3", target: "5" }] }] },
  ];
  const DS = () => ({ history: clone(DUP_HISTORY), plans: clone(PLANS), measurements: [], exercises: [], customFields: [], userName: "" });

  test("works on a copy: the input is never mutated", () => {
    const ds = DS();
    const before = clone(ds);
    A.prepareV1UploadDataset(ds);
    assert.deepEqual(ds, before);
  });

  test("result passes the gate; order, dates, values and exerciseId are kept; only technical ids change", () => {
    const ds = DS();
    const p = A.prepareV1UploadDataset(ds);
    assert.equal(p.changed, true);
    assert.deepEqual(A.v1DatasetIntegrityIssues(p.dataset), []);
    const h = p.dataset.history;
    assert.deepEqual(h.map((s) => [s.id, s.date]), ds.history.map((s) => [s.id, s.date]));
    assert.deepEqual(h.map((s) => s.exercises.map((ex) => [ex.exerciseId, ex.sets.map((x) => [x.weight, x.reps])])), ds.history.map((s) => s.exercises.map((ex) => [ex.exerciseId, ex.sets.map((x) => [x.weight, x.reps])])));
    assert.equal(new Set(setIdsOf(h)).size, 4, "4 distinct set ids");
    assert.ok(h.flatMap((s) => s.exercises.flatMap((ex) => ex.sets)).every((x) => x.detailId === "sd1" || x.detailId === "sd2"), "old id kept as detailId (link to setsDetail)");
    assert.equal(h[0].exercises[0].id, "we-1", "first occurrence of the repeated ex.id keeps it");
    assert.notEqual(h[1].exercises[0].id, "we-1", "the repeat gets its own id");
    assert.deepEqual(semantics(h), semantics(ds.history), "volume and progression verdicts unchanged");
    const items = p.dataset.plans.flatMap((pl) => pl.exercises);
    assert.ok(items.every((it) => it.id), "plan item without id got one");
    assert.equal(new Set(items.map((it) => it.id)).size, items.length, "plan item ids unique");
    assert.deepEqual(p.dataset.plans.map((pl) => pl.exercises.map((it) => it.exerciseId)), PLANS.map((pl) => pl.exercises.map((it) => it.exerciseId)));
    assert.equal(p.dataset.plans[0].exercises[1].id, "i2", "first occurrence keeps its id");
  });

  test("idempotent: preparing the prepared dataset changes nothing", () => {
    const p1 = A.prepareV1UploadDataset(DS());
    const p2 = A.prepareV1UploadDataset(p1.dataset);
    assert.equal(p2.changed, false);
    assert.deepEqual(p2.dataset, p1.dataset);
  });

  test("the normal start-up identity migration is unchanged: a repeated ex.id is never re-identified there", () => {
    const r = A.normalizeWorkoutIdentity(clone(DUP_HISTORY), [], { migrateExistingSets: true });
    assert.deepEqual(wexIdsOf(r.history), ["we-1", "we-1"]);
  });
});

describe("verification checks child identity + parent relation", () => {
  const PLAN = [{ id: "p1", name: "A", exercises: [{ id: "i1", exerciseId: "bench_press", setsDetail: [{ id: "x1" }, { id: "x2" }] }, { id: "i2", exerciseId: "squat_barbell", setsDetail: [{ id: "x3" }] }] }];
  const H = [
    { id: "w1", date: "2026-10-01T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: "bench_press", type: "weight", sets: [st("a1", 1, 1), st("a2", 1, 1)] }] },
    { id: "w2", date: "2026-10-02T10:00:00.000Z", exercises: [{ id: "e2", exerciseId: "bench_press", type: "weight", sets: [st("b1", 1, 1)] }] },
  ];
  async function uploaded() {
    localStorage.setItem(key(UA, "history"), JSON.stringify(H));
    localStorage.setItem(key(UA, "plans"), JSON.stringify(PLAN));
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, true, r.error);
    return { history: H, plans: PLAN, exercises: [], measurements: [], customFields: [] };
  }
  const verify = (eligible) => quiet(() => A.verifyMigrationV1(UA, eligible, A.getOrCreateDeviceId()));

  test("complete upload → every child table found", async () => {
    const v = await verify(await uploaded());
    for (const k of ["workoutExercises", "workoutSets", "planItems", "planItemSets"]) assert.equal(v.results[k].allFound, true, k);
  });
  test("a set that exists but hangs under ANOTHER workout exercise → not found", async () => {
    const eligible = await uploaded();
    const wexOf = (lid) => rows("nextrep_workout_exercises").find((r) => r.legacy_id === lid).id;
    rows("nextrep_workout_sets").find((r) => r.legacy_id === "a2").workout_exercise_id = wexOf("e2");
    const v = await verify(eligible);
    assert.equal(v.results.workoutSets.allFound, false);
    assert.deepEqual(v.results.workoutSets.missingLegacyIdsSample, ["a2"]);
  });
  test("a workout exercise under the wrong workout → not found", async () => {
    const eligible = await uploaded();
    const wOf = (lid) => rows("nextrep_workouts").find((r) => r.legacy_id === lid).id;
    rows("nextrep_workout_exercises").find((r) => r.legacy_id === "e1").workout_id = wOf("w2");
    const v = await verify(eligible);
    assert.equal(v.results.workoutExercises.allFound, false);
  });
  test("a plan item set under another item / a missing plan item set → not found", async () => {
    const eligible = await uploaded();
    const itemOf = (lid) => rows("nextrep_plan_items").find((r) => r.legacy_id === lid).id;
    rows("nextrep_plan_item_sets").find((r) => r.legacy_id === "x2").plan_item_id = itemOf("i2");
    let v = await verify(eligible);
    assert.equal(v.results.planItemSets.allFound, false);
    S.tables.nextrep_plan_item_sets = rows("nextrep_plan_item_sets").filter((r) => r.legacy_id !== "x3");
    v = await verify(eligible);
    assert.deepEqual(v.results.planItemSets.missingLegacyIdsSample.sort(), ["x2", "x3"]);
  });
  test("a missing set row → runMigrationV1 is NOT completed", async () => {
    await uploaded();
    S.tables.nextrep_workout_sets = rows("nextrep_workout_sets").filter((r) => r.legacy_id !== "b1");
    // a re-run would re-create it; simulate a server that silently drops that one insert
    S.queryHook = (q) => {
      if (q.table === "nextrep_workout_sets" && q.op === "insert" && q.payload && q.payload.legacy_id === "b1") {
        q.op = "select"; // swallowed: nothing stored, no error
      }
      return null;
    };
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, false);
    assert.equal(r.verification.results.workoutSets.allFound, false);
    assert.notEqual(A.getMigrationStatus().status, "completed");
  });
  test("pagination: a server cap of 3 rows per response still finds every child row", async () => {
    const many = [{ id: "w1", date: "2026-10-01T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: "bench_press", type: "weight", sets: Array.from({ length: 11 }, (_, i) => st(`m${i}`, 1, 1)) }] }];
    localStorage.setItem(key(UA, "history"), JSON.stringify(many));
    S.maxRows = 3;
    const r = await quiet(() => A.runMigrationV1());
    assert.equal(r.success, true, r.error);
    assert.equal(r.verification.results.workoutSets.localRecordsFoundInRemote, 11);
  });
});

describe("Stage 4A.3 device → empty cloud with repeated identities (I-2 regression)", () => {
  test("prepared copy (backup of the original first) is the account data AND the cloud data; PULL adds nothing", async () => {
    localStorage.setItem(key(UA, "history"), JSON.stringify(DUP_HISTORY));
    const before = semantics(DUP_HISTORY);
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, () => UA));
    assert.equal(r.ok, true, r.error);
    const local = readJson(key(UA, "history"));
    assert.equal(new Set(setIdsOf(local)).size, 4);
    assert.deepEqual(rows("nextrep_workout_sets").map((x) => x.legacy_id).sort(), setIdsOf(local).sort(), "cloud sets = local sets");
    assert.deepEqual(rows("nextrep_workout_exercises").map((x) => x.legacy_id).sort(), wexIdsOf(local).sort());
    assert.equal(rows("nextrep_workout_exercises").filter((x) => isPos(x.legacy_id)).length, 0, "no new '-posN' row");
    const backup = A.loadBackupList().find((b) => b.reason === "before-migration" && b.namespace === `user_${UA}`);
    assert.ok(backup, "backup of the original taken");
    assert.deepEqual(backup.data.history, DUP_HISTORY, "the backup holds the ORIGINAL (unprepared) data");
    const apply = await pullApply();
    assert.equal(apply.applied.workout_sets, 0);
    assert.equal(apply.applied.workout_exercises, 0);
    assert.deepEqual(semantics(readJson(key(UA, "history"))), before, "history semantics unchanged after upload + PULL");
  });

  test("data that cannot be prepared (repeated workout ids) → refused before the marker and before any write", async () => {
    localStorage.setItem(key(UA, "history"), JSON.stringify([{ ...DUP_HISTORY[0] }, { ...DUP_HISTORY[1], id: "w1" }]));
    const raw = localStorage.getItem(key(UA, "history"));
    S.calls = [];
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, () => UA));
    assert.equal(r.ok, false);
    assert.match(r.error, /powtórzone identyfikatory/);
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(A.getAccountInitMarker(UA), null, "no 'uploading_device' marker");
    assert.equal(localStorage.getItem(key(UA, "history")), raw, "local data unchanged");
  });
});

describe("F-1 — resume of an upload that a version WITHOUT preparation started", () => {
  // Old data shape: the sets carry their plan template ids (sd1/sd2). Uploaded as they are (the old
  // code had no preparation), then the app was killed: marker "uploading_device", V1 "in_progress".
  const OLD = [{ id: "w1", date: "2026-10-01T10:00:00.000Z", planName: "P", exercises: [{ id: "we-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 80, 8), st("sd2", 80, 8)] }] }];
  async function interruptedOldUpload() {
    localStorage.setItem(key(UA, "history"), JSON.stringify(OLD));
    const r = await quiet(() => A.runMigrationV1()); // rows written with the OLD identities
    assert.equal(r.success, true, r.error);
    A.setMigrationStatus("in_progress", {}, UA);
    A.setAccountInitMarker(UA, { status: "uploading_device", source: "device", syncPaused: true, userId: UA, namespace: `user_${UA}`, deviceId: A.getOrCreateDeviceId(), startedAt: new Date().toISOString() });
  }

  test("resume is refused: zero cloud writes, local data unchanged, marker stays interrupted; no orphan/duplicate set", async () => {
    await interruptedOldUpload();
    const rawLocal = localStorage.getItem(key(UA, "history"));
    const cloudBefore = clone(S.tables);
    S.calls = [];
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, () => UA));
    if (r.ok) {
      // (only without the F-1 protection) the account would now be used normally: ready → PULL
      await pullApply();
    } else {
      assert.equal(r.resumeUnsafe, true);
      assert.match(r.error, /nie można bezpiecznie dokończyć/);
      assert.equal(cloudWrites(S).length, 0, "nothing sent");
      assert.deepEqual(S.tables, cloudBefore, "cloud unchanged");
      assert.equal(localStorage.getItem(key(UA, "history")), rawLocal, "local data byte-for-byte unchanged");
      assert.equal(A.getAccountInitMarker(UA).status, "uploading_device", "still recognisable as interrupted");
    }
    const local = readJson(key(UA, "history"));
    const localSets = new Set(setIdsOf(local));
    assert.ok(rows("nextrep_workout_sets").every((x) => localSets.has(String(x.legacy_id))), "no cloud set without a local counterpart (orphan)");
    assert.equal(setIdsOf(local).length, 2, "exactly the 2 sets of the workout — no duplicate after PULL");
  });

  test("a resume whose data needs no preparation still completes (idempotent upsert)", async () => {
    const clean = [{ ...OLD[0], exercises: [{ ...OLD[0].exercises[0], sets: [st("u1", 80, 8), st("u2", 80, 8)] }] }];
    localStorage.setItem(key(UA, "history"), JSON.stringify(clean));
    await quiet(() => A.runMigrationV1());
    A.setAccountInitMarker(UA, { status: "uploading_device", source: "device", syncPaused: true, userId: UA, namespace: `user_${UA}`, deviceId: A.getOrCreateDeviceId() });
    const n = rows("nextrep_workout_sets").length;
    const r = await quiet(() => A.uploadAccountDataToEmptyCloud(UA, () => UA));
    assert.equal(r.ok, true, r.error);
    assert.equal(rows("nextrep_workout_sets").length, n);
  });
});
