// PE-A (A1) — load and volume normalization, src/engine/load.js.
// Acceptance tests PE-03…PE-07, the volume part of PE-08, PE-18 (Progress Engine 2.0 spec) and the
// edge cases of the approved PE-A plan. The models are given explicitly here: the engine does not
// depend on any atlas (the transitional mapping is tested in pe-a-legacy-map.test.mjs).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseKg, parseReps, normalizeModel, hasClassicKg, setRole, isPerformed, isWorkingSet, isProgressSet,
  normalizeLoad, setVolumeKg, exerciseTotals, sessionTotals, LOAD_MODELS, VOLUME_FORMULA_VERSION,
} from "../../src/engine/load.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const M = (loadModel, extra = {}) => ({ loadModel, confidence: "verified", source: "test", ...extra });
const BARBELL = M("barbell_total");
const DB_PAIR = M("dumbbell_pair");
const DB_SINGLE_UNI = M("dumbbell_single", { laterality: "unilateral" });
const DB_PAIR_UNI = M("dumbbell_pair", { laterality: "unilateral" });
const DB_PAIR_ALT = M("dumbbell_pair", { laterality: "alternating" });
const BW = M("bodyweight");
const BW_PLUS = M("bodyweight_plus");
const ASSISTED = M("assisted");
const BAND = M("band");
const set = (weight, reps, extra = {}) => ({ weight, reps, rir: "0-1", setType: "normal", ...extra });

describe("PE-A acceptance tests (spec PE-03…PE-07, PE-08 volume part, PE-18)", () => {
  test("PE-03: two dumbbells 26 kg × 10 → 520 kg, 1 working set", () => {
    const t = exerciseTotals([set("26", "10")], DB_PAIR);
    assert.equal(t.volumeKg, 520);
    assert.equal(t.workingSets, 1);
    assert.equal(t.volumeStatus, "exact");
  });
  test("PE-04: 26×10, 26×10, 26×10, 28×6 with two dumbbells → 36 reps, 1896 kg, 4 working sets", () => {
    const t = exerciseTotals([set("26", "10"), set("26", "10"), set("26", "10"), set("28", "6")], DB_PAIR);
    assert.equal(t.reps, 36);
    assert.equal(t.volumeKg, 1896);
    assert.equal(t.workingSets, 4);
    assert.equal(t.topExternalKg, 56); // 2 × 28 kg
  });
  test("PE-05: warmup 10 kg × 12 + 3 working sets 26 kg × 10 (dumbbells) → 3 sets, 1560 kg, warmup excluded", () => {
    const sets = [set("10", "12", { setType: "warmup" }), set("26", "10"), set("26", "10"), set("26", "10")];
    const t = exerciseTotals(sets, DB_PAIR);
    assert.equal(t.workingSets, 3);
    assert.equal(t.warmupSets, 1);
    assert.equal(t.volumeKg, 1560);
    assert.equal(t.reps, 30);
    assert.equal(setVolumeKg(sets[0], DB_PAIR), 0);
  });
  test("PE-06: plan 8–10, a completed set 26 kg × 6 counts for sets and volume", () => {
    const t = exerciseTotals([set("26", "6")], DB_PAIR);
    assert.equal(t.workingSets, 1);
    assert.equal(t.progressSets, 1);
    assert.equal(t.volumeKg, 312);
  });
  test("PE-07: pull-ups 8, 8, 7 without load → 0 kg classic volume, 23 reps, 3 sets, main unit reps", () => {
    const t = exerciseTotals([set("", "8"), set("", "8"), set("", "7")], BW);
    assert.equal(t.volumeKg, 0);
    assert.equal(t.volumeStatus, "none");
    assert.equal(t.reps, 23);
    assert.equal(t.workingSets, 3);
    assert.equal(t.unit, "reps");
    assert.equal(t.topExternalKg, null);
  });
  test("PE-08 (volume part): pull-up +10 kg × 8 → 80 kg; body mass never added", () => {
    const t = exerciseTotals([set("10", "8", { bodyweightKg: 82 })], BW_PLUS);
    assert.equal(t.volumeKg, 80);
    assert.equal(t.topExternalKg, 10);
    assert.equal(t.unit, "kg");
  });
  test("PE-18a: single-arm row 26 kg × 10 per side → 520 kg, 10 per side, ONE set", () => {
    const n = normalizeLoad(set("26", "10"), DB_SINGLE_UNI);
    assert.equal(n.volumeKg, 520);
    assert.equal(n.repsPerSide, 10);
    assert.equal(n.repsAllSides, 20);
    const t = exerciseTotals([set("26", "10")], DB_SINGLE_UNI);
    assert.equal(t.workingSets, 1);
    assert.equal(t.volumeKg, 520);
  });
  test("PE-18b: alternating lunges 20 reps → 20 in total, 10 per side, ONE set", () => {
    const n = normalizeLoad(set("", "20"), M("bodyweight", { laterality: "alternating" }));
    assert.equal(n.reps, 20);
    assert.equal(n.repsPerSide, 10);
    assert.equal(n.repsAllSides, 20);
    const t = exerciseTotals([set("", "20")], M("bodyweight", { laterality: "alternating" }));
    assert.equal(t.workingSets, 1);
    assert.equal(t.reps, 20);
  });
});

describe("no double counting: implements and reps counting are separate (requirement 1)", () => {
  const cases = [
    // [model, kg typed, reps typed, expected volume, expected reps per side, expected reps all sides]
    ["barbell, bilateral", BARBELL, "100", "5", 500, null, 5],
    ["two dumbbells, bilateral", DB_PAIR, "20", "10", 400, null, 10],
    ["one dumbbell, bilateral (goblet)", M("dumbbell_single"), "20", "10", 200, null, 10],
    ["one dumbbell, unilateral per side", DB_SINGLE_UNI, "20", "10", 400, 10, 20],
    ["two dumbbells, unilateral per side (Bulgarian split squat)", DB_PAIR_UNI, "20", "10", 800, 10, 20],
    ["two dumbbells, alternating, reps in total (lunges)", DB_PAIR_ALT, "20", "20", 800, 10, 20],
    ["one kettlebell, alternating", M("kettlebell_single", { laterality: "alternating" }), "16", "20", 320, 10, 20],
    ["two kettlebells", M("kettlebell_pair"), "16", "10", 320, null, 10],
    ["cable, unilateral per side", M("cable", { laterality: "unilateral" }), "15", "12", 360, 12, 24],
    ["machine, unilateral counted in total", M("machine_stack", { laterality: "unilateral", repsCounting: "total" }), "40", "20", 800, 10, 20],
  ];
  for (const [name, model, kg, reps, vol, perSide, allSides] of cases) {
    test(name, () => {
      const n = normalizeLoad(set(kg, reps), model);
      assert.equal(n.volumeKg, vol);
      assert.equal(n.repsPerSide, perSide);
      assert.equal(n.repsAllSides, allSides);
      assert.equal(exerciseTotals([set(kg, reps)], model).workingSets, 1);
    });
  }
  test("a bilateral model never counts per side, even if asked to", () => {
    const m = normalizeModel(M("barbell_total", { repsCounting: "per_side" }));
    assert.equal(m.repsCounting, "total");
    assert.equal(setVolumeKg(set("100", "5"), m), 500);
  });
  test("implements only apply to per-implement models", () => {
    assert.equal(normalizeModel(M("barbell_total", { implements: 2 })).implements, 1);
    assert.equal(normalizeModel(M("dumbbell_single", { implements: 2 })).implements, 2);
    assert.equal(normalizeModel(M("dumbbell_pair", { implements: 0 })).implements, 2);
  });
});

describe("bodyweight, bodyweight_plus, assisted and band — each separately (requirement 3)", () => {
  test("bodyweight: typed kg ignored, body mass never in kg volume, reps count", () => {
    const sets = [set("80", "10", { bodyweightKg: 80 }), set("", "8")];
    const t = exerciseTotals(sets, BW);
    assert.equal(t.volumeKg, 0);
    assert.equal(t.volumeStatus, "none");
    assert.equal(t.reps, 18);
    assert.equal(t.workingSets, 2);
    assert.equal(normalizeLoad(sets[0], BW).externalKg, 0);
    assert.equal(hasClassicKg(BW), false);
  });
  test("bodyweight_plus: only the added load counts; a set without added kg is a plain bodyweight set", () => {
    const sets = [set("10", "8"), set("12,5", "6"), set("", "10")];
    const t = exerciseTotals(sets, BW_PLUS);
    assert.equal(t.volumeKg, 10 * 8 + 12.5 * 6);
    assert.equal(t.workingSets, 3);
    assert.equal(t.reps, 24);
    assert.equal(normalizeLoad(sets[2], BW_PLUS).isLoaded, false);
    assert.equal(t.topExternalKg, 12.5);
  });
  test("assisted: assistance is never load — 0 kg volume, assistKg kept apart, reps count", () => {
    const sets = [set("20", "8"), set("15", "6"), { assistKg: "25", reps: "5", setType: "working" }];
    const t = exerciseTotals(sets, ASSISTED);
    assert.equal(t.volumeKg, 0);
    assert.equal(t.volumeStatus, "none");
    assert.equal(t.reps, 19);
    assert.equal(t.minAssistKg, 15);
    assert.equal(t.topExternalKg, null);
    const n = normalizeLoad(sets[0], ASSISTED);
    assert.equal(n.assistKg, 20);
    assert.equal(n.externalKg, 0);
    assert.equal(n.isLoaded, false);
  });
  test("band (P1): 0 kg classic volume, typed resistance kept as info only, sets and reps count", () => {
    const sets = [set("15", "12"), set("15", "12")];
    const t = exerciseTotals(sets, BAND);
    assert.equal(t.volumeKg, 0);
    assert.equal(t.volumeStatus, "none");
    assert.equal(t.workingSets, 2);
    assert.equal(t.reps, 24);
    const n = normalizeLoad(sets[0], BAND);
    assert.equal(n.bandResistance, 15);
    assert.equal(n.externalKg, 0);
  });
});

describe("set roles (D5) and performed sets", () => {
  test("dropset counts for sets and volume, not for progression", () => {
    const sets = [set("26", "10"), set("18", "8", { setType: "dropset" })];
    const t = exerciseTotals(sets, DB_PAIR);
    assert.equal(t.workingSets, 2);
    assert.equal(t.dropsetSets, 1);
    assert.equal(t.progressSets, 1);
    assert.equal(t.volumeKg, 808);
    assert.equal(isProgressSet(sets[1], DB_PAIR), false);
    assert.equal(isWorkingSet(sets[1], DB_PAIR), true);
    assert.equal(t.topExternalKg, 52); // the dropset never sets the top load
  });
  test("roles: normal/working/missing → working; v2 skipped → skipped", () => {
    assert.equal(setRole({ setType: "normal" }), "working");
    assert.equal(setRole({ setType: "working" }), "working");
    assert.equal(setRole({}), "working");
    assert.equal(setRole({ setType: "warmup" }), "warmup");
    assert.equal(setRole({ setType: "dropset" }), "dropset");
    assert.equal(setRole({ setType: "normal", status: "skipped" }), "skipped");
    assert.equal(setRole(null), "skipped");
  });
  test("a skipped set with numbers counts nowhere", () => {
    const t = exerciseTotals([set("26", "10", { status: "skipped" }), set("26", "10")], DB_PAIR);
    assert.equal(t.workingSets, 1);
    assert.equal(t.skippedSets, 1);
    assert.equal(t.volumeKg, 520);
  });
  test("kg typed but no reps: not performed, 0 kg, flagged incomplete (today's finish() counted kg × 1)", () => {
    for (const reps of ["", null, undefined, "0", 0]) {
      const n = normalizeLoad(set("26", reps), DB_PAIR);
      assert.equal(n.performed, false);
      assert.equal(n.volumeKg, 0);
      assert.equal(n.incomplete, true);
    }
    const t = exerciseTotals([set("26", ""), set("26", "10")], DB_PAIR);
    assert.equal(t.incompleteSets, 1);
    assert.equal(t.workingSets, 1);
    assert.equal(t.volumeKg, 520);
  });
  test("an empty planned set is neither performed nor incomplete", () => {
    const n = normalizeLoad(set("", ""), DB_PAIR);
    assert.equal(n.performed, false);
    assert.equal(n.incomplete, false);
  });
  test("time, cardio and sets-only use their own performed test and have no kg", () => {
    assert.equal(isPerformed({ duration: "45" }, M("time")), true);
    assert.equal(isPerformed({ duration: "" }, M("time")), false);
    assert.equal(isPerformed({ duration: "600", distance: "2" }, M("cardio")), true);
    assert.equal(isPerformed({ done: true }, M("sets_only")), true);
    assert.equal(isPerformed({ weight: "3" }, M("sets_only")), true);
    assert.equal(isPerformed({ weight: "" }, M("sets_only")), false);
    const t = exerciseTotals([{ duration: "45", setType: "normal" }, { duration: "60", setType: "normal" }], M("time"));
    assert.deepEqual([t.unit, t.seconds, t.workingSets, t.volumeKg, t.volumeStatus], ["seconds", 105, 2, 0, "none"]);
    const c = exerciseTotals([{ duration: "600" }], M("cardio"));
    assert.deepEqual([c.unit, c.seconds, c.volumeKg], ["cardio", 600, 0]);
  });
});

describe("missing RIR (D4)", () => {
  test("missing RIR changes neither sets nor volume and assumes no value", () => {
    const sets = [set("26", "10"), set("26", "10", { rir: "" }), set("26", "10", { rir: null })];
    const t = exerciseTotals(sets, DB_PAIR);
    assert.equal(t.workingSets, 3);
    assert.equal(t.volumeKg, 1560);
    assert.equal(t.rirMissingSets, 2);
    const n = normalizeLoad(sets[1], DB_PAIR);
    assert.equal(n.rir, null);
    assert.equal(n.rirKnown, false);
  });
  test("legacy numeric RIR and model categories are known", () => {
    for (const rir of [0, 3, "0", "0-1", "1-2", "2"]) assert.equal(normalizeLoad(set("26", "10", { rir }), DB_PAIR).rirKnown, true);
  });
});

describe("parsing typed numbers", () => {
  test("57,5 and 57.5 are the same", () => {
    assert.equal(parseKg("57,5"), 57.5);
    assert.equal(parseKg("57.5"), 57.5);
    assert.equal(parseKg(" 57,5 "), 57.5);
    assert.equal(parseKg(57.5), 57.5);
    assert.equal(setVolumeKg(set("57,5", "10"), BARBELL), 575);
  });
  test("negative, text, NaN, Infinity, empty → null and 0 kg, never an exception", () => {
    for (const v of ["-5", -5, "abc", "12kg", NaN, Infinity, -Infinity, "", null, undefined, {}, [], "1e3"]) {
      assert.equal(parseKg(v), null, String(v));
      assert.equal(setVolumeKg(set(v, "10"), BARBELL), 0);
    }
    assert.equal(parseReps("-3"), null);
    assert.equal(normalizeLoad(set("50", "-3"), BARBELL).performed, false);
  });
  test("v2 fields (loadKg, setType working) and today's fields give the same result", () => {
    const today = [set("26", "10"), set("18", "8", { setType: "dropset" })];
    const v2 = [{ loadKg: 26, reps: 10, rir: "0-1", setType: "working", status: "done" }, { loadKg: 18, reps: 8, rir: "0-1", setType: "dropset", status: "done" }];
    assert.deepEqual(exerciseTotals(v2, DB_PAIR), exerciseTotals(today, DB_PAIR));
  });
  test("inputs are never mutated", () => {
    const sets = [set("26", "10"), set("18", "8", { setType: "dropset" })];
    const copy = JSON.parse(JSON.stringify(sets));
    exerciseTotals(sets, DB_PAIR);
    normalizeLoad(sets[0], DB_PAIR);
    assert.deepEqual(sets, copy);
  });
});

describe("uncertain models (requirement 2)", () => {
  test("confidence low → volume given as estimated, never as exact", () => {
    const t = exerciseTotals([set("20", "10")], { loadModel: "dumbbell_pair", confidence: "low", source: "inferred" });
    assert.equal(t.volumeKg, 400);
    assert.equal(t.volumeStatus, "estimated");
  });
  test("confidence unknown → no kg volume at all (null, unavailable); sets and reps still count", () => {
    const m = { loadModel: "external_unknown", confidence: "unknown", source: "none" };
    const t = exerciseTotals([set("20", "10"), set("20", "8")], m);
    assert.equal(t.volumeKg, null);
    assert.equal(t.volumeStatus, "unavailable");
    assert.equal(t.workingSets, 2);
    assert.equal(t.reps, 18);
    assert.equal(setVolumeKg(set("20", "10"), m), null);
  });
  test("an unrecognised or missing model is unknown, never guessed", () => {
    for (const m of [null, undefined, {}, { loadModel: "spaceship", confidence: "verified" }]) {
      const n = normalizeModel(m);
      assert.equal(n.confidence, "unknown");
      assert.equal(n.loadModel, "external_unknown");
    }
  });
  test("models without classic kg stay certain (0 kg) even with low confidence", () => {
    const t = exerciseTotals([set("", "8")], { loadModel: "bodyweight", confidence: "low" });
    assert.equal(t.volumeKg, 0);
    assert.equal(t.volumeStatus, "none");
  });
});

describe("sessionTotals", () => {
  const MODELS = { bench: BARBELL, db_press: DB_PAIR, pullup: BW, plank: M("time"), own_db: { loadModel: "dumbbell_pair", confidence: "low" }, gone: { loadModel: "external_unknown", confidence: "unknown" } };
  const resolve = (ex) => MODELS[ex.exerciseId];
  const mixed = {
    exercises: [
      { exerciseId: "bench", sets: [set("60", "8"), set("60", "8")] },
      { exerciseId: "db_press", sets: [set("10", "12", { setType: "warmup" }), set("26", "10"), set("18", "8", { setType: "dropset" })] },
      { exerciseId: "pullup", sets: [set("", "8"), set("", "7")] },
      { exerciseId: "plank", sets: [{ duration: "60" }] },
    ],
  };
  test("a mixed session = the sum of its exercises", () => {
    const s = sessionTotals(mixed, resolve);
    const sum = (k) => s.exercises.reduce((a, e) => a + (e.totals[k] ?? 0), 0);
    assert.equal(s.volumeKg, 960 + 808);
    assert.equal(s.volumeKg, sum("volumeKg"));
    assert.equal(s.workingSets, 7);
    assert.equal(s.workingSets, sum("workingSets"));
    assert.equal(s.reps, 16 + 18 + 15);
    assert.equal(s.seconds, 60);
    assert.equal(s.volumeStatus, "exact");
  });
  test("an estimated exercise makes the session estimated; an unknown one makes it partial", () => {
    const est = sessionTotals({ exercises: [...mixed.exercises, { exerciseId: "own_db", sets: [set("20", "10")] }] }, resolve);
    assert.equal(est.volumeStatus, "estimated");
    const part = sessionTotals({ exercises: [...mixed.exercises, { exerciseId: "gone", sets: [set("20", "10")] }] }, resolve);
    assert.equal(part.volumeStatus, "partial");
    assert.equal(part.volumeKg, 960 + 808); // the unknown exercise is left out, not guessed
  });
  test("an exercise with only unperformed sets does not affect the status", () => {
    const s = sessionTotals({ exercises: [...mixed.exercises, { exerciseId: "gone", sets: [set("20", "")] }] }, resolve);
    assert.equal(s.volumeStatus, "exact");
  });
  test("bodyweight only → status none; empty or malformed session → zeros", () => {
    assert.equal(sessionTotals({ exercises: [mixed.exercises[2]] }, resolve).volumeStatus, "none");
    for (const bad of [null, undefined, {}, { exercises: null }]) {
      const s = sessionTotals(bad, resolve);
      assert.deepEqual([s.volumeKg, s.workingSets, s.volumeStatus], [0, 0, "none"]);
    }
  });
});

describe("PE-A safety: no screen uses load.js before A5", () => {
  test("src/engine/index.js does not export load.js and no src/app file imports it", () => {
    const index = readFileSync(resolve(root, "src/engine/index.js"), "utf8");
    // I3: the only load-related exports are the snapshot validator and the nr1 plan/snapshot contracts —
    // never load.js itself (normalizeLoad, sessionTotals, … stay out of the app until A5)
    const loadLines = index.split("\n").filter((l) => /load/.test(l) && !l.startsWith("//"));
    assert.deepEqual(loadLines, [
      'export { validateLoadSnapshot } from "./load-snapshot.js";',
      'export { resolvePlanItemLoadModel, LOAD_MODEL_CHOICE_LABELS } from "../nr1/contracts/plan-load-model.js";',
    ]);
    assert.doesNotMatch(index, /["']\.\/load\.js["']/);
    for (const f of readdirSync(resolve(root, "src/app"))) {
      if (f.endsWith(".jsx")) assert.doesNotMatch(readFileSync(resolve(root, "src/app", f), "utf8"), /engine\/load|load-legacy-map/, f);
    }
  });
  test("every load model declares its kg meaning and unit; formula version is 1", () => {
    assert.equal(VOLUME_FORMULA_VERSION, 1);
    for (const [k, v] of Object.entries(LOAD_MODELS)) {
      assert.ok(["total", "per_implement", "added", "plates", "assist", "resistance", "none"].includes(v.kg), k);
      assert.ok(["kg", "reps", "seconds", "cardio", "sets"].includes(v.unit), k);
    }
  });
});
