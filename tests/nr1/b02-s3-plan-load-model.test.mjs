// B02 / S3 — the load model chosen in a plan item (B02-D21) goes into the workout's immutable load
// snapshot. Real nr1 domain (plan.js, workout.js, workout-from-plan.js), real engine
// (load-model-options.js, load-snapshot.js v3, load.js) and the real SQL draft in PGlite.
// The machine exercises are SYNTHETIC test records on top of the real Batch 01 atlas: the 40 B02
// records are not imported (S5).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as P from "../../src/nr1/domain/plan.js";
import * as W from "../../src/nr1/domain/workout.js";
import { planItemSnapshot, checkPlanForWorkout, startWorkoutFromPlan } from "../../src/nr1/domain/workout-from-plan.js";
import { resolvePlanItemLoadModel, LOAD_MODEL_CHOICE_LABELS } from "../../src/nr1/contracts/plan-load-model.js";
import { validatePlanState } from "../../src/nr1/contracts/plan-goal.js";
import { validateWorkoutState } from "../../src/nr1/contracts/workout.js";
import { loadModelOptions, comparabilityKey } from "../../src/engine/load-model-options.js";
import { validateLoadSnapshot, snapshotToRow, rowToSnapshot, modelFromSnapshot, LOAD_SNAPSHOT_VERSION } from "../../src/engine/load-snapshot.js";
import { sessionTotals, exerciseTotals, SMITH_STARTING_RESISTANCE_MISSING } from "../../src/engine/load.js";
import { createMemoryExerciseSettingsStore } from "../../src/engine/exercise-settings.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { LOAD_MODEL_CODES } from "../../src/engine/atlas-schema.js";
import { PLAN_ITEM_SQL_PATH, generatePlanItemSql } from "../../tools/gen-snapshot-sql.mjs";
import { ids, clock, deepFreeze } from "./helpers.mjs";

const REAL = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const clone = (x) => structuredClone(x);
const MACHINES = ["chest_press_machine_flat", "chest_press_machine_incline", "chest_press_machine_unilateral"];
const PRIVATE_ID = "00000000-0000-4000-8000-0000000000f1";

// Real Batch 01 atlas + synthetic test records (never written to the repository atlas).
function testAtlas() {
  const a = clone(REAL);
  a.atlasVersion = 2;
  a.dictionaries.equipment.push(
    { code: "chest_press_machine", labelPl: "Maszyna do wyciskania (test)", role: "load", loadModels: ["machine_stack", "plate_loaded"], status: "active" },
    { code: "smith_machine", labelPl: "Maszyna Smitha (test)", role: "load", loadModels: ["smith_plates_only"], status: "active" },
    { code: "cable_machine", labelPl: "Wyciąg (test)", role: "load", loadModels: ["cable"], status: "active" },
  );
  a.dictionaries.variantAttributes.push({ code: "angle.incline", labelPl: "Skos dodatni (test)", dimension: "angle", status: "active" });
  a.families.push({ familyId: "chest_press_machine", namePl: "Wyciskanie na maszynie (test)", status: "active" }, { familyId: "chest_fly", namePl: "Rozpiętki (test)", status: "active" });
  const base = a.exercises.find((x) => x.exerciseId === "bench_press_barbell_flat");
  const mk = (exerciseId, over) => ({ ...clone(base), exerciseId, aliasesPl: [], implements: null, loadIncrementKg: 2.5, ...over });
  a.exercises.push(
    mk("chest_press_machine_flat", { familyId: "chest_press_machine", namePl: "Wyciskanie na maszynie (test, płasko)", equipment: ["chest_press_machine"], loadModel: "machine_stack", variantAttributes: ["angle.flat"] }),
    mk("chest_press_machine_incline", { familyId: "chest_press_machine", namePl: "Wyciskanie na maszynie (test, skos)", equipment: ["chest_press_machine"], loadModel: "machine_stack", variantAttributes: ["angle.incline"] }),
    mk("chest_press_machine_unilateral", { familyId: "chest_press_machine", namePl: "Wyciskanie na maszynie (test, jednorącz)", equipment: ["chest_press_machine"], loadModel: "machine_stack", laterality: "unilateral", repsCounting: "per_side", variantAttributes: ["angle.flat", "laterality.unilateral"] }),
    mk("bench_press_smith_flat", { namePl: "Wyciskanie na Smicie (test)", equipment: ["smith_machine", "bench"], loadModel: "smith_plates_only", variantAttributes: ["angle.flat"] }),
    mk("fly_cable_mid", { familyId: "chest_fly", namePl: "Rozpiętki na wyciągu (test)", equipment: ["cable_machine"], loadModel: "cable", variantAttributes: [] }),
  );
  for (const x of a.exercises) if (!a.issuedIds.includes(x.exerciseId)) a.issuedIds.push(x.exerciseId);
  return a;
}
const ATLAS = testAtlas();
const byId = new Map(ATLAS.exercises.map((x) => [x.exerciseId, x]));
const PRIVATE = { privateExerciseId: PRIVATE_ID, exerciseId: PRIVATE_ID, scope: "private", namePl: "Moje wyciskanie", familyId: null, measurementType: "weight_reps", loadModel: "dumbbell_pair", implements: 2, laterality: "bilateral", repsCounting: "total", primaryMuscles: [...byId.get("bench_press_barbell_flat").primaryMuscles], secondaryMuscles: [], entryRev: 1, confidence: "high" };
const privateById = new Map([[PRIVATE_ID, PRIVATE]]);
const cat = (id) => ({ catalogExerciseId: id });

function setup() {
  const g = ids(5);
  const now = clock();
  const { state } = P.createPlan({ profile: P.createProfile({ now: now(), newId: g }), plans: [] }, { name: "Klatka", now: now(), newId: g });
  return { g, now, state };
}
const add = (state, id, loadModel, { now, g, withContext = true } = {}) =>
  P.addPlanItem(state, { exerciseRef: cat(id), loadModel, exercise: withContext ? byId.get(id) : null, atlas: ATLAS, now: now(), newId: g });
const ctxOf = (now, extra = {}) => ({ atlasById: byId, atlas: ATLAS, atlasVersion: ATLAS.atlasVersion, privateById, now: now(), ...extra });
const done = (loadKg, reps) => ({ setType: "working", status: "done", loadKg, reps });
function withSets(w, perExercise, now, g) {
  let s = w;
  W.workoutView(s).forEach((ex, i) => { for (const v of perExercise[i] || []) s = W.addWorkoutSet(s, { exerciseId: ex.id, values: v, now: now(), newId: g }).state; });
  return s;
}
const totals = (w) => sessionTotals({ exercises: W.workoutView(w) }, (ex) => modelFromSnapshot(ex.loadSnapshot));

describe("S3 — test atlas sanity", () => {
  test("the synthetic records validate with the real Batch 01 atlas (0 errors)", () => {
    const r = validateAtlas(ATLAS);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
  });
});

describe("S3 — 1. machine exercises: two allowed models, the choice is stored in the plan item", () => {
  for (const id of MACHINES) {
    test(`${id}: options machine_stack + plate_loaded; both choices stored, survive serialisation`, () => {
      assert.deepEqual([...loadModelOptions(byId.get(id), ATLAS).options], ["machine_stack", "plate_loaded"]);
      const c = setup();
      let st = c.state;
      for (const m of ["machine_stack", "plate_loaded"]) {
        const r = add(st, id, m, c);
        st = r.state;
        assert.equal(r.item.loadModel, m);
        assert.equal(r.item.catalogExerciseId, id, "the choice does not change the exercise id");
      }
      assert.deepEqual(validatePlanState(st), []);
      const round = JSON.parse(JSON.stringify(st));
      assert.deepEqual(round, st);
      assert.deepEqual(validatePlanState(round), []);
      assert.deepEqual(P.planView(round).map((i) => i.loadModel), ["machine_stack", "plate_loaded"]);
    });
  }
  test("the choice question and the meaning of the typed kg are part of the contract", () => {
    assert.match(LOAD_MODEL_CHOICE_LABELS.question, /maszynie/);
    assert.match(LOAD_MODEL_CHOICE_LABELS.plate_loaded.entryHint, /sumę dołożonych talerzy, bez masy podstawy maszyny/);
    assert.match(LOAD_MODEL_CHOICE_LABELS.machine_stack.entryHint, /stosie/);
  });
});

describe("S3 — 2. the plan's model goes into the snapshot; comparabilityKey separates the models", () => {
  test("two items of the same exercise, stack and plates → two snapshots, two keys, same exerciseId and entryRev", () => {
    const c = setup();
    let st = add(c.state, "chest_press_machine_flat", "machine_stack", c).state;
    st = add(st, "chest_press_machine_flat", "plate_loaded", c).state;
    const w = startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g }));
    assert.deepEqual(validateWorkoutState(w), []);
    const ex = W.workoutView(w);
    assert.deepEqual(ex.map((e) => e.loadSnapshot.loadModel), ["machine_stack", "plate_loaded"]);
    assert.deepEqual(ex.map((e) => e.planItemId), P.planView(st).map((i) => i.id));
    for (const e of ex) {
      assert.deepEqual(validateLoadSnapshot(e.loadSnapshot), []);
      assert.deepEqual([e.loadSnapshot.snapshotVersion, e.loadSnapshot.entryRev, e.loadSnapshot.catalogExerciseId, e.loadSnapshot.source, e.loadSnapshot.confidence], [LOAD_SNAPSHOT_VERSION, 1, "chest_press_machine_flat", "atlas", "verified"]);
    }
    assert.notEqual(comparabilityKey(ex[0].loadSnapshot), comparabilityKey(ex[1].loadSnapshot));
    assert.deepEqual(ex.map((e) => comparabilityKey(e.loadSnapshot)), ["chest_press_machine_flat|machine_stack|1", "chest_press_machine_flat|plate_loaded|1"]);
  });
  test("plan supersets are rebuilt in the workout", () => {
    const c = setup();
    let st = add(c.state, "chest_press_machine_flat", "plate_loaded", c).state;
    st = add(st, "fly_cable_mid", null, c).state;
    const [a, b] = P.planView(st);
    st = P.joinPlanSuperset(st, { firstId: a.id, secondId: b.id, now: c.now(), newId: c.g });
    const ex = W.workoutView(startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g })));
    assert.ok(ex[0].supersetGroup && ex[0].supersetGroup === ex[1].supersetGroup);
  });
});

describe("S3 — 3. editing the plan after a workout never changes the workout's snapshot", () => {
  test("stack → plates in the plan: the old workout keeps machine_stack and its volume; the next one gets plate_loaded", () => {
    const c = setup();
    const r = add(c.state, "chest_press_machine_incline", "machine_stack", c);
    let st = r.state;
    const w1 = withSets(startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g })), [[done(50, 10)]], c.now, c.g);
    const frozen = clone(w1);
    const t1 = totals(w1);
    st = P.updatePlanItem(st, { itemId: r.item.id, changes: { loadModel: "plate_loaded" }, exercise: byId.get("chest_press_machine_incline"), atlas: ATLAS, now: c.now() });
    assert.equal(P.planView(st)[0].loadModel, "plate_loaded");
    assert.deepEqual(w1, frozen, "the old workout is unchanged");
    assert.deepEqual(totals(w1), t1);
    assert.equal(W.workoutView(w1)[0].loadSnapshot.loadModel, "machine_stack");
    const w2 = startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g }));
    assert.equal(W.workoutView(w2)[0].loadSnapshot.loadModel, "plate_loaded");
    // the old workout's totals are read from its own snapshot, never from the plan or the atlas
    assert.deepEqual(totals(w1).exercises[0].model.loadModel, "machine_stack");
  });
  test("editing the model is validated and needs the exercise", () => {
    const c = setup();
    const r = add(c.state, "chest_press_machine_flat", "machine_stack", c);
    const ex = byId.get("chest_press_machine_flat");
    assert.throws(() => P.updatePlanItem(r.state, { itemId: r.item.id, changes: { loadModel: "plate_loaded" }, now: c.now() }), /LOAD_MODEL_CONTEXT_MISSING/);
    assert.throws(() => P.updatePlanItem(r.state, { itemId: r.item.id, changes: { loadModel: "cable" }, exercise: ex, atlas: ATLAS, now: c.now() }), /LOAD_MODEL_NOT_ALLOWED/);
    assert.throws(() => P.updatePlanItem(r.state, { itemId: r.item.id, changes: { loadModel: null }, exercise: ex, atlas: ATLAS, now: c.now() }), /LOAD_MODEL_MISSING/);
    const next = P.updatePlanItem(deepFreeze(r.state), { itemId: r.item.id, changes: { loadModel: "plate_loaded" }, exercise: ex, atlas: ATLAS, now: c.now() });
    const item = next.items.find((i) => i.id === r.item.id);
    assert.deepEqual([item.loadModel, item.version, item.catalogExerciseId], ["plate_loaded", r.item.version + 1, "chest_press_machine_flat"]);
    assert.deepEqual(validatePlanState(next), []);
  });
});

describe("S3 — 4. a missing choice: LOAD_MODEL_MISSING, never a silent default", () => {
  test("adding a choice exercise with the exercise known but no model is refused", () => {
    const c = setup();
    assert.throws(() => add(c.state, "chest_press_machine_flat", null, c), (e) => e.code === "LOAD_MODEL_MISSING" && e.details.options.includes("plate_loaded"));
  });
  test("an imported / older item without the model: the workout does not start, all problems listed", () => {
    const c = setup();
    let st = add(c.state, "chest_press_machine_flat", null, { ...c, withContext: false }).state; // context unknown → stored null
    st = add(st, "bench_press_barbell_flat", null, c).state;
    st = add(st, "chest_press_machine_unilateral", null, { ...c, withContext: false }).state;
    // an older item without the field at all
    st = { ...st, items: st.items.map((i, n) => (n === 2 ? (({ loadModel, ...rest }) => rest)(i) : i)) };
    assert.deepEqual(validatePlanState(st), []);
    const check = checkPlanForWorkout(st, ctxOf(c.now));
    assert.equal(check.ok, false);
    assert.deepEqual(check.errors.map((e) => e.code), ["LOAD_MODEL_MISSING", "LOAD_MODEL_MISSING"]);
    assert.deepEqual(check.errors[0].allowed, ["machine_stack", "plate_loaded"]);
    assert.throws(() => startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g })), (e) => e.code === "LOAD_MODEL_MISSING" && e.details.errors.length === 2);
  });
  test("a missing exercise or a mix of problems → PLAN_NOT_READY with every problem", () => {
    const c = setup();
    let st = add(c.state, "chest_press_machine_flat", null, { ...c, withContext: false }).state;
    st = P.addPlanItem(st, { exerciseRef: cat("does_not_exist"), now: c.now(), newId: c.g }).state;
    assert.throws(() => startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g })), (e) => e.code === "PLAN_NOT_READY" && e.details.errors.map((x) => x.code).join() === "LOAD_MODEL_MISSING,EXERCISE_NOT_FOUND");
  });
});

describe("S3 — 5. single-model and private exercises need no choice", () => {
  test("a barbell exercise: stored null, no question, the workout uses the atlas model", () => {
    const c = setup();
    const r = add(c.state, "bench_press_barbell_flat", null, c);
    assert.equal(r.item.loadModel, null);
    assert.equal(resolvePlanItemLoadModel({ ref: cat("bench_press_barbell_flat"), exercise: byId.get("bench_press_barbell_flat"), atlas: ATLAS }).choice, false);
    assert.equal(W.workoutView(startWorkoutFromPlan(r.state, ctxOf(c.now, { newId: c.g })))[0].loadSnapshot.loadModel, "barbell_total");
    assert.throws(() => add(c.state, "bench_press_barbell_flat", "plate_loaded", c), /LOAD_MODEL_NOT_ALLOWED/);
    // the explicit default is accepted and stored as null (nothing to choose)
    assert.equal(add(c.state, "bench_press_barbell_flat", "barbell_total", c).item.loadModel, null);
  });
  test("a private exercise: its own model only, never a foreign one", () => {
    const c = setup();
    const ref = { privateExerciseId: PRIVATE_ID };
    const r = P.addPlanItem(c.state, { exerciseRef: ref, exercise: PRIVATE, now: c.now(), newId: c.g });
    assert.equal(r.item.loadModel, null);
    assert.throws(() => P.addPlanItem(c.state, { exerciseRef: ref, loadModel: "machine_stack", exercise: PRIVATE, now: c.now(), newId: c.g }), /LOAD_MODEL_NOT_ALLOWED/);
    const s = W.workoutView(startWorkoutFromPlan(r.state, ctxOf(c.now, { newId: c.g })))[0].loadSnapshot;
    assert.deepEqual([s.source, s.privateExerciseId, s.loadModel, s.implements, s.confidence], ["private", PRIVATE_ID, "dumbbell_pair", 2, "high"]);
    // a foreign model stored by mistake (import) is refused at workout start
    const bad = { ...r.state, items: r.state.items.map((i) => ({ ...i, loadModel: "machine_stack" })) };
    assert.throws(() => startWorkoutFromPlan(bad, ctxOf(c.now, { newId: c.g })), (e) => e.code === "PLAN_NOT_READY" && e.details.errors[0].code === "LOAD_MODEL_NOT_ALLOWED");
  });
  test("a model without the exercise context is refused; a mismatched context is refused", () => {
    const c = setup();
    assert.throws(() => add(c.state, "chest_press_machine_flat", "plate_loaded", { ...c, withContext: false }), /LOAD_MODEL_CONTEXT_MISSING/);
    assert.throws(() => P.addPlanItem(c.state, { exerciseRef: cat("chest_press_machine_flat"), loadModel: "plate_loaded", exercise: byId.get("chest_press_machine_incline"), atlas: ATLAS, now: c.now(), newId: c.g }), /EXERCISE_CONTEXT_MISMATCH/);
  });
});

describe("S3 — 6. invalid models are refused; round-trip of plan, snapshot and SQL", () => {
  test("an unknown model: the engine validator refuses it; the plan contract flags a stored unknown model", () => {
    const c = setup();
    assert.throws(() => add(c.state, "chest_press_machine_flat", "rocket", c), (e) => e.code === "LOAD_MODEL_NOT_ALLOWED" && e.details.errors[0].allowed.join() === "machine_stack,plate_loaded");
    const st = add(c.state, "chest_press_machine_flat", "machine_stack", c).state;
    const broken = { ...st, items: st.items.map((i) => ({ ...i, loadModel: "rocket" })) };
    assert.deepEqual(validatePlanState(broken).map((e) => e.code), ["PLAN_ITEM_LOAD_MODEL_INVALID"]);
    const check = planItemSnapshot(broken.items[0], ctxOf(c.now));
    assert.deepEqual([check.ok, check.error.code], [false, "LOAD_MODEL_NOT_ALLOWED"]);
  });
  test("snapshot ↔ row round-trip of plan-built snapshots is lossless", () => {
    const c = setup();
    let st = add(c.state, "chest_press_machine_flat", "plate_loaded", c).state;
    st = add(st, "bench_press_smith_flat", null, c).state;
    for (const e of W.workoutView(startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g })))) assert.deepEqual(rowToSnapshot(snapshotToRow(e.loadSnapshot)), e.loadSnapshot);
  });

  describe("SQL draft 002 (plan_items.load_model) ↔ plan contract (PGlite)", () => {
    let db;
    before(async () => {
      db = await PGlite.create();
      await db.exec("create table plan_items (id uuid primary key default gen_random_uuid());");
      await db.exec(readFileSync(PLAN_ITEM_SQL_PATH, "utf8"));
    });
    after(async () => { if (db) await db.close(); });
    test("the committed SQL is what the generator produces", () => {
      assert.equal(readFileSync(PLAN_ITEM_SQL_PATH, "utf8"), generatePlanItemSql());
      assert.match(generatePlanItemSql(), /^-- NEXTREP 1\.0 \/ schema v2 — DRAFT, NOT A MIGRATION/);
    });
    test("the column is nullable text; database accepts exactly what the plan contract accepts", async () => {
      const col = (await db.query("select data_type, is_nullable from information_schema.columns where table_name = 'plan_items' and column_name = 'load_model'")).rows[0];
      assert.deepEqual([col.data_type, col.is_nullable], ["text", "YES"]);
      const c = setup();
      const st = add(c.state, "chest_press_machine_flat", "machine_stack", c).state;
      for (const v of [null, ...LOAD_MODEL_CODES, "external_unknown", "rocket", ""]) {
        const contractOk = validatePlanState({ ...st, items: st.items.map((i) => ({ ...i, loadModel: v })) }).length === 0;
        let dbOk = true;
        try { await db.query("insert into plan_items (load_model) values ($1)", [v]); } catch { dbOk = false; }
        assert.equal(dbOk, contractOk, `value ${JSON.stringify(v)}`);
      }
    });
  });
});

describe("S3 — 7. Smith regression (S2 contract) through the plan", () => {
  test("R = 15 → 550; R = null → 400 + notice; R = 0 → 400 without notice; older workouts never recomputed", () => {
    const c = setup();
    const st = add(c.state, "bench_press_smith_flat", null, c).state;
    assert.equal(P.planView(st)[0].loadModel, null, "Smith has one model: nothing to choose");
    const settings = createMemoryExerciseSettingsStore();
    const run = () => withSets(startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g, settings })), [[done(40, 10)]], c.now, c.g);
    const wNull = run();
    const smith = byId.get("bench_press_smith_flat");
    settings.set("bench_press_smith_flat", { startingResistanceKg: 15 }, smith);
    const w15 = run();
    settings.set("bench_press_smith_flat", { startingResistanceKg: 0 }, smith);
    const w0 = run();
    const tNull = totals(wNull);
    const t15 = totals(w15);
    const t0 = totals(w0);
    assert.deepEqual([tNull.volumeKg, tNull.volumeStatus, tNull.notices.map((n) => n.code)], [400, "plates_only", [SMITH_STARTING_RESISTANCE_MISSING]]);
    assert.deepEqual([t15.volumeKg, t15.volumeStatus, t15.notices], [550, "exact", []]);
    assert.deepEqual([t0.volumeKg, t0.volumeStatus, t0.notices], [400, "exact", []]);
    assert.deepEqual(W.workoutView(wNull)[0].loadSnapshot.startingResistanceStatus, "unknown");
    // a later card edit does not recompute older workouts
    settings.set("bench_press_smith_flat", { startingResistanceKg: 20 }, smith);
    assert.deepEqual(totals(wNull), tNull);
    assert.deepEqual(totals(w15), t15);
  });
});

describe("S3 — 8. B02-D24 cable and unilateral per side unchanged", () => {
  test("two stacks 15 + 15 = 30 kg × 12 → 360 kg; one-arm machine per side 40 × 10 → 800 kg", () => {
    const c = setup();
    let st = add(c.state, "fly_cable_mid", null, c).state;
    st = add(st, "chest_press_machine_unilateral", "plate_loaded", c).state;
    const w = withSets(startWorkoutFromPlan(st, ctxOf(c.now, { newId: c.g })), [[done(30, 12)], [done(40, 10)]], c.now, c.g);
    const t = totals(w);
    assert.deepEqual(t.exercises.map((e) => e.totals.volumeKg), [360, 800]);
    assert.deepEqual([t.volumeKg, t.volumeStatus], [1160, "exact"]);
    assert.equal(exerciseTotals([done(30, 12)], { loadModel: "cable", confidence: "verified" }).volumeKg, 360);
  });
});
