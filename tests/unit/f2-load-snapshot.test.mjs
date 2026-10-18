// F2.1 — load-model snapshot contract (D13, F2-4, F2-5), version 2 since AT3.2b (AT3-D18). The muscle
// work of the hierarchy (AT3-D17, replacing the F2 group work) is tested in at3-2b-hierarchy-stats.test.mjs.
// Synthetic data only. The database side of the contract is in f2-snapshot-sql.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildLoadSnapshot, validateLoadSnapshot, modelFromSnapshot, resolveWorkoutExerciseModel, correctLoadSnapshot, snapshotToRow, rowToSnapshot, SNAPSHOT_FIELDS } from "../../src/engine/load-snapshot.js";
import { exerciseTotals, sessionTotals } from "../../src/engine/load.js";
import { baseAtlas, clone } from "../fixtures/atlas/synthetic.mjs";

const NOW = "2026-10-11T10:00:00.000Z";
const atlas = baseAtlas();
const byId = new Map(atlas.exercises.map((e) => [e.exerciseId, e]));
const snap = (id, over = {}) => buildLoadSnapshot({ exercise: { ...byId.get(id), ...over }, atlasVersion: atlas.atlasVersion, muscles: atlas.dictionaries.muscles, now: NOW });
const set = (weight, reps, extra = {}) => ({ weight, reps, rir: "0-1", setType: "normal", ...extra });

describe("building and validating a snapshot", () => {
  test("an atlas exercise gives a complete, verified snapshot v2 with the muscles frozen and no groups", () => {
    const s = snap("test_press_db_incline");
    assert.deepEqual(validateLoadSnapshot(s), []);
    assert.equal(s.source, "atlas");
    assert.equal(s.confidence, "verified");
    assert.deepEqual([s.loadModel, s.implements, s.laterality, s.repsCounting], ["dumbbell_pair", 2, "bilateral", "total"]);
    assert.equal(s.snapshotVersion, 2);
    assert.deepEqual([s.primaryMuscles, s.secondaryMuscles], [byId.get("test_press_db_incline").primaryMuscles, byId.get("test_press_db_incline").secondaryMuscles]);
    assert.ok(!("primaryGroups" in s) && !("secondaryGroups" in s));
    assert.deepEqual([s.atlasVersion, s.entryRev, s.familyId, s.weightUnit, s.volumeFormulaVersion, s.correctionCount], [1, 1, "test_family_press", "kg", 1, 0]);
    // every contract field is present
    for (const f of SNAPSHOT_FIELDS) assert.ok(f.name in s, f.name);
  });
  test("a private exercise: confidence from the form; 'nie wiem' about the load → unknown", () => {
    const priv = { privateExerciseId: "00000000-0000-4000-8000-000000000001", loadModel: "dumbbell_pair", laterality: "bilateral", repsCounting: "total", primaryMuscles: ["test.m.chest_a"], confidence: "low" };
    const s = buildLoadSnapshot({ privateExercise: priv, muscles: atlas.dictionaries.muscles, now: NOW });
    assert.deepEqual([s.source, s.confidence, s.implements, s.catalogExerciseId], ["private", "low", 2, null]);
    const u = buildLoadSnapshot({ privateExercise: { ...priv, loadModel: null }, muscles: atlas.dictionaries.muscles, now: NOW });
    assert.deepEqual([u.loadModel, u.confidence], ["external_unknown", "unknown"]);
  });
  test("every rule of the contract rejects what it should", () => {
    const ok = snap("test_press_bar");
    const bad = (mut, code) => {
      const s = clone(ok);
      mut(s);
      assert.ok(validateLoadSnapshot(s).some((e) => e.code === code), `${code}: ${JSON.stringify(validateLoadSnapshot(s))}`);
    };
    bad((s) => { s.loadModel = null; }, "NOT_NULL");
    bad((s) => { s.loadModel = "rocket"; }, "VALUE");
    bad((s) => { s.snapshotVersion = 1; }, "VALUE"); // version 1 (stats groups) is withdrawn
    bad((s) => { s.primaryMuscles = "x"; }, "TYPE");
    bad((s) => { s.privateExerciseId = "00000000-0000-4000-8000-000000000001"; }, "ws_exactly_one_exercise");
    bad((s) => { s.confidence = "low"; }, "ws_atlas_source");
    bad((s) => { s.repsCounting = "per_side"; }, "ws_bilateral_total");
    bad((s) => { s.implements = 2; }, "ws_implements_model");
    bad((s) => { s.loadIncrementKg = -1; }, "ws_load_increment");
    bad((s) => { s.secondaryMuscles = ["test.m.chest_a"]; }, "ws_muscles_disjoint");
    bad((s) => { s.primaryMuscles = []; }, "ws_primary_muscle");
    bad((s) => { s.correctionCount = 1; }, "ws_correction_count");
    bad((s) => { s.measurementType = "band_reps"; }, "ws_measurement_model");
    assert.deepEqual(validateLoadSnapshot(null), [{ code: "SNAPSHOT_MISSING", field: null }]);
  });
  test("an invalid exercise cannot produce a snapshot (the build throws instead of saving garbage)", () => {
    assert.throws(() => snap("test_press_bar", { laterality: "bilateral", repsCounting: "per_side" }), /invalid snapshot/);
  });
  test("client object ↔ database row round trip is lossless", () => {
    for (const id of byId.keys()) {
      const s = snap(id);
      const row = snapshotToRow(s);
      assert.deepEqual(Object.keys(row).sort(), SNAPSHOT_FIELDS.map((f) => f.column).sort());
      assert.deepEqual(rowToSnapshot(row), s);
    }
  });
});

describe("history reads the snapshot first (D13)", () => {
  const workout = (we) => ({ exercises: [we] });
  test("a new atlas release with a different model does NOT change an old workout", () => {
    const s = snap("test_press_db"); // two dumbbells
    const we = { catalogExerciseId: "test_press_db", loadSnapshot: s, sets: [set("26", "10")] };
    const changedAtlas = new Map([["test_press_db", { ...byId.get("test_press_db"), loadModel: "dumbbell_single", implements: 1 }]]);
    const r = resolveWorkoutExerciseModel(we, { atlasById: changedAtlas });
    assert.equal(r.status, "snapshot");
    assert.equal(exerciseTotals(we.sets, r.model).volumeKg, 520);
    const total = sessionTotals(workout(we), (e) => resolveWorkoutExerciseModel(e, { atlasById: changedAtlas }).model);
    assert.deepEqual([total.volumeKg, total.volumeStatus], [520, "exact"]);
  });
  test("a changed atlas entry does not change the muscles stored in the workout", () => {
    const s = snap("test_press_bar");
    const we = { catalogExerciseId: "test_press_bar", loadSnapshot: s };
    const frozen = { primaryMuscles: [...s.primaryMuscles], secondaryMuscles: [...s.secondaryMuscles] };
    byId.get("test_press_bar").primaryMuscles.push("test.m.back_a"); // a later atlas release
    try {
      assert.deepEqual(resolveWorkoutExerciseModel(we).muscles, frozen);
    } finally {
      byId.get("test_press_bar").primaryMuscles.pop();
    }
  });
  test("missing snapshot is a fault: current atlas only with a warning and never exact", () => {
    const we = { catalogExerciseId: "test_press_db", sets: [set("26", "10")] };
    const r = resolveWorkoutExerciseModel(we, { atlasById: byId });
    assert.equal(r.status, "snapshot_missing");
    assert.match(r.warning, /aktualnego atlasu/);
    const t = exerciseTotals(we.sets, r.model);
    assert.deepEqual([t.volumeKg, t.volumeStatus], [520, "estimated"]);
  });
  test("an invalid snapshot counts as missing; nothing known → unknown, no kg", () => {
    const s = snap("test_press_db");
    s.snapshotVersion = 99;
    assert.equal(resolveWorkoutExerciseModel({ catalogExerciseId: "test_press_db", loadSnapshot: s }, { atlasById: byId }).status, "snapshot_missing");
    const r = resolveWorkoutExerciseModel({ catalogExerciseId: "test_gone", sets: [] }, { atlasById: byId });
    assert.equal(r.status, "unknown");
    assert.equal(exerciseTotals([set("20", "10")], r.model).volumeKg, null);
  });
  test("modelFromSnapshot keeps the snapshot's interpretation and confidence", () => {
    const m = modelFromSnapshot(snap("test_row_db_one"));
    assert.deepEqual([m.loadModel, m.implements, m.laterality, m.repsCounting, m.confidence], ["dumbbell_single", 1, "unilateral", "per_side", "verified"]);
    assert.equal(exerciseTotals([set("26", "10")], m).volumeKg, 520); // PE-18
  });
});

describe("explicit correction of a finished workout (F2-5)", () => {
  test("changes only that workout's snapshot, is marked and keeps the previous model", () => {
    const original = snap("test_row_cable");
    const other = snap("test_row_cable");
    const { snapshot, correction } = correctLoadSnapshot(original, { laterality: "unilateral", repsCounting: "per_side" }, { reason: "Testowa korekta: jedna ręka", now: "2026-10-12T08:00:00.000Z" });
    assert.deepEqual([snapshot.source, snapshot.correctionCount, snapshot.laterality, snapshot.confidence], ["user_correction", 1, "unilateral", "verified"]);
    assert.deepEqual(correction.previousSnapshot, original);
    assert.deepEqual(correction.newSnapshot, snapshot);
    assert.equal(correction.reason, "Testowa korekta: jedna ręka");
    assert.deepEqual(validateLoadSnapshot(snapshot), []);
    assert.deepEqual(other, snap("test_row_cable")); // other workouts untouched
    assert.equal(original.source, "atlas"); // input not mutated
    const second = correctLoadSnapshot(snapshot, { loadIncrementKg: 2.5 }, { reason: "Testowa druga korekta" });
    assert.equal(second.snapshot.correctionCount, 2);
    assert.deepEqual(second.correction.previousSnapshot, snapshot);
  });
  test("refuses: no reason, a non-model field, an invalid result", () => {
    const s = snap("test_row_cable");
    assert.throws(() => correctLoadSnapshot(s, { laterality: "unilateral", repsCounting: "per_side" }, {}), /reason/);
    assert.throws(() => correctLoadSnapshot(s, { primaryGroups: ["abs"] }, { reason: "x" }), /cannot be corrected/);
    assert.throws(() => correctLoadSnapshot(s, { loadModel: "band", measurementType: "weight_reps" }, { reason: "x" }), /invalid result/);
  });
});
