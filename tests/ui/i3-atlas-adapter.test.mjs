// I3 (24.10.2026) — the atlas adapter of the app (17b-atlas-catalog.jsx) on the nr1 contracts:
//   - a plan item stores catalogExerciseId (= exerciseId) and the model checked by resolvePlanItemLoadModel
//     (B02-D21: the 3 machine exercises need a choice);
//   - a load snapshot v3 is built by planItemSnapshot (→ engine buildLoadSnapshot) for every atlas exercise;
//   - the input kind of the existing workout screen follows the measurement type / load model (no muscles);
//   - the JSON import gate accepts only copies that fit the atlas-only model.
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { useS1Profile } from "../harness/load-app.mjs";
import { loadApp } from "../harness/ui.mjs";
import { validateLoadSnapshot } from "../../src/engine/load-snapshot.js";

useS1Profile();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const atlas = JSON.parse(readFileSync(resolve(root, "src/atlas/atlas.json"), "utf8"));
let A;
before(async () => {
  A = await loadApp();
});

describe("I3: atlas adapter on the nr1 contracts", () => {
  test("plan item fields: id in catalogExerciseId = exerciseId; a machine choice needs the model", () => {
    assert.deepEqual(A.atlasPlanItemFields("bench_press_barbell_flat"), { exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadModel: null });
    assert.throws(() => A.atlasPlanItemFields("chest_press_machine_flat", null), /LOAD_MODEL_MISSING/);
    assert.equal(A.atlasPlanItemFields("chest_press_machine_flat", "plate_loaded").loadModel, "plate_loaded");
    assert.throws(() => A.atlasPlanItemFields("bench_press_barbell_flat", "plate_loaded"), /LOAD_MODEL_NOT_ALLOWED/);
    assert.throws(() => A.atlasPlanItemFields("squat_barbell"), /not an active atlas exercise/);
    const choice = atlas.exercises.filter((e) => A.atlasLoadModelChoice(e.exerciseId).choice).map((e) => e.exerciseId);
    assert.deepEqual(choice, ["chest_press_machine_flat", "chest_press_machine_incline", "chest_press_machine_unilateral"]);
  });
  test("snapshot v3 for every active atlas exercise (default model), valid and matching the reference", () => {
    for (const e of atlas.exercises.filter((x) => x.status === "active")) {
      const lm = A.atlasLoadModelChoice(e.exerciseId).choice ? "machine_stack" : null;
      const s = A.atlasLoadSnapshot(e.exerciseId, lm, "2026-10-24T10:00:00.000Z");
      assert.deepEqual(validateLoadSnapshot(s), [], e.exerciseId);
      assert.equal(s.snapshotVersion, 3);
      assert.equal(s.catalogExerciseId, e.exerciseId);
      assert.equal(s.atlasVersion, atlas.atlasVersion);
      assert.equal(s.loadModel, lm || e.loadModel);
    }
  });
  test("input kind from the measurement type / load model; picked fields keep own exercises as before", () => {
    assert.equal(A.atlasExerciseView("bench_press_barbell_flat").kind, "weight");
    assert.equal(A.atlasExerciseView("pullup_pronated_band_assisted").kind, "bodyweight");
    assert.equal(A.atlasExerciseView("fly_band_standing").kind, "bodyweight");
    const plus = atlas.exercises.find((e) => e.loadModel === "bodyweight_plus");
    assert.equal(A.atlasExerciseView(plus.exerciseId).kind, "bodyweightPlus");
    const time = atlas.exercises.find((e) => e.loadModel === "time");
    assert.equal(A.atlasExerciseView(time.exerciseId).kind, "time");
    assert.deepEqual(A.pickedExerciseFields("own-1", null, [{ id: "own-1" }]), { exerciseId: "own-1" });
    assert.equal(A.atlasExerciseView("own-1"), null);
  });
  test("import gate: only copies that fit the atlas-only model", () => {
    const snap = A.atlasLoadSnapshot("bench_press_barbell_flat", null, "2026-10-24T10:00:00.000Z");
    const ok = {
      exercises: [],
      plans: [{ id: "p", name: "P", exercises: [{ id: "i", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadModel: null, setsDetail: [] }] }],
      history: [{ id: "s", date: "2026-10-24T10:00:00.000Z", exercises: [{ id: "x", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", loadSnapshot: snap, sets: [] }] }],
    };
    assert.deepEqual(A.atlasImportProblems(ok), []);
    assert.deepEqual(A.atlasImportProblems({ ...ok, exercises: [{ id: "own", name: "Moje" }] }), ["ćwiczenia spoza atlasu"]);
    assert.deepEqual(A.atlasImportProblems({ ...ok, plans: [{ id: "p", exercises: [{ id: "i", exerciseId: "bench_press" }] }] }), ["plan z ćwiczeniem spoza atlasu"]);
    const noSnap = { ...ok, history: [{ id: "s", exercises: [{ id: "x", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", sets: [] }] }] };
    assert.deepEqual(A.atlasImportProblems(noSnap), ["trening bez ćwiczenia z atlasu lub bez snapshotu"]);
    const wrongSnap = { ...ok, history: [{ id: "s", exercises: [{ id: "x", exerciseId: "fly_band_standing", catalogExerciseId: "fly_band_standing", loadSnapshot: snap, sets: [] }] }] };
    assert.deepEqual(A.atlasImportProblems(wrongSnap), ["trening bez ćwiczenia z atlasu lub bez snapshotu"]);
    assert.deepEqual(A.atlasImportProblems({ history: [{ id: "old", exercises: [{ exerciseId: "bench_press", sets: [] }] }] }), ["trening bez ćwiczenia z atlasu lub bez snapshotu"]);
  });
});
