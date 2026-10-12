// NEXTREP 1.0 (N1) — engine input contract: a workout as the engine (src/engine/load.js and the
// Progress Engine 2.0 stages) reads it. Live records only, in list order; the model of every
// exercise comes from ITS snapshot (D13), never from the current atlas.
import { sessionTotals, exerciseTotals } from "../../engine/load.js";
import { modelFromSnapshot } from "../../engine/load-snapshot.js";
import { liveSiblings } from "../domain/ordering.js";

// One set in the engine's shape (v2 set shape of load.js).
export function toEngineSet(s) {
  return {
    setType: s.setType,
    status: s.status,
    done: s.status === "done",
    reps: s.reps ?? null,
    loadKg: s.loadKg ?? null,
    assistKg: s.assistKg ?? null,
    duration: s.durationSec ?? null,
    rir: s.rir ?? null,
  };
}

export function toEngineSession(state) {
  const { workout, exercises = [], sets = [] } = state;
  return {
    id: workout.id,
    date: workout.startedAt,
    exercises: liveSiblings(exercises, "workoutId", workout.id).map((ex) => ({
      id: ex.id,
      exerciseId: ex.catalogExerciseId ?? ex.privateExerciseId,
      loadSnapshot: ex.loadSnapshot,
      sets: liveSiblings(sets, "workoutExerciseId", ex.id).map(toEngineSet),
    })),
  };
}

export const modelOfEngineExercise = (ex) => modelFromSnapshot(ex.loadSnapshot);

export function workoutTotals(state) {
  return sessionTotals(toEngineSession(state), modelOfEngineExercise);
}

export function workoutExerciseTotals(state, workoutExerciseId) {
  const ex = toEngineSession(state).exercises.find((x) => x.id === workoutExerciseId);
  return ex ? exerciseTotals(ex.sets, modelOfEngineExercise(ex)) : null;
}
