// PE-A (A2) — transitional load models for today's exercises (src/engine/load-legacy-map.js).
// Representative cases of every load model and laterality, the exceptions, own and edited
// exercises with an explicit uncertainty state, and history entries whose exercise is gone.
// The final models come with the F2 atlas; these tests pin the transitional behaviour only.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "../harness/load-app.mjs";
import { exerciseTotals, sessionTotals, normalizeLoad } from "../../src/engine/load.js";
import { legacyLoadModel, inferLoadModel, loadModelFromKind, makeLegacyResolver, LEGACY_ATLAS_MODELS, legacyEquipmentKey } from "../../src/engine/load-legacy-map.js";
import { generate, EXCEPTIONS } from "../../tools/gen-legacy-load-map.mjs";
import { LEGACY_DEFAULT_EXERCISES } from "../fixtures/legacy/default-exercises.mjs"; // I2: the old list is test data now

let A;
let ATLAS;
before(async () => {
  A = await loadApp();
  ATLAS = new Map(LEGACY_DEFAULT_EXERCISES.map((e) => [e.id, e]));
});
const set = (weight, reps, extra = {}) => ({ weight, reps, rir: "0-1", setType: "normal", ...extra });
const pick = (m) => [m.loadModel, m.laterality, m.repsCounting, m.confidence, m.source];
const own = (equipment, extra = {}) => ({ id: "own-" + equipment.join("-"), name: "Własne", equipment, isTimeBased: false, isSetsOnly: false, ...extra });

describe("LEGACY_ATLAS_MODELS covers today's atlas exactly", () => {
  test("68 built-in exercises, one entry each, no extra ids", () => {
    assert.equal(LEGACY_DEFAULT_EXERCISES.length, 68);
    assert.deepEqual(Object.keys(LEGACY_ATLAS_MODELS).sort(), [...ATLAS.keys()].sort());
  });
  test("the committed map is exactly what tools/gen-legacy-load-map.mjs produces", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../../src/engine/load-legacy-map.js", import.meta.url), "utf8");
    assert.ok(src.includes(await generate(LEGACY_DEFAULT_EXERCISES)));
  });
  test("every built-in exercise gets a definite model with confidence high, none unknown", () => {
    for (const ex of LEGACY_DEFAULT_EXERCISES) {
      const m = legacyLoadModel(ex);
      assert.equal(m.source, "legacy-map", ex.id);
      assert.equal(m.confidence, "high", ex.id);
      assert.notEqual(m.loadModel, "external_unknown", ex.id);
    }
  });
  test("every exception names a real exercise", () => {
    for (const id of Object.keys(EXCEPTIONS)) assert.ok(ATLAS.has(id), id);
  });
});

describe("representative built-in exercises (every model and laterality)", () => {
  const expected = {
    squat_barbell: ["barbell_total", "bilateral", "total"],
    db_shoulder_press_seated: ["dumbbell_pair", "bilateral", "total"],
    db_row_single_arm: ["dumbbell_single", "unilateral", "per_side"],
    bulgarian_split_squat_db: ["dumbbell_pair", "unilateral", "per_side"],
    db_lunge: ["dumbbell_pair", "alternating", "total"],
    leg_press: ["plate_loaded", "bilateral", "total"],
    leg_curl_seated: ["machine_stack", "bilateral", "total"],
    lat_pulldown: ["cable", "bilateral", "total"],
    pullup: ["bodyweight", "bilateral", "total"],
    ab_wheel_rollout: ["bodyweight", "bilateral", "total"],
    bird_dog: ["bodyweight", "alternating", "total"],
    dips: ["bodyweight_plus", "bilateral", "total"],
    pullup_overhand_weighted: ["bodyweight_plus", "bilateral", "total"],
    pullup_band_assist: ["assisted", "bilateral", "total"],
    band_row: ["band", "bilateral", "total"],
    plank: ["time", "bilateral", "total"],
    weighted_plank: ["time", "bilateral", "total"],
    cardio_bike: ["cardio", "bilateral", "total"],
    farmers_walk: ["sets_only", "bilateral", "total"],
  };
  for (const [id, exp] of Object.entries(expected)) {
    test(id, () => assert.deepEqual(pick(legacyLoadModel(ATLAS.get(id))).slice(0, 3), exp));
  }
});

describe("PE-03 / PE-04 / PE-18 through the transitional map", () => {
  test("PE-03: Wyciskanie hantli siedząc 26 kg × 10 → 520 kg, exact", () => {
    const t = exerciseTotals([set("26", "10")], legacyLoadModel(ATLAS.get("db_shoulder_press_seated")));
    assert.deepEqual([t.volumeKg, t.volumeStatus], [520, "exact"]);
  });
  test("PE-04: Wyciskanie hantli na ławce skos 26×10 ×3 + 28×6 → 36 reps, 1896 kg", () => {
    const t = exerciseTotals([set("26", "10"), set("26", "10"), set("26", "10"), set("28", "6")], legacyLoadModel(ATLAS.get("db_incline_press_30")));
    assert.deepEqual([t.reps, t.volumeKg], [36, 1896]);
  });
  test("PE-18: Wiosłowanie jednorącz 26 × 10 per side → 520 kg; Wykroki z hantlami 20 reps → 10 per side", () => {
    const row = exerciseTotals([set("26", "10")], legacyLoadModel(ATLAS.get("db_row_single_arm")));
    assert.deepEqual([row.volumeKg, row.workingSets], [520, 1]);
    const lunge = normalizeLoad(set("12", "20"), legacyLoadModel(ATLAS.get("db_lunge")));
    assert.deepEqual([lunge.reps, lunge.repsPerSide, lunge.volumeKg], [20, 10, 480]);
  });
  test("Przysiad bułgarski: two dumbbells 20 kg × 10 per leg → 800 kg, one set (implements and sides counted once each)", () => {
    const t = exerciseTotals([set("20", "10")], legacyLoadModel(ATLAS.get("bulgarian_split_squat_db")));
    assert.deepEqual([t.volumeKg, t.workingSets, t.repsAllSides], [800, 1, 20]);
  });
  test("bands (P1), assisted pull-up and bodyweight: 0 kg; weighted pull-up: added kg only", () => {
    for (const id of ["band_row", "hip_abduction_band", "pullup_band_assist", "pullup", "pushup"]) {
      const t = exerciseTotals([set("15", "10")], legacyLoadModel(ATLAS.get(id)));
      assert.deepEqual([t.volumeKg, t.volumeStatus, t.reps], [0, "none", 10], id);
    }
    assert.equal(exerciseTotals([set("10", "8")], legacyLoadModel(ATLAS.get("pullup_overhand_weighted"))).volumeKg, 80);
  });
});

describe("own and edited exercises: explicit uncertainty (requirement 2)", () => {
  const cases = [
    // [equipment, extra, loadModel, confidence, volume status for 20 kg × 10]
    [["Sztanga"], {}, "barbell_total", "high", "exact"],
    [["Sztanga łamana"], {}, "barbell_total", "high", "exact"],
    [["Maszyny"], {}, "machine_stack", "high", "exact"],
    [["Hantle"], {}, "dumbbell_pair", "low", "estimated"],
    [["Kettlebell"], {}, "kettlebell_single", "low", "estimated"],
    [["Linki"], {}, "cable", "low", "estimated"],
    [["Masa ciała", "Obciążenie"], {}, "bodyweight_plus", "low", "estimated"],
    [["Drążek", "Obciążenie"], {}, "bodyweight_plus", "low", "estimated"],
    [["Masa ciała", "Hantle"], {}, "bodyweight_plus", "low", "estimated"],
    [["Obciążenie"], {}, "external_unknown", "low", "estimated"],
    [["Sztanga", "Hantle"], {}, "external_unknown", "unknown", "unavailable"],
    [["Inne"], {}, "external_unknown", "unknown", "unavailable"],
    [["Mój sprzęt"], {}, "external_unknown", "unknown", "unavailable"],
    [[], {}, "external_unknown", "unknown", "unavailable"],
    [["Masa ciała"], {}, "bodyweight", "high", "none"],
    [["Drążek", "Piłka"], {}, "bodyweight", "high", "none"],
    [["Gumy oporowe"], {}, "band", "high", "none"],
    [["Guma oporowa"], {}, "band", "high", "none"],
    [["Drążek", "Gumy oporowe"], {}, "assisted", "high", "none"],
    [["Hantle"], { isTimeBased: true }, "time", "high", "none"],
    [["Maszyny"], { isCardio: true }, "cardio", "high", "none"],
    [["Hantle"], { isSetsOnly: true }, "sets_only", "high", "none"],
  ];
  for (const [equipment, extra, loadModel, confidence, status] of cases) {
    test(`${equipment.join(" + ") || "(brak sprzętu)"}${Object.keys(extra).join("")} → ${loadModel}, ${confidence}, ${status}`, () => {
      const m = legacyLoadModel(own(equipment, extra));
      assert.deepEqual([m.loadModel, m.confidence, m.source], [loadModel, confidence, "inferred"]);
      assert.equal(exerciseTotals([set("20", "10", { duration: "30" })], m).volumeStatus, status);
    });
  }
  test("unavailable volume is null, never a number; sets and reps still count", () => {
    const t = exerciseTotals([set("20", "10"), set("20", "8")], legacyLoadModel(own(["Inne"])));
    assert.deepEqual([t.volumeKg, t.workingSets, t.reps], [null, 2, 18]);
  });
  test("a built-in exercise whose equipment the person changed is inferred again, not taken from the map", () => {
    const edited = { ...ATLAS.get("db_row_single_arm"), equipment: ["Hantle", "Masa ciała"] };
    assert.notEqual(legacyEquipmentKey(edited), LEGACY_ATLAS_MODELS.db_row_single_arm.key);
    const m = legacyLoadModel(edited);
    assert.deepEqual([m.source, m.confidence], ["inferred", "low"]);
    const timed = { ...ATLAS.get("squat_barbell"), isTimeBased: true };
    assert.equal(legacyLoadModel(timed).loadModel, "time");
  });
  test("equipment order and an equipment string instead of a list do not matter", () => {
    assert.equal(legacyEquipmentKey({ equipment: ["Obciążenie", "Masa ciała"] }), legacyEquipmentKey({ equipment: ["Masa ciała", "Obciążenie"] }));
    assert.equal(legacyLoadModel({ id: "x", equipment: "Sztanga" }).loadModel, "barbell_total");
    assert.equal(legacyLoadModel({ ...ATLAS.get("dips"), equipment: ["Obciążenie", "Masa ciała"] }).source, "legacy-map");
  });
  test("malformed input never throws", () => {
    for (const bad of [null, undefined, {}, { equipment: null }, { equipment: [null, "", 5] }]) {
      assert.doesNotThrow(() => legacyLoadModel(bad));
      assert.doesNotThrow(() => inferLoadModel(bad));
    }
  });
});

describe("history entries and the resolver", () => {
  test("an exercise that no longer exists falls back to the kind stored with the workout", () => {
    assert.deepEqual(pick(loadModelFromKind("weight")).slice(0, 4), ["external_unknown", "bilateral", "total", "low"]);
    assert.equal(loadModelFromKind("bodyweight").loadModel, "bodyweight");
    assert.deepEqual([loadModelFromKind("bodyweightPlus").loadModel, loadModelFromKind("bodyweightPlus").confidence], ["bodyweight_plus", "low"]);
    assert.equal(loadModelFromKind("time").loadModel, "time");
    assert.equal(loadModelFromKind("cardio").loadModel, "cardio");
    assert.equal(loadModelFromKind("sets").loadModel, "sets_only");
    assert.equal(loadModelFromKind(undefined).confidence, "unknown");
  });
  test("sessionTotals with the resolver: built-in exact, own dumbbell estimated, deleted exercise estimated by kind", () => {
    const exercises = [...LEGACY_DEFAULT_EXERCISES, own(["Hantle"])];
    const resolve = makeLegacyResolver(exercises);
    const base = [
      { exerciseId: "bench_press", type: "weight", sets: [set("60", "8"), set("60", "8")] },
      { exerciseId: "db_row_single_arm", type: "weight", sets: [set("26", "10")] },
      { exerciseId: "pullup", type: "bodyweight", sets: [set("", "8")] },
    ];
    const exact = sessionTotals({ exercises: base }, resolve);
    assert.deepEqual([exact.volumeKg, exact.volumeStatus, exact.workingSets], [960 + 520, "exact", 4]);
    const withOwn = sessionTotals({ exercises: [...base, { exerciseId: "own-Hantle", type: "weight", sets: [set("10", "10")] }] }, resolve);
    assert.deepEqual([withOwn.volumeKg, withOwn.volumeStatus], [960 + 520 + 200, "estimated"]);
    const withGone = sessionTotals({ exercises: [...base, { exerciseId: "deleted-123", type: "weight", sets: [set("10", "10")] }] }, resolve);
    assert.deepEqual([withGone.volumeKg, withGone.volumeStatus], [960 + 520 + 100, "estimated"]);
    const unknownKind = sessionTotals({ exercises: [...base, { exerciseId: "deleted-456", sets: [set("10", "10")] }] }, resolve);
    assert.deepEqual([unknownKind.volumeKg, unknownKind.volumeStatus], [960 + 520, "partial"]);
  });
  test("the resolver accepts numeric ids and a missing exercise list", () => {
    assert.equal(makeLegacyResolver([{ id: 7, equipment: ["Sztanga"] }])({ exerciseId: "7" }).loadModel, "barbell_total");
    assert.equal(makeLegacyResolver(null)({ exerciseId: "x", type: "bodyweight" }).loadModel, "bodyweight");
  });
});

describe("differences from today's kinds (documented for A5)", () => {
  // Main unit of today's engine (getExerciseKind → WORKLOAD_UNIT_BY_KIND) vs the transitional model.
  test("only bands, the assisted pull-up and the ab wheel change their main unit (kg → reps)", () => {
    const changed = [];
    for (const ex of LEGACY_DEFAULT_EXERCISES) {
      const kind = A.getExerciseKind(ex);
      const before = A.WORKLOAD_UNIT_BY_KIND[kind];
      if (!before) continue; // sets / cardio have no workload unit today
      const after = legacyLoadModel(ex).unit;
      if (before !== after) changed.push(`${ex.id}:${before}->${after}`);
    }
    assert.deepEqual(changed.sort(), [
      "ab_wheel_rollout:kg->reps", "band_chest_press:kg->reps", "band_curl:kg->reps", "band_lateral_raise:kg->reps", "band_overhead_press:kg->reps",
      "band_rdl:kg->reps", "band_row:kg->reps", "band_squat:kg->reps", "band_triceps_extension:kg->reps",
      "hip_abduction_band:kg->reps", "pullup_band_assist:kg->reps",
    ]);
  });
});
