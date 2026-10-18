// AT3.2c — cardio statistics, history, trends and comparisons (AT3-D19; spec v2 §7.3–7.4; O-32, P1).
//
// Works on workouts with snapshot v2 (system and private cardio alike). Only entries whose snapshot
// has measurementType "cardio" are cardio activities; an entry without a valid snapshot is a fault
// (F2-4) and is left out with a warning. Metrics are never mixed: time and distance stay apart, pace
// is derived only, nothing becomes kg, and distance is summed only within one activity (exerciseId)
// — there is no distance total across different activities (O-32). The total cardio time may be
// summed across activities.
//
// Comparison (P1): only the same exerciseId measured with the same model from the snapshot (D13:
// loadModel, measurementType, entryRev). Metric by metric, never one combined score:
//   pace     — lower = better;
//   distance — longer = better;
//   time     — shorter = better ONLY at an identical distance; otherwise the change is information.
// Progress Engine statuses for strength are not used for cardio.
import { exerciseTotals } from "./load.js";
import { validateLoadSnapshot, modelFromSnapshot } from "./load-snapshot.js";

const list = (x) => (Array.isArray(x) ? x : []);
const idOf = (entry) => (entry ? entry.catalogExerciseId || entry.privateExerciseId || entry.exerciseId || null : null);

// One cardio entry → its performance, or null when it is not a performed cardio activity.
export function cardioPerformance(entry, { workoutId = null, date = null } = {}) {
  const s = entry && entry.loadSnapshot;
  if (!s || validateLoadSnapshot(s).length || s.measurementType !== "cardio") return null;
  const t = exerciseTotals(entry.sets, modelFromSnapshot(s));
  if (t.workingSets === 0) return null;
  return {
    exerciseId: idOf(entry),
    source: s.source,
    model: { loadModel: s.loadModel, measurementType: s.measurementType, entryRev: s.entryRev },
    workoutId,
    date,
    sets: t.workingSets,
    durationSec: t.durationSec > 0 ? t.durationSec : null,
    distanceM: t.distanceM > 0 ? t.distanceM : null,
    paceSecPerKm: t.paceSecPerKm,
  };
}

// Every cardio performance of the workouts, in the order given (chronological by the caller).
// workouts: [{ id?, date?, exercises: [...] }]
export function cardioPerformances(workouts) {
  const out = [];
  const faults = { missingSnapshot: 0 };
  for (const w of list(workouts)) {
    for (const e of list(w && w.exercises)) {
      const s = e && e.loadSnapshot;
      if (!s || validateLoadSnapshot(s).length) {
        faults.missingSnapshot++; // the kind of activity is unknown without a snapshot (F2-4)
        continue;
      }
      const p = cardioPerformance(e, { workoutId: w.id ?? null, date: w.date ?? w.startedAt ?? null });
      if (p) out.push(p);
    }
  }
  return { performances: out, faults };
}

// Statistics of a period: per activity (count, time, distance, pace) and for the category
// „Cardio i kondycja” (count and total time — no distance total, O-32).
export function cardioPeriodStats(workouts) {
  const { performances, faults } = cardioPerformances(workouts);
  const byExercise = {};
  let durationSec = 0;
  for (const p of performances) {
    const b = byExercise[p.exerciseId] || (byExercise[p.exerciseId] = { activities: 0, durationSec: 0, distanceM: 0, pacedDurationSec: 0, pacedDistanceM: 0, paceSecPerKm: null });
    b.activities++;
    b.durationSec += p.durationSec ?? 0;
    b.distanceM += p.distanceM ?? 0;
    if (p.paceSecPerKm != null) {
      b.pacedDurationSec += p.durationSec;
      b.pacedDistanceM += p.distanceM;
    }
    durationSec += p.durationSec ?? 0;
  }
  for (const b of Object.values(byExercise)) {
    b.paceSecPerKm = b.pacedDistanceM > 0 ? Math.round((b.pacedDurationSec / (b.pacedDistanceM / 1000)) * 10) / 10 : null;
    delete b.pacedDurationSec;
    delete b.pacedDistanceM;
  }
  return { category: { activities: performances.length, durationSec }, byExercise, faults };
}

// Trend of one activity: the last `limit` performances (≤ 10, as Progress Engine), one series per metric.
export function cardioTrend(workouts, exerciseId, { limit = 10 } = {}) {
  const mine = cardioPerformances(workouts).performances.filter((p) => p.exerciseId === exerciseId).slice(-limit);
  const series = (k) => mine.filter((p) => p[k] != null).map((p) => ({ workoutId: p.workoutId, date: p.date, value: p[k] }));
  return { exerciseId, performances: mine.length, durationSec: series("durationSec"), distanceM: series("distanceM"), paceSecPerKm: series("paceSecPerKm") };
}

const sameModel = (a, b) => a.loadModel === b.loadModel && a.measurementType === b.measurementType && a.entryRev === b.entryRev;
const verdict = (delta, better) => (delta === 0 ? "same" : (better === "lower" ? delta < 0 : delta > 0) ? "better" : "worse");

// P1 comparison of two performances (before → after).
export function compareCardio(before, after) {
  if (!before || !after) return { comparable: false, reason: "MISSING", metrics: {} };
  if (before.exerciseId !== after.exerciseId) return { comparable: false, reason: "DIFFERENT_ACTIVITY", metrics: {} };
  const comparable = sameModel(before.model, after.model);
  const metrics = {};
  const both = (k) => before[k] != null && after[k] != null;
  if (both("paceSecPerKm")) {
    const delta = Math.round((after.paceSecPerKm - before.paceSecPerKm) * 10) / 10;
    metrics.paceSecPerKm = { before: before.paceSecPerKm, after: after.paceSecPerKm, delta, verdict: comparable ? verdict(delta, "lower") : null };
  }
  if (both("distanceM")) {
    const delta = after.distanceM - before.distanceM;
    metrics.distanceM = { before: before.distanceM, after: after.distanceM, delta, verdict: comparable ? verdict(delta, "higher") : null };
  }
  if (both("durationSec")) {
    const delta = after.durationSec - before.durationSec;
    const sameDistance = both("distanceM") && before.distanceM === after.distanceM;
    metrics.durationSec = { before: before.durationSec, after: after.durationSec, delta, verdict: comparable && sameDistance ? verdict(delta, "lower") : null };
  }
  return { comparable, reason: comparable ? (Object.keys(metrics).length ? null : "NO_SHARED_METRIC") : "DIFFERENT_MODEL", metrics };
}
