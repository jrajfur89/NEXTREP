// Cross-version guard for the "rep overshoot" stage — new suite written 2026-10-06.
// Compares the CURRENT engine with the engine of commit c07a61d (origin/main before 5228ecba,
// i.e. BEFORE the overshoot change), read from git with `git show` (working tree untouched).
// Expectation (stage scope): the engines differ ONLY where reps above the plan's upper bound
// decide the comparison (signal "repsAboveRange"); everything else is byte-identical.
// If the reference bundle can't be built (no git history), the suite is skipped, not failed.
//
// NOTE: this suite is pinned to the overshoot stage. A FUTURE intentional engine change will make
// it report differences — then update REF or the allowed-difference rule deliberately.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp, loadRefApp } from "../harness/load-app.mjs";
import { W, plan } from "../harness/fixtures.mjs";

const REF = "c07a61d";
const here = dirname(fileURLToPath(import.meta.url));
let NEW, OLD;

before(async () => {
  NEW = await loadApp();
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

// Deterministic pseudo-random generator (no flaky tests).
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomCase(r) {
  const lo = 6 + Math.floor(r() * 4); // 6..9
  const hi = lo + 2 + Math.floor(r() * 3); // +2..+4
  const nSets = 2 + Math.floor(r() * 3);
  const loads = [95, 100, 100, 100, 105];
  const rirs = ["", "0", "0-1", "1-2", "2"];
  const perf = () => {
    const load = loads[Math.floor(r() * loads.length)];
    return Array.from({ length: nSets }, () => W(load, lo - 2 + Math.floor(r() * (hi - lo + 6)), rirs[Math.floor(r() * rirs.length)]));
  };
  const nPrev = 1 + Math.floor(r() * 4);
  const history = Array.from({ length: nPrev }, (_, i) => ({ sets: perf(), date: new Date(Date.UTC(2026, 8, 18 - i * 3)).toISOString() }));
  return { sets: perf(), setsDetail: plan(...Array(nSets).fill(`${lo}-${hi}`)), history, date: new Date(Date.UTC(2026, 8, 21)).toISOString(), hi };
}

describe(`progression engine: current vs ${REF} (pre-overshoot)`, () => {
  test("reference bundle available (skip otherwise)", (t) => {
    if (!OLD) t.skip(`git ref ${REF} not available`);
    else assert.equal(typeof OLD.computeExerciseAnalysis, "function");
  });

  test("overshoot tests DISCRIMINATE: same 12-after-10 case differs between engines", (t) => {
    if (!OLD) return t.skip("no reference");
    // (a) 12,12 after 10,10: BOTH engines say green, but the old one only via the volume signal —
    //     the new one names reps above the range.
    const a = { sets: [W(100, 12), W(100, 12)], kind: "weight", setsDetail: plan("8-10", "8-10"), history: [{ sets: [W(100, 10), W(100, 10)], date: "2026-09-17T10:00:00.000Z" }], date: "2026-09-20T10:00:00.000Z" };
    assert.equal(OLD.computeExerciseAnalysis(a).status, "green");
    assert.doesNotMatch(OLD.computeExerciseAnalysis(a).message, /powyżej górnej granicy/);
    assert.match(NEW.computeExerciseAnalysis(a).message, /powyżej górnej granicy zakresu planu/);
    // (b) 12,12 after 10,10,10 (fewer sets → volume can't decide): old = not progress, new = green.
    const b = { ...a, setsDetail: plan("8-10", "8-10", "8-10"), history: [{ sets: [W(100, 10), W(100, 10), W(100, 10)], date: "2026-09-17T10:00:00.000Z" }] };
    assert.notEqual(OLD.computeExerciseAnalysis(b).status, "green");
    assert.equal(NEW.computeExerciseAnalysis(b).status, "green");
  });

  test("2000 random cases: identical unless reps above the range decide", (t) => {
    if (!OLD) return t.skip("no reference");
    const r = rng(20261005);
    let identical = 0;
    let overshootDiffs = 0;
    const unexplained = [];
    for (let i = 0; i < 2000; i++) {
      const c = randomCase(r);
      const args = { sets: c.sets, kind: "weight", setsDetail: c.setsDetail, history: c.history, date: c.date };
      const a = NEW.computeExerciseAnalysis(args);
      const b = OLD.computeExerciseAnalysis(args);
      if (a.status === b.status && a.message === b.message) {
        identical++;
        continue;
      }
      // Explained difference: some comparison in the chain is decided by repsAboveRange, or the
      // status is identical and the only change is TEXT:
      //   • the new "— powyżej górnej granicy: N powt." on the plan line (that "powt." also ends
      //     the sentence since the post-smoke-test fix — so it is replaced by the plain ".");
      //   • the old engine's double period after "powt." ("bez przekroczenia 8 powt.. Pracuj"),
      //     removed by the same fix (normalised on the OLD side only).
      // Rule updated deliberately with the double-period fix (README rule 3); status never differs.
      const range = NEW.overallRepRange(c.setsDetail);
      const perfs = [NEW.summarizePerformance(c.sets, "weight", range, c.date), ...c.history.map((h) => NEW.summarizePerformance(h.sets, "weight", range, h.date))];
      const chain = perfs.slice(0, -1).map((p, k) => NEW.comparePerformances(p, perfs[k + 1], true));
      const anyAbove = chain.some((x) => x.signal === "repsAboveRange");
      const textOnly = a.status === b.status && a.message.replace(/ — powyżej górnej granicy: \d+ powt\./, ".") === b.message.replace(/powt\.\./g, "powt.");
      if (anyAbove || textOnly) overshootDiffs++;
      else unexplained.push({ i, new: a.status, old: b.status, newMsg: a.message, oldMsg: b.message });
    }
    t.diagnostic(`identical=${identical} overshoot-explained=${overshootDiffs} unexplained=${unexplained.length}`);
    assert.deepEqual(unexplained.slice(0, 3), []);
    assert.ok(identical > 1000, "most cases must be untouched by the stage");
    assert.ok(overshootDiffs > 0, "the matrix must actually exercise overshoot");
  });

  // Guard (post-smoke-test fix): no engine text may ever contain "..". Runs on the CURRENT engine
  // only (no reference bundle needed, never skipped), over the same deterministic matrix for every
  // kind with a unit: weight, bodyweightPlus, bodyweight (reps) and time (seconds).
  test("no '..' in any engine text across 4 × 2000 matrix cases (all kinds)", () => {
    const toKind = (sets, kind) =>
      sets.map((s) => (kind === "time" ? { duration: String(Number(s.reps) * 5), rir: s.rir } : kind === "bodyweight" ? { ...s, weight: "" } : s));
    const fields = ["message", "currentLine", "analysisText", "recommendation"];
    const offenders = [];
    let aboveRangeSeen = 0;
    for (const kind of ["weight", "bodyweightPlus", "bodyweight", "time"]) {
      const r = rng(20261006);
      for (let i = 0; i < 2000; i++) {
        const c = randomCase(r);
        const scale = kind === "time" ? (t) => t.replace(/(\d+)/g, (n) => String(Number(n) * 5)) : (t) => t;
        const args = {
          sets: toKind(c.sets, kind),
          kind,
          setsDetail: c.setsDetail.map((sd) => ({ ...sd, target: scale(sd.target) })),
          history: c.history.map((h) => ({ ...h, sets: toKind(h.sets, kind) })),
          date: c.date,
        };
        const a = NEW.computeExerciseAnalysis(args);
        if (/powyżej górnej granicy: \d+/.test(a.currentLine)) aboveRangeSeen++;
        for (const f of fields) if (/\.\./.test(a[f] || "")) offenders.push({ kind, i, f, text: a[f] });
      }
    }
    assert.deepEqual(offenders.slice(0, 3), []);
    assert.ok(aboveRangeSeen > 100, "the matrix must contain reps/time above the range");
  });

  test("comparePerformances: identical results whenever no value exceeds the range", (t) => {
    if (!OLD) return t.skip("no reference");
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const c = randomCase(r);
      const range = NEW.overallRepRange(c.setsDetail);
      const cur = NEW.summarizePerformance(c.sets, "weight", range, c.date);
      const prev = NEW.summarizePerformance(c.history[0].sets, "weight", range, c.history[0].date);
      const above = [...cur.values, ...prev.values].some((v) => v > range.max);
      if (above) continue;
      assert.deepEqual(NEW.comparePerformances(cur, prev, true), OLD.comparePerformances(OLD.summarizePerformance(c.sets, "weight", range, c.date), OLD.summarizePerformance(c.history[0].sets, "weight", range, c.history[0].date), true));
    }
  });
});
