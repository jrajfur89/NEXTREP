// N1 — contracts: exercise reference, set values per load model (snapshot), RIR categories (D4),
// typed numbers with comma (PE-27), mandatory snapshot (F2-4), unique ids (PE-24), per-set goals
// (PE-28), plan status (D3).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateExerciseRef } from "../../src/nr1/contracts/exercise-ref.js";
import { validateWorkoutSet, parseSetInput, allowedSetFields } from "../../src/nr1/contracts/set.js";
import { validatePlanItemSet } from "../../src/nr1/contracts/plan-goal.js";
import { validateWorkoutState } from "../../src/nr1/contracts/workout.js";
import { RIR_CATEGORIES, DEFAULT_RIR_TARGET } from "../../src/nr1/contracts/constants.js";
import * as W from "../../src/nr1/domain/workout.js";
import * as P from "../../src/nr1/domain/plan.js";
import { buildLoadSnapshot } from "../../src/engine/load-snapshot.js";
import { ids, snap, ATLAS } from "./helpers.mjs";

const T = "2026-10-12T10:00:00.000Z";
const codes = (errs) => errs.map((e) => e.code);
const set = (over = {}) => ({ setType: "working", status: "done", reps: null, loadKg: null, assistKg: null, durationSec: null, rir: null, ...over });

describe("exercise reference: exactly one, exact id", () => {
  test("catalog or private, never both or none", () => {
    assert.deepEqual(validateExerciseRef({ catalogExerciseId: "test_press_db" }), []);
    assert.deepEqual(validateExerciseRef({ privateExerciseId: "00000000-0000-4000-8000-000000000001" }), []);
    assert.deepEqual(codes(validateExerciseRef({})), ["EXERCISE_REF_EXACTLY_ONE"]);
    assert.ok(codes(validateExerciseRef({ catalogExerciseId: "test_press_db", privateExerciseId: "00000000-0000-4000-8000-000000000001" })).includes("EXERCISE_REF_EXACTLY_ONE"));
    assert.deepEqual(codes(validateExerciseRef({ catalogExerciseId: "Bench Press" })), ["CATALOG_ID_INVALID"]);
    assert.deepEqual(codes(validateExerciseRef({ privateExerciseId: "abc" })), ["PRIVATE_ID_INVALID"]);
  });
});

describe("set values follow the snapshot's load model", () => {
  test("allowed fields per model", () => {
    assert.deepEqual(allowedSetFields("dumbbell_pair"), ["reps", "loadKg", "rir"]);
    assert.deepEqual(allowedSetFields("bodyweight_plus"), ["reps", "loadKg", "rir"]);
    assert.deepEqual(allowedSetFields("assisted"), ["reps", "assistKg", "rir"]);
    assert.deepEqual(allowedSetFields("bodyweight"), ["reps", "rir"]);
    assert.deepEqual(allowedSetFields("band"), ["reps", "rir"]);
    assert.deepEqual(allowedSetFields("time"), ["durationSec"]);
    assert.deepEqual(allowedSetFields("cardio"), ["durationSec"]);
    assert.deepEqual(allowedSetFields("sets_only"), []);
    assert.equal(allowedSetFields("rocket"), null);
  });
  test("a field that does not fit the model is refused", () => {
    assert.deepEqual(validateWorkoutSet(set({ reps: 10, loadKg: 26 }), snap("test_press_db")), []);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 8, loadKg: 10 }), snap("test_pull_bw"))), ["SET_FIELD_NOT_ALLOWED"]);
    assert.deepEqual(validateWorkoutSet(set({ reps: 8, loadKg: 10 }), snap("test_pull_belt")), []); // added kg
    assert.deepEqual(validateWorkoutSet(set({ reps: 8, assistKg: 20 }), snap("test_pull_assist")), []);
    assert.deepEqual(codes(validateWorkoutSet(set({ durationSec: 60, rir: "0-1" }), snap("test_core_plank"))), ["SET_FIELD_NOT_ALLOWED"]);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 10 }), snap("test_core_plank"))), ["SET_FIELD_NOT_ALLOWED", "SET_DURATION_REQUIRED"]);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 10, loadKg: 5 }), snap("test_core_band"))), ["SET_FIELD_NOT_ALLOWED"]);
  });
  test("values: numbers only, non-negative, integer reps and seconds, plausible limits", () => {
    const s = snap("test_press_bar");
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 10, loadKg: "60" }), s)), ["SET_VALUE_INVALID"]);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 10.5, loadKg: 60 }), s)), ["SET_VALUE_NOT_INTEGER"]);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 10, loadKg: -1 }), s)), ["SET_VALUE_INVALID"]);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 10, loadKg: 5000 }), s)), ["SET_VALUE_TOO_LARGE"]);
    assert.deepEqual(validateWorkoutSet(set({ reps: 10, loadKg: 62.5 }), s), []);
    assert.deepEqual(codes(validateWorkoutSet(set({ reps: 0, loadKg: 60 }), s)), ["SET_REPS_REQUIRED"]);
    assert.deepEqual(validateWorkoutSet(set({ status: "skipped" }), s), []);
    assert.deepEqual(codes(validateWorkoutSet(set({ setType: "normal", reps: 5 }), s)), ["SET_TYPE_INVALID"]);
  });
  test("RIR: only the 4 categories or empty; never assumed (D4)", () => {
    const s = snap("test_press_bar");
    for (const r of RIR_CATEGORIES) assert.deepEqual(validateWorkoutSet(set({ reps: 5, loadKg: 100, rir: r }), s), [], r);
    for (const r of ["3", "0-2", 1, "2+"]) assert.deepEqual(codes(validateWorkoutSet(set({ reps: 5, loadKg: 100, rir: r }), s)), ["RIR_INVALID"], String(r));
    const g = ids();
    let w = W.createWorkout({ now: T, newId: g });
    const { state, exercise } = W.addWorkoutExercise(w, { exerciseRef: { catalogExerciseId: "test_press_bar" }, loadSnapshot: s, now: T, newId: g });
    const { set: added } = W.addWorkoutSet(state, { exerciseId: exercise.id, values: { reps: 5, loadKg: 100 }, now: T, newId: g });
    assert.equal(added.rir, null);
  });
});

describe("typed input (PE-27)", () => {
  test("comma and dot decimals, spaces; text that is not a number is an error, empty is null", () => {
    assert.deepEqual(parseSetInput({ loadKg: "62,5", reps: " 10 ", rir: "0-1" }), { values: { loadKg: 62.5, reps: 10, rir: "0-1" }, errors: [] });
    assert.deepEqual(parseSetInput({ loadKg: "57.5" }).values, { loadKg: 57.5 });
    assert.deepEqual(parseSetInput({ loadKg: "", reps: null }).values, { loadKg: null, reps: null });
    assert.deepEqual(codes(parseSetInput({ loadKg: "sześćdziesiąt" }).errors), ["SET_INPUT_NOT_A_NUMBER"]);
    assert.deepEqual(codes(parseSetInput({ loadKg: "-5" }).errors), ["SET_INPUT_NOT_A_NUMBER"]);
    assert.deepEqual(codes(parseSetInput({ rir: "3" }).errors), ["RIR_INVALID"]);
  });
});

describe("workout contract", () => {
  function workout() {
    const g = ids();
    let w = W.createWorkout({ now: T, newId: g });
    const r = W.addWorkoutExercise(w, { exerciseRef: { catalogExerciseId: "test_press_db" }, loadSnapshot: snap("test_press_db"), now: T, newId: g });
    w = W.addWorkoutSet(r.state, { exerciseId: r.exercise.id, values: { reps: 10, loadKg: 26 }, now: T, newId: g }).state;
    return { w, g };
  }
  test("the snapshot is mandatory and must describe the referenced exercise (F2-4)", () => {
    const g = ids();
    const w = W.createWorkout({ now: T, newId: g });
    assert.throws(() => W.addWorkoutExercise(w, { exerciseRef: { catalogExerciseId: "test_press_db" }, now: T, newId: g }), /EXERCISE_INVALID/);
    assert.throws(() => W.addWorkoutExercise(w, { exerciseRef: { catalogExerciseId: "test_press_db" }, loadSnapshot: snap("test_press_bar"), now: T, newId: g }), /EXERCISE_INVALID/);
    const broken = { ...snap("test_press_db"), loadModel: "rocket" };
    assert.throws(() => W.addWorkoutExercise(w, { exerciseRef: { catalogExerciseId: "test_press_db" }, loadSnapshot: broken, now: T, newId: g }), /EXERCISE_INVALID/);
    const { w: ok } = workout();
    const stripped = { ...ok, exercises: ok.exercises.map((x) => ({ ...x, loadSnapshot: null })) };
    assert.ok(codes(validateWorkoutState(stripped)).includes("SNAPSHOT_MISSING"));
  });
  test("a private exercise works the same way ('nie wiem' = external_unknown, no exact kg)", () => {
    const g = ids();
    const pid = "00000000-0000-4000-8000-0000000000bb";
    const ps = buildLoadSnapshot({ privateExercise: { privateExerciseId: pid, loadModel: null, laterality: "bilateral", repsCounting: "total", primaryMuscles: ["test.m.chest_a"] }, muscles: ATLAS.dictionaries.muscles, now: T });
    assert.deepEqual([ps.loadModel, ps.confidence], ["external_unknown", "unknown"]);
    const r = W.addWorkoutExercise(W.createWorkout({ now: T, newId: g }), { exerciseRef: { privateExerciseId: pid }, loadSnapshot: ps, now: T, newId: g });
    assert.deepEqual(validateWorkoutState(r.state), []);
  });
  test("every id is unique in a workout (PE-24); finished never before started", () => {
    const { w } = workout();
    const dupl = { ...w, sets: [...w.sets, { ...w.sets[0] }] };
    assert.ok(codes(validateWorkoutState(dupl)).includes("ID_DUPLICATE"));
    assert.throws(() => W.finishWorkout(w, { finishedAt: "2026-10-12T09:00:00.000Z", now: T }), /STATE_INVALID/);
    assert.ok(codes(validateWorkoutState(w, { requireFinished: true })).includes("WORKOUT_NOT_FINISHED"));
    assert.deepEqual(validateWorkoutState(W.finishWorkout(w, { now: "2026-10-12T11:00:00.000Z" }), { requireFinished: true }), []);
  });
  test("a set update must still fit the model; the refused update changes nothing", () => {
    const { w } = workout();
    const json = JSON.stringify(w);
    assert.throws(() => W.updateWorkoutSet(w, { setId: w.sets[0].id, changes: { durationSec: 30 }, now: T }), /SET_INVALID/);
    assert.throws(() => W.updateWorkoutSet(w, { setId: w.sets[0].id, changes: { id: "x" }, now: T }), /FIELD_NOT_EDITABLE/);
    assert.equal(JSON.stringify(w), json);
    const ok = W.updateWorkoutSet(w, { setId: w.sets[0].id, changes: { loadKg: 28, rir: "1-2" }, now: T });
    assert.deepEqual([ok.sets[0].loadKg, ok.sets[0].rir, ok.sets[0].version], [28, "1-2", 2]);
  });
});

describe("plan goals (PE-28, D1, D3)", () => {
  test("each planned set has its own goal; ranges ordered; reps or time, not both", () => {
    assert.deepEqual(validatePlanItemSet({ setType: "working", repsMin: 6, repsMax: 8, rirTarget: "0-1" }), []);
    assert.deepEqual(validatePlanItemSet({ setType: "working", repsMin: 10, repsMax: 12, rirTarget: null }), []);
    assert.deepEqual(codes(validatePlanItemSet({ setType: "working", repsMin: 10, repsMax: 8 })), ["GOAL_RANGE_REVERSED"]);
    assert.deepEqual(codes(validatePlanItemSet({ setType: "working", repsMin: 8, repsMax: 10, durationMinSec: 30, durationMaxSec: 60 })), ["GOAL_REPS_AND_TIME"]);
    assert.deepEqual(codes(validatePlanItemSet({ setType: "working", durationMinSec: 30, durationMaxSec: 60, rirTarget: "0-1" })), ["RIR_NOT_FOR_TIME"]);
    assert.deepEqual(codes(validatePlanItemSet({ setType: "dropset" })), ["SET_TYPE_INVALID"]);
  });
  test("defaults: target RIR 0–1 for a new working set with reps; none for warm-ups and timed sets", () => {
    const g = ids();
    let { state } = P.createPlan({ profile: P.createProfile({ now: T, newId: g }), plans: [] }, { name: "X", now: T, newId: g });
    state = P.addPlanItem(state, { exerciseRef: { catalogExerciseId: "test_press_db" }, now: T, newId: g }).state;
    const itemId = state.items[0].id;
    const a = P.addPlanItemSet(state, { itemId, goal: { repsMin: 6, repsMax: 8 }, now: T, newId: g });
    const b = P.addPlanItemSet(a.state, { itemId, goal: { setType: "warmup", repsMin: 12, repsMax: 12 }, now: T, newId: g });
    const c = P.addPlanItemSet(b.state, { itemId, goal: { durationMinSec: 30, durationMaxSec: 45 }, now: T, newId: g });
    const d = P.addPlanItemSet(c.state, { itemId, goal: { repsMin: 10, repsMax: 12, rirTarget: null }, now: T, newId: g });
    assert.deepEqual([a.set.rirTarget, b.set.rirTarget, c.set.rirTarget, d.set.rirTarget], [DEFAULT_RIR_TARGET, null, null, null]);
    assert.deepEqual(P.planView(d.state)[0].sets.map((s) => [s.repsMin, s.repsMax]), [[6, 8], [12, 12], [null, null], [10, 12]]);
  });
});
