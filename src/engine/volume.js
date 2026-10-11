// NEXTREP — the ONE access point for the volume numbers shown on screens (PE-A, step A4.5).
//
// Every screen that shows volume asks here and nowhere else (10 places on 6 screens, see
// tests/ui/pe-a-volume-baseline.test.mjs). In A4.5 each function returns EXACTLY what that place
// computed in F1.6 — the formulas are moved here unchanged, including their known faults (comma
// weights read as 0 in the exercise detail, dropsets left out of computeSessionVolume, dumbbells
// counted once). PE-A5 replaces the bodies with the load engine (load.js); the screens stay.
//
// Not routed here on purpose (decision P3): finish() keeps writing session.volume and
// session.totalWeight with today's formula, and sync sends them unchanged.
import { computeSessionVolume, computeMuscleGroupWorkload, muscleGroupSessionPoints, computeCategoryLastDelta, toNumber } from "./legacy-progression.js";

// Which implementation answers. "f1.6" = today's formulas; A5 changes it.
export const VOLUME_SOURCE = "f1.6";

// Places 1, 3, 4, 6, 7 — the volume stored with a finished workout (session.volume), as is.
// The callers keep their own rounding / fallback exactly as before.
export function sessionVolume(session) {
  return session.volume;
}

// Places 5 and 8 — volume of one exercise in one workout (today: computeSessionVolume).
export function exerciseVolume(sets, kind) {
  return computeSessionVolume(sets, kind);
}

// Place 2 — muscle-group workload, its chart points and the last-workout delta.
export function muscleGroupWorkload(history, exercises, start, end) {
  return computeMuscleGroupWorkload(history, exercises, start, end);
}
export function muscleGroupPoints(history, exercises, group) {
  return muscleGroupSessionPoints(history, exercises, group);
}
export function muscleGroupLastDelta(history, exercises, group) {
  return computeCategoryLastDelta(history, exercises, group);
}

// Place 9 — exercise detail ("Obciążenie", chart "Objętość na sesję"): F1.6 formula, unchanged
// (Number(weight), so "57,5" counts as 0; reps missing → × 1).
export function exerciseDetailVolume(sets) {
  return sets.reduce((s, st) => s + (Number(st.weight) || 0) * (st.reps != null ? Number(st.reps) : 1), 0);
}

// Place 10 — dashboard card of an unfinished workout: performed sets of the draft, kg × (reps or 1),
// summed in the same order as F1.6. `isPerformed(set, kind)` is the app's isSetPerformed.
export function draftVolume(items, isPerformed) {
  let volume = 0;
  items.forEach((it) => {
    const sets = Array.isArray(it.sets) ? it.sets : [];
    sets
      .filter((st) => st && isPerformed(st, it.type))
      .forEach((st) => {
        volume += (toNumber(st.weight) || 0) * (st.reps !== "" && st.reps != null ? Number(st.reps) : 1);
      });
  });
  return volume;
}
