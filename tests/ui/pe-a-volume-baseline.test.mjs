// PE-A (A4) — characterization of EVERY place that shows volume today, before A5 switches them to
// the load engine. Each test pins today's number for one fixed probe workout and, next to it, the
// number the engine (sessionTotals / exerciseTotals with the transitional models) gives — the
// "after" that A5 is expected to show. Nothing here changes the app; when A5 lands, the "today"
// expectations of the switched places are replaced by the engine numbers, one place at a time.
//
// Probe workout (all numbers typed as in the app; stored fields written with today's finish()):
//   Wyciskanie hantli siedząc  26×10, 26×10, 26×10, 28×6        (two dumbbells — D2)
//   Wyciskanie sztangi leżąc   57,5×8, 57,5×8, dropset 40×10    (comma decimal, dropset — D5)
//   Wiosłowanie z gumą         15×12, 15×12                     (band — P1)
//   Podciąganie na drążku      8, 8, 7                          (bodyweight — D8)
//   Wiosłowanie jednorącz      26×10 per side                   (unilateral — D2)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { React, mount, unmount, flush, loadApp, $$, buttonByText, click } from "../harness/ui.mjs";
import { resetStorage } from "../harness/load-app.mjs";
import { sessionTotals, exerciseTotals } from "../../src/engine/load.js";
import { makeLegacyResolver, legacyLoadModel } from "../../src/engine/load-legacy-map.js";
import { LEGACY_DEFAULT_EXERCISES } from "../fixtures/legacy/default-exercises.mjs"; // I2: the old list is test data now

const h = React.createElement;
let A;
let EXERCISES;
let RESOLVE;
const W = (w, r, extra = {}) => ({ weight: String(w), reps: String(r), rir: "0-1", setType: "normal", ...extra });
const DB = "db_shoulder_press_seated";
const S1 = {
  id: "pe-a-s1", date: "2026-09-28T08:00:00.000Z", planId: "pe-a-plan", planName: "Plan A",
  exercisesCount: 1, totalSets: 3, totalReps: 30, totalWeight: 72, volume: 720, durationSec: 1800,
  exercises: [{ exerciseId: DB, name: "Wyciskanie hantli siedząc", type: "weight", sets: [W(24, 10), W(24, 10), W(24, 10)] }],
};
const S2 = {
  id: "pe-a-s2", date: "2026-10-05T08:00:00.000Z", planId: "pe-a-plan", planName: "Plan A",
  exercisesCount: 5, totalSets: 13, totalReps: 119, totalWeight: 317, volume: 2888, durationSec: 3600,
  exercises: [
    { exerciseId: DB, name: "Wyciskanie hantli siedząc", type: "weight", sets: [W(26, 10), W(26, 10), W(26, 10), W(28, 6)] },
    { exerciseId: "bench_press", name: "Wyciskanie sztangi leżąc", type: "weight", sets: [W("57,5", 8), W("57,5", 8), W(40, 10, { setType: "dropset" })] },
    { exerciseId: "band_row", name: "Wiosłowanie z gumą", type: "weight", sets: [W(15, 12), W(15, 12)] },
    { exerciseId: "pullup", name: "Podciąganie na drążku", type: "bodyweight", sets: [W("", 8), W("", 8), W("", 7)] },
    { exerciseId: "db_row_single_arm", name: "Wiosłowanie jednorącz hantlem", type: "weight", sets: [W(26, 10)] },
  ],
};
const HISTORY = [S2, S1];
const kgText = (text, label) => {
  const m = text.match(new RegExp(`([\\d\\s\\u00a0]+) kg${label}`));
  return m ? Number(m[1].replace(/[\s ]/g, "")) : null;
};

before(async () => {
  A = await loadApp();
  resetStorage();
  EXERCISES = LEGACY_DEFAULT_EXERCISES.map(A.normalizeExercise);
  RESOLVE = makeLegacyResolver(EXERCISES);
});
after(unmount);

describe("the probe workout is what today's finish() would have stored", () => {
  test("stored volume / totalWeight follow today's formula (kg × reps incl. dropsets; Σ kg)", () => {
    let volume = 0;
    let totalWeight = 0;
    for (const ex of S2.exercises) for (const s of ex.sets) {
      volume += (A.toNumber(s.weight) || 0) * (s.reps !== "" && s.reps != null ? Number(s.reps) : 1);
      totalWeight += A.toNumber(s.weight) || 0;
    }
    assert.deepEqual([volume, totalWeight], [S2.volume, S2.totalWeight]);
  });
  test("engine target for the whole workout: 3736 kg exact (stored today: 2888 kg)", () => {
    const t = sessionTotals(S2, RESOLVE);
    assert.deepEqual([t.volumeKg, t.volumeStatus, t.workingSets], [1896 + 1320 + 0 + 0 + 520, "exact", 13]);
  });
});

describe("1. Statystyki — tile „Objętość” (computeOverallStats → stored session.volume)", () => {
  test("today 3608 kg; engine target 5176 kg", () => {
    const o = A.computeOverallStats(HISTORY, new Date("2026-09-01"), new Date("2026-11-01"));
    assert.equal(o.totalVolume, 720 + 2888);
    assert.equal(HISTORY.reduce((a, s) => a + sessionTotals(s, RESOLVE).volumeKg, 0), 1440 + 3736);
  });
});

describe("2. Statystyki — muscle-group workload (computeMuscleGroupWorkload → computeSessionVolume)", () => {
  test("today: dropsets left out, dumbbells ×1, band counted as kg; engine target per group", () => {
    const w = A.computeMuscleGroupWorkload(HISTORY, EXERCISES, null, null);
    const groupOf = (id) => A.getExerciseMuscleGroups(id, EXERCISES).muscleGroup;
    assert.equal(groupOf("bench_press"), "chest");
    assert.deepEqual([w.chest.kg, w.chest.sets], [920, 2]);
    assert.equal(w[groupOf(DB)].kg, 720 + 948);
    const back = w[groupOf("db_row_single_arm")];
    assert.equal(groupOf("band_row"), groupOf("db_row_single_arm"));
    assert.equal(groupOf("pullup"), groupOf("db_row_single_arm"));
    assert.deepEqual([back.kg, back.reps, back.sets], [360 + 260, 23, 6]);
    // engine target: same grouping, volume per exerciseTotals
    const target = (id, sess) => exerciseTotals(sess.exercises.find((e) => e.exerciseId === id).sets, legacyLoadModel(EXERCISES.find((e) => e.id === id)));
    assert.deepEqual([target("bench_press", S2).volumeKg, target("bench_press", S2).workingSets], [1320, 3]);
    assert.equal(target(DB, S1).volumeKg + target(DB, S2).volumeKg, 1440 + 1896);
    assert.deepEqual([target("band_row", S2).volumeKg, target("band_row", S2).unit, target("band_row", S2).reps], [0, "reps", 24]);
    assert.equal(target("db_row_single_arm", S2).volumeKg, 520);
  });
});

describe("3–5. Historia and Szczegóły treningu", () => {
  test("3. history list card: „2888 kg objętości” from stored session.volume", async () => {
    const c = await mount(h(A.HistoryScreen, {
      history: HISTORY, plans: [], exercises: EXERCISES, updatePlans() {}, updateExercises() {}, onNavigate() {},
      onOpenDetail() {}, onDelete() {}, onStartBackfill() {}, onOpenReport() {}, isPro: true, onOpenUnlock() {},
    }));
    await flush();
    await click(buttonByText("Lista", c));
    await flush();
    assert.match(c.textContent, /2888 kg objętości/);
    assert.match(c.textContent, /720 kg objętości/);
  });
  test("4. detail header: Objętość 2888 kg, Suma ciężarów 317 kg (stored); 5. „Objętość wg ćwiczeń” via computeSessionVolume", async () => {
    const c = await mount(h(A.HistoryDetail, {
      session: S2, exercises: EXERCISES, history: HISTORY, onBack() {}, onOpenExercise() {}, onStartEdit() {}, onOpenReport() {}, isPro: true, onOpenUnlock() {},
    }));
    await flush();
    const t = c.textContent;
    assert.equal(kgText(t, "Objętość"), 2888);
    assert.equal(kgText(t, "Suma ciężarów"), 317);
    const rows = $$("[data-testid=report-exercise]", c).map((e) => e.textContent);
    assert.match(rows[0], /4 serie · 36 powt\. · 948 kg/); // engine: 1896 kg
    assert.match(rows[1], /2 serie · 16 powt\. · 920 kg/); // engine: 3 sets, 26 reps, 1320 kg (dropset counts, D5)
    assert.match(rows[2], /2 serie · 24 powt\. · 360 kg/); // engine: 0 kg, 24 reps (band, P1)
    assert.match(rows[3], /3 serie · 23 powt\./); // engine: same, 0 kg
    assert.match(rows[4], /1 seria · 10 powt\. · 260 kg/); // engine: 520 kg, 10 per side
  });
});

describe("6. Raport treningu — „Objętość” / „Suma ciężarów” (generateTrainingReport → stored)", () => {
  test("today 2888 kg and 317 kg; engine target 3736 kg", () => {
    const r = A.generateTrainingReport(S2, HISTORY, EXERCISES);
    assert.deepEqual([r.quickSummary.volume, r.quickSummary.totalWeight, r.quickSummary.dropsetCount], [2888, 317, 1]);
  });
});

describe("7–8. PRO analysis", () => {
  test("7. „Jak poszedł dzisiejszy trening?” (workoutComparisonSeries → stored): 720 → 2888 (+301%); engine 1440 → 3736", () => {
    const pts = A.workoutComparisonSeries(HISTORY, S2, "analogous");
    assert.deepEqual(pts.map((p) => p.volume), [720, 2888]);
    assert.deepEqual(pts.map((p) => sessionTotals(p.session, RESOLVE).volumeKg), [1440, 3736]);
  });
  test("8. „Jak rozwijało się to ćwiczenie?” (exercisePerformanceSeries → computeSessionVolume): 720 → 948; engine 1440 → 1896", () => {
    const ex = S2.exercises[0];
    const pts = A.exercisePerformanceSeries(HISTORY, S2, ex);
    assert.deepEqual(pts.map((p) => p.volume), [720, 948]);
    const model = legacyLoadModel(EXERCISES.find((e) => e.id === DB));
    assert.deepEqual(pts.map((p) => exerciseTotals(p.sets, model).volumeKg), [1440, 1896]);
  });
});

describe("9. Szczegóły ćwiczenia — „Obciążenie” and chart „Objętość na sesję” (own formula, Number(weight))", () => {
  test("bench press: today 400 kg — 57,5 kg sets read as 0 (comma bug); engine target 1320 kg", async () => {
    const bench = EXERCISES.find((e) => e.id === "bench_press");
    const c = await mount(h(A.ExerciseDetail, { exercise: bench, history: HISTORY, onBack() {}, updateExercises() {}, isPro: true, onOpenUnlock() {} }));
    await flush();
    await click(buttonByText("Statystyki", c));
    await flush();
    assert.equal(kgText(c.textContent, "Obciążenie"), 400);
    assert.equal(exerciseTotals(S2.exercises[1].sets, legacyLoadModel(bench)).volumeKg, 1320);
  });
  test("dumbbell press: today 1668 kg over two workouts; engine target 3336 kg", async () => {
    const db = EXERCISES.find((e) => e.id === DB);
    const c = await mount(h(A.ExerciseDetail, { exercise: db, history: HISTORY, onBack() {}, updateExercises() {}, isPro: true, onOpenUnlock() {} }));
    await flush();
    await click(buttonByText("Statystyki", c));
    await flush();
    assert.equal(kgText(c.textContent, "Obciążenie"), 720 + 948);
  });
});

describe("10. Pulpit — unfinished-workout card (summarizeActiveWorkoutDraft, own formula)", () => {
  test("today: kg × (reps or 1) over performed sets incl. dropsets; engine target from sessionTotals", () => {
    const items = S2.exercises.map((e, i) => ({ id: `it${i}`, exerciseId: e.exerciseId, name: e.name, type: e.type, sets: [...e.sets, W("", "")] }));
    const draft = { startTime: Date.parse("2026-10-05T08:00:00Z"), savedAt: "2026-10-05T08:30:00Z", plan: { name: "Plan A" }, blocks: [{ id: "b", items }] };
    const s = A.summarizeActiveWorkoutDraft(draft);
    assert.equal(s.volume, 2888);
    assert.equal(sessionTotals({ exercises: items }, RESOLVE).volumeKg, 3736);
  });
});

describe("A5 boundary: what stays as it is (P3)", () => {
  test("finish() keeps writing session.volume / totalWeight with today's formula — no engine import in the app", () => {
    // the app bundle does not include load.js before A5 (pe-a-load.test.mjs checks the sources)
    assert.equal(typeof A.sessionTotals, "undefined");
    assert.equal(typeof A.legacyLoadModel, "undefined");
  });
});
