// B02-D21 — configurable load model of machines (engine layer). Tests 1–20 of the handoff.
// The machine exercises and machine equipment exist only in an in-memory copy of Batch 01; the
// published atlas is not changed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MACHINE_LOAD_MODEL_CHOICE, loadModelOptions, validateLoadModelChoice, comparabilityKey } from "../../src/engine/load-model-options.js";
import { batch01Of } from "../fixtures/atlas/batch01.mjs";
import { buildLoadSnapshot, validateLoadSnapshot, modelFromSnapshot, resolveWorkoutExerciseModel, snapshotToRow, rowToSnapshot } from "../../src/engine/load-snapshot.js";
import { exerciseTotals, sessionTotals } from "../../src/engine/load.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ATLAS = JSON.parse(readFileSync(resolve(ROOT, "src/atlas/atlas.json"), "utf8"));
const BATCH01 = batch01Of(REPO_ATLAS); // Batch 01 as published (release 1); a subset since B02-S5
const NOW = "2026-10-18T15:00:00.000Z";

function machineAtlas() {
  const a = structuredClone(BATCH01);
  a.dictionaries.equipment.push(
    { code: "machine_press_test", labelPl: "Maszyna do wyciskania (test)", role: "load", loadModels: ["machine_stack", "plate_loaded"], status: "active" },
    { code: "machine_stack_only_test", labelPl: "Maszyna ze stosem (test)", role: "load", loadModels: ["machine_stack"], status: "active" },
  );
  const bench = a.exercises.find((e) => e.exerciseId === "bench_press_barbell_flat");
  const mk = (exerciseId, familyId, namePl, equipment, loadModel) => ({ ...structuredClone(bench), exerciseId, familyId, namePl, aliasesPl: [], variantAttributes: [], equipment, loadModel, implements: null, tipsPl: "" });
  a.families.push({ familyId: "machine_press_test", namePl: "Wyciskanie na maszynie (test)", status: "active" }, { familyId: "pec_deck_test", namePl: "Rozpiętki na maszynie (test)", status: "active" });
  a.exercises.push(
    mk("machine_press_test", "machine_press_test", "Wyciskanie na maszynie (test)", ["machine_press_test"], "machine_stack"),
    mk("pec_deck_test", "pec_deck_test", "Rozpiętki na maszynie (test)", ["machine_stack_only_test"], "machine_stack"),
  );
  a.issuedIds.push("machine_press_test", "pec_deck_test");
  return a;
}
const ATLAS = machineAtlas();
const ex = (id) => ATLAS.exercises.find((e) => e.exerciseId === id);
const EQ = ATLAS.dictionaries.equipment;
const snap = (id, loadModel, extra = {}) => buildLoadSnapshot({ exercise: ex(id), atlasVersion: 1, now: NOW, equipment: ATLAS, ...(loadModel !== undefined ? { loadModel } : {}), ...extra });
const set = (weight, reps) => ({ weight: String(weight), reps: String(reps), setType: "normal", rir: "1" });

describe("B02-D21 — the synthetic machine atlas is valid (20)", () => {
  test("validator: 0 errors with the machine equipment and exercises; the published atlas is untouched", () => {
    assert.deepEqual(validateAtlas(ATLAS).issues.filter((i) => i.level === "error"), []);
    // the test-only codes never reach the published atlas; Batch 01 itself is unchanged
    for (const code of ["machine_press_test", "machine_stack_only_test"]) assert.ok(!REPO_ATLAS.dictionaries.equipment.some((e) => e.code === code), code);
    for (const id of ["machine_press_test", "pec_deck_test"]) assert.ok(!REPO_ATLAS.issuedIds.includes(id), id);
    assert.equal(BATCH01.exercises.length, 15);
  });
});

describe("B02-D21 — options (1–4)", () => {
  test("1. machine allowing stack and plates → two options, the default first", () => {
    const o = loadModelOptions(ex("machine_press_test"), ATLAS);
    assert.deepEqual([o.options, o.choice, o.defaultModel, o.reason], [["machine_stack", "plate_loaded"], true, "machine_stack", null]);
    // the default decides the order; the equipment dictionary may be passed alone
    const plateDefault = { ...ex("machine_press_test"), loadModel: "plate_loaded" };
    assert.deepEqual(loadModelOptions(plateDefault, EQ).options, ["plate_loaded", "machine_stack"]);
  });

  test("2. machine allowing only one model → one option", () => {
    const o = loadModelOptions(ex("pec_deck_test"), ATLAS);
    assert.deepEqual([o.options, o.choice, o.reason], [["machine_stack"], false, "equipment_single_model"]);
  });

  test("3. barbell, dumbbells, bodyweight, band → no machine choice", () => {
    for (const id of ["bench_press_barbell_flat", "bench_press_dumbbell_pair_flat", "row_dumbbell_single_bench_supported", "pullup_pronated_bodyweight", "pullup_pronated_band_assisted", "plank_forearm"]) {
      const o = loadModelOptions(ex(id), ATLAS);
      assert.deepEqual([o.options, o.choice, o.reason], [[ex(id).loadModel], false, "single_model"], id);
    }
    // a barbell exercise can never become plate_loaded (no global exception)
    assert.equal(validateLoadModelChoice(ex("bench_press_barbell_flat"), ATLAS, "plate_loaded").errors[0].code, "LOAD_MODEL_NOT_ALLOWED");
  });

  test("4. a model outside the options → LOAD_MODEL_NOT_ALLOWED; no choice → the default", () => {
    assert.deepEqual(validateLoadModelChoice(ex("machine_press_test"), ATLAS, "cable"), { ok: false, loadModel: null, errors: [{ code: "LOAD_MODEL_NOT_ALLOWED", field: "loadModel", allowed: ["machine_stack", "plate_loaded"] }] });
    assert.equal(validateLoadModelChoice(ex("pec_deck_test"), ATLAS, "plate_loaded").errors[0].code, "LOAD_MODEL_NOT_ALLOWED");
    assert.deepEqual(validateLoadModelChoice(ex("machine_press_test"), ATLAS, "plate_loaded"), { ok: true, loadModel: "plate_loaded", errors: [] });
    for (const none of [undefined, null, ""]) assert.deepEqual(validateLoadModelChoice(ex("machine_press_test"), ATLAS, none), { ok: true, loadModel: "machine_stack", errors: [] });
  });

  test("inconsistent equipment data never opens a choice (nothing inferred from names)", () => {
    const base = ex("machine_press_test");
    assert.equal(loadModelOptions({ ...base, equipment: ["no_such_machine"] }, ATLAS).reason, "equipment_unknown");
    assert.equal(loadModelOptions({ ...base, equipment: ["bench"] }, ATLAS).reason, "no_load_equipment");
    assert.equal(loadModelOptions({ ...base, equipment: ["machine_press_test", "barbell"] }, ATLAS).reason, "multiple_load_equipment");
    const eqWithoutDefault = [...EQ.filter((e) => e.code !== "machine_press_test"), { code: "machine_press_test", role: "load", loadModels: ["plate_loaded"], status: "active" }];
    assert.equal(loadModelOptions(base, eqWithoutDefault).reason, "equipment_inconsistent");
    const archived = EQ.map((e) => (e.code === "machine_press_test" ? { ...e, status: "archived" } : e));
    assert.equal(loadModelOptions(base, archived).reason, "no_load_equipment");
    assert.equal(loadModelOptions({ ...base, namePl: "Maszyna ładowana talerzami" }, []).choice, false, "the name means nothing");
    assert.deepEqual(loadModelOptions(null, ATLAS).options, []);
    assert.equal(validateLoadModelChoice(null, ATLAS).errors[0].code, "LOAD_MODEL_MISSING");
    assert.ok(Object.isFrozen(loadModelOptions(base, ATLAS)) && Object.isFrozen(loadModelOptions(base, ATLAS).options));
    assert.deepEqual([...MACHINE_LOAD_MODEL_CHOICE], ["machine_stack", "plate_loaded"]);
  });
});

describe("B02-D21 — snapshot (5–8, 18)", () => {
  test("5–6. the chosen model is stored in the existing loadModel field; contract and versions unchanged", () => {
    const stack = snap("machine_press_test", "machine_stack");
    const plates = snap("machine_press_test", "plate_loaded");
    assert.equal(stack.loadModel, "machine_stack");
    assert.equal(plates.loadModel, "plate_loaded");
    for (const s of [stack, plates]) {
      assert.deepEqual(validateLoadSnapshot(s), []);
      assert.deepEqual([s.snapshotVersion, s.volumeFormulaVersion, s.entryRev, s.source, s.confidence, s.implements], [3, 1, 1, "atlas", "verified", null]);
      assert.deepEqual(rowToSnapshot(snapshotToRow(s)), s, "same columns, lossless");
    }
  });

  test("7. without the parameter: the default model, exactly as before", () => {
    const before = buildLoadSnapshot({ exercise: ex("machine_press_test"), atlasVersion: 1, now: NOW });
    assert.equal(before.loadModel, "machine_stack");
    assert.deepEqual(snap("machine_press_test"), before);
    for (const e of BATCH01.exercises) assert.deepEqual(buildLoadSnapshot({ exercise: e, atlasVersion: 1, now: NOW, equipment: ATLAS }), buildLoadSnapshot({ exercise: e, atlasVersion: 1, now: NOW }), e.exerciseId);
  });

  test("a model outside the options is refused by the snapshot; without the dictionary only the default passes; private: only its own", () => {
    assert.throws(() => snap("machine_press_test", "cable"), /LOAD_MODEL_NOT_ALLOWED/);
    assert.throws(() => snap("bench_press_barbell_flat", "plate_loaded"), /LOAD_MODEL_NOT_ALLOWED/);
    assert.throws(() => buildLoadSnapshot({ exercise: ex("machine_press_test"), atlasVersion: 1, now: NOW, loadModel: "plate_loaded" }), /LOAD_MODEL_NOT_ALLOWED/);
    assert.equal(buildLoadSnapshot({ exercise: ex("machine_press_test"), atlasVersion: 1, now: NOW, loadModel: "machine_stack" }).loadModel, "machine_stack");
    const priv = { privateExerciseId: "00000000-0000-4000-8000-0000000000d1", loadModel: "machine_stack", laterality: "bilateral", repsCounting: "total", primaryMuscles: ["pectoralis_major"] };
    assert.throws(() => buildLoadSnapshot({ privateExercise: priv, now: NOW, loadModel: "plate_loaded", equipment: ATLAS }), /LOAD_MODEL_NOT_ALLOWED/);
    assert.equal(buildLoadSnapshot({ privateExercise: priv, now: NOW, loadModel: "machine_stack" }).loadModel, "machine_stack");
  });

  test("8. reading a stored snapshot does not depend on a later plan configuration or atlas change", () => {
    const plan = { items: [{ exerciseId: "machine_press_test", loadModel: "plate_loaded" }] };
    const we = { catalogExerciseId: "machine_press_test", loadSnapshot: snap("machine_press_test", plan.items[0].loadModel), sets: [set(40, 10)] };
    const stored = JSON.stringify(we.loadSnapshot);
    plan.items[0].loadModel = "machine_stack"; // the plan changes later
    const changedAtlas = new Map([["machine_press_test", { ...ex("machine_press_test"), loadModel: "machine_stack" }]]);
    const r = resolveWorkoutExerciseModel(we, { atlasById: changedAtlas });
    assert.deepEqual([r.status, r.model.loadModel], ["snapshot", "plate_loaded"]);
    assert.equal(JSON.stringify(we.loadSnapshot), stored);
  });
});

describe("B02-D21 — tonnage (9–12)", () => {
  const vol = (model, sets) => exerciseTotals(sets, modelFromSnapshot(snap("machine_press_test", model)));
  test("9. stack 50 kg × 10 → 500 kg", () => assert.deepEqual([vol("machine_stack", [set(50, 10)]).volumeKg, vol("machine_stack", [set(50, 10)]).volumeStatus], [500, "exact"]));
  test("10. plates 20 + 20 kg typed as 40 kg × 10 → 400 kg", () => assert.equal(vol("plate_loaded", [set(40, 10)]).volumeKg, 400));
  test("11–12. nothing added for the machine, nothing counted twice", () => {
    for (const model of ["machine_stack", "plate_loaded"]) {
      const t = vol(model, [set(40, 10), set(40, 10)]);
      assert.deepEqual([t.volumeKg, t.topExternalKg, t.workingSets], [800, 40, 2], model);
    }
    const s = sessionTotals({ exercises: [{ exerciseId: "a", sets: [set(50, 10)] }, { exerciseId: "b", sets: [set(40, 10)] }] }, (e) => modelFromSnapshot(snap("machine_press_test", e.exerciseId === "a" ? "machine_stack" : "plate_loaded")));
    assert.equal(s.volumeKg, 900);
  });
});

describe("B02-D21 — comparability (13–15)", () => {
  test("13. same exercise, different load model → different keys", () => {
    assert.notEqual(comparabilityKey(snap("machine_press_test", "machine_stack")), comparabilityKey(snap("machine_press_test", "plate_loaded")));
  });
  test("14. same exercise and model, different entryRev → different keys", () => {
    const rev2 = buildLoadSnapshot({ exercise: { ...ex("machine_press_test"), entryRev: 2 }, atlasVersion: 2, now: NOW, equipment: ATLAS, loadModel: "plate_loaded" });
    assert.notEqual(comparabilityKey(snap("machine_press_test", "plate_loaded")), comparabilityKey(rev2));
  });
  test("15. identical parameters → identical key; snapshot and plain object agree; incomplete → null", () => {
    const a = snap("machine_press_test", "plate_loaded");
    assert.equal(comparabilityKey(a), comparabilityKey(snap("machine_press_test", "plate_loaded", { now: "2026-12-01T00:00:00.000Z" })));
    assert.equal(comparabilityKey(a), "machine_press_test|plate_loaded|1");
    assert.equal(comparabilityKey({ exerciseId: "machine_press_test", loadModel: "plate_loaded", entryRev: 1 }), comparabilityKey(a));
    assert.equal(comparabilityKey({ exerciseId: "x", loadModel: "machine_stack" }), null);
    assert.equal(comparabilityKey(null), null);
  });
});
