// NEXTREP 1.0 (N1) — plan operations (pure). State: { plan, items, sets } — plan items (exercises of
// the plan, ordered, with supersets) and planned sets (goals, ordered per item). Lists include
// tombstones. The list of plans of the user: { profile, plans } — the profile is the parent of the
// plan list (STORE FIRST), a local entity until synchronisation.
//
// Every operation is atomic: it builds the whole next state, normalises versions (one step per
// changed record, one step for the parent of a changed list), validates the result with the plan
// contract and the ordering / superset invariants, and either returns it or throws DomainError.
import { DomainError, newEntity, bump, squash, squashOne, isLive, defaultNewId, requireNow } from "./entity.js";
import { liveSiblings, moveBlock, validatePositions } from "./ordering.js";
import { join, leave, moveOne, moveGroup } from "./superset.js";
import { insertChild, removeChild, tombstoneChildren, structureChanged } from "./list-ops.js";
import { validatePlanState, validatePlanItemSet } from "../contracts/plan-goal.js";
import { validateExerciseRef } from "../contracts/exercise-ref.js";
import { DEFAULT_RIR_TARGET, PLAN_STATUSES } from "../contracts/constants.js";

const ITEM = { parentKey: "planId", supersets: true };
const SET = { parentKey: "planItemId" };
const GOAL_FIELDS = ["setType", "repsMin", "repsMax", "durationMinSec", "durationMaxSec", "rirTarget"];
const ITEM_FIELDS = ["restSec", "notes"];

// ---- the list of plans ----------------------------------------------------------------------
export function createProfile({ now, newId = defaultNewId }) {
  return newEntity({}, { now, newId });
}

function commitPlans(before, plans, { now }) {
  const next = squash(before.plans, plans, { now });
  const structural = structureChanged(before.plans, next, null, null);
  const profile = structural ? squashOne(before.profile, before.profile, { now, structural: true }) : before.profile;
  const errs = validatePositions(next, null);
  if (errs.length) throw new DomainError("STATE_INVALID", "plan list order is invalid", { errors: errs });
  return { profile, plans: next };
}

export function createPlan(list, { name, status = "active", index = null, now, newId = defaultNewId }) {
  requireNow(now);
  if (!PLAN_STATUSES.includes(status)) throw new DomainError("PLAN_STATUS_INVALID", "unknown plan status", { status });
  const { list: plans, record } = insertChild(list.plans, { parentKey: null, parentId: null, fields: { name: String(name ?? "").trim(), status, notes: "" }, index, now, newId });
  const nextList = commitPlans(list, plans, { now });
  const state = { plan: record, items: [], sets: [] };
  assertPlan(state);
  return { list: nextList, state };
}

export function movePlan(list, { planId, toIndex, now }) {
  requireNow(now);
  const { list: plans } = moveBlock(list.plans, { parentKey: null, parentId: null, ids: [planId], toIndex, now });
  return commitPlans(list, plans, { now });
}

// Removes a plan from the list and tombstones its items and sets (cascade, S6).
export function removePlan(list, state, { now }) {
  requireNow(now);
  if (!isLive(state.plan)) throw new DomainError("NOT_LIVE", "plan is already removed");
  // the plan record of the state is the current one (its version moves with its own list changes);
  // a list copy that is newer than the state means the caller holds a stale state
  const copy = list.plans.find((p) => p.id === state.plan.id);
  if (!copy) throw new DomainError("NOT_A_LIVE_SIBLING", "plan is not in the list", { planId: state.plan.id });
  if (copy.version > state.plan.version) throw new DomainError("PLAN_STALE", "the plan state is older than the plan list", { planId: state.plan.id });
  const synced = { ...list, plans: list.plans.map((p) => (p.id === state.plan.id ? state.plan : p)) };
  const plans = removeChild(synced.plans, { parentKey: null, parentId: null, id: state.plan.id, now });
  const nextList = commitPlans(synced, plans, { now });
  const plan = nextList.plans.find((p) => p.id === state.plan.id);
  const items = squash(state.items, tombstoneChildren(state.items, { parentKey: "planId", parentIds: [plan.id], now }), { now });
  const itemIds = state.items.map((i) => i.id);
  const sets = squash(state.sets, tombstoneChildren(state.sets, { parentKey: "planItemId", parentIds: itemIds, now }), { now });
  const next = { plan, items, sets };
  assertPlan(next);
  return { list: nextList, state: next };
}

// ---- one plan -------------------------------------------------------------------------------
function commit(before, draft, { now }) {
  const items = squash(before.items, draft.items, { now });
  const sets = squash(before.sets, draft.sets, { now });
  const structural = structureChanged(before.items, items, "planId", before.plan.id, true);
  const plan = squashOne(before.plan, draft.plan, { now, structural });
  const changedItemIds = new Set();
  for (const it of before.items) if (structureChanged(before.sets, sets, "planItemId", it.id)) changedItemIds.add(it.id);
  for (const s of sets) if (!before.sets.some((b) => b.id === s.id)) changedItemIds.add(s.planItemId);
  const items2 = items.map((it) => {
    if (!changedItemIds.has(it.id)) return it;
    const b = before.items.find((x) => x.id === it.id);
    return b ? squashOne(b, it, { now, structural: true }) : it;
  });
  const next = { plan, items: items2, sets };
  assertPlan(next);
  return next;
}

function assertPlan(state) {
  const errors = [
    ...validatePlanState(state),
    ...validatePositions(state.items, "planId"),
    ...validatePositions(state.sets, "planItemId"),
  ];
  if (errors.length) throw new DomainError("STATE_INVALID", "plan state violates the contract", { errors });
}

const liveItem = (state, id) => {
  const it = state.items.find((i) => i.id === id);
  if (!it || !isLive(it)) throw new DomainError("NOT_A_LIVE_SIBLING", "no such live plan item", { id });
  return it;
};

export function updatePlan(state, { changes, now }) {
  requireNow(now);
  const allowed = ["name", "status", "notes"];
  for (const k of Object.keys(changes)) if (!allowed.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} cannot be changed here`, { field: k });
  const c = { ...changes };
  if ("name" in c) c.name = String(c.name ?? "").trim();
  return commit(state, { ...state, plan: bump(state.plan, c, { now }) }, { now });
}

export function addPlanItem(state, { exerciseRef, index = null, fields = {}, now, newId = defaultNewId }) {
  requireNow(now);
  const ref = { catalogExerciseId: exerciseRef?.catalogExerciseId ?? null, privateExerciseId: exerciseRef?.privateExerciseId ?? null };
  const refErrors = validateExerciseRef(ref);
  if (refErrors.length) throw new DomainError("EXERCISE_REF_INVALID", "invalid exercise reference", { errors: refErrors });
  for (const k of Object.keys(fields)) if (!ITEM_FIELDS.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} cannot be set here`, { field: k });
  const { list: items, record } = insertChild(state.items, { ...ITEM, parentId: state.plan.id, fields: { ...ref, restSec: null, notes: "", ...fields }, index, now, newId });
  return { state: commit(state, { ...state, items }, { now }), item: record };
}

export function updatePlanItem(state, { itemId, changes, now }) {
  requireNow(now);
  for (const k of Object.keys(changes)) if (!ITEM_FIELDS.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} cannot be changed here`, { field: k });
  const it = liveItem(state, itemId);
  return commit(state, { ...state, items: state.items.map((i) => (i.id === it.id ? bump(i, changes, { now }) : i)) }, { now });
}

export function movePlanItem(state, { itemId, toIndex, now }) {
  requireNow(now);
  const { list: items } = moveOne(state.items, { ...ITEM, parentId: state.plan.id, id: itemId, toIndex, now });
  return commit(state, { ...state, items }, { now });
}

// Removes an item and tombstones its planned sets.
export function removePlanItem(state, { itemId, now }) {
  requireNow(now);
  liveItem(state, itemId);
  const items = removeChild(state.items, { ...ITEM, parentId: state.plan.id, id: itemId, now });
  const sets = tombstoneChildren(state.sets, { parentKey: "planItemId", parentIds: [itemId], now });
  return commit(state, { ...state, items, sets }, { now });
}

export function joinPlanSuperset(state, { firstId, secondId, now, newId = defaultNewId }) {
  requireNow(now);
  const { list: items } = join(state.items, { ...ITEM, parentId: state.plan.id, firstId, secondId, now, newId });
  return commit(state, { ...state, items }, { now });
}

export function leavePlanSuperset(state, { itemId, now, newId = defaultNewId }) {
  requireNow(now);
  const { list: items } = leave(state.items, { ...ITEM, parentId: state.plan.id, id: itemId, now, newId });
  return commit(state, { ...state, items }, { now });
}

export function movePlanSuperset(state, { group, toIndex, now }) {
  requireNow(now);
  const { list: items } = moveGroup(state.items, { ...ITEM, parentId: state.plan.id, group, toIndex, now });
  return commit(state, { ...state, items }, { now });
}

// ---- planned sets (goals, PE-28) -----------------------------------------------------------
function goalOf(goal = {}) {
  for (const k of Object.keys(goal)) if (!GOAL_FIELDS.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} is not a goal field`, { field: k });
  const setType = goal.setType ?? "working";
  const time = goal.durationMinSec != null || goal.durationMaxSec != null;
  const g = {
    setType,
    repsMin: goal.repsMin ?? null,
    repsMax: goal.repsMax ?? null,
    durationMinSec: goal.durationMinSec ?? null,
    durationMaxSec: goal.durationMaxSec ?? null,
    // default target RIR 0–1 for a new working set with reps (D1); warm-ups and timed sets: none
    rirTarget: "rirTarget" in goal ? goal.rirTarget : setType === "working" && !time ? DEFAULT_RIR_TARGET : null,
  };
  const errors = validatePlanItemSet(g);
  if (errors.length) throw new DomainError("GOAL_INVALID", "invalid planned set", { errors });
  return g;
}

export function addPlanItemSet(state, { itemId, goal, index = null, now, newId = defaultNewId }) {
  requireNow(now);
  liveItem(state, itemId);
  const { list: sets, record } = insertChild(state.sets, { ...SET, parentId: itemId, fields: goalOf(goal), index, now, newId });
  return { state: commit(state, { ...state, sets }, { now }), set: record };
}

export function updatePlanItemSet(state, { setId, changes, now }) {
  requireNow(now);
  const s = state.sets.find((x) => x.id === setId);
  if (!s || !isLive(s)) throw new DomainError("NOT_LIVE", "no such live planned set", { setId });
  for (const k of Object.keys(changes)) if (!GOAL_FIELDS.includes(k)) throw new DomainError("FIELD_NOT_EDITABLE", `${k} is not a goal field`, { field: k });
  const merged = { ...s, ...changes };
  const errors = validatePlanItemSet(merged);
  if (errors.length) throw new DomainError("GOAL_INVALID", "invalid planned set", { errors });
  return commit(state, { ...state, sets: state.sets.map((x) => (x.id === setId ? bump(x, changes, { now }) : x)) }, { now });
}

export function movePlanItemSet(state, { setId, toIndex, now }) {
  requireNow(now);
  const s = state.sets.find((x) => x.id === setId);
  if (!s || !isLive(s)) throw new DomainError("NOT_LIVE", "no such live planned set", { setId });
  const { list: sets } = moveBlock(state.sets, { ...SET, parentId: s.planItemId, ids: [setId], toIndex, now });
  return commit(state, { ...state, sets }, { now });
}

export function removePlanItemSet(state, { setId, now }) {
  requireNow(now);
  const s = state.sets.find((x) => x.id === setId);
  if (!s || !isLive(s)) throw new DomainError("NOT_LIVE", "no such live planned set", { setId });
  const sets = removeChild(state.sets, { ...SET, parentId: s.planItemId, id: setId, now });
  return commit(state, { ...state, sets }, { now });
}

// Ordered live view (for readers): items with their sets.
export function planView(state) {
  return liveSiblings(state.items, "planId", state.plan.id).map((it) => ({ ...it, sets: liveSiblings(state.sets, "planItemId", it.id) }));
}



// The plan record exists twice in memory: in the plan list ({ profile, plans }) and in the plan state
// ({ plan, items, sets }). The newer version wins; storage (N2) keeps one record. These helpers move
// the newer copy across and refuse to go back in version.
export function withPlan(list, plan) {
  const copy = list.plans.find((p) => p.id === plan.id);
  if (!copy) throw new DomainError("NOT_A_LIVE_SIBLING", "plan is not in the list", { planId: plan.id });
  if (copy.version > plan.version) throw new DomainError("PLAN_STALE", "the plan record is older than the list copy", { planId: plan.id });
  return copy === plan ? list : { ...list, plans: list.plans.map((p) => (p.id === plan.id ? plan : p)) };
}

export function refreshPlan(state, list) {
  const copy = list.plans.find((p) => p.id === state.plan.id);
  if (!copy) throw new DomainError("NOT_A_LIVE_SIBLING", "plan is not in the list", { planId: state.plan.id });
  if (copy.version < state.plan.version) throw new DomainError("PLAN_STALE", "the list copy is older than the plan state", { planId: state.plan.id });
  return copy === state.plan ? state : { ...state, plan: copy };
}
