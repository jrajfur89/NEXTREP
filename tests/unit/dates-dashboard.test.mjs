// Dates, completed-workout date editing, backfill and Dashboard — new suite written 2026-10-06.
// Runs in TZ=Europe/Warsaw (set by harness/load-app.mjs unless TZ is already set), incl. DST.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "../harness/load-app.mjs";
import { W, plan, session, ex } from "../harness/fixtures.mjs";

let A;
before(async () => {
  A = await loadApp();
});

describe("editedSessionDateIso (completed-workout date edit)", () => {
  test("same day → original timestamp untouched", () => {
    const orig = new Date(2026, 8, 15, 18, 42, 7, 123).toISOString();
    assert.equal(A.editedSessionDateIso(orig, "2026-09-15"), orig);
  });
  test("another day → that day at the original LOCAL time of day", () => {
    const orig = new Date(2026, 8, 15, 18, 42, 7, 123).toISOString();
    const d = new Date(A.editedSessionDateIso(orig, "2026-09-03"));
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()], [2026, 8, 3, 18, 42, 7, 123]);
  });
  test("across DST (summer → winter time) the local hour is kept", () => {
    const orig = new Date(2026, 8, 15, 7, 30).toISOString(); // CEST
    const d = new Date(A.editedSessionDateIso(orig, "2026-11-10")); // CET
    assert.deepEqual([d.getHours(), d.getMinutes()], [7, 30]);
  });
  test("invalid edit value → original unchanged", () => {
    const orig = new Date(2026, 8, 15, 18, 0).toISOString();
    for (const v of ["", null, undefined, "15.09.2026", "2026-9-1"]) assert.equal(A.editedSessionDateIso(orig, v), orig);
  });
  test("broken original date → the edited day at 12:00 local", () => {
    const d = new Date(A.editedSessionDateIso("not a date", "2026-09-03"));
    assert.deepEqual([d.getDate(), d.getHours()], [3, 12]);
  });
  test("toLocalDateStr uses the LOCAL day (late evening UTC+2 is still the same local day)", () => {
    assert.equal(A.toLocalDateStr(new Date(2026, 8, 15, 23, 30)), "2026-09-15");
    assert.equal(A.toLocalDateStr("2026-09-15T22:30:00.000Z"), "2026-09-16"); // 00:30 in Warsaw
  });
});

describe("Dashboard rolling 30 days", () => {
  test("getLastCompletedWorkoutDate = max session.date regardless of order; ignores broken dates", () => {
    const h = [{ date: "2026-09-01T10:00:00.000Z" }, { date: "nope" }, { date: "2026-09-20T10:00:00.000Z" }, { date: "2026-09-05T10:00:00.000Z" }];
    assert.equal(A.getLastCompletedWorkoutDate(h).toISOString(), "2026-09-20T10:00:00.000Z");
    assert.equal(A.getLastCompletedWorkoutDate([]), null);
    assert.equal(A.getLastCompletedWorkoutDate(null), null);
  });
  test("range = D−29 00:00 … D 23:59:59.999 (local), crossing a month boundary", () => {
    const r = A.getRollingMonthRange(new Date(2026, 9, 3, 17, 0));
    assert.deepEqual([r.start.getFullYear(), r.start.getMonth(), r.start.getDate(), r.start.getHours()], [2026, 8, 4, 0]);
    assert.deepEqual([r.end.getDate(), r.end.getHours(), r.end.getMinutes(), r.end.getMilliseconds()], [3, 23, 59, 999]);
    assert.equal(A.getRollingMonthRange(null), null);
  });
  test("computeDashboardSummary counts sessions in the window anchored on the LAST workout, not today", () => {
    const p = plan("8-10", "8-10");
    const h = [
      session("2026-06-01T10:00:00", [ex("bench_press", "weight", [W(100, 8), W(100, 8)], p)]), // outside
      session("2026-07-05T10:00:00", [ex("bench_press", "weight", [W(100, 9), W(100, 9)], p)]),
      session("2026-07-20T10:00:00", [ex("bench_press", "weight", [W(100, 10), W(100, 10)], p)]),
    ];
    const s = A.computeDashboardSummary(h);
    assert.equal(s.workoutsCount, 2);
    assert.equal(s.exercisesCount, 2);
    assert.equal(s.progressPct, 100, "both in-window performances are progress vs their own earlier history");
  });
  test("computeDashboardSummary: no history → zeros and progressPct null", () => {
    assert.deepEqual(A.computeDashboardSummary([]), { workoutsCount: 0, exercisesCount: 0, progressPct: null });
  });
});

describe("getNextPlan (stored order cycle)", () => {
  const plans = [
    { id: "A", name: "A", exercises: [{ exerciseId: "bench_press" }] },
    { id: "B", name: "B", exercises: [{ exerciseId: "squat_barbell" }] },
    { id: "C", name: "C", exercises: [] },
  ];
  test("next after the most recent plan session", () => {
    const h = [{ planId: "A", date: "2026-09-01T10:00:00Z" }, { planId: "A", date: "2026-09-10T10:00:00Z" }];
    assert.equal(A.getNextPlan(plans, h).id, "B");
  });
  test("next plan without exercises → null", () => {
    assert.equal(A.getNextPlan(plans, [{ planId: "B", date: "2026-09-10T10:00:00Z" }]), null);
  });
  test("wraps around after the last plan", () => {
    const p2 = plans.slice(0, 2);
    assert.equal(A.getNextPlan(p2, [{ planId: "B", date: "2026-09-10T10:00:00Z" }]).id, "A");
  });
  test("no session from own plans → null (no guessing)", () => {
    assert.equal(A.getNextPlan(plans, [{ planId: "ready-template", date: "2026-09-10T10:00:00Z" }]), null);
    assert.equal(A.getNextPlan([], []), null);
  });
  test("uses the most recent by date, not array order", () => {
    const h = [{ planId: "B", date: "2026-09-20T10:00:00Z" }, { planId: "A", date: "2026-09-01T10:00:00Z" }];
    assert.equal(A.getNextPlan(plans.slice(0, 2), h).id, "A");
  });
});

describe("summarizeActiveWorkoutDraft (Dashboard 'Kontynuuj trening' card)", () => {
  test("elapsed, done/total and volume over performed sets only", () => {
    const start = Date.parse("2026-09-20T10:00:00Z");
    const draft = {
      startTime: start,
      savedAt: new Date(start + 25 * 60 * 1000 + 30 * 1000).toISOString(),
      plan: { name: "Push" },
      blocks: [
        { items: [{ type: "weight", sets: [{ weight: "100", reps: "10" }, { weight: "100", reps: "8" }] }] },
        { items: [{ type: "weight", sets: [{ weight: "50", reps: "10" }, { weight: "50", reps: "" }] }] },
      ],
    };
    assert.deepEqual(A.summarizeActiveWorkoutDraft(draft), { name: "Push", elapsedSec: 1530, doneExercises: 1, totalExercises: 2, volume: 2300 });
  });
  test("empty / broken draft → null", () => {
    assert.equal(A.summarizeActiveWorkoutDraft(null), null);
    assert.equal(A.summarizeActiveWorkoutDraft({ blocks: [] }), null);
    assert.equal(A.summarizeActiveWorkoutDraft({ blocks: "x" }), null);
  });
  test("no plan → 'Trening bez planu'; savedAt before start → elapsed null", () => {
    const s = A.summarizeActiveWorkoutDraft({ startTime: 2000, savedAt: new Date(1000).toISOString(), blocks: [{ items: [{ type: "weight", sets: [] }] }] });
    assert.deepEqual([s.name, s.elapsedSec], ["Trening bez planu", null]);
  });
});

describe("findMatchingSessions / backfill chronology", () => {
  test("a backfilled older workout is ordered by its date; beforeDate is strict", () => {
    const a = session("2026-09-10T10:00:00", [ex("bench_press", "weight", [W(100, 10)])]);
    const b = session("2026-09-01T10:00:00", [ex("bench_press", "weight", [W(90, 10)])]);
    const empty = session("2026-09-05T10:00:00", [ex("bench_press", "weight", [])]);
    const m = A.findMatchingSessions([a, empty, b], { exerciseId: "bench_press", beforeDate: a.date });
    assert.deepEqual(m.map((s) => s.id), [b.id], "same-timestamp session and sessions without sets are excluded");
  });
});
