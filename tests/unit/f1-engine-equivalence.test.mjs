// F1.5 — proof that moving the progression engine into src/engine/ changed nothing.
// The engine module is imported DIRECTLY from src/engine/ and compared with the engine inside the
// app of the reference commit (a2b9ca0, the finished S1 — built from git with `git show`).
// Thousands of deterministic random inputs per function; every result must be deep-equal.
// If the reference cannot be built (no git history), the suite is skipped, not failed;
// CI checks out the full history so it always runs there.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRefApp } from "../harness/load-app.mjs";
import * as ENGINE from "../../src/engine/index.js";

const REF = "a2b9ca0";
const here = dirname(fileURLToPath(import.meta.url));
const NAMES = [
  "toNumber", "parseRepRange", "parseRirBounds", "overallRepRange", "noteOverride", "avgOf",
  "computeSessionVolume", "PROGRESSION_MAX_PERFORMANCES", "PROGRESSION_LONG_BREAK_DAYS",
  "summarizePerformance", "sumTopK", "comparePerformances", "computeExerciseAnalysis",
  "exerciseHistoryBefore", "analyzeSessionExercise", "MUSCLE_GROUPS", "CATEGORY_TO_MUSCLE_GROUP",
  "ATLAS_MUSCLE_GROUPS", "getExerciseMuscleGroups", "WORKLOAD_UNIT_BY_KIND", "computeMuscleGroupWorkload",
  "workloadMainUnit", "computeProgressSignal", "muscleGroupSessionPoints", "computeCategoryLastDelta",
  "getHistoricalBest", "findMatchingSessions",
];
let OLD;
before(async () => {
  OLD = await loadRefApp(REF);
  if (!OLD) {
    try {
      execFileSync(process.execPath, [resolve(here, "../harness/build.mjs"), "--ref", REF], { stdio: "ignore" });
      OLD = await loadRefApp(REF);
    } catch {
      OLD = null;
    }
  }
});

// deterministic random
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const mk = (seed) => {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const KINDS = ["weight", "weight", "weight", "bodyweight", "bodyweightPlus", "time", "sets", "cardio"];
  const RIRS = ["", "", "0", "0-1", "1-2", "2", 0, 1, 3, "x"];
  const NOTES = ["", "", "", "gorszy dzień", "za ciężko", "bardzo dobrze", "boli bark", "nie dam rady więcej"];
  const TARGETS = ["8-10", "6-8", "10", "12-15", "20-30 s", "", "brak", "10–8", "5"];
  const EX_IDS = ["squat_barbell", "bench_press", "deadlift", "pullup", "db_row_single_arm", "custom-a", "custom-b", "cardio_treadmill"];
  const weight = () => pick(["", String(int(0, 120)), `${int(20, 100)},5`, int(5, 80), "abc", "0", String(int(10, 60) + 0.25)]);
  const set = () => ({
    weight: weight(), reps: pick(["", String(int(0, 16)), int(1, 12), "0"]), duration: pick(["", String(int(5, 120))]),
    rir: pick(RIRS), setType: pick(["normal", "normal", "normal", undefined, "dropset"]), note: pick(NOTES), done: r() < 0.5,
  });
  const sets = () => Array.from({ length: int(0, 6) }, set);
  const setsDetail = () => (r() < 0.15 ? undefined : Array.from({ length: int(1, 5) }, (_, i) => ({ id: `d${i}`, target: pick(TARGETS), rir: pick(["", "0-1", "2"]) })));
  let day = 0;
  const date = () => new Date(Date.UTC(2026, 0, 1) + (day += int(0, 30)) * 86400000 + int(0, 86399) * 1000).toISOString();
  const exercise = () => ({ id: `we-${int(1, 1e6)}`, exerciseId: pick(EX_IDS), name: "x", type: pick(KINDS), setsDetail: setsDetail(), sets: sets() });
  const session = () => ({ id: `s-${int(1, 1e9)}`, date: r() < 0.03 ? "not a date" : date(), planLabel: pick(["A", "B", undefined]), planName: pick(["Plan", undefined]), exercises: Array.from({ length: int(0, 4) }, exercise) });
  const history = () => Array.from({ length: int(0, 12) }, session);
  const userExercises = () => [
    { id: "custom-a", category: pick([["Klatka"], ["Plecy", "Biceps"], ["Nogi"], []]) },
    { id: "custom-b", category: pick([["Barki", "Triceps"], ["Cardio"], ["Brzuch"]]) },
  ];
  const GROUPS = ["chest", "back", "quads", "shoulders", "biceps", "triceps", "abs", "calves", "hamstrings_glutes", "forearms"];
  return { r, pick, int, set, sets, setsDetail, date, exercise, session, history, userExercises, GROUPS, KINDS, EX_IDS };
};

const same = (name, a, b, ctx) => assert.deepEqual(JSON.parse(JSON.stringify(b ?? null)), JSON.parse(JSON.stringify(a ?? null)), `${name} differs for ${String(JSON.stringify(ctx)).slice(0, 400)}`);

describe("F1.5 engine equivalence: src/engine/ vs the app engine of a2b9ca0", () => {
  test("all 27 names are exported by src/engine/", () => {
    for (const n of NAMES) assert.ok(n in ENGINE, n);
    assert.equal(Object.keys(ENGINE).length, NAMES.length);
  });

  test("reference available", (t) => {
    if (!OLD) t.skip("reference bundle unavailable (no git history)");
  });

  test("constants are identical", (t) => {
    if (!OLD) return t.skip("no reference");
    for (const n of ["PROGRESSION_MAX_PERFORMANCES", "PROGRESSION_LONG_BREAK_DAYS", "MUSCLE_GROUPS", "CATEGORY_TO_MUSCLE_GROUP", "ATLAS_MUSCLE_GROUPS", "WORKLOAD_UNIT_BY_KIND"]) assert.deepEqual(ENGINE[n], OLD[n], n);
  });

  test("parsers and small helpers — 3000 random inputs each", (t) => {
    if (!OLD) return t.skip("no reference");
    const g = mk(11);
    for (let i = 0; i < 3000; i++) {
      const v = g.pick(["", null, undefined, 0, 12, "57,5", "8-10", "20-30 s", "10–8", "abc", "0-1", "2", 3, " 1 - 2 ", NaN, "1e3"]);
      for (const f of ["toNumber", "parseRepRange", "parseRirBounds"]) same(f, OLD[f](v), ENGINE[f](v), v);
      const sd = g.setsDetail();
      same("overallRepRange", OLD.overallRepRange(sd), ENGINE.overallRepRange(sd), sd);
      const note = g.pick(["", "gorszy dzień i boli", "za ciężko", "bardzo dobrze", "nic"]) + (g.r() < 0.5 ? " zmęczony" : "");
      same("noteOverride", OLD.noteOverride(note), ENGINE.noteOverride(note), note);
      const arr = Array.from({ length: g.int(0, 6) }, () => g.int(0, 20));
      same("avgOf", OLD.avgOf(arr), ENGINE.avgOf(arr), arr);
      const k = g.int(0, 7);
      same("sumTopK", OLD.sumTopK(arr, k), ENGINE.sumTopK(arr, k), [arr, k]);
    }
  });

  test("volume, summaries and comparisons — 3000 random performances", (t) => {
    if (!OLD) return t.skip("no reference");
    const g = mk(22);
    for (let i = 0; i < 3000; i++) {
      const kind = g.pick(g.KINDS);
      const sets = g.sets();
      same("computeSessionVolume", OLD.computeSessionVolume(sets, kind, kind === "time"), ENGINE.computeSessionVolume(sets, kind, kind === "time"), [sets, kind]);
      const range = g.r() < 0.2 ? null : OLD.parseRepRange(g.pick(["8-10", "6", "12-15"]));
      const d1 = g.date();
      const d2 = g.date();
      const a = OLD.summarizePerformance(sets, kind, range, d2);
      same("summarizePerformance", a, ENGINE.summarizePerformance(sets, kind, range, d2), [sets, kind, range]);
      const prevSets = g.sets();
      const b = OLD.summarizePerformance(prevSets, kind, range, d1);
      const loaded = kind === "weight" || kind === "bodyweightPlus";
      same("comparePerformances", OLD.comparePerformances(a, b, loaded), ENGINE.comparePerformances(a, b, loaded), [sets, prevSets]);
      same("comparePerformances(null)", OLD.comparePerformances(a, null, loaded), ENGINE.comparePerformances(a, null, loaded), sets);
    }
  });

  test("computeExerciseAnalysis — 4000 random cases (history, plan, notes, breaks)", (t) => {
    if (!OLD) return t.skip("no reference");
    const g = mk(33);
    for (let i = 0; i < 4000; i++) {
      const kind = g.pick(g.KINDS.filter((k) => k !== "cardio"));
      const hist = Array.from({ length: g.int(0, 11) }, () => ({ sets: g.sets(), date: g.r() < 0.1 ? null : g.date() })).reverse();
      const args = {
        sets: g.sets(), kind, setsDetail: g.setsDetail(),
        history: g.r() < 0.1 ? null : hist,
        priorSessionSets: g.r() < 0.2 ? g.sets() : null,
        date: g.r() < 0.1 ? null : g.date(),
      };
      same("computeExerciseAnalysis", OLD.computeExerciseAnalysis(args), ENGINE.computeExerciseAnalysis(args), args);
    }
  });

  test("history functions — 1500 random histories", (t) => {
    if (!OLD) return t.skip("no reference");
    const g = mk(44);
    for (let i = 0; i < 1500; i++) {
      const history = g.history();
      const exId = g.pick(g.EX_IDS);
      const before = g.r() < 0.2 ? null : g.date();
      same("findMatchingSessions", OLD.findMatchingSessions(history, { exerciseId: exId, beforeDate: before }), ENGINE.findMatchingSessions(history, { exerciseId: exId, beforeDate: before }), [exId, before]);
      const excl = history.length ? g.pick(history).id : null;
      same("exerciseHistoryBefore", OLD.exerciseHistoryBefore(history, exId, before, excl), ENGINE.exerciseHistoryBefore(history, exId, before, excl), [exId, before]);
      same("getHistoricalBest", OLD.getHistoricalBest(history, exId, before), ENGINE.getHistoricalBest(history, exId, before), [exId, before]);
      const valid = history.filter((h) => h.date !== "not a date");
      if (valid.length) {
        const s = g.pick(valid);
        for (const ex of s.exercises) same("analyzeSessionExercise", OLD.analyzeSessionExercise(valid, s, ex), ENGINE.analyzeSessionExercise(valid, s, ex), ex);
        same("computeProgressSignal", OLD.computeProgressSignal(valid), ENGINE.computeProgressSignal(valid), valid.length);
      }
    }
  });

  test("muscle-group functions — 1500 random histories", (t) => {
    if (!OLD) return t.skip("no reference");
    const g = mk(55);
    for (let i = 0; i < 1500; i++) {
      const history = g.history();
      const ux = g.userExercises();
      const exId = g.pick(g.EX_IDS);
      same("getExerciseMuscleGroups", OLD.getExerciseMuscleGroups(exId, ux), ENGINE.getExerciseMuscleGroups(exId, ux), exId);
      const start = g.r() < 0.5 ? null : g.date();
      const end = g.r() < 0.5 ? null : g.date();
      const w = OLD.computeMuscleGroupWorkload(history, ux, start, end);
      same("computeMuscleGroupWorkload", w, ENGINE.computeMuscleGroupWorkload(history, ux, start, end), [start, end]);
      for (const grp of g.GROUPS) {
        same("workloadMainUnit", OLD.workloadMainUnit(w[grp]), ENGINE.workloadMainUnit(w[grp]), grp);
        same("muscleGroupSessionPoints", OLD.muscleGroupSessionPoints(history, ux, grp), ENGINE.muscleGroupSessionPoints(history, ux, grp), grp);
        same("computeCategoryLastDelta", OLD.computeCategoryLastDelta(history, ux, grp), ENGINE.computeCategoryLastDelta(history, ux, grp), grp);
      }
    }
  });
});
