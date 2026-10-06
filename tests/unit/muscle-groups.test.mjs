// Muscle groups — new suite written 2026-10-06 against the current index.html.
//   MGW-001: muscle-group workload analytics (primary group only, units never mixed, honest
//            "brak porównania", chronology from session.date).
//   MGW-002: primary + secondary classification stored in the EXISTING `category` field,
//            filters (10 groups + Cardio + "Partia nieokreślona" only when needed), badges.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "../harness/load-app.mjs";
import { W, BW, T, DROP, session, ex } from "../harness/fixtures.mjs";

let A;
before(async () => {
  A = await loadApp();
});

describe("MGW-001 dictionary and atlas mapping", () => {
  test("10 muscle groups with stable ids", () => {
    assert.deepEqual(A.MUSCLE_GROUPS.map((g) => g.id), ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "quads", "hamstrings_glutes", "calves"]);
  });
  test("atlas map has 61 entries, all real atlas exercise ids, all valid group ids", () => {
    const ids = new Set(A.MUSCLE_GROUPS.map((g) => g.id));
    const keys = Object.keys(A.ATLAS_MUSCLE_GROUPS);
    assert.equal(keys.length, 61);
    for (const k of keys) {
      assert.ok(A.DEFAULT_EXERCISES.some((e) => e.id === k), `${k} not in DEFAULT_EXERCISES`);
      const m = A.ATLAS_MUSCLE_GROUPS[k];
      assert.ok(ids.has(m.muscleGroup), `${k}: bad primary`);
      for (const s of m.secondaryMuscleGroups) {
        assert.ok(ids.has(s), `${k}: bad secondary ${s}`);
        assert.notEqual(s, m.muscleGroup, `${k}: primary repeated as secondary`);
      }
    }
  });
  test("every non-cardio atlas exercise is mapped; the 7 unmapped are exactly the cardio ones", () => {
    const unmapped = A.DEFAULT_EXERCISES.filter((e) => !A.ATLAS_MUSCLE_GROUPS[e.id]);
    assert.equal(unmapped.length, 7);
    assert.ok(unmapped.every((e) => e.isCardio));
  });
  test("owner decisions: 'Nogi' split (squat→quads, RDL→hamstrings_glutes, calf raise→calves)", () => {
    assert.equal(A.ATLAS_MUSCLE_GROUPS.squat_barbell.muscleGroup, "quads");
    assert.equal(A.ATLAS_MUSCLE_GROUPS.rdl_barbell.muscleGroup, "hamstrings_glutes");
    assert.equal(A.ATLAS_MUSCLE_GROUPS.calf_raise_standing.muscleGroup, "calves");
    assert.deepEqual(A.ATLAS_MUSCLE_GROUPS.dips, { muscleGroup: "chest", secondaryMuscleGroups: ["triceps"] });
  });
  test("getExerciseMuscleGroups for own exercises: first category = primary; Nogi/Całe ciało/Cardio → null", () => {
    const own = [
      { id: "o1", category: ["Plecy", "Biceps"] },
      { id: "o2", category: ["Nogi"] },
      { id: "o3", category: ["Całe ciało", "Klatka"] },
      { id: "o4", category: ["Cardio"] },
      { id: "o5", category: ["Klatka piersiowa", "Triceps", "Klatka piersiowa"] },
    ];
    assert.deepEqual(A.getExerciseMuscleGroups("o1", own), { muscleGroup: "back", secondaryMuscleGroups: ["biceps"] });
    assert.equal(A.getExerciseMuscleGroups("o2", own), null);
    assert.equal(A.getExerciseMuscleGroups("o3", own), null);
    assert.equal(A.getExerciseMuscleGroups("o4", own), null);
    assert.deepEqual(A.getExerciseMuscleGroups("o5", own), { muscleGroup: "chest", secondaryMuscleGroups: ["triceps"] });
    assert.equal(A.getExerciseMuscleGroups("missing", own), null);
  });
  test("atlas mapping wins over a (possibly edited) stored category", () => {
    assert.equal(A.getExerciseMuscleGroups("bench_press", [{ id: "bench_press", category: ["Plecy"] }]).muscleGroup, "chest");
  });
});

describe("MGW-001 computeMuscleGroupWorkload", () => {
  const exercises = [{ id: "own_back", category: ["Plecy", "Biceps"] }, { id: "own_legs", category: ["Nogi"] }];

  test("primary only — dips count for chest, not triceps (no double counting)", () => {
    const h = [session("2026-09-10T10:00:00", [ex("dips", "bodyweightPlus", [W(10, 8), W(10, 8), W(10, 7)])])];
    const w = A.computeMuscleGroupWorkload(h, exercises);
    assert.deepEqual(Object.keys(w), ["chest"]);
    assert.equal(w.chest.kg, 230, "external load only, never body mass");
    assert.equal(w.chest.sets, 3);
  });

  test("units kept separate: kg / reps / seconds", () => {
    const h = [
      session("2026-09-10T10:00:00", [
        ex("bench_press", "weight", [W(100, 10), W(100, 8)]),
        ex("pushup", "bodyweight", [BW(20), BW(15)]),
        ex("plank", "time", [T(60), T(45)]),
      ]),
    ];
    const w = A.computeMuscleGroupWorkload(h, exercises);
    assert.deepEqual({ kg: w.chest.kg, reps: w.chest.reps, sets: w.chest.sets }, { kg: 1800, reps: 35, sets: 4 });
    assert.deepEqual({ seconds: w.abs.seconds, kg: w.abs.kg }, { seconds: 105, kg: 0 });
    assert.equal(A.workloadMainUnit(w.chest), "kg");
    assert.equal(A.workloadMainUnit(w.abs), "seconds");
  });

  test("dropsets excluded from sets and volume", () => {
    const h = [session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10), DROP(60, 15)])])];
    const w = A.computeMuscleGroupWorkload(h, exercises);
    assert.deepEqual([w.chest.sets, w.chest.kg], [1, 1000]);
  });

  test("unclassifiable exercises (own 'Nogi', cardio) are skipped silently", () => {
    const h = [session("2026-09-10T10:00:00", [ex("own_legs", "weight", [W(100, 10)]), ex("cardio_bike", "cardio", [{ duration: "600" }])])];
    assert.deepEqual(A.computeMuscleGroupWorkload(h, exercises), {});
  });

  test("own exercise uses its first category as primary", () => {
    const h = [session("2026-09-10T10:00:00", [ex("own_back", "weight", [W(50, 10)])])];
    assert.equal(A.computeMuscleGroupWorkload(h, exercises).back.kg, 500);
  });

  test("date window is start ≤ session.date < end", () => {
    const h = [
      session("2026-09-01T00:00:00", [ex("bench_press", "weight", [W(100, 1)])]),
      session("2026-09-15T12:00:00", [ex("bench_press", "weight", [W(100, 2)])]),
      session("2026-10-01T00:00:00", [ex("bench_press", "weight", [W(100, 4)])]),
    ];
    const w = A.computeMuscleGroupWorkload(h, exercises, new Date("2026-09-01T00:00:00"), new Date("2026-10-01T00:00:00"));
    assert.equal(w.chest.kg, 300);
  });

  test("computeStatsByCategory is the same layer (no second volume definition)", () => {
    const h = [session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])])];
    assert.deepEqual(A.computeStatsByCategory(h, exercises, new Date("2026-09-01"), new Date("2026-10-01")), A.computeMuscleGroupWorkload(h, exercises, new Date("2026-09-01"), new Date("2026-10-01")));
  });
});

describe("MGW-001 session-over-session comparison", () => {
  const E = [];
  test("same exercises, same unit → comparable delta", () => {
    const h = [
      session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])]),
      session("2026-09-14T10:00:00", [ex("bench_press", "weight", [W(100, 12)])]),
    ];
    const d = A.computeCategoryLastDelta(h, E, "chest");
    assert.deepEqual([d.comparable, d.prevVolume, d.lastVolume, d.delta, d.unit], [true, 1000, 1200, 200, "kg"]);
  });
  test("different exercises → 'brak porównania' (reason exercises), never up/down", () => {
    const h = [
      session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])]),
      session("2026-09-14T10:00:00", [ex("db_incline_press_30", "weight", [W(30, 10)])]),
    ];
    const d = A.computeCategoryLastDelta(h, E, "chest");
    assert.equal(d.comparable, false);
    assert.equal(d.reason, "exercises");
    assert.equal(d.delta, undefined);
  });
  test("different unit → 'brak porównania' (reason unit)", () => {
    const h = [
      session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])]),
      session("2026-09-14T10:00:00", [ex("pushup", "bodyweight", [BW(30)])]),
    ];
    const d = A.computeCategoryLastDelta(h, E, "chest");
    assert.deepEqual([d.comparable, d.reason], [false, "unit"]);
  });
  test("fewer than 2 sessions → null", () => {
    assert.equal(A.computeCategoryLastDelta([session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])])], E, "chest"), null);
  });
  test("chronology from session.date, not array order (backfilled workout lands in place)", () => {
    const newer = session("2026-09-20T10:00:00", [ex("bench_press", "weight", [W(100, 12)])]);
    const older = session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])]);
    const backfilled = session("2026-09-15T10:00:00", [ex("bench_press", "weight", [W(100, 11)])]);
    const d = A.computeCategoryLastDelta([newer, older, backfilled], E, "chest");
    assert.deepEqual([d.prevVolume, d.lastVolume], [1100, 1200]);
  });
  test("time series: last 10 points in the unit of the most recent session", () => {
    const h = [];
    for (let i = 0; i < 12; i++) h.push(session(`2026-08-${String(i + 1).padStart(2, "0")}T10:00:00`, [ex("bench_press", "weight", [W(100, 10 + i)])]));
    h.push(session("2026-08-20T10:00:00", [ex("pushup", "bodyweight", [BW(30)])]));
    h.push(session("2026-08-21T10:00:00", [ex("bench_press", "weight", [W(100, 5)])]));
    const s = A.computeCategoryTimeSeries(h, E, "chest");
    assert.equal(s.length, 10);
    assert.ok(s.every((p) => p.unit === "kg"));
    assert.equal(s[s.length - 1].volume, 500);
  });
});

describe("MGW-002 classification stored in `category`", () => {
  test("buildMuscleCategory: primary first, secondaries in dictionary order, never duplicated", () => {
    assert.deepEqual(A.buildMuscleCategory("back", ["forearms", "biceps"]), ["Plecy", "Biceps", "Przedramiona"]);
    assert.deepEqual(A.buildMuscleCategory("chest", ["chest", "triceps"]), ["Klatka piersiowa", "Triceps"]);
    assert.deepEqual(A.buildMuscleCategory("biceps", []), ["Biceps"]);
    assert.deepEqual(A.buildMuscleCategory("nope", ["biceps"]), []);
  });
  test("click order does not matter (deterministic)", () => {
    assert.deepEqual(A.buildMuscleCategory("quads", ["calves", "hamstrings_glutes"]), A.buildMuscleCategory("quads", ["hamstrings_glutes", "calves"]));
  });
  test("round trip: build → read gives the same selection", () => {
    const category = A.buildMuscleCategory("shoulders", ["triceps", "chest"]);
    const sel = A.readMuscleSelection({ id: "own1", category });
    assert.deepEqual(sel, { atlas: false, primary: "shoulders", secondary: ["chest", "triceps"], legacyUnmapped: false });
  });
  test("readMuscleSelection: atlas exercise → fixed groups, read-only", () => {
    const sel = A.readMuscleSelection({ id: "barbell_row", category: ["Plecy"] });
    assert.deepEqual(sel, { atlas: true, primary: "back", secondary: ["biceps"], legacyUnmapped: false });
  });
  test("readMuscleSelection: old categories still readable (Klatka → chest)", () => {
    assert.equal(A.readMuscleSelection({ id: "own2", category: ["Klatka", "Triceps"] }).primary, "chest");
  });
  test("readMuscleSelection: legacy 'Nogi' → no primary, legacyUnmapped (user must choose)", () => {
    assert.deepEqual(A.readMuscleSelection({ id: "own3", category: ["Nogi"] }), { atlas: false, primary: null, secondary: [], legacyUnmapped: true });
  });
  test("cardio own exercise is not 'legacyUnmapped'", () => {
    assert.equal(A.readMuscleSelection({ id: "own4", category: ["Cardio"], isCardio: true }).legacyUnmapped, false);
  });
});

describe("MGW-002 filters and badges", () => {
  const lib = [
    { id: "bench_press", category: ["Klatka"] },
    { id: "barbell_row", category: ["Plecy", "Biceps"] },
    { id: "own_curl", category: ["Biceps"] },
    { id: "own_legs", category: ["Nogi"] },
    { id: "cardio_bike", category: ["Cardio"], isCardio: true },
  ];
  test("filter options = 10 groups + Cardio; 'Partia nieokreślona' only when some exercise needs it", () => {
    assert.deepEqual(A.MUSCLE_FILTER_OPTIONS, [...A.MUSCLE_GROUPS.map((g) => g.label), "Cardio"]);
    assert.equal(A.muscleFilterOptionsFor(lib).at(-1), "Partia nieokreślona");
    assert.equal(A.muscleFilterOptionsFor(lib.filter((e) => e.id !== "own_legs")).includes("Partia nieokreślona"), false);
    assert.equal(A.muscleFilterOptionsFor(A.DEFAULT_EXERCISES).length, 11, "the default atlas needs no fallback filter");
  });
  test("a group filter matches primary OR secondary", () => {
    const biceps = lib.filter((e) => A.exerciseMatchesMuscleFilter(e, "Biceps", lib)).map((e) => e.id);
    assert.deepEqual(biceps, ["barbell_row", "own_curl"]);
  });
  test("Cardio is a separate filter", () => {
    assert.deepEqual(lib.filter((e) => A.exerciseMatchesMuscleFilter(e, "Cardio", lib)).map((e) => e.id), ["cardio_bike"]);
  });
  test("old own 'Nogi' exercise stays findable under 'Partia nieokreślona' (never lost)", () => {
    assert.deepEqual(lib.filter((e) => A.exerciseMatchesMuscleFilter(e, "Partia nieokreślona", lib)).map((e) => e.id), ["own_legs"]);
  });
  test("'Wszystkie' / empty filter matches everything", () => {
    assert.ok(lib.every((e) => A.exerciseMatchesMuscleFilter(e, "Wszystkie", lib) && A.exerciseMatchesMuscleFilter(e, "", lib)));
  });
  test("badges: primary first then secondaries; cardio; neutral fallback", () => {
    assert.deepEqual(A.exerciseMuscleBadges(lib[1], lib), ["Plecy", "Biceps"]);
    assert.deepEqual(A.exerciseMuscleBadges(lib[4], lib), ["Cardio"]);
    assert.deepEqual(A.exerciseMuscleBadges(lib[3], lib), ["Partia nieokreślona"]);
    assert.deepEqual(A.exerciseMuscleBadges({ id: "pullup_overhand_weighted" }, []), ["Plecy", "Biceps", "Przedramiona"]);
  });
  test("categoryVisualKey maps new labels to existing visuals", () => {
    assert.equal(A.categoryVisualKey("Klatka piersiowa"), "Klatka");
    assert.equal(A.categoryVisualKey("Czworogłowe uda"), "Nogi");
    assert.equal(A.categoryVisualKey("Cardio"), "Cardio");
  });
});
