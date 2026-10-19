// NEXTREP 1.0 — B02/S3: building a workout from a plan, with the load snapshot of every exercise.
//
// For each live plan item, in plan order: the exercise (atlas or private) and the model to use are
// resolved, and an immutable load snapshot is built (engine load-snapshot.js buildLoadSnapshot, v3):
//   - atlas exercise with a model choice (B02-D21): the item's `loadModel`, checked by the engine's
//     validateLoadModelChoice; no choice stored → LOAD_MODEL_MISSING (never a silent default);
//   - atlas exercise with one model: that model; a different stored model → LOAD_MODEL_NOT_ALLOWED;
//   - private exercise: its own model;
//   - Smith (smith_plates_only, S2): the person's current starting resistance R from the exercise
//     settings store (null = unknown, never 0).
// ALL items are checked before the workout is created: one problem → no workout (DomainError with
// every problem listed). Editing the plan or the atlas later never changes a workout built here: the
// workout keeps its snapshots (and the plan item id), never a reference to the plan's model.
//
// Pure, no storage or UI. The active-workout screen (draft, timers) and its wiring are S6 / N4.
import { DomainError, defaultNewId, requireNow, isLive } from "./entity.js";
import { liveSiblings } from "./ordering.js";
import { createWorkout, addWorkoutExercise, joinWorkoutSuperset } from "./workout.js";
import { loadModelOptions, validateLoadModelChoice } from "../../engine/load-model-options.js";
import { buildLoadSnapshot } from "../../engine/load-snapshot.js";
import { startingResistanceForSnapshot } from "../../engine/exercise-settings.js";

// ctx: { atlasById: Map(exerciseId → atlas record), atlas (atlas or equipment dictionary),
//        atlasVersion, privateById: Map(id → private record), settings (exercise settings store with
//        get(id), optional), now }
// → { ok: true, snapshot } | { ok: false, error: { code, planItemId, field, allowed? } }
export function planItemSnapshot(item, ctx) {
  const { atlasById = new Map(), atlas = null, atlasVersion = null, privateById = new Map(), settings = null, now } = ctx || {};
  const fail = (code, extra = {}) => ({ ok: false, error: { code, planItemId: item && item.id, field: "loadModel", ...extra } });
  if (!item || !isLive(item)) return fail("PLAN_ITEM_NOT_LIVE");
  const isAtlas = item.catalogExerciseId != null;
  const exercise = isAtlas ? atlasById.get(item.catalogExerciseId) : privateById.get(item.privateExerciseId);
  if (!exercise) return { ok: false, error: { code: "EXERCISE_NOT_FOUND", planItemId: item.id, field: isAtlas ? "catalogExerciseId" : "privateExerciseId" } };
  const stored = item.loadModel ?? null;
  let loadModel;
  if (isAtlas) {
    const o = loadModelOptions(exercise, atlas);
    if (o.choice && stored == null) return fail("LOAD_MODEL_MISSING", { allowed: [...o.options] });
    if (!o.choice && stored != null && stored !== o.defaultModel) return fail("LOAD_MODEL_NOT_ALLOWED", { allowed: [...o.options] });
    const v = validateLoadModelChoice(exercise, atlas, stored);
    if (!v.ok) return fail(v.errors[0].code, { allowed: v.errors[0].allowed });
    loadModel = v.loadModel;
  } else {
    const own = exercise.loadModel || "external_unknown";
    if (stored != null && stored !== own) return fail("LOAD_MODEL_NOT_ALLOWED", { allowed: [own] });
    loadModel = undefined; // a private exercise has only its own model
  }
  const settingsId = isAtlas ? item.catalogExerciseId : item.privateExerciseId;
  const r = startingResistanceForSnapshot(exercise, settings && typeof settings.get === "function" ? settings.get(settingsId) : null);
  try {
    const snapshot = isAtlas
      ? buildLoadSnapshot({ exercise, atlasVersion, now, loadModel, equipment: atlas, startingResistanceKg: r })
      : buildLoadSnapshot({ privateExercise: { ...exercise, privateExerciseId: item.privateExerciseId }, now, startingResistanceKg: r });
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: { code: "SNAPSHOT_INVALID", planItemId: item.id, field: "loadSnapshot", message: e.message } };
  }
}

// Checks every live item of a plan state { plan, items, sets } in plan order.
// → { ok, items: [{ item, snapshot }], errors: [...] }
export function checkPlanForWorkout(planState, ctx) {
  const live = liveSiblings(planState.items, "planId", planState.plan.id);
  const items = [];
  const errors = [];
  for (const item of live) {
    const r = planItemSnapshot(item, ctx);
    if (r.ok) items.push({ item, snapshot: r.snapshot });
    else errors.push(r.error);
  }
  return { ok: errors.length === 0, items, errors };
}

// Creates a workout { workout, exercises, sets } from a plan: one workout exercise per live plan
// item (planItemId kept), with its snapshot, and the plan's supersets. No sets are copied (planned
// sets are goals, not performed sets). Throws DomainError before anything is created when an item
// cannot be resolved: code LOAD_MODEL_MISSING when every problem is a missing choice, otherwise
// PLAN_NOT_READY; details.errors lists them all.
export function startWorkoutFromPlan(planState, ctx) {
  const { now, newId = defaultNewId, startedAt = null } = ctx || {};
  requireNow(now);
  if (!planState || !planState.plan || !isLive(planState.plan)) throw new DomainError("PLAN_NOT_LIVE", "the plan is removed or missing");
  const check = checkPlanForWorkout(planState, ctx);
  if (!check.ok) {
    const code = check.errors.every((e) => e.code === "LOAD_MODEL_MISSING") ? "LOAD_MODEL_MISSING" : "PLAN_NOT_READY";
    throw new DomainError(code, "the plan cannot start a workout yet", { errors: check.errors });
  }
  let state = createWorkout({ planId: planState.plan.id, startedAt, now, newId });
  const byItem = new Map();
  for (const { item, snapshot } of check.items) {
    const ref = { catalogExerciseId: item.catalogExerciseId ?? null, privateExerciseId: item.privateExerciseId ?? null };
    const r = addWorkoutExercise(state, { exerciseRef: ref, loadSnapshot: snapshot, planItemId: item.id, now, newId });
    state = r.state;
    byItem.set(item.id, r.exercise.id);
  }
  // supersets: neighbours of the same plan group are joined in the workout too
  for (let i = 1; i < check.items.length; i++) {
    const a = check.items[i - 1].item;
    const b = check.items[i].item;
    if (a.supersetGroup != null && a.supersetGroup === b.supersetGroup) state = joinWorkoutSuperset(state, { firstId: byItem.get(a.id), secondId: byItem.get(b.id), now, newId });
  }
  return state;
}
