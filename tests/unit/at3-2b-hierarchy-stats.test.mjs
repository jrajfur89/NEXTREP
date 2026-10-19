// AT3.2b — hierarchy (AT3-D16), snapshot v2 (AT3-D18) and muscle work (AT3-D17).
// Acceptance tests T1–T16 of NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md v2 §11, on the published Batch 01 and
// src/atlas/navigation.json. "P" = primary work, "S" = secondary work.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHierarchy, buildHierarchyIndex } from "../../src/engine/hierarchy.js";
import { aggregateMuscleWork } from "../../src/engine/muscle-stats.js";
import { buildLoadSnapshot, validateLoadSnapshot, modelFromSnapshot } from "../../src/engine/load-snapshot.js";
import { sessionTotals } from "../../src/engine/load.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ATLAS = JSON.parse(readFileSync(resolve(ROOT, "src/atlas/atlas.json"), "utf8"));
const NAV = JSON.parse(readFileSync(resolve(ROOT, "src/atlas/navigation.json"), "utf8"));
const H = buildHierarchyIndex(NAV);
const byId = new Map(ATLAS.exercises.map((e) => [e.exerciseId, e]));
const NOW = "2026-10-18T10:00:00.000Z";
const clone = (x) => structuredClone(x);

let seq = 0;
const S = (weight, reps, extra = {}) => ({ id: `s${++seq}`, weight: String(weight), reps: String(reps), setType: "normal", rir: "1", ...extra });
const T = (seconds, extra = {}) => ({ id: `s${++seq}`, duration: String(seconds), setType: "normal", ...extra });
const atlasEntry = (id, sets) => ({ catalogExerciseId: id, loadSnapshot: buildLoadSnapshot({ exercise: byId.get(id), atlasVersion: ATLAS.atlasVersion, now: NOW }), sets });
const privateEntry = (n, fields, sets) => {
  const privateExerciseId = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return { privateExerciseId, loadSnapshot: buildLoadSnapshot({ privateExercise: { privateExerciseId, laterality: "bilateral", repsCounting: "total", secondaryMuscles: [], ...fields }, now: NOW }), sets };
};
const run = (...entries) => aggregateMuscleWork({ exercises: entries }, H);
const w = (r, kind, level, code) => r[kind][level][code];
const sk = (x) => (x ? [x.sets, x.volumeKg] : null);

// T1 / T2 building blocks
const squat = () => atlasEntry("squat_barbell_back", [S(100, 5), S(100, 5), S(100, 5)]);
const frontSquat = () => atlasEntry("squat_barbell_front", [S(80, 5), S(80, 5)]);

describe("AT3.2b — navigation.json: exactly the hierarchy of spec §3.2", () => {
  test("6 muscle categories + cardio without sub-regions, 18 sub-regions, hierarchyVersion 1", () => {
    assert.equal(NAV.hierarchyVersion, 1);
    assert.deepEqual(NAV.categories.map((c) => [c.code, c.labelPl, c.kind]), [
      ["chest", "Klatka piersiowa", "muscle"], ["back", "Plecy", "muscle"], ["shoulders", "Barki", "muscle"],
      ["arms", "Ramiona", "muscle"], ["core", "Brzuch i core", "muscle"], ["legs", "Nogi", "muscle"],
      ["cardio", "Cardio i kondycja", "conditioning"],
    ]);
    const subs = NAV.categories.flatMap((c) => c.subregions.map((s) => s.code));
    assert.deepEqual(subs, [
      "chest.pectorals", "back.lats", "back.upper", "back.lower", "shoulders.front", "shoulders.side", "shoulders.rear",
      "arms.biceps", "arms.triceps", "arms.forearms", "core.abs", "core.obliques",
      "legs.quads", "legs.hamstrings", "legs.glutes", "legs.adductors", "legs.hip_flexors", "legs.calves",
    ]);
    assert.deepEqual(NAV.categories.find((c) => c.code === "cardio").subregions, []);
  });

  test("all 19 Batch 01 muscle codes have exactly the sub-region of the spec", () => {
    const want = {
      pectoralis_major: "chest.pectorals", latissimus_dorsi: "back.lats", trapezius: "back.upper", erector_spinae: "back.lower",
      deltoid_anterior: "shoulders.front", deltoid_lateral: "shoulders.side", deltoid_posterior: "shoulders.rear",
      biceps_brachii: "arms.biceps", brachialis: "arms.biceps", triceps_brachii: "arms.triceps", brachioradialis: "arms.forearms",
      rectus_abdominis: "core.abs", transversus_abdominis: "core.abs", obliques: "core.obliques",
      quadriceps: "legs.quads", biceps_femoris: "legs.hamstrings", gluteus_maximus: "legs.glutes",
      adductor_magnus: "legs.adductors", hip_flexors: "legs.hip_flexors",
    };
    assert.deepEqual(ATLAS.dictionaries.muscles.map((m) => m.code).sort(), Object.keys(want).sort());
    for (const [m, s] of Object.entries(want)) assert.equal(H.subregionOf(m), s, m);
    assert.equal(H.subregionOf("gastrocnemius"), null);
  });

  test("legs.calves stays empty; the 4 planned codes are planned only and absent from the atlas dictionary", () => {
    const sub = (code) => NAV.categories.flatMap((c) => c.subregions).find((s) => s.code === code);
    assert.deepEqual(sub("legs.calves").muscles, []);
    const planned = Object.fromEntries(NAV.categories.flatMap((c) => c.subregions).flatMap((s) => s.plannedMuscles.map((m) => [m, s.code])));
    assert.deepEqual(planned, { rhomboids: "back.upper", gluteus_medius: "legs.glutes", gastrocnemius: "legs.calves", soleus: "legs.calves" });
    const dict = ATLAS.dictionaries.muscles.map((m) => m.code);
    for (const m of Object.keys(planned)) assert.ok(!dict.includes(m), m);
  });

  test("the hierarchy is valid with Batch 01 (0 errors; info: legs.calves empty)", () => {
    const r = validateHierarchy(NAV, { atlas: ATLAS, previous: NAV });
    assert.deepEqual(r.issues.filter((i) => i.level !== "info"), []);
    assert.deepEqual(r.issues.map((i) => [i.code, i.node]), [["SUBREGION_EMPTY", "legs.calves"]]);
    assert.equal(r.ok, true);
  });
});

describe("AT3.2b — T1–T13: aggregation (AT3-D17)", () => {
  test("T1 squat: quads + glutes primary, legs counted once; secondary kept although legs has primary work", () => {
    const r = run(squat());
    for (const code of ["legs.quads", "legs.glutes"]) assert.deepEqual(sk(w(r, "primary", "subregions", code)), [3, 1500], code);
    assert.deepEqual(sk(w(r, "primary", "categories", "legs")), [3, 1500]); // not 6 / 3000
    assert.deepEqual(sk(w(r, "secondary", "subregions", "legs.adductors")), [3, 1500]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "legs")), [3, 1500]);
    assert.deepEqual(sk(w(r, "secondary", "subregions", "back.lower")), [3, 1500]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "back")), [3, 1500]);
    for (const m of ["quadriceps", "gluteus_maximus"]) assert.deepEqual(sk(w(r, "primary", "muscles", m)), [3, 1500]);
    for (const m of ["adductor_magnus", "erector_spinae"]) assert.deepEqual(sk(w(r, "secondary", "muscles", m)), [3, 1500]);
    assert.deepEqual([r.workout.workingSets, r.workout.volumeKg, r.workout.volumeStatus], [3, 1500, "exact"]);
    assert.equal(w(r, "primary", "categories", "back"), undefined);
  });

  test("T2 two exercises in the same node", () => {
    const r = run(squat(), frontSquat());
    for (const code of ["legs.quads", "legs.glutes"]) assert.deepEqual(sk(w(r, "primary", "subregions", code)), [5, 2300]);
    assert.deepEqual(sk(w(r, "primary", "categories", "legs")), [5, 2300]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "legs")), [3, 1500]);
    assert.deepEqual(sk(w(r, "secondary", "subregions", "legs.adductors")), [3, 1500]);
    assert.deepEqual(sk(w(r, "secondary", "subregions", "back.lower")), [5, 2300]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "back")), [5, 2300]);
    assert.deepEqual(sk(w(r, "secondary", "subregions", "core.abs")), [2, 800]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "core")), [2, 800]);
    assert.deepEqual([r.workout.workingSets, r.workout.volumeKg], [5, 2300]);
  });

  test("T3 two primary muscles in one sub-region (curl, dumbbell pair)", () => {
    const r = run(atlasEntry("curl_dumbbell_pair_standing", [S(12, 10), S(12, 10)]));
    assert.deepEqual(sk(w(r, "primary", "subregions", "arms.biceps")), [2, 480]); // not 4 / 960
    assert.deepEqual(sk(w(r, "primary", "categories", "arms")), [2, 480]);
    assert.deepEqual(sk(w(r, "secondary", "subregions", "arms.forearms")), [2, 480]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "arms")), [2, 480]);
    for (const m of ["biceps_brachii", "brachialis"]) assert.deepEqual(sk(w(r, "primary", "muscles", m)), [2, 480]);
  });

  test("T4 primary muscles in two categories: each node full, the workout total once", () => {
    const r = run(privateEntry(4, { loadModel: "barbell_total", measurementType: "weight_reps", primaryMuscles: ["quadriceps", "deltoid_anterior"] }, [S(40, 10), S(40, 10)]));
    for (const code of ["legs.quads", "shoulders.front"]) assert.deepEqual(sk(w(r, "primary", "subregions", code)), [2, 800]);
    for (const code of ["legs", "shoulders"]) assert.deepEqual(sk(w(r, "primary", "categories", code)), [2, 800]);
    assert.deepEqual([r.workout.workingSets, r.workout.volumeKg], [2, 800]); // not 1600
  });

  test("T5 secondary muscles in other categories (bench press)", () => {
    const r = run(atlasEntry("bench_press_barbell_flat", [S(80, 8), S(80, 8), S(80, 8)]));
    assert.deepEqual(sk(w(r, "primary", "subregions", "chest.pectorals")), [3, 1920]);
    assert.deepEqual(sk(w(r, "primary", "categories", "chest")), [3, 1920]);
    for (const [l, c] of [["subregions", "arms.triceps"], ["categories", "arms"], ["subregions", "shoulders.front"], ["categories", "shoulders"]]) assert.deepEqual(sk(w(r, "secondary", l, c)), [3, 1920], c);
  });

  test("T6 pull-ups without kg: sets and reps, volume status none", () => {
    const r = run(atlasEntry("pullup_pronated_bodyweight", [S("", 8), S("", 8), S("", 7)]));
    const p = w(r, "primary", "categories", "back");
    assert.deepEqual([p.sets, p.reps, p.volumeStatus, p.volumeKg], [3, 23, "none", 0]);
    assert.deepEqual([w(r, "primary", "subregions", "back.lats").sets, w(r, "primary", "subregions", "back.lats").reps], [3, 23]);
    for (const [l, c] of [["subregions", "back.upper"], ["categories", "back"], ["subregions", "arms.biceps"], ["categories", "arms"]]) {
      assert.deepEqual([w(r, "secondary", l, c).sets, w(r, "secondary", l, c).reps], [3, 23], c); // biceps + brachialis → arms.biceps once
    }
  });

  test("T7 unilateral row: 520 kg (PE-18), reps per side 10, all sides 20", () => {
    const r = run(atlasEntry("row_dumbbell_single_bench_supported", [S(26, 10)]));
    const p = w(r, "primary", "subregions", "back.lats");
    assert.deepEqual([p.sets, p.volumeKg, p.reps, p.repsAllSides], [1, 520, 10, 20]);
    assert.deepEqual(sk(w(r, "primary", "categories", "back")), [1, 520]);
    for (const [l, c] of [["subregions", "back.upper"], ["categories", "back"], ["subregions", "shoulders.rear"], ["categories", "shoulders"], ["subregions", "arms.biceps"], ["categories", "arms"]]) assert.deepEqual(sk(w(r, "secondary", l, c)), [1, 520], c);
  });

  test("T8 private with the unknown model: kg of the others kept, status partial", () => {
    const r = run(squat(), privateEntry(8, { loadModel: null, primaryMuscles: ["quadriceps"] }, [S(50, 10), S(50, 10)]));
    for (const code of ["legs.quads"]) {
      const x = w(r, "primary", "subregions", code);
      assert.deepEqual([x.sets, x.volumeKg, x.volumeStatus], [5, 1500, "partial"]);
    }
    const legs = w(r, "primary", "categories", "legs");
    assert.deepEqual([legs.sets, legs.volumeKg, legs.volumeStatus], [5, 1500, "partial"]);
    assert.equal(w(r, "primary", "subregions", "legs.glutes").volumeStatus, "exact");
    assert.equal(r.workout.volumeStatus, "partial");
  });

  test("T9 missing snapshot: no node, counted as a fault with a warning (F2-4); T1 unchanged", () => {
    const t1 = run(squat());
    const r = run(squat(), { catalogExerciseId: "bench_press_barbell_flat", sets: [S(80, 8), S(80, 8), S(80, 8)] });
    assert.deepEqual(r.primary, t1.primary);
    assert.deepEqual(r.secondary, t1.secondary);
    assert.equal(r.faults.missingSnapshot, 1);
    assert.equal(r.faults.warnings.length, 1);
    assert.equal(r.faults.warnings[0].exerciseId, "bench_press_barbell_flat");
    // a version-1 / invalid snapshot is the same fault
    const bad = squat();
    bad.loadSnapshot = { ...bad.loadSnapshot, snapshotVersion: 1 };
    assert.equal(run(bad).faults.missingSnapshot, 1);
  });

  test("T10 timed strength exercise: seconds, no kg, not cardio", () => {
    const r = run(atlasEntry("plank_forearm", [T(60), T(60), T(60)]));
    for (const [l, c] of [["subregions", "core.abs"], ["categories", "core"]]) {
      const x = w(r, "primary", l, c);
      assert.deepEqual([x.sets, x.seconds, x.volumeKg, x.volumeStatus], [3, 180, 0, "none"], c);
    }
    for (const [l, c] of [["subregions", "core.obliques"], ["categories", "core"], ["subregions", "legs.glutes"], ["categories", "legs"]]) assert.deepEqual([w(r, "secondary", l, c).sets, w(r, "secondary", l, c).seconds], [3, 180], c);
    assert.equal(r.cardio.entries, 0);
  });

  test("T11 cardio: no muscle node, also with informational muscles (O-30, P3)", () => {
    const cardio = (n, muscles) => privateEntry(n, { measurementType: "cardio", loadModel: "cardio", primaryMuscles: muscles }, [T(1800)]);
    const r = run(cardio(11, []), cardio(12, ["quadriceps"]));
    assert.equal(r.cardio.entries, 2);
    for (const kind of ["primary", "secondary"]) for (const level of ["categories", "subregions", "muscles"]) assert.deepEqual(r[kind][level], {}, `${kind}.${level}`);
    assert.equal(r.faults.missingSnapshot, 0);
  });

  test("T12 duplicate set id: each node counts it once; the duplicate is reported", () => {
    const e = squat();
    e.sets = [e.sets[0], { ...e.sets[0] }, e.sets[1]]; // the first set twice
    const r = run(e);
    assert.deepEqual(sk(w(r, "primary", "categories", "legs")), [2, 1000]);
    assert.deepEqual(sk(w(r, "secondary", "categories", "back")), [2, 1000]);
    assert.deepEqual(r.faults.duplicateSetIds, [e.sets[0].id]);
    // the same set id in two exercises is counted once in a shared node
    const a = squat();
    const b = frontSquat();
    b.sets[0] = { ...b.sets[0], id: a.sets[0].id };
    const r2 = run(a, b);
    assert.deepEqual(w(r2, "primary", "categories", "legs").sets, 4);
    assert.deepEqual(r2.faults.duplicateSetIds, [a.sets[0].id]);
  });

  test("T13 hanging_knee_raise from the atlas (R-AT3-1): core primary, no legs.glutes / hamstrings", () => {
    const r = run(atlasEntry("hanging_knee_raise", [S("", 12), S("", 12), S("", 12)]));
    assert.deepEqual([w(r, "primary", "subregions", "core.abs").sets, w(r, "primary", "subregions", "core.abs").reps], [3, 36]);
    assert.deepEqual([w(r, "primary", "categories", "core").sets, w(r, "primary", "categories", "core").reps], [3, 36]);
    assert.ok(w(r, "secondary", "subregions", "core.obliques"));
    assert.ok(w(r, "secondary", "subregions", "legs.hip_flexors"));
    assert.ok(w(r, "secondary", "categories", "legs"));
    for (const kind of ["primary", "secondary"]) for (const code of ["legs.glutes", "legs.hamstrings"]) assert.equal(w(r, kind, "subregions", code), undefined, `${kind} ${code}`);
    assert.equal(w(r, "primary", "categories", "legs"), undefined);
  });
});

describe("AT3.2b — T14: hierarchy validator", () => {
  test("T14 four faults → four errors: muscle in two sub-regions, muscle without sub-region, unknown code, removed node code", () => {
    const previous = clone(NAV);
    previous.categories.find((c) => c.code === "back").subregions.push({ code: "back.middle", labelPl: "Środek pleców", muscles: [], plannedMuscles: [] });
    previous.issuedNodeCodes.push("back.middle");
    const h = clone(NAV);
    h.hierarchyVersion = 2;
    const sub = (code) => h.categories.flatMap((c) => c.subregions).find((s) => s.code === code);
    sub("legs.glutes").muscles.push("quadriceps"); // also in legs.quads
    sub("core.obliques").muscles = []; // obliques loses its sub-region
    sub("arms.triceps").muscles.push("anconeus_x"); // not in the atlas
    const r = validateHierarchy(h, { atlas: ATLAS, previous }); // back.middle was issued before
    const errors = r.issues.filter((i) => i.level === "error").map((i) => i.code).sort();
    assert.deepEqual(errors, ["MUSCLE_MULTIPLE_SUBREGIONS", "MUSCLE_UNKNOWN", "MUSCLE_WITHOUT_SUBREGION", "NODE_REMOVED"]);
    assert.equal(r.ok, false);
  });

  test("stable node codes and versions", () => {
    const codes = (h, opts) => validateHierarchy(h, { atlas: ATLAS, ...opts }).issues.filter((i) => i.level === "error").map((i) => i.code);
    const renamed = clone(NAV);
    renamed.categories[0].subregions[0].code = "chest.pecs";
    assert.deepEqual(codes(renamed).sort(), ["NODE_NOT_ISSUED", "NODE_REMOVED"]);
    const issuedDropped = clone(NAV);
    issuedDropped.issuedNodeCodes = issuedDropped.issuedNodeCodes.filter((c) => c !== "legs.calves");
    assert.deepEqual(codes(issuedDropped, { previous: NAV }).sort(), ["HIERARCHY_VERSION_NOT_BUMPED", "NODE_NOT_ISSUED", "NODE_REMOVED"]);
    const changed = clone(NAV);
    changed.categories[0].subregions[0].labelPl = "Mięśnie piersiowe";
    assert.deepEqual(codes(changed, { previous: NAV }), ["HIERARCHY_VERSION_NOT_BUMPED"]);
    changed.hierarchyVersion = 2;
    assert.deepEqual(codes(changed, { previous: NAV }), []);
    const older = clone(NAV);
    older.hierarchyVersion = 0;
    assert.ok(codes(older).includes("HIERARCHY_VERSION"));
  });

  test("structure rules: cardio without sub-regions, one conditioning category, sub-region prefix, planned codes", () => {
    const codes = (h) => validateHierarchy(h, { atlas: ATLAS }).issues.filter((i) => i.level === "error").map((i) => i.code);
    const cardioSubs = clone(NAV);
    cardioSubs.categories[6].subregions = [{ code: "cardio.run", labelPl: "Bieg", muscles: [], plannedMuscles: [] }];
    cardioSubs.issuedNodeCodes.push("cardio.run");
    assert.deepEqual(codes(cardioSubs), ["CONDITIONING_SUBREGIONS"]);
    const prefix = clone(NAV);
    prefix.categories[1].subregions[0].code = "legs.lats";
    prefix.issuedNodeCodes = prefix.issuedNodeCodes.map((c) => (c === "back.lats" ? "legs.lats" : c));
    assert.deepEqual(codes(prefix), ["SUBREGION_CODE_PREFIX"]);
    const plannedInAtlas = clone(ATLAS);
    plannedInAtlas.dictionaries.muscles.push({ ...plannedInAtlas.dictionaries.muscles[0], code: "soleus" });
    assert.deepEqual(validateHierarchy(NAV, { atlas: plannedInAtlas }).issues.filter((i) => i.level === "error").map((i) => i.code).sort(), ["MUSCLE_WITHOUT_SUBREGION", "PLANNED_MUSCLE_IN_ATLAS"]);
    const noCardio = clone(NAV);
    noCardio.categories.pop();
    noCardio.issuedNodeCodes.pop();
    assert.deepEqual(codes(noCardio), ["CONDITIONING_CATEGORY_COUNT"]);
    assert.deepEqual(validateHierarchy(null).issues.map((i) => i.code), ["HIERARCHY_MISSING"]);
  });
});

describe("AT3.2b — T15: the workout total is independent of the nodes", () => {
  test("T15 every node ≤ the workout; the total is sessionTotals; hierarchyVersion reported", () => {
    const entries = [
      squat(), frontSquat(),
      atlasEntry("curl_dumbbell_pair_standing", [S(12, 10), S(12, 10)]),
      privateEntry(15, { loadModel: "barbell_total", measurementType: "weight_reps", primaryMuscles: ["quadriceps", "deltoid_anterior"] }, [S(40, 10), S(40, 10)]),
      atlasEntry("bench_press_barbell_flat", [S(80, 8), S(80, 8), S(80, 8)]),
      atlasEntry("pullup_pronated_bodyweight", [S("", 8), S("", 8), S("", 7)]),
      atlasEntry("row_dumbbell_single_bench_supported", [S(26, 10)]),
      privateEntry(16, { loadModel: null, primaryMuscles: ["quadriceps"] }, [S(50, 10), S(50, 10)]),
      { catalogExerciseId: "lunge_dumbbell_pair_stationary", sets: [S(20, 10)] },
      atlasEntry("plank_forearm", [T(60), T(60), T(60)]),
    ];
    const r = run(...entries);
    const expected = sessionTotals({ exercises: entries }, (e) => (e.loadSnapshot ? modelFromSnapshot(e.loadSnapshot) : null));
    delete expected.exercises;
    assert.deepEqual(r.workout, expected);
    for (const kind of ["primary", "secondary"]) for (const level of ["categories", "subregions", "muscles"]) for (const [code, x] of Object.entries(r[kind][level])) {
      assert.ok(x.sets <= r.workout.workingSets, `${kind}.${level}.${code}`);
    }
    const sumOfCategories = Object.values(r.primary.categories).reduce((a, x) => a + x.sets, 0);
    assert.ok(sumOfCategories > r.workout.workingSets, `categories overlap (T4): ${sumOfCategories} > ${r.workout.workingSets}, so a workout is never their sum`);
    assert.equal(r.hierarchyVersion, 1);
    assert.equal(r.faults.missingSnapshot, 1);
  });

  test("nodes are computed when read: a new hierarchy version changes grouping, not the stored snapshot", () => {
    const e = squat();
    const before = clone(e.loadSnapshot);
    const v2 = clone(NAV);
    v2.hierarchyVersion = 2;
    const sub = (code) => v2.categories.flatMap((c) => c.subregions).find((s) => s.code === code);
    sub("legs.adductors").muscles = [];
    sub("legs.quads").muscles.push("adductor_magnus");
    assert.equal(validateHierarchy(v2, { atlas: ATLAS, previous: NAV }).ok, true);
    const r = aggregateMuscleWork({ exercises: [e] }, buildHierarchyIndex(v2));
    assert.equal(r.hierarchyVersion, 2);
    assert.equal(r.secondary.subregions["legs.adductors"], undefined);
    assert.deepEqual(sk(r.secondary.subregions["legs.quads"]), [3, 1500]);
    assert.deepEqual(e.loadSnapshot, before);
  });

  test("a hierarchy index is required", () => {
    assert.throws(() => aggregateMuscleWork({ exercises: [] }, NAV), /hierarchy index required/);
    assert.deepEqual(run().workout.workingSets, 0);
  });
});

describe("AT3.2b — T16 and snapshot v2 (AT3-D18, B2)", () => {
  test("T16 a private exercise outside cardio without a primary muscle is refused by the snapshot contract", () => {
    const pid = "00000000-0000-4000-8000-000000000016";
    for (const fields of [{ measurementType: "weight_reps", loadModel: "barbell_total" }, { loadModel: null }, { measurementType: "time", loadModel: "time" }]) {
      assert.throws(() => buildLoadSnapshot({ privateExercise: { privateExerciseId: pid, laterality: "bilateral", repsCounting: "total", primaryMuscles: [], ...fields }, now: NOW }), /ws_primary_muscle/);
    }
    // the same snapshot with a primary muscle is valid; private cardio without muscles is allowed (C13)
    assert.ok(buildLoadSnapshot({ privateExercise: { privateExerciseId: pid, measurementType: "weight_reps", loadModel: "barbell_total", primaryMuscles: ["quadriceps"] }, now: NOW }));
    const cardio = buildLoadSnapshot({ privateExercise: { privateExerciseId: pid, measurementType: "cardio", loadModel: "cardio", primaryMuscles: [] }, now: NOW });
    assert.deepEqual(validateLoadSnapshot(cardio), []);
    // atlas snapshots follow the same rule
    const s = buildLoadSnapshot({ exercise: byId.get("squat_barbell_back"), atlasVersion: 1, now: NOW });
    assert.ok(validateLoadSnapshot({ ...s, primaryMuscles: [] }).some((e) => e.code === "ws_primary_muscle"));
  });

  test("snapshot v2: version 2, muscles frozen at save, no stats groups", () => {
    const ex = clone(byId.get("row_barbell_bent_over_pronated"));
    const s = buildLoadSnapshot({ exercise: ex, atlasVersion: 1, now: NOW });
    assert.equal(s.snapshotVersion, 3); // v3 since B02/S2 (Smith R columns); the v2 rules stay
    assert.ok(!("primaryGroups" in s) && !("secondaryGroups" in s));
    ex.primaryMuscles.push("biceps_brachii");
    ex.secondaryMuscles.length = 0;
    assert.deepEqual([s.primaryMuscles, s.secondaryMuscles], [["latissimus_dorsi", "trapezius"], ["biceps_brachii", "deltoid_posterior", "erector_spinae"]]);
    assert.ok(!("hierarchyVersion" in s), "the snapshot never stores nodes or the hierarchy version");
  });

  test("every Batch 01 exercise gives a valid snapshot v2 and its primary muscles reach a muscle category", () => {
    for (const e of ATLAS.exercises) {
      const s = buildLoadSnapshot({ exercise: e, atlasVersion: 1, now: NOW });
      assert.deepEqual(validateLoadSnapshot(s), [], e.exerciseId);
      const n = H.nodesForMuscles(s.primaryMuscles);
      assert.ok(n.categories.length >= 1 && n.unmapped.length === 0, e.exerciseId);
    }
  });
});
