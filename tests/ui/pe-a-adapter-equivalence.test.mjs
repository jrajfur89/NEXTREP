// PE-A (A4.5) — the volume access point (src/engine/volume.js) changes NOTHING: every one of the 10
// places that show volume gives exactly what the F1.6 build (28e2e70, last F1 commit, built from
// git) gives, on deterministic random data with dropsets, comma decimals, empty reps, unilateral
// and own / deleted exercises and odd stored values. Pure functions are compared on 1500 random
// histories each; the 4 screens are rendered from both builds and their text compared.
// Also guards that no screen computes volume itself any more and that saving and sync are untouched.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { React, mount, unmount, flush, loadApp, buttonByText, click } from "../harness/ui.mjs";
import { loadRefApp, resetStorage } from "../harness/load-app.mjs";
import * as VOLUME from "../../src/engine/volume.js";

const REF = "28e2e70"; // F1.6
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const h = React.createElement;
let NEW;
let OLD;
before(async () => {
  NEW = await loadApp();
  try {
    execFileSync(process.execPath, [resolve(here, "../harness/build.mjs"), "--ref", REF], { stdio: "ignore" });
    OLD = await loadRefApp(REF);
  } catch {
    OLD = null;
  }
});
after(unmount);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const IDS = ["db_shoulder_press_seated", "bench_press", "band_row", "pullup", "db_row_single_arm", "db_lunge", "dips", "plank", "cardio_bike", "farmers_walk", "own-1", "deleted-9"];
const KINDS = { db_shoulder_press_seated: "weight", bench_press: "weight", band_row: "weight", pullup: "bodyweight", db_row_single_arm: "weight", db_lunge: "weight", dips: "bodyweightPlus", plank: "time", cardio_bike: "cardio", farmers_walk: "sets", "own-1": "weight", "deleted-9": "weight" };
function gen(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const weight = () => pick(["", String(int(0, 120)), `${int(10, 100)},5`, `${int(10, 100)}.25`, int(5, 80), "abc", "0", null]);
  const set = () => ({
    weight: weight(), reps: pick(["", String(int(0, 15)), int(1, 12), "0", null, undefined]), duration: pick(["", String(int(5, 120))]),
    rir: pick(["", "0", "0-1", "1-2", "2", 3]), setType: pick(["normal", "normal", "normal", undefined, "dropset"]), done: r() < 0.5,
  });
  const exercise = () => {
    const exerciseId = pick(IDS);
    return { id: `we-${int(1, 1e6)}`, exerciseId, name: exerciseId, type: r() < 0.9 ? KINDS[exerciseId] : pick(["weight", "bodyweight", "time"]), sets: Array.from({ length: int(0, 5) }, set) };
  };
  let day = 0;
  const session = (k) => {
    const exercises = Array.from({ length: int(1, 4) }, exercise);
    return {
      id: `s-${k}-${int(1, 1e9)}`, date: new Date(Date.UTC(2026, 7, 1) + (day += int(0, 6)) * 86400000 + int(0, 86399) * 1000).toISOString(),
      planId: pick(["p1", "p2", undefined]), planName: pick(["Plan A", "Plan B", undefined]), planLabel: pick(["A", "B", undefined]),
      exercisesCount: exercises.length, totalSets: int(0, 20), totalReps: int(0, 200), totalWeight: pick([int(0, 900), 12.5, undefined]),
      volume: pick([int(0, 9000), int(0, 9000) + 0.4, 0, undefined, null, "123"]), durationSec: int(0, 7200), exercises,
    };
  };
  const history = Array.from({ length: int(1, 9) }, (_, k) => session(k)).reverse(); // newest first, as stored
  return { r, pick, int, history, set };
}
const EXERCISES = () => [...NEW.DEFAULT_EXERCISES.map(NEW.normalizeExercise), { ...NEW.normalizeExercise({ id: "own-1", name: "Własne", equipment: ["Hantle"], category: ["Plecy"] }) }];
const same = (name, a, b, ctx) => assert.deepEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)), `${name} differs (seed ${ctx})`);
// identical Math.random sequence for both builds (reports pick texts at random)
function seeded(fn) {
  const orig = Math.random;
  const r = rng(42);
  Math.random = r;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

describe("A4.5: every volume place equals F1.6 (28e2e70)", () => {
  test("reference F1.6 available", (t) => {
    if (!OLD && process.env.CI) assert.fail("reference bundle 28e2e70 could not be built in CI");
    if (!OLD) t.skip("reference bundle unavailable (no git history)");
  });
  test("1500 random histories: places 1, 2, 6, 7, 8, 10 (pure functions) give identical results", (t) => {
    if (!OLD) return t.skip("no reference");
    const ex = EXERCISES();
    const start = new Date("2026-08-01");
    const end = new Date("2026-12-01");
    for (let seed = 1; seed <= 1500; seed++) {
      const { history, pick } = gen(seed);
      const s = pick(history);
      same("1 computeOverallStats", NEW.computeOverallStats(history, start, end), OLD.computeOverallStats(history, start, end), seed);
      same("2 computeStatsByCategory", NEW.computeStatsByCategory(history, ex, start, end), OLD.computeStatsByCategory(history, ex, start, end), seed);
      for (const g of ["chest", "back", "shoulders", "quads", "abs"]) {
        same("2 computeCategoryTimeSeries", NEW.computeCategoryTimeSeries(history, ex, g), OLD.computeCategoryTimeSeries(history, ex, g), seed);
        same("2 last delta", VOLUME.muscleGroupLastDelta(history, ex, g), OLD.computeCategoryLastDelta(history, ex, g), seed);
      }
      same("6 generateTrainingReport", seeded(() => NEW.generateTrainingReport(s, history, ex)), seeded(() => OLD.generateTrainingReport(s, history, ex)), seed);
      for (const mode of ["analogous", "all"]) same("7 workoutComparisonSeries", NEW.workoutComparisonSeries(history, s, mode), OLD.workoutComparisonSeries(history, s, mode), seed);
      for (const e of s.exercises) same("8 exercisePerformanceSeries", NEW.exercisePerformanceSeries(history, s, e), OLD.exercisePerformanceSeries(history, s, e), seed);
      const draft = { startTime: Date.parse(s.date), savedAt: new Date(Date.parse(s.date) + 1800e3).toISOString(), plan: { name: s.planName }, blocks: [{ id: "b", items: s.exercises }] };
      same("10 summarizeActiveWorkoutDraft", NEW.summarizeActiveWorkoutDraft(draft), OLD.summarizeActiveWorkoutDraft(draft), seed);
    }
  });
  test("the adapter's own functions equal the F1.6 formulas on random sets (places 5, 8, 9, 10)", (t) => {
    if (!OLD) return t.skip("no reference");
    for (let seed = 1; seed <= 3000; seed++) {
      const { r, pick, int, set } = gen(seed);
      const sets = Array.from({ length: int(0, 7) }, set);
      const kind = pick(["weight", "bodyweight", "bodyweightPlus", "time", "sets", "cardio"]);
      assert.equal(VOLUME.exerciseVolume(sets, kind), OLD.computeSessionVolume(sets, kind));
      // place 9: the F1.6 ExerciseDetail inline formula, verbatim
      const f16 = sets.reduce((s, st) => s + (Number(st.weight) || 0) * (st.reps != null ? Number(st.reps) : 1), 0);
      assert.ok(Object.is(VOLUME.exerciseDetailVolume(sets), f16), `seed ${seed}`);
      const items = [{ type: kind, sets }, { type: pick(["weight", "time"]), sets: Array.from({ length: int(0, 3) }, set) }];
      let legacy = 0; // the F1.6 dashboard loop, verbatim
      items.forEach((it) => (Array.isArray(it.sets) ? it.sets : []).filter((st) => st && OLD.isSetPerformed(st, it.type)).forEach((st) => {
        legacy += (OLD.toNumber(st.weight) || 0) * (st.reps !== "" && st.reps != null ? Number(st.reps) : 1);
      }));
      assert.ok(Object.is(VOLUME.draftVolume(items, NEW.isSetPerformed), legacy), `seed ${seed}`);
      void r;
    }
  });
});

describe("A4.5: the 4 screens render the same text as F1.6", () => {
  const ui = async (A, el, tab) => {
    resetStorage();
    const c = await mount(el(A));
    await flush();
    if (tab) {
      await click(buttonByText(tab, c));
      await flush();
    }
    const text = c.textContent;
    await unmount();
    return text;
  };
  test("40 random histories: Statystyki, Historia (list), Szczegóły treningu, Szczegóły ćwiczenia", async (t) => {
    if (!OLD) return t.skip("no reference");
    for (let seed = 1; seed <= 40; seed++) {
      const { history, pick } = gen(seed * 7919);
      const ex = EXERCISES();
      const s = pick(history);
      const target = ex.find((e) => e.id === pick(s.exercises).exerciseId) || ex[0];
      const screens = [
        ["Statystyki", (A) => h(A.StatsScreen, { history, exercises: ex, onNavigate() {}, onOpenExercise() {} }), null],
        ["Historia", (A) => h(A.HistoryScreen, { history, plans: [], exercises: ex, updatePlans() {}, updateExercises() {}, onNavigate() {}, onOpenDetail() {}, onDelete() {}, onStartBackfill() {}, onOpenReport() {}, isPro: true, onOpenUnlock() {} }), "Lista"],
        ["Szczegóły treningu", (A) => h(A.HistoryDetail, { session: s, exercises: ex, history, onBack() {}, onOpenExercise() {}, onStartEdit() {}, onOpenReport() {}, isPro: true, onOpenUnlock() {} }), null],
        ["Szczegóły ćwiczenia", (A) => h(A.ExerciseDetail, { exercise: target, history, onBack() {}, updateExercises() {}, isPro: true, onOpenUnlock() {} }), "Statystyki"],
      ];
      for (const [name, el, tab] of screens) {
        const a = await seeded(() => ui(NEW, el, tab));
        const b = await seeded(() => ui(OLD, el, tab));
        assert.equal(a, b, `${name} differs (seed ${seed})`);
      }
    }
  });
});

describe("A4.5 guards", () => {
  const app = (f) => readFileSync(resolve(root, "src/app", f), "utf8");
  const appFiles = readdirSync(resolve(root, "src/app")).filter((f) => f.endsWith(".jsx"));
  test("no screen reads session.volume or computes volume itself — only through the access point", () => {
    // reading the stored field directly is allowed only where it is written / synced (finish(), sync)
    const allowed = new Set(["18-active-workout.jsx", "07-sync-queue-push.jsx", "08-sync-meta-pull-conflicts.jsx"]);
    for (const f of appFiles) {
      const src = app(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"); // code only
      if (!allowed.has(f)) assert.equal(src.match(/\b(?:session|s|h)\.volume\b/g), null, `${f} reads the stored volume directly`);
      assert.doesNotMatch(src, /computeSessionVolume\(/, `${f} calls computeSessionVolume directly`);
      assert.doesNotMatch(src, /\(Number\(st\.weight\) \|\| 0\) \* \(st\.reps/, `${f} has an inline volume formula`);
      assert.doesNotMatch(src, /\b(?:computeMuscleGroupWorkload|muscleGroupSessionPoints|computeCategoryLastDelta)\(/, `${f} calls a muscle-group volume function directly`);
    }
  });
  test("finish() and sync are untouched by A4.5 (identical to F1.6)", () => {
    const at = (f) => execFileSync("git", ["show", `${REF}:src/app/${f}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    for (const f of ["07-sync-queue-push.jsx", "08-sync-meta-pull-conflicts.jsx", "04-account-init-migration.jsx", "03-normalizers-namespaces.jsx"]) {
      assert.equal(app(f), at(f), `${f} changed`);
    }
    // SEC-HF-01 (18.10.2026) changed the draft / finish SAFETY of 18-active-workout.jsx and
    // 05-storage-keys-draft-pro.jsx. What A4.5 protects stays byte-identical: the volume and totals
    // formulas of finish() and the storage helpers loadKey / saveKey.
    const block = (src, from, to) => {
      const i = src.indexOf(from);
      const j = src.indexOf(to, i);
      assert.ok(i >= 0 && j > i, `block ${from} … ${to} found`);
      return src.slice(i, j);
    };
    const formulas = (src) => block(src, "const allItems = blocks.flatMap((b) => b.items);", "// Analysis with the current engine");
    assert.equal(formulas(app("18-active-workout.jsx")), formulas(at("18-active-workout.jsx")), "finish() volume formulas changed");
    const sessionFields = "      exercisesCount: withSets.length,\n      totalSets,\n      totalReps,\n      totalWeight,\n      volume,\n";
    assert.ok(app("18-active-workout.jsx").includes(sessionFields), "the stored session fields are the same");
    const helpers = (src) => block(src, "async function loadKey(key) {", "// SEC-HF-01 (P0-2)").trim() || "";
    const helpersRef = (src) => block(src, "async function loadKey(key) {", "/* ---").trim();
    assert.equal(helpers(app("05-storage-keys-draft-pro.jsx")), helpersRef(at("05-storage-keys-draft-pro.jsx")), "loadKey / saveKey changed");
  });
  test("the access point reports the F1.6 source and does not use the new load engine yet", () => {
    assert.equal(VOLUME.VOLUME_SOURCE, "f1.6");
    assert.doesNotMatch(readFileSync(resolve(root, "src/engine/volume.js"), "utf8"), /from "\.\/load/);
  });
});
