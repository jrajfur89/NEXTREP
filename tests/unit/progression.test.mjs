// Progression engine (computeExerciseAnalysis & helpers) — new suite written 2026-10-06 against the current
// index.html. Covers the documented engine rules and the "rep overshoot / reps above plan range"
// stage (commit 5228ecba).
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "../harness/load-app.mjs";
import { W, BW, T, DROP, plan, hist, session, ex } from "../harness/fixtures.mjs";

let A;
before(async () => {
  A = await loadApp();
});

const run = (sets, setsDetail, history = [], kind = "weight", date = "2026-09-20T10:00:00") =>
  A.computeExerciseAnalysis({ sets, kind, setsDetail, history, date: new Date(date).toISOString() });

describe("parsers and volume", () => {
  test("parseRepRange", () => {
    assert.deepEqual(A.parseRepRange("8-10"), { min: 8, max: 10 });
    assert.deepEqual(A.parseRepRange("10"), { min: 10, max: 10 });
    assert.deepEqual(A.parseRepRange("20-30 s"), { min: 20, max: 30 });
    assert.deepEqual(A.parseRepRange("12–8"), { min: 8, max: 12 });
    assert.equal(A.parseRepRange(""), null);
    assert.equal(A.parseRepRange("brak"), null);
  });
  test("parseRirBounds and formatRir (4 categories, '2' = 2 or more)", () => {
    assert.deepEqual(A.parseRirBounds("0-1"), { lo: 0, hi: 1 });
    assert.deepEqual(A.parseRirBounds("2"), { lo: 2, hi: 3 });
    assert.deepEqual(A.parseRirBounds(3), { lo: 3, hi: 3 });
    assert.equal(A.parseRirBounds(""), null);
    assert.equal(A.formatRir("0"), "0");
    assert.equal(A.formatRir("0-1"), "0–1");
    assert.equal(A.formatRir("1-2"), "1–2");
    assert.equal(A.formatRir("2"), "2");
    assert.equal(A.formatRir(3), "2", "legacy numeric 3 is shown as top category '2'");
    assert.equal(A.formatRir(1), "1–2");
  });
  test("overallRepRange = union of all planned series", () => {
    assert.deepEqual(A.overallRepRange(plan("8-10", "6-8", "10-12")), { min: 6, max: 12 });
    assert.equal(A.overallRepRange([]), null);
  });
  test("computeSessionVolume per kind, dropsets excluded, body mass never added", () => {
    const sets = [W(100, 10), W(100, 8), DROP(60, 12)];
    assert.equal(A.computeSessionVolume(sets, "weight", false), 1800);
    assert.equal(A.computeSessionVolume([BW(12), BW(10)], "bodyweight", false), 22);
    assert.equal(A.computeSessionVolume([T(30), T(45)], "time", true), 75);
    // bodyweightPlus: MW +10 kg × (8, 8, 7) = 230 (documented example in the code)
    assert.equal(A.computeSessionVolume([W(10, 8), W(10, 8), W(10, 7)], "bodyweightPlus", false), 230);
  });
  test("comma decimal weights are parsed (toNumber)", () => {
    assert.equal(A.computeSessionVolume([W("22,5", 10)], "weight", false), 225);
  });
});

describe("comparePerformances — signal hierarchy incl. overshoot", () => {
  const P = (sets, range = { min: 8, max: 10 }, date = null) => A.summarizePerformance(sets, "weight", range, date);
  test("load up / load down decide first", () => {
    assert.equal(A.comparePerformances(P([W(105, 6)]), P([W(100, 10)]), true).type, "loadUp");
    assert.equal(A.comparePerformances(P([W(95, 12)]), P([W(100, 8)]), true).type, "loadDown");
  });
  test("more reps inside the range → better/reps", () => {
    const c = A.comparePerformances(P([W(100, 10), W(100, 9)]), P([W(100, 9), W(100, 9)]), true);
    assert.deepEqual([c.type, c.signal], ["better", "reps"]);
  });
  test("OVERSHOOT: 12 after 10 on an 8–10 plan at the same load → better/repsAboveRange", () => {
    const c = A.comparePerformances(P([W(100, 12)]), P([W(100, 10)]), true);
    assert.deepEqual([c.type, c.signal], ["better", "repsAboveRange"]);
  });
  test("OVERSHOOT: 11 after 12 (both above range) is NOT a decline (capped tie)", () => {
    const c = A.comparePerformances(P([W(100, 11)]), P([W(100, 12)]), true);
    assert.notEqual(c.type, "worse");
    assert.equal(c.type, "same");
  });
  test("OVERSHOOT: a surplus in one set never covers a weaker set (capped values decide first)", () => {
    // capped [10, 8] = 18 < [10, 10] = 20
    const c = A.comparePerformances(P([W(100, 12), W(100, 8)]), P([W(100, 10), W(100, 10)]), true);
    assert.equal(c.type, "worse");
  });
  test("same reps, higher RIR → better/rir; lower RIR → same + rirWorse", () => {
    const up = A.comparePerformances(P([W(100, 10, "2")]), P([W(100, 10, "0-1")]), true);
    assert.deepEqual([up.type, up.signal], ["better", "rir"]);
    const down = A.comparePerformances(P([W(100, 10, "0")]), P([W(100, 10, "2")]), true);
    assert.equal(down.type, "same");
    assert.equal(down.rirWorse, true);
  });
  test("more sets at the same top load → better/moreSetsAtLoad", () => {
    const c = A.comparePerformances(P([W(100, 8), W(100, 8), W(100, 8)]), P([W(100, 8), W(100, 8)]), true);
    assert.deepEqual([c.type, c.signal], ["better", "moreSetsAtLoad"]);
  });
  test("afterBreak flag when the gap is > 14 days", () => {
    const c = A.comparePerformances(P([W(100, 8)], undefined, "2026-09-30"), P([W(100, 10)], undefined, "2026-09-01"), true);
    assert.equal(c.type, "worse");
    assert.equal(c.afterBreak, true);
  });
});

describe("computeExerciseAnalysis — statuses", () => {
  const p810 = plan("8-10", "8-10", "8-10");

  test("first performance = baseline, yellow, no progress/trend words", () => {
    const a = run([W(100, 10), W(100, 10), W(100, 9)], p810);
    assert.equal(a.baseline, true);
    assert.equal(a.status, "yellow");
    assert.equal(a.analyzedCount, 1);
    assert.match(a.message, /punkt odniesienia/);
    assert.doesNotMatch(a.message, /Progres|Trend|stagnacja/);
  });

  test("more reps than last time → green 'Progres'", () => {
    const a = run([W(100, 10), W(100, 9), W(100, 9)], p810, hist([[W(100, 9), W(100, 9), W(100, 8)], "2026-09-17"]));
    assert.equal(a.status, "green");
    assert.match(a.message, /^Progres: więcej powtórzeń przy 100 kg/);
  });

  test("OVERSHOOT end-to-end: 12,12,12 after 10,10,10 on 8–10 → green + 'powyżej górnej granicy'", () => {
    const a = run([W(100, 12), W(100, 12), W(100, 12)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-09-17"]));
    assert.equal(a.status, "green");
    assert.match(a.analysisText, /powyżej górnej granicy zakresu planu/);
    assert.match(a.currentLine, /Pełna realizacja celu planu \(8–10 powt\.\) przy 100 kg — powyżej górnej granicy: 12 powt\./);
  });

  // Post-smoke-test fix: the overshoot plan line ends with EXACTLY one period
  // (production showed "… 12 powt.." because "powt." already carries its own period).
  const noDoublePeriod = (a) => {
    for (const f of ["message", "currentLine", "analysisText", "recommendation"]) assert.doesNotMatch(a[f], /\.\./, `${f}: ${a[f]}`);
  };
  test("OVERSHOOT text, weight: ends exactly '… 12 powt.' (one period)", () => {
    const a = run([W(60, 12, "1-2"), W(60, 12, "1-2"), W(60, 12, "1-2")], p810, hist([[W(60, 10, "1-2"), W(60, 10, "1-2"), W(60, 10, "1-2")], "2026-10-03"]));
    assert.equal(a.currentLine, "Pełna realizacja celu planu (8–10 powt.) przy 60 kg — powyżej górnej granicy: 12 powt.");
    assert.equal(a.status, "green", "status unchanged by the text fix");
    noDoublePeriod(a);
  });
  test("OVERSHOOT text, bodyweight: ends exactly '… 15 powt.' (one period)", () => {
    const a = run([BW(15), BW(15)], plan("8-12", "8-12"), hist([[BW(12), BW(12)], "2026-10-03"]), "bodyweight");
    assert.equal(a.currentLine, "Pełna realizacja celu planu (8–12 powt.) — powyżej górnej granicy: 15 powt.");
    noDoublePeriod(a);
  });
  test("OVERSHOOT text, time: '… 50 s.' keeps its single closing period", () => {
    const a = run([T(50), T(50)], plan("30-45", "30-45"), hist([[T(45), T(45)], "2026-10-03"]), "time");
    assert.equal(a.currentLine, "Pełna realizacja celu planu (30–45 s) — powyżej górnej granicy: 50 s.");
    noDoublePeriod(a);
  });
  test("plan line without overshoot still ends with one period", () => {
    const a = run([W(60, 10), W(60, 10), W(60, 10)], p810, hist([[W(60, 9), W(60, 9), W(60, 9)], "2026-10-03"]));
    assert.equal(a.currentLine, "Pełna realizacja celu planu (8–10 powt.) przy 60 kg.");
  });

  test("OVERSHOOT does not change the plan range (still judged against 8–10)", () => {
    const a = run([W(100, 12), W(100, 12), W(100, 12)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-09-17"]));
    assert.match(a.recommendation + a.currentLine, /8–10/);
    assert.doesNotMatch(a.message, /12–12|8–12/);
  });

  test("higher load held in ≥2 sets in range → green", () => {
    const a = run([W(105, 8), W(105, 8), W(105, 8)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-09-17"]));
    assert.equal(a.status, "green");
    assert.match(a.message, /Wyższy ciężar niż poprzednio \(105 kg\)/);
  });

  test("higher load but below range → yellow (stabilisation, not regress)", () => {
    const a = run([W(110, 6), W(110, 5)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-09-17"]));
    assert.equal(a.status, "yellow");
    assert.match(a.message, /normalny etap stabilizacji/);
  });

  test("lower load → yellow, never red", () => {
    const a = run([W(90, 10), W(90, 10), W(90, 10)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-09-17"]));
    assert.equal(a.status, "yellow");
    assert.match(a.message, /niższym ciężarze/);
  });

  test("one weaker workout with only 2 performances → yellow 'Wstępny sygnał'", () => {
    const a = run([W(100, 8), W(100, 8), W(100, 8)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-09-17"]));
    assert.equal(a.status, "yellow");
    assert.match(a.message, /Wstępny sygnał/);
  });

  test("second consecutive weaker result at same load → red", () => {
    const a = run(
      [W(100, 8), W(100, 8), W(100, 8)],
      p810,
      hist([[W(100, 9), W(100, 9), W(100, 9)], "2026-09-17"], [[W(100, 10), W(100, 10), W(100, 10)], "2026-09-14"])
    );
    assert.equal(a.status, "red");
    assert.match(a.message, /Drugi kolejny słabszy wynik/);
    assert.equal(a.recommendation, "");
  });

  test("weaker result after > 14 days break → yellow, explicitly not a regress", () => {
    const a = run([W(100, 8), W(100, 8), W(100, 8)], p810, hist([[W(100, 10), W(100, 10), W(100, 10)], "2026-08-20"]));
    assert.equal(a.status, "yellow");
    assert.match(a.message, /po dłuższej przerwie/);
  });

  test("note 'gorszy dzień' → weaker result is context, not regress (never red)", () => {
    const sets = [W(100, 8, "", { note: "gorszy dzień, niewyspany" }), W(100, 8), W(100, 8)];
    const a = run(sets, p810, hist([[W(100, 9), W(100, 9), W(100, 9)], "2026-09-17"], [[W(100, 10), W(100, 10), W(100, 10)], "2026-09-14"]));
    assert.equal(a.status, "yellow");
    assert.match(a.message, /słabszy dzień/);
  });

  test("three flat performances at same load → possible stagnation", () => {
    const s = () => [W(100, 9), W(100, 9), W(100, 9)];
    const a = run(s(), p810, hist([s(), "2026-09-17"], [s(), "2026-09-14"]));
    assert.equal(a.status, "stagnation");
    assert.match(a.message, /Możliwa stagnacja/);
  });

  // Post-smoke-test fix: "bez przekroczenia 8 powt.. Pracuj" → "8 powt. Pracuj"; time keeps "30 s.".
  test("STAGNATION text (at/below min): '8 powt.' followed by one period only", () => {
    const a = run([W(60, 8), W(60, 8)], plan("8-10", "8-10"), hist([[W(60, 8), W(60, 8)], "2026-10-03"]));
    assert.equal(a.status, "stagnation");
    assert.match(a.analysisText, /bez przekroczenia 8 powt\. Pracuj dalej/);
    assert.doesNotMatch(a.message + a.analysisText, /\.\./);
  });
  test("STAGNATION text, time: '30 s.' keeps its closing period", () => {
    const a = run([T(30), T(30)], plan("30-45", "30-45"), hist([[T(30), T(30)], "2026-10-03"]), "time");
    assert.equal(a.status, "stagnation");
    assert.match(a.analysisText, /bez przekroczenia 30 s\. Pracuj dalej/);
  });

  test("twice at top of range with RIR reserve at same load → 'można rozważyć zwiększenie', never a concrete kg", () => {
    const s = () => [W(100, 10, "1-2"), W(100, 10, "2"), W(100, 10, "1-2")];
    const a = run(s(), p810, hist([s(), "2026-09-17"]));
    assert.match(a.recommendation, /Można rozważyć zwiększenie ciężaru/);
    assert.doesNotMatch(a.message, /\d+(,\d+)? ?kg\b.*(dodaj|zwiększ do)/i);
    assert.equal(a.suggestedWeight, 100, "pre-fill = weight actually used, no invented increment");
  });

  test("top of range at RIR 0 → hold, build reserve (not a regress)", () => {
    const s = () => [W(100, 10, "0"), W(100, 10, "0"), W(100, 10, "0")];
    const a = run(s(), p810, hist([s(), "2026-09-17"]));
    assert.match(a.recommendation, /blisko upadku mięśniowego/);
  });

  test("note 'za ciężko' → never suggest an increase", () => {
    const s = (note) => [W(100, 10, "2", note ? { note } : {}), W(100, 10, "2"), W(100, 10, "2")];
    const a = run(s("za ciężko, nie zwiększać"), p810, hist([s(), "2026-09-17"]));
    assert.doesNotMatch(a.recommendation, /rozważyć zwiększenie/);
    assert.match(a.recommendation, /nie ma powodu, żeby go teraz zwiększać/);
  });

  test("first-set pre-fill = where the person actually started (ramp set)", () => {
    const a = run([W(80, 10), W(100, 10), W(100, 10)], p810, hist([[W(100, 9), W(100, 9)], "2026-09-17"]));
    assert.equal(a.suggestedFirstSetWeight, 80);
    assert.equal(a.suggestedWeight, 100);
  });

  test("'sets only' kind → no progression judgement", () => {
    const a = run([{ done: true }], p810, [], "sets");
    assert.equal(a.baseline, true);
    assert.match(a.message, /nie ocenia progresji/);
  });

  test("time kind uses seconds and 'czasu' wording", () => {
    const a = run([T(40), T(40)], plan("30-45", "30-45"), hist([[T(35), T(35)], "2026-09-17"]), "time");
    assert.equal(a.status, "green");
    assert.match(a.message, /więcej czasu/);
  });

  test("bodyweight: more reps → green", () => {
    const a = run([BW(12), BW(12)], plan("8-15", "8-15"), hist([[BW(10), BW(10)], "2026-09-17"]), "bodyweight");
    assert.equal(a.status, "green");
  });

  test("trend line only from 3 performances, 'mocna podstawa' from 5", () => {
    const s = (r) => [W(100, r), W(100, r), W(100, r)];
    const a3 = run(s(10), p810, hist([s(9), "2026-09-17"], [s(8), "2026-09-14"]));
    assert.match(a3.message, /Trend z 3 ostatnich wykonań: rosnący/);
    const a5 = run(s(10), p810, hist([s(9), "2026-09-17"], [s(8), "2026-09-14"], [s(8), "2026-09-10"], [s(8), "2026-09-07"]));
    assert.match(a5.message, /mocna podstawa danych/);
  });

  test("window capped at PROGRESSION_MAX_PERFORMANCES (10)", () => {
    const s = () => [W(100, 9), W(100, 9)];
    const many = Array.from({ length: 15 }, (_, i) => [s(), `2026-09-${String(18 - i).padStart(2, "0")}`]);
    const a = run(s(), plan("8-10", "8-10"), hist(...many));
    assert.equal(a.analyzedCount, 10);
  });
});

describe("history chronology (session.date is the only source)", () => {
  test("exerciseHistoryBefore: strictly before the date, most recent first, excludes the session itself", () => {
    const s1 = session("2026-09-01T10:00:00", [ex("bench_press", "weight", [W(90, 10)])]);
    const s2 = session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(95, 10)])]);
    const s3 = session("2026-09-20T10:00:00", [ex("bench_press", "weight", [W(100, 10)])]);
    const other = session("2026-09-05T10:00:00", [ex("squat_barbell", "weight", [W(120, 5)])]);
    const history = [s3, other, s1, s2]; // array order deliberately scrambled
    const h = A.exerciseHistoryBefore(history, "bench_press", s3.date, s3.id);
    assert.deepEqual(h.map((x) => x.sets[0].weight), ["95", "90"]);
  });

  test("analyzeSessionExercise on a BACKFILLED old workout never sees later data", () => {
    const later = session("2026-09-20T10:00:00", [ex("bench_press", "weight", [W(120, 10), W(120, 10)], plan("8-10", "8-10"))]);
    const backfilled = session("2026-09-01T10:00:00", [ex("bench_press", "weight", [W(100, 10), W(100, 10)], plan("8-10", "8-10"))]);
    const a = A.analyzeSessionExercise([later, backfilled], backfilled, backfilled.exercises[0]);
    assert.equal(a.baseline, true, "the 120 kg session is AFTER it and must be invisible");
  });

  test("analyzeSessionExercise: cardio → null", () => {
    const s = session("2026-09-01T10:00:00", [ex("treadmill", "cardio", [{ duration: "600" }])]);
    assert.equal(A.analyzeSessionExercise([s], s, s.exercises[0]), null);
  });
});
