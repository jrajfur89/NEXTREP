// NEXTREP 1.0 (N1) — workout operations (pure). State: { workout, exercises, sets } — exercises of
// the workout (ordered, with supersets, each with its LOAD SNAPSHOT) and their sets (ordered).
// Lists include tombstones. Workouts themselves are ordered by date, not by position.
//
// Same guarantees as plan.js: atomic (whole next state or DomainError), one version step per
// changed record, one step for the parent of a changed list, validated with the workout contract.
// No storage, no UI, no network: building the workout from a plan and the active-workout logic
// (draft, timers) are stage N4.
import { DomainError, newEntity, bump, squash, squashOne, isLive, isIsoTime, defaultNewId, requireNow } from "./entity.js";
import { liveSiblings, moveBlock, validatePositions } from "./ordering.js";
import { join, leave, moveOne, moveGroup } from "./superset.js";
import { insertChild, removeChild, tombstoneChildren, structureChanged } from "./list-ops.js";
import { validateWorkoutState } from "../contracts/workout.js";
import { validateWorkoutSet, SET_VALUE_FIELDS } from "../contracts/set.js";
import { validateExerciseRef, validateRefMatchesSnapshot } from "../contracts/exercise-ref.js";
import { validateLoadSnapshot } from "../../engine/load-snapshot.js";

const EX = { parentKey: "workoutId", supersets: true };
const SET = { parentKey: "workoutExerciseId" };
const SET_FIELDS = ["setType", "status", ...SET_VALUE_FIELDS];

export function createWorkout({ planId = null, startedAt = null, notes = "", now, newId = defaultNewId }) {
  requireNow(now);
  const start = startedAt ?? now;
  if (!isIsoTime(start)) throw new DomainError("TIME_INVALID", "startedAt must be an ISO UTC time", { startedAt });
  const state = { workout: newEntity({ planId, startedAt: start, finishedAt: null, notes }, { now, newId }), exercises: [], sets: [] };
  assertWorkout(state);
  return state;
}

function commit(before, draft, { now, requireFinished = false }) {
  const exercises = squash(before.exercises, draft.exercises, { now });
  const sets = squash(before.sets, draft.sets, { now });
  const structural = structureChanged(before.exercises, exercises, "workoutId", before.workout.id, true);
  const workout = squashOne(before.workout, draft.workout, { now, structural });
  const parents = new Set();
  for (const ex of before.exercises) if (structureChanged(before.sets, sets, "workoutExerciseId", ex.id)) parents.add(ex.id);
  const exercises2 = exercises.map((ex) => {
    if (!parents.has(ex.id)) return ex;
    const b = before.exercises.find((x) => x.id === ex.id);
    return b ? squashOne(b, ex, { now, structural: true }) : ex;
  });
  const next = { workout, exercises: exercises2, sets };
  assertWorkout(next, { requireFinished });
  return next;
}

function assertWorkout(state, opts = {}) {
  const errors = [
    ...validateWorkoutState(state, opts),
    ...validatePositions(state.exercises, "workoutId"),
    ...validatePositions(state.sets, "workoutExerciseId"),
  ];
  if (errors.length) throw new DomainError("STATE_INVALID", "workout state violates the contract", { errors });
}

const liveExercise = (state, id) => {
  const ex = state.exercises.find((x) => x.id === id);
  if (!ex || !isLive(ex)) throw new DomainError("NOT_A_LIVE_SIBLING", "no such live workout exercise", { id });
  return ex;
};
const liveSet = (state, id) => {
  const s = state.sets.find((x) => x.id === id);
  if (!s || !isLive(s)) throw new DomainError("NOT_LIVE", "no such live set", { id });
  return s;
};

// Adds an exercise WITH its load snapshot (F2-4). The snapshot is built by the caller from the atlas
// or the private exercise (src/engine/load-snapshot.js buildLoadSnapshot) and must describe exactly
// the referenced exercise.
export function addWorkoutExercise(state, { exerciseRef, loadSnapshot, planItemId = null, index = null, notes = "", now, newId = defaultNewId }) {
  requireNow(now);
  const ref = { catalogExerciseId: exerciseRef?.catalogExerciseId ?? null, privateExerciseId: exerciseRef?.privateExerciseId ?? null };
  const errors = [...validateExerciseRef(ref)];
  if (!loadSnapshot) errors.push({ code: "SNAPSHOT_MISSING", field: "loadSnapshot" });
  else errors.push(...validateLoadSnapshot(loadSnapshot), ...validateRefMatchesSnapshot(ref, loadSnapshot));
  if (errors.length) throw new DomainError("EXERCISE_INVALID", "exercise reference or snapshot invalid", { errors });
  const { list: exercises, record } = insertChild(state.exercises, { ...EX, parentId: state.workout.id, fields: { ...ref, loadSnapshot, planItemId, notes }, index, now, newId });
  return { state: commit(state, { ...state, exercises }, { now }), exercise: record };
}

export function moveWorkoutExercise(state, { exerciseId, toIndex, now }) {
  requireNow(now);
  const { list: exercises } = moveOne(state.exercises, { ...EX, parentId: state.workout.id, id: exerciseId, toIndex, now });
  return commit(state, { ...state, exercises }, { now });
}

// Removes an exercise and tombstones its sets (cascade, S6).
export function removeWorkoutExercise(state, { exerciseId, now }) {
  requireNow(now);
  liveExercise(state, exerciseId);
  const exercises = removeChild(state.exercises, { ...EX, parentId: state.workout.id, id: exerciseId, now });
  const sets = tombstoneChildren(state.sets, { parentKey: "workoutExerciseId", parentIds: [exerciseId], now });
  return commit(state, { ...state, exercises, sets }, { now });
}

export function joinWorkoutSuperset(state, { firstId, secondId, now, newId = defaultNewId }) {
  requireNow(now);
  const { list: exercises } = join(state.exercises, { ...EX, parentId: state.workout.id, firstId, secondId, now, newId });
  return commit(state, { ...state, exercises }, { now });
}

export function leaveWorkoutSuperset(state, { exerciseId, now, newId = defaultNewId }) {
  requireNow(now);
  const { list: exercises } = leave(state.exercises, { ...EX, parentId: state.workout.id, id: exerciseId, now, newId });
  return commit(state, { ...state, exercises }, { now });
}

export function moveWorkoutSuperset(state, { group, toIndex, now }) {
  requireNow(now);
  const { list: exercises } = moveGroup(state.exercises, { ...EX, parentId: state.workout.id, group, toIndex, now });
  return commit(state, { ...state, exercises }, { now });
}

// ---- sets ---------------------------------------------------------------------------------------
function setFields(values, ex) {
  for (const k of Object.keys(values)) if (!SET_FIELDS.includes(k) && k !== "planItemSetId") throw new DomainError("FIELD_NOT_EDITABLE", `${k} is not a set field`, { field: k });
  const s = { setType: "working", status: "done", reps: null, loadKg: null, assistKg: null, durationSec: null, rir: null, planItemSetId: null, ...values };
  const errors = validateWorkoutSet(s, ex.loadSnapshot);
  if (errors.length) throw new DomainError("SET_INVALID", "set values do not fit the exercise's load model", { errors });
  return s;
}

// `values` are numbers (use contracts/set.js parseSetInput for typed text).
export function addWorkoutSet(state, { exerciseId, values = {}, index = null, now, newId = defaultNewId }) {
  requireNow(now);
  const ex = liveExercise(state, exerciseId);
  const { list: sets, record } = insertChild(state.sets, { ...SET, parentId: ex.id, fields: setFields(values, ex), index, now, newId });
  return { state: commit(state, { ...state, sets }, { now }), set: record };
}

export function updateWorkoutSet(state, { setId, changes, now }) {
  requireNow(now);
  const s = liveSet(state, setId);
  const ex = liveExercise(state, s.workoutExerciseId);
  for (const k of Object.keys(changes)) if (!SET_FIELDS.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} is not a set field`, { field: k });
  const errors = validateWorkoutSet({ ...s, ...changes }, ex.loadSnapshot);
  if (errors.length) throw new DomainError("SET_INVALID", "set values do not fit the exercise's load model", { errors });
  return commit(state, { ...state, sets: state.sets.map((x) => (x.id === setId ? bump(x, changes, { now }) : x)) }, { now });
}

export function moveWorkoutSet(state, { setId, toIndex, now }) {
  requireNow(now);
  const s = liveSet(state, setId);
  const { list: sets } = moveBlock(state.sets, { ...SET, parentId: s.workoutExerciseId, ids: [setId], toIndex, now });
  return commit(state, { ...state, sets }, { now });
}

export function removeWorkoutSet(state, { setId, now }) {
  requireNow(now);
  const s = liveSet(state, setId);
  const sets = removeChild(state.sets, { ...SET, parentId: s.workoutExerciseId, id: setId, now });
  return commit(state, { ...state, sets }, { now });
}

// ---- the workout itself -------------------------------------------------------------------------
export function finishWorkout(state, { finishedAt = null, now }) {
  requireNow(now);
  const end = finishedAt ?? now;
  return commit(state, { ...state, workout: bump(state.workout, { finishedAt: end }, { now }) }, { now, requireFinished: true });
}

export function updateWorkout(state, { changes, now }) {
  requireNow(now);
  const allowed = ["notes", "startedAt", "finishedAt"];
  for (const k of Object.keys(changes)) if (!allowed.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} cannot be changed here`, { field: k });
  return commit(state, { ...state, workout: bump(state.workout, changes, { now }) }, { now });
}

// Tombstones the workout with all its exercises and sets (cascade).
export function removeWorkout(state, { now }) {
  requireNow(now);
  if (!isLive(state.workout)) throw new DomainError("NOT_LIVE", "workout is already removed");
  const workout = bump(state.workout, { deletedAt: now }, { now });
  const exercises = tombstoneChildren(state.exercises, { parentKey: "workoutId", parentIds: [workout.id], now });
  const sets = tombstoneChildren(state.sets, { parentKey: "workoutExerciseId", parentIds: state.exercises.map((e) => e.id), now });
  return commit(state, { workout, exercises, sets }, { now });
}

export function workoutView(state) {
  return liveSiblings(state.exercises, "workoutId", state.workout.id).map((ex) => ({ ...ex, sets: liveSiblings(state.sets, "workoutExerciseId", ex.id) }));
}
