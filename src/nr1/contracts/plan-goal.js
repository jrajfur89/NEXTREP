// NEXTREP 1.0 (N1) — plan contract: plan, plan items (exercises) and planned sets (goals).
//
// Every planned set has its own goal (PE-28): a rep range (repsMin..repsMax) OR a time range
// (durationMinSec..durationMaxSec), and a target RIR category or null. A plan has an explicit status
// active / archived (D3). Plan items reference exactly one exercise; supersets are contiguous groups.
// A plan item may store the chosen load model `loadModel` (B02/S3, B02-D21).
import { validateEntity, isLive, isUuid } from "../domain/entity.js";
import { liveSiblings } from "../domain/ordering.js";
import { validateSupersets } from "../domain/superset.js";
import { validateExerciseRef } from "./exercise-ref.js";
import { RIR_CATEGORIES, PLAN_SET_TYPES, PLAN_STATUSES, LIMITS } from "./constants.js";
import { LOAD_MODEL_CODES } from "../../engine/atlas-schema.js";

const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function validatePlanItemSet(s, where = {}) {
  const errors = [];
  const e = (code, field) => errors.push({ code, field, ...where, id: s && s.id });
  if (!PLAN_SET_TYPES.includes(s.setType)) e("SET_TYPE_INVALID", "setType");
  const reps = s.repsMin != null || s.repsMax != null;
  const time = s.durationMinSec != null || s.durationMaxSec != null;
  if (reps && time) e("GOAL_REPS_AND_TIME", "repsMin");
  if (reps) {
    if (!intIn(s.repsMin, 1, LIMITS.repsMax) || !intIn(s.repsMax, 1, LIMITS.repsMax)) e("GOAL_REPS_INVALID", "repsMin");
    else if (s.repsMin > s.repsMax) e("GOAL_RANGE_REVERSED", "repsMin");
  }
  if (time) {
    if (!intIn(s.durationMinSec, 1, LIMITS.durationMaxSec) || !intIn(s.durationMaxSec, 1, LIMITS.durationMaxSec)) e("GOAL_DURATION_INVALID", "durationMinSec");
    else if (s.durationMinSec > s.durationMaxSec) e("GOAL_RANGE_REVERSED", "durationMinSec");
  }
  if (s.rirTarget != null && !RIR_CATEGORIES.includes(s.rirTarget)) e("RIR_INVALID", "rirTarget");
  if (time && s.rirTarget != null) e("RIR_NOT_FOR_TIME", "rirTarget");
  return errors;
}

// Whole plan state { plan, items, sets } (items / sets include tombstones).
export function validatePlanState(state) {
  const { plan, items = [], sets = [] } = state || {};
  const errors = [...validateEntity(plan, { kind: "plan" })];
  if (!plan) return errors;
  if (typeof plan.name !== "string" || !plan.name.trim()) errors.push({ code: "PLAN_NAME_REQUIRED", field: "name", kind: "plan", id: plan.id });
  if (!PLAN_STATUSES.includes(plan.status)) errors.push({ code: "PLAN_STATUS_INVALID", field: "status", kind: "plan", id: plan.id });
  if (!Number.isInteger(plan.position) || plan.position < 0) errors.push({ code: "POSITION_INVALID", field: "position", kind: "plan", id: plan.id });
  const ids = new Set([plan.id]);
  const dup = (r, kind) => { if (ids.has(r.id)) errors.push({ code: "ID_DUPLICATE", field: "id", kind, id: r.id }); ids.add(r.id); };
  const itemIds = new Set(items.map((i) => i.id));
  for (const it of items) {
    const where = { kind: "planItem" };
    dup(it, "planItem");
    errors.push(...validateEntity(it, where));
    if (it.planId !== plan.id) errors.push({ code: "PARENT_MISMATCH", field: "planId", ...where, id: it.id });
    if (!Number.isInteger(it.position) || it.position < 0) errors.push({ code: "POSITION_INVALID", field: "position", ...where, id: it.id });
    errors.push(...validateExerciseRef(it, { ...where, id: it.id }));
    // B02/S3: the chosen load model — null / absent (not chosen, or older items) or a known atlas model.
    // Whether it is allowed for THIS exercise needs the atlas: contracts/plan-load-model.js.
    if (it.loadModel != null && !LOAD_MODEL_CODES.includes(it.loadModel)) errors.push({ code: "PLAN_ITEM_LOAD_MODEL_INVALID", field: "loadModel", ...where, id: it.id });
    if (isLive(it) && plan.deletedAt) errors.push({ code: "LIVE_CHILD_OF_DELETED", field: "deletedAt", ...where, id: it.id });
  }
  errors.push(...validateSupersets(liveSiblings(items, "planId", plan.id)).map((x) => ({ ...x, kind: "planItem" })));
  for (const s of sets) {
    const where = { kind: "planItemSet" };
    dup(s, "planItemSet");
    errors.push(...validateEntity(s, where));
    if (!itemIds.has(s.planItemId)) errors.push({ code: "PARENT_MISMATCH", field: "planItemId", ...where, id: s.id });
    if (!Number.isInteger(s.position) || s.position < 0) errors.push({ code: "POSITION_INVALID", field: "position", ...where, id: s.id });
    errors.push(...validatePlanItemSet(s, where));
    const parent = items.find((i) => i.id === s.planItemId);
    if (isLive(s) && parent && parent.deletedAt) errors.push({ code: "LIVE_CHILD_OF_DELETED", field: "deletedAt", ...where, id: s.id });
  }
  for (const it of items) if (it.supersetGroup != null && !isUuid(it.supersetGroup)) errors.push({ code: "SUPERSET_GROUP_INVALID", field: "supersetGroup", kind: "planItem", id: it.id });
  return errors;
}
