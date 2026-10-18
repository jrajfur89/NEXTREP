// AT3.2c — cardio engine (AT3-D19, O-30–O-33, P1–P3; atlas spec v2 §7, tests C1–C15).
// System cardio exercises do not exist in the published atlas yet, so the tests add one to an
// in-memory copy of Batch 01 (nothing is written). Private cardio uses the private snapshot.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { validateCardioSet, parseDurationInput, parseDistanceInput, paceSecPerKm, cardioSetValues, CARDIO_LIMITS } from "../../src/engine/cardio.js";
import { cardioPerformance, cardioPeriodStats, cardioTrend, compareCardio } from "../../src/engine/cardio-stats.js";
import { exerciseTotals, sessionTotals, normalizeLoad, isPerformed } from "../../src/engine/load.js";
import { buildLoadSnapshot, modelFromSnapshot, validateLoadSnapshot } from "../../src/engine/load-snapshot.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { buildHierarchyIndex } from "../../src/engine/hierarchy.js";
import { aggregateMuscleWork } from "../../src/engine/muscle-stats.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BATCH01 = JSON.parse(readFileSync(resolve(ROOT, "src/atlas/atlas.json"), "utf8"));
const NAV = JSON.parse(readFileSync(resolve(ROOT, "src/atlas/navigation.json"), "utf8"));
const H = buildHierarchyIndex(NAV);
const NOW = "2026-10-18T12:00:00.000Z";

// in-memory atlas with two system cardio exercises (not part of the published catalog)
function atlasWithCardio() {
  const a = structuredClone(BATCH01);
  const base = a.exercises.find((e) => e.exerciseId === "plank_forearm");
  const cardio = (id, familyId, namePl) => ({ ...structuredClone(base), exerciseId: id, familyId, namePl, aliasesPl: [], variantAttributes: [], equipment: [], primaryMuscles: [], secondaryMuscles: [], measurementType: "cardio", loadModel: "cardio", tipsPl: "" });
  a.families.push({ familyId: "run_test", namePl: "Bieg (test)", status: "active" }, { familyId: "row_erg_test", namePl: "Ergometr (test)", status: "active" });
  a.exercises.push(cardio("run_cardio_test", "run_test", "Bieg na bieżni (test)"), cardio("row_erg_cardio_test", "row_erg_test", "Ergometr wioślarski (test)"));
  a.issuedIds.push("run_cardio_test", "row_erg_cardio_test");
  return a;
}
const ATLAS = atlasWithCardio();
const byId = new Map(ATLAS.exercises.map((e) => [e.exerciseId, e]));

let seq = 0;
const C = (durationSec, distanceM, extra = {}) => ({ id: `c${++seq}`, setType: "working", ...(durationSec !== undefined ? { durationSec } : {}), ...(distanceM !== undefined ? { distanceM } : {}), ...extra });
const sys = (id, sets, over = {}) => ({ catalogExerciseId: id, loadSnapshot: buildLoadSnapshot({ exercise: { ...byId.get(id), ...over }, atlasVersion: 1, now: NOW }), sets });
const PID = "00000000-0000-4000-8000-0000000000c0";
const priv = (sets, fields = {}) => ({ privateExerciseId: PID, loadSnapshot: buildLoadSnapshot({ privateExercise: { privateExerciseId: PID, measurementType: "cardio", loadModel: "cardio", laterality: "bilateral", repsCounting: "total", primaryMuscles: [], secondaryMuscles: [], ...fields }, now: NOW }), sets });
const run = (sets) => sys("run_cardio_test", sets);
const totalsOf = (entry) => exerciseTotals(entry.sets, modelFromSnapshot(entry.loadSnapshot));
const squat = () => ({ catalogExerciseId: "squat_barbell_back", loadSnapshot: buildLoadSnapshot({ exercise: byId.get("squat_barbell_back"), atlasVersion: 1, now: NOW }), sets: [1, 2, 3].map((i) => ({ id: `sq${++seq}`, weight: "100", reps: "5", setType: "normal" })) });
const workout = (id, date, ...exercises) => ({ id, date, exercises });

describe("AT3.2c — C1–C7: sets, values, validation", () => {
  test("C1 time only: performed, 1800 s, no distance, no pace", () => {
    const p = cardioPerformance(run([C(1800)]));
    assert.deepEqual([p.sets, p.durationSec, p.distanceM, p.paceSecPerKm], [1, 1800, null, null]);
  });

  test("C2 distance only: performed, 5000 m, no time, no pace", () => {
    const p = cardioPerformance(run([C(undefined, 5000)]));
    assert.deepEqual([p.sets, p.durationSec, p.distanceM, p.paceSecPerKm], [1, null, 5000, null]);
  });

  test("C3 time and distance: pace 300 s/km (5:00/km), derived and never stored", () => {
    const e = run([C(1500, 5000)]);
    assert.equal(cardioPerformance(e).paceSecPerKm, 300);
    assert.equal(paceSecPerKm(1500, 5000), 300);
    assert.ok(!("paceSecPerKm" in e.sets[0]));
    assert.deepEqual(validateCardioSet({ ...e.sets[0], paceSecPerKm: 300 }).errors, [{ code: "FIELD_NOT_ALLOWED", field: "paceSecPerKm" }]);
  });

  test("C4 intervals: 1200 s, 2000 m, pace only from sets with both values = 300 s/km", () => {
    const t = totalsOf(run([C(300, 1000), C(300, 1000), C(600)]));
    assert.deepEqual([t.workingSets, t.durationSec, t.distanceM, t.paceSecPerKm], [3, 1200, 2000, 300]);
  });

  test("C5 input with a comma and mm:ss", () => {
    assert.deepEqual(parseDistanceInput("5,2"), { value: 5200, error: null });
    assert.deepEqual(parseDurationInput("25:30"), { value: 1530, error: null });
    assert.deepEqual(parseDurationInput("1:02:03"), { value: 3723, error: null });
    assert.deepEqual(parseDurationInput("30"), { value: 1800, error: null }); // minutes
    assert.deepEqual(parseDistanceInput("800 m"), { value: 800, error: null });
    assert.deepEqual(parseDistanceInput("5.2 km"), { value: 5200, error: null });
    assert.deepEqual(parseDistanceInput(""), { value: null, error: null }); // empty = no value
  });

  test("C6 errors: negative distance, text time, explicit zero — three errors, nothing stored as a number", () => {
    assert.deepEqual(parseDistanceInput("-1"), { value: null, error: "NEGATIVE" });
    assert.deepEqual(parseDurationInput("abc"), { value: null, error: "FORMAT" });
    assert.deepEqual(parseDurationInput("0"), { value: null, error: "ZERO" });
    const r = validateCardioSet({ durationSec: "abc", distanceM: -1 });
    assert.deepEqual(r.errors, [{ code: "TYPE", field: "durationSec" }, { code: "NEGATIVE", field: "distanceM" }]);
    assert.deepEqual(validateCardioSet({ durationSec: 0 }).errors, [{ code: "ZERO", field: "durationSec" }]);
    assert.deepEqual([r.performed, r.values], [false, { durationSec: null, distanceM: null }]);
    assert.deepEqual(validateCardioSet({ durationSec: 1.5 }).errors, [{ code: "NOT_INTEGER", field: "durationSec" }]);
    assert.deepEqual(validateCardioSet({ durationSec: CARDIO_LIMITS.durationSec.max + 1, distanceM: CARDIO_LIMITS.distanceM.max + 1 }).errors.map((e) => e.code), ["TOO_LARGE", "TOO_LARGE"]);
    assert.deepEqual(validateCardioSet({ durationSec: 86400, distanceM: 1000000 }).errors, []);
  });

  test("C7 neither value: the set is not performed and counts for nothing", () => {
    const e = run([C(), C(null, ""), C(0, 0)]);
    assert.equal(isPerformed(e.sets[0], modelFromSnapshot(e.loadSnapshot)), false);
    assert.equal(totalsOf(e).workingSets, 0);
    assert.equal(cardioPerformance(e), null);
    const s = sessionTotals({ exercises: [e] }, (x) => modelFromSnapshot(x.loadSnapshot));
    assert.deepEqual(s.cardio, { activities: 0, sets: 0, durationSec: 0, byExercise: {} });
    assert.equal(validateCardioSet(e.sets[0]).performed, false);
    assert.deepEqual(validateCardioSet(e.sets[0]).errors, []); // empty is not an error
  });
});

describe("AT3.2c — C8–C10: aggregation apart from strength", () => {
  test("C8 mixed workout: strength sums without cardio, a separate cardio block, no cardio in muscle nodes", () => {
    const entries = [squat(), run([C(1500, 5000)])];
    const s = sessionTotals({ exercises: entries }, (x) => modelFromSnapshot(x.loadSnapshot));
    assert.deepEqual([s.workingSets, s.volumeKg, s.seconds, s.reps], [3, 1500, 0, 15]);
    assert.deepEqual([s.cardio.activities, s.cardio.sets, s.cardio.durationSec], [1, 1, 1500]);
    assert.deepEqual([s.cardio.byExercise.run_cardio_test.distanceM, s.cardio.byExercise.run_cardio_test.paceSecPerKm], [5000, 300]);
    const m = aggregateMuscleWork({ exercises: entries }, H);
    assert.deepEqual([m.primary.categories.legs.sets, m.cardio.entries, m.workout.cardio.durationSec], [3, 1, 1500]);
    for (const level of ["categories", "subregions", "muscles"]) assert.ok(Object.values(m.primary[level]).every((x) => x.seconds === 0));
  });

  test("C9 several activities: total time summed, distance per activity only (no 7000 m total)", () => {
    const st = cardioPeriodStats([workout("w1", "2026-10-01", run([C(1500, 5000)]), sys("row_erg_cardio_test", [C(600, 2000)]))]);
    assert.deepEqual(st.category, { activities: 2, durationSec: 2100 });
    assert.equal(st.byExercise.run_cardio_test.distanceM, 5000);
    assert.equal(st.byExercise.row_erg_cardio_test.distanceM, 2000);
    assert.ok(!("distanceM" in st.category));
    const s = sessionTotals({ exercises: [run([C(1500, 5000)]), sys("row_erg_cardio_test", [C(600, 2000)])] }, (x) => modelFromSnapshot(x.loadSnapshot));
    assert.equal(s.cardio.durationSec, 2100);
    assert.ok(!("distanceM" in s.cardio));
  });

  test("C10 private cardio with an informational muscle: valid private snapshot, pace 300, not in legs", () => {
    const e = priv([C(900, 3000)], { primaryMuscles: ["quadriceps"] });
    assert.deepEqual(validateLoadSnapshot(e.loadSnapshot), []);
    assert.equal(e.loadSnapshot.source, "private");
    const p = cardioPerformance(e);
    assert.deepEqual([p.exerciseId, p.paceSecPerKm, p.source], [PID, 300, "private"]);
    const m = aggregateMuscleWork({ exercises: [e] }, H);
    assert.equal(m.primary.subregions["legs.quads"], undefined);
    assert.equal(m.primary.categories.legs, undefined);
    assert.equal(m.cardio.entries, 1);
    assert.equal(cardioPeriodStats([workout("w", null, e)]).byExercise[PID].distanceM, 3000);
  });
});

describe("AT3.2c — C11–C12 and P1: comparisons", () => {
  const perf = (sets, over) => cardioPerformance(over ? sys("run_cardio_test", sets, over) : run(sets));

  test("C11 same activity, same distance, faster: pace better, distance same, time better", () => {
    const r = compareCardio(perf([C(1560, 5000)]), perf([C(1500, 5000)]));
    assert.equal(r.comparable, true);
    assert.deepEqual(r.metrics.paceSecPerKm, { before: 312, after: 300, delta: -12, verdict: "better" });
    assert.deepEqual(r.metrics.distanceM, { before: 5000, after: 5000, delta: 0, verdict: "same" });
    assert.deepEqual(r.metrics.durationSec, { before: 1560, after: 1500, delta: -60, verdict: "better" });
  });

  test("C12 no shared metric: time only before, distance only now — no comparison, no combined result", () => {
    const r = compareCardio(perf([C(1800)]), perf([C(undefined, 5000)]));
    assert.deepEqual([r.reason, r.metrics], ["NO_SHARED_METRIC", {}]);
  });

  test("P1: time without an identical distance is information only", () => {
    const longer = compareCardio(perf([C(1500, 5000)]), perf([C(1600, 5500)]));
    assert.equal(longer.metrics.durationSec.verdict, null);
    assert.equal(longer.metrics.distanceM.verdict, "better");
    assert.equal(compareCardio(perf([C(1800)]), perf([C(1700)])).metrics.durationSec.verdict, null); // time only
  });

  test("P1: a different activity or a different model from the snapshot is not evaluated", () => {
    const other = cardioPerformance(sys("row_erg_cardio_test", [C(1500, 5000)]));
    assert.deepEqual(compareCardio(perf([C(1500, 5000)]), other), { comparable: false, reason: "DIFFERENT_ACTIVITY", metrics: {} });
    const r = compareCardio(perf([C(1560, 5000)]), perf([C(1500, 5000)], { entryRev: 2 }));
    assert.deepEqual([r.comparable, r.reason], [false, "DIFFERENT_MODEL"]);
    for (const m of Object.values(r.metrics)) assert.equal(m.verdict, null);
    assert.equal(r.metrics.durationSec.delta, -60); // the change is still shown as information
  });

  test("history and trend: last ≤ 10 performances, one series per metric", () => {
    const ws = Array.from({ length: 12 }, (_, i) => workout(`w${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`, i % 3 === 0 ? run([C(1500 + i)]) : run([C(1500 - i, 5000)])));
    const t = cardioTrend(ws, "run_cardio_test");
    assert.equal(t.performances, 10);
    assert.equal(t.durationSec.length, 10);
    assert.equal(t.distanceM.length, ws.slice(-10).filter((_, k) => (k + 2) % 3 !== 0).length);
    assert.equal(t.durationSec[0].workoutId, "w2");
    assert.ok(t.paceSecPerKm.every((x) => x.value > 0));
  });
});

describe("AT3.2c — C13–C15: atlas, contract, validation of system and private cardio", () => {
  test("C13 cardio without muscles: no M1 error, valid snapshot; strength without a primary muscle still fails M1", () => {
    const r = validateAtlas(ATLAS);
    assert.deepEqual(r.issues.filter((i) => i.level === "error"), []);
    assert.deepEqual(validateLoadSnapshot(sys("run_cardio_test", []).loadSnapshot), []);
    const bad = structuredClone(ATLAS);
    bad.exercises.find((e) => e.exerciseId === "squat_barbell_back").primaryMuscles = [];
    assert.deepEqual(validateAtlas(bad).issues.filter((i) => i.level === "error").map((i) => [i.code, i.exerciseId]), [["PRIMARY_MUSCLE_REQUIRED", "squat_barbell_back"]]);
  });

  test("C14 time and distance only: kcal, heart rate, speed, incline are refused by the set contract", () => {
    const r = validateCardioSet({ durationSec: 1500, distanceM: 5000, kcal: 300, heartRate: 150, speed: 12, incline: 2 });
    assert.deepEqual(r.errors.map((e) => e.field), ["kcal", "heartRate", "speed", "incline"]);
    assert.ok(r.errors.every((e) => e.code === "FIELD_NOT_ALLOWED"));
  });

  test("C15 one value valid, the other an explicit 0 — system and private alike", () => {
    for (const make of [(sets) => run(sets), (sets) => priv(sets)]) {
      const e = make([C(1500, 0)]);
      const v = validateCardioSet(e.sets[0]);
      assert.deepEqual(v.errors, [{ code: "ZERO", field: "distanceM" }]);
      assert.deepEqual([v.performed, v.values], [true, { durationSec: 1500, distanceM: null }]);
      const p = cardioPerformance(e);
      assert.deepEqual([p.sets, p.durationSec, p.distanceM, p.paceSecPerKm], [1, 1500, null, null]);
    }
  });

  test("the engine reads only valid values (invalid ones count as absent); the older `duration` field still works", () => {
    assert.deepEqual(cardioSetValues({ durationSec: -5, distanceM: 4000 }), { durationSec: null, distanceM: 4000 });
    assert.deepEqual(cardioSetValues({ duration: "600" }), { durationSec: 600, distanceM: null });
    const n = normalizeLoad({ durationSec: 600, distanceM: 2000 }, { loadModel: "cardio" });
    assert.deepEqual([n.counts, n.seconds, n.durationSec, n.distanceM, n.volumeKg], [true, 600, 600, 2000, 0]);
    // warmup cardio sets count for nothing (D5)
    assert.equal(totalsOf(run([C(600, 2000, { setType: "warmup" })])).workingSets, 0);
  });
});

describe("AT3.2c — strength results are unchanged (only the model cardio changed)", () => {
  test("random workouts without cardio: exerciseTotals and sessionTotals equal the AT3.2b engine", async () => {
    const dir = mkdtempSync(join(tmpdir(), "at32c-ref-"));
    try {
      mkdirSync(join(dir, "src/engine"), { recursive: true });
      for (const f of ["load.js", "rir.js"]) writeFileSync(join(dir, "src/engine", f), execFileSync("git", ["show", `28ab16e:src/engine/${f}`], { cwd: ROOT }));
      writeFileSync(join(dir, "package.json"), '{"type":"module"}');
      const old = await import(pathToFileURL(join(dir, "src/engine/load.js")).href);
      let s0 = 11;
      const r = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const pick = (a) => a[Math.floor(r() * a.length)];
      const models = ["barbell_total", "dumbbell_pair", "dumbbell_single", "kettlebell_pair", "machine_stack", "cable", "bodyweight", "bodyweight_plus", "assisted", "band", "time", "sets_only", "external_unknown"];
      const set = () => ({ weight: pick(["", "20", "57,5", "0", "x", null]), reps: pick(["", "8", "10", "0", null]), duration: pick(["", "45", "60", null]), rir: pick(["", "1", "0-1"]), setType: pick(["normal", "dropset", "warmup"]), status: pick([undefined, "skipped", "done"]), done: pick([true, false]) });
      for (let i = 0; i < 2000; i++) {
        const ms = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ loadModel: pick(models), confidence: pick(["high", "low", "verified"]), laterality: pick(["bilateral", "unilateral", "alternating"]) }));
        const session = { exercises: ms.map((m, k) => ({ exerciseId: String(k), sets: Array.from({ length: Math.floor(r() * 5) }, set) })) };
        const now = sessionTotals(session, (e) => ms[Number(e.exerciseId)]);
        const before = old.sessionTotals(session, (e) => ms[Number(e.exerciseId)]);
        for (const k of ["workingSets", "reps", "repsAllSides", "seconds", "volumeKg", "volumeStatus"]) assert.equal(now[k], before[k], k);
        now.exercises.forEach((e, k) => {
          for (const [key, v] of Object.entries(before.exercises[k].totals)) assert.deepEqual(e.totals[key], v, key);
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
