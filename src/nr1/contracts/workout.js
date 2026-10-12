// NEXTREP 1.0 (N1) — workout contract { workout, exercises, sets } (lists include tombstones).
//
// * every workout exercise references exactly one exercise and CARRIES A VALID LOAD SNAPSHOT of that
//   exercise (F2-4: mandatory; built with src/engine/load-snapshot.js when the exercise is added);
// * sets are valid for the snapshot's load model (contracts/set.js);
// * every id is unique in the whole workout (PE-24: a workout is counted once);
// * supersets are contiguous groups of at least two exercises;
// * a finished workout does not end before it started.
import { validateEntity, isLive, isIsoTime } from "../domain/entity.js";
import { liveSiblings } from "../domain/ordering.js";
import { validateSupersets } from "../domain/superset.js";
import { validateLoadSnapshot } from "../../engine/load-snapshot.js";
import { validateExerciseRef, validateRefMatchesSnapshot } from "./exercise-ref.js";
import { validateWorkoutSet } from "./set.js";

export function validateWorkoutState(state, { requireFinished = false } = {}) {
  const { workout, exercises = [], sets = [] } = state || {};
  const errors = [...validateEntity(workout, { kind: "workout" })];
  if (!workout) return errors;
  const w = (code, field) => errors.push({ code, field, kind: "workout", id: workout.id });
  if (!isIsoTime(workout.startedAt)) w("TIME_INVALID", "startedAt");
  if (workout.finishedAt !== null && !isIsoTime(workout.finishedAt)) w("TIME_INVALID", "finishedAt");
  if (workout.finishedAt && workout.startedAt && Date.parse(workout.finishedAt) < Date.parse(workout.startedAt)) w("FINISHED_BEFORE_START", "finishedAt");
  if (requireFinished && !workout.finishedAt) w("WORKOUT_NOT_FINISHED", "finishedAt");
  const ids = new Set([workout.id]);
  const dup = (r, kind) => { if (ids.has(r.id)) errors.push({ code: "ID_DUPLICATE", field: "id", kind, id: r.id }); ids.add(r.id); };
  const byId = new Map(exercises.map((x) => [x.id, x]));
  for (const ex of exercises) {
    const where = { kind: "workoutExercise", id: ex.id };
    dup(ex, "workoutExercise");
    errors.push(...validateEntity(ex, { kind: "workoutExercise" }));
    if (ex.workoutId !== workout.id) errors.push({ code: "PARENT_MISMATCH", field: "workoutId", ...where });
    if (!Number.isInteger(ex.position) || ex.position < 0) errors.push({ code: "POSITION_INVALID", field: "position", ...where });
    errors.push(...validateExerciseRef(ex, where));
    if (!ex.loadSnapshot) errors.push({ code: "SNAPSHOT_MISSING", field: "loadSnapshot", ...where });
    else {
      errors.push(...validateLoadSnapshot(ex.loadSnapshot).map((x) => ({ ...x, code: `SNAPSHOT_${x.code}`, ...where })));
      errors.push(...validateRefMatchesSnapshot(ex, ex.loadSnapshot, where));
    }
    if (isLive(ex) && workout.deletedAt) errors.push({ code: "LIVE_CHILD_OF_DELETED", field: "deletedAt", ...where });
  }
  errors.push(...validateSupersets(liveSiblings(exercises, "workoutId", workout.id)).map((x) => ({ ...x, kind: "workoutExercise" })));
  for (const s of sets) {
    const where = { kind: "workoutSet" };
    dup(s, "workoutSet");
    errors.push(...validateEntity(s, where));
    const parent = byId.get(s.workoutExerciseId);
    if (!parent) { errors.push({ code: "PARENT_MISMATCH", field: "workoutExerciseId", ...where, id: s.id }); continue; }
    if (!Number.isInteger(s.position) || s.position < 0) errors.push({ code: "POSITION_INVALID", field: "position", ...where, id: s.id });
    errors.push(...validateWorkoutSet(s, parent.loadSnapshot, where));
    if (isLive(s) && parent.deletedAt) errors.push({ code: "LIVE_CHILD_OF_DELETED", field: "deletedAt", ...where, id: s.id });
  }
  return errors;
}
