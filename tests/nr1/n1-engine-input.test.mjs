// N1 — engine input contract: a v2 workout read by src/engine/load.js through its snapshots.
// Progress Engine 2.0 scenarios PE-03, PE-04, PE-05, PE-07, PE-18, D5, D13, PE-24 / PE-27 on the
// SYNTHETIC atlas (the real atlas content comes from approved F2.3 batches).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as W from "../../src/nr1/domain/workout.js";
import { workoutTotals, workoutExerciseTotals, toEngineSession, toEngineSet } from "../../src/nr1/contracts/engine-input.js";
import { parseSetInput } from "../../src/nr1/contracts/set.js";
import { buildLoadSnapshot } from "../../src/engine/load-snapshot.js";
import { ids, snap, ATLAS } from "./helpers.mjs";

const T = "2026-10-12T10:00:00.000Z";

function workoutOf(entries) {
  const g = ids();
  let s = W.createWorkout({ now: T, newId: g });
  const exIds = [];
  for (const { id, loadSnapshot, sets } of entries) {
    const r = W.addWorkoutExercise(s, { exerciseRef: loadSnapshot ? { privateExerciseId: loadSnapshot.privateExerciseId } : { catalogExerciseId: id }, loadSnapshot: loadSnapshot || snap(id), now: T, newId: g });
    s = r.state;
    exIds.push(r.exercise.id);
    for (const v of sets) s = W.addWorkoutSet(s, { exerciseId: r.exercise.id, values: v, now: T, newId: g }).state;
  }
  return { s, exIds, g };
}

describe("Progress Engine 2.0 volume scenarios on the v2 contract", () => {
  test("PE-03: two dumbbells 26 kg × 10 = 520 kg", () => {
    const { s } = workoutOf([{ id: "test_press_db", sets: [{ loadKg: 26, reps: 10 }] }]);
    const t = workoutTotals(s);
    assert.deepEqual([t.volumeKg, t.volumeStatus], [520, "exact"]);
  });
  test("PE-04: 26×10, 26×10, 26×10, 28×6 with two dumbbells = 36 reps, 1896 kg", () => {
    const { s } = workoutOf([{ id: "test_press_db", sets: [{ loadKg: 26, reps: 10 }, { loadKg: 26, reps: 10 }, { loadKg: 26, reps: 10 }, { loadKg: 28, reps: 6 }] }]);
    const t = workoutTotals(s);
    assert.deepEqual([t.reps, t.volumeKg, t.workingSets], [36, 1896, 4]);
  });
  test("PE-05: a warm-up counts in no metric (3 working sets)", () => {
    const { s } = workoutOf([{ id: "test_press_bar", sets: [{ setType: "warmup", loadKg: 10, reps: 12 }, { loadKg: 60, reps: 8 }, { loadKg: 60, reps: 8 }, { loadKg: 60, reps: 8 }] }]);
    const t = workoutTotals(s);
    assert.deepEqual([t.workingSets, t.volumeKg], [3, 1440]);
  });
  test("D5: a drop set counts in sets and volume", () => {
    const { s } = workoutOf([{ id: "test_press_bar", sets: [{ loadKg: 60, reps: 8 }, { setType: "dropset", loadKg: 40, reps: 10 }] }]);
    const t = workoutTotals(s);
    assert.deepEqual([t.workingSets, t.volumeKg], [2, 880]);
  });
  test("PE-07: pull-ups 8, 8, 7 without load = 0 kg classic volume, 23 reps, 3 sets", () => {
    const { s } = workoutOf([{ id: "test_pull_bw", sets: [{ reps: 8 }, { reps: 8 }, { reps: 7 }] }]);
    const t = workoutTotals(s);
    assert.deepEqual([t.volumeKg, t.reps, t.workingSets, t.volumeStatus], [0, 23, 3, "none"]);
  });
  test("PE-18: one-arm row 26 kg × 10 per side = 520 kg; alternating lunges 20 reps in total, no double counting", () => {
    const { s, exIds } = workoutOf([{ id: "test_row_db_one", sets: [{ loadKg: 26, reps: 10 }] }]);
    const t = workoutExerciseTotals(s, exIds[0]);
    assert.deepEqual([t.volumeKg, t.workingSets], [520, 1]);
    const pid = "00000000-0000-4000-8000-0000000000cc";
    const lunges = buildLoadSnapshot({ privateExercise: { privateExerciseId: pid, loadModel: "dumbbell_pair", laterality: "alternating", repsCounting: "total", primaryMuscles: ["test.m.quad_a"], confidence: "high" }, muscles: ATLAS.dictionaries.muscles, now: T });
    const w2 = workoutOf([{ loadSnapshot: lunges, sets: [{ loadKg: 10, reps: 20 }] }]);
    const t2 = workoutExerciseTotals(w2.s, w2.exIds[0]);
    assert.deepEqual([t2.reps, t2.workingSets, t2.volumeKg], [20, 1, 400]);
  });
  test("time and band: no kg anywhere (PE-29 basis)", () => {
    const { s } = workoutOf([{ id: "test_core_plank", sets: [{ durationSec: 60 }] }, { id: "test_core_band", sets: [{ reps: 15 }] }]);
    const t = workoutTotals(s);
    assert.deepEqual([t.volumeKg, t.seconds, t.reps], [0, 60, 15]);
  });
});

describe("history reads the snapshot, not the current atlas (D13); counted once (PE-24)", () => {
  test("changing the atlas after the workout does not change its totals", () => {
    const { s } = workoutOf([{ id: "test_press_db", sets: [{ loadKg: 26, reps: 10 }] }]);
    const before = workoutTotals(s).volumeKg;
    const atlasEntry = ATLAS.exercises.find((e) => e.exerciseId === "test_press_db");
    const saved = atlasEntry.loadModel;
    atlasEntry.loadModel = "dumbbell_single"; // a later atlas release with another model
    try {
      assert.equal(workoutTotals(s).volumeKg, before);
    } finally {
      atlasEntry.loadModel = saved;
    }
  });
  test("tombstoned sets and exercises are not counted; order is the list order", () => {
    const { s, exIds } = workoutOf([{ id: "test_press_bar", sets: [{ loadKg: 60, reps: 8 }, { loadKg: 60, reps: 8 }] }, { id: "test_press_db", sets: [{ loadKg: 20, reps: 10 }] }]);
    const firstSet = s.sets.find((x) => x.workoutExerciseId === exIds[0]);
    let n = W.removeWorkoutSet(s, { setId: firstSet.id, now: T });
    n = W.removeWorkoutExercise(n, { exerciseId: exIds[1], now: T });
    const t = workoutTotals(n);
    assert.deepEqual([t.workingSets, t.volumeKg], [1, 480]);
    assert.deepEqual(toEngineSession(n).exercises.map((x) => x.exerciseId), ["test_press_bar"]);
  });
  test("typed '62,5' reaches the engine as 62.5 (PE-27)", () => {
    const { values } = parseSetInput({ loadKg: "62,5", reps: "4" });
    const { s } = workoutOf([{ id: "test_press_bar", sets: [values] }]);
    assert.equal(workoutTotals(s).volumeKg, 250);
  });
  test("the engine shape of a set", () => {
    assert.deepEqual(toEngineSet({ setType: "working", status: "done", reps: 5, loadKg: 100, assistKg: null, durationSec: null, rir: "0-1" }), { setType: "working", status: "done", done: true, reps: 5, loadKg: 100, assistKg: null, duration: null, rir: "0-1" });
  });
});
