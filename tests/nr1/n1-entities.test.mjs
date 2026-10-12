// N1 — v2 entities: UUID, position, version, deleted_at; deterministic order; atomic operations with
// exact versioning (one step per changed record, one step for the parent of a changed list).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { newEntity, bump, touch, tombstone, squash, validateEntity, isUuid, DomainError } from "../../src/nr1/domain/entity.js";
import { compareOrder, sortByOrder, liveSiblings, validatePositions } from "../../src/nr1/domain/ordering.js";
import * as P from "../../src/nr1/domain/plan.js";
import * as W from "../../src/nr1/domain/workout.js";
import { validatePlanState } from "../../src/nr1/contracts/plan-goal.js";
import { validateWorkoutState } from "../../src/nr1/contracts/workout.js";
import { validateSupersets } from "../../src/nr1/domain/superset.js";
import { ids, clock, snap, deepFreeze, rng } from "./helpers.mjs";

const T0 = "2026-10-12T10:00:00.000Z";

describe("entity basics", () => {
  test("a new record: device UUID, version 1, created = updated, not deleted", () => {
    const e = newEntity({ name: "x" }, { now: T0, newId: ids() });
    assert.ok(isUuid(e.id));
    assert.deepEqual([e.version, e.createdAt, e.updatedAt, e.deletedAt], [1, T0, T0, null]);
    assert.deepEqual(validateEntity(e), []);
    assert.throws(() => newEntity({ version: 3 }, { now: T0, newId: ids() }), /ENTITY_FIELD_RESERVED/);
    assert.throws(() => newEntity({}, { now: "yesterday", newId: ids() }), /NOW_REQUIRED/);
    assert.throws(() => newEntity({}, { now: T0, newId: () => "not-a-uuid" }), /ID_INVALID/);
  });
  test("bump: no real change = same object and version; a change = version + 1; updatedAt never goes back", () => {
    const e = newEntity({ name: "x" }, { now: T0, newId: ids() });
    assert.equal(bump(e, { name: "x" }, { now: T0 }), e);
    const b = bump(e, { name: "y" }, { now: "2026-10-12T09:00:00.000Z" }); // device clock moved back
    assert.deepEqual([b.version, b.updatedAt, b.name], [2, T0, "y"]);
    assert.throws(() => bump(e, { version: 9 }, { now: T0 }), /ENTITY_FIELD_RESERVED/);
    assert.equal(touch(e, { now: T0 }).version, 2);
  });
  test("tombstone: deletedAt + version step, idempotent", () => {
    const e = newEntity({}, { now: T0, newId: ids() });
    const t = tombstone(e, { now: "2026-10-12T11:00:00.000Z" });
    assert.deepEqual([t.version, t.deletedAt], [2, "2026-10-12T11:00:00.000Z"]);
    assert.equal(tombstone(t, { now: "2026-10-12T12:00:00.000Z" }), t);
  });
  test("squash: exactly one version step per changed record within one operation", () => {
    const e = newEntity({ position: 0, supersetGroup: "a" }, { now: T0, newId: ids() });
    const twice = bump(bump(e, { position: 1 }, { now: T0 }), { supersetGroup: null }, { now: T0 });
    assert.equal(twice.version, 3);
    const [s] = squash([e], [twice], { now: T0 });
    assert.equal(s.version, 2);
    assert.equal(squash([e], [e], { now: T0 })[0], e);
  });
});

describe("deterministic order (position, createdAt, id) — PE-32", () => {
  test("ties and gaps give the same order whatever the input order", () => {
    const g = ids();
    const recs = [
      { ...newEntity({}, { now: T0, newId: g }), position: 2 },
      { ...newEntity({}, { now: T0, newId: g }), position: 0 },
      { ...newEntity({}, { now: "2026-10-12T09:00:00.000Z", newId: g }), position: 5 },
      { ...newEntity({}, { now: "2026-10-12T09:00:00.000Z", newId: g }), position: 5 },
      { ...newEntity({}, { now: T0, newId: g }), position: 5 },
    ];
    const want = sortByOrder(recs).map((r) => r.id);
    const r = rng(3);
    for (let i = 0; i < 50; i++) {
      const shuffled = [...recs].sort(() => r() - 0.5);
      assert.deepEqual(sortByOrder(shuffled).map((x) => x.id), want);
    }
    assert.ok(compareOrder(recs[1], recs[0]) < 0);
  });
});

// ---- plan: versioning rules -------------------------------------------------------------------
function planWith(n, g = ids(), now = T0) {
  const profile = P.createProfile({ now, newId: g });
  let { list, state } = P.createPlan({ profile, plans: [] }, { name: "Plan", now, newId: g });
  for (let i = 0; i < n; i++) state = P.addPlanItem(state, { exerciseRef: { catalogExerciseId: "test_press_db" }, now, newId: g }).state;
  return { list, state, g };
}

describe("plan operations: versions of records and parents", () => {
  test("adding an item: new item v1, plan + 1, nothing else", () => {
    const { state, g } = planWith(2);
    const before = deepFreeze(state);
    const { state: s, item } = P.addPlanItem(before, { exerciseRef: { catalogExerciseId: "test_row_cable" }, now: T0, newId: g });
    assert.equal(item.version, 1);
    assert.equal(s.plan.version, before.plan.version + 1);
    for (const it of before.items) assert.equal(s.items.find((x) => x.id === it.id), it);
  });
  test("insert at the front: shifted siblings + 1 each, plan + 1", () => {
    const { state, g } = planWith(3);
    const before = deepFreeze(state);
    const { state: s, item } = P.addPlanItem(before, { exerciseRef: { catalogExerciseId: "test_row_cable" }, index: 0, now: T0, newId: g });
    assert.deepEqual(liveSiblings(s.items, "planId", s.plan.id).map((i) => i.id)[0], item.id);
    for (const it of before.items) assert.equal(s.items.find((x) => x.id === it.id).version, it.version + 1);
    assert.equal(s.plan.version, before.plan.version + 1);
  });
  test("move: every record whose position changes + 1, plan + 1, untouched records identical", () => {
    const { state } = planWith(4);
    const before = deepFreeze(state);
    const order = liveSiblings(before.items, "planId", before.plan.id);
    const s = P.movePlanItem(before, { itemId: order[3].id, toIndex: 1, now: T0 });
    const after = liveSiblings(s.items, "planId", s.plan.id);
    assert.deepEqual(after.map((i) => i.id), [order[0], order[3], order[1], order[2]].map((i) => i.id));
    assert.equal(s.items.find((x) => x.id === order[0].id), order[0]);
    for (const r of [order[1], order[2], order[3]]) assert.equal(s.items.find((x) => x.id === r.id).version, r.version + 1);
    assert.equal(s.plan.version, before.plan.version + 1);
    assert.deepEqual(validatePositions(s.items, "planId"), []);
  });
  test("a goal change bumps only that planned set (not its item, not the plan)", () => {
    let { state, g } = planWith(1);
    const itemId = state.items[0].id;
    state = P.addPlanItemSet(state, { itemId, goal: { repsMin: 8, repsMax: 10 }, now: T0, newId: g }).state;
    const before = deepFreeze(state);
    const s = P.updatePlanItemSet(before, { setId: before.sets[0].id, changes: { repsMax: 12 }, now: T0 });
    assert.equal(s.sets[0].version, 2);
    assert.equal(s.items[0], before.items[0]);
    assert.equal(s.plan, before.plan);
  });
  test("adding a planned set bumps its item (parent of the list) once, not the plan", () => {
    const { state, g } = planWith(1);
    const before = deepFreeze(state);
    const s = P.addPlanItemSet(before, { itemId: before.items[0].id, goal: {}, now: T0, newId: g }).state;
    assert.equal(s.items[0].version, before.items[0].version + 1);
    assert.equal(s.plan, before.plan);
  });
  test("removing an item: tombstone + cascade to its sets, siblings renumbered, plan + 1", () => {
    let { state, g } = planWith(3);
    const order = liveSiblings(state.items, "planId", state.plan.id);
    state = P.addPlanItemSet(state, { itemId: order[0].id, goal: { repsMin: 5, repsMax: 5 }, now: T0, newId: g }).state;
    state = P.addPlanItemSet(state, { itemId: order[0].id, goal: { repsMin: 5, repsMax: 5 }, now: T0, newId: g }).state;
    const before = deepFreeze(state);
    const s = P.removePlanItem(before, { itemId: order[0].id, now: "2026-10-12T11:00:00.000Z" });
    const removed = s.items.find((x) => x.id === order[0].id);
    assert.equal(removed.deletedAt, "2026-10-12T11:00:00.000Z");
    assert.equal(removed.version, before.items.find((x) => x.id === order[0].id).version + 1);
    assert.ok(s.sets.every((x) => x.deletedAt !== null));
    assert.ok(s.sets.every((x, i) => x.version === before.sets[i].version + 1));
    assert.deepEqual(liveSiblings(s.items, "planId", s.plan.id).map((x) => x.position), [0, 1]);
    assert.equal(s.plan.version, before.plan.version + 1);
    assert.deepEqual(validatePlanState(s), []);
  });
  test("plan list: moving a plan bumps the moved plans and the profile once; removing a plan cascades", () => {
    const g = ids();
    let list = { profile: P.createProfile({ now: T0, newId: g }), plans: [] };
    const states = [];
    for (const name of ["A", "B", "C"]) {
      const r = P.createPlan(list, { name, now: T0, newId: g });
      list = r.list;
      states.push(r.state);
    }
    assert.equal(list.profile.version, 4);
    const before = deepFreeze(list);
    const moved = P.movePlan(before, { planId: states[2].plan.id, toIndex: 0, now: T0 });
    assert.equal(moved.profile.version, 5);
    assert.deepEqual(liveSiblings(moved.plans, null, null).map((p) => p.name), ["C", "A", "B"]);
    let st = P.addPlanItem(states[1], { exerciseRef: { catalogExerciseId: "test_press_bar" }, now: T0, newId: g }).state;
    st = P.addPlanItemSet(st, { itemId: st.items[0].id, goal: {}, now: T0, newId: g }).state;
    const r = P.removePlan(list, st, { now: "2026-10-12T12:00:00.000Z" });
    assert.equal(r.state.plan.version, st.plan.version + 1, "removal continues the plan's own version");
    assert.equal(r.list.plans.find((p) => p.id === st.plan.id), r.state.plan);
    const stale = { ...st, plan: { ...st.plan, version: 0 + 1 } };
    assert.throws(() => P.removePlan({ ...list, plans: list.plans.map((p) => (p.id === st.plan.id ? { ...p, version: 9 } : p)) }, stale, { now: T0 }), /PLAN_STALE/);
    assert.ok(r.state.plan.deletedAt && r.state.items.every((i) => i.deletedAt) && r.state.sets.every((x) => x.deletedAt));
    assert.deepEqual(liveSiblings(r.list.plans, null, null).map((p) => p.name), ["A", "C"]);
    assert.equal(r.list.profile.version, list.profile.version + 1);
  });
  test("plan status active / archived (D3); invalid status refused", () => {
    const { state } = planWith(0);
    const s = P.updatePlan(state, { changes: { status: "archived" }, now: T0 });
    assert.deepEqual([s.plan.status, s.plan.version], ["archived", 2]);
    assert.throws(() => P.updatePlan(state, { changes: { status: "deleted" }, now: T0 }), /STATE_INVALID/);
  });
});

describe("atomicity: a refused operation returns nothing and changes nothing", () => {
  test("refused operations throw DomainError; the frozen input stays valid and identical", () => {
    const { state, g } = planWith(3);
    const before = deepFreeze(state);
    const snapshot = JSON.stringify(before);
    const bad = [
      () => P.movePlanItem(before, { itemId: before.items[0].id, toIndex: 7, now: T0 }),
      () => P.addPlanItem(before, { exerciseRef: { catalogExerciseId: "test_press_db", privateExerciseId: "00000000-0000-4000-8000-000000000001" }, now: T0, newId: g }),
      () => P.addPlanItemSet(before, { itemId: before.items[0].id, goal: { repsMin: 10, repsMax: 8 }, now: T0, newId: g }),
      () => P.removePlanItem(before, { itemId: "00000000-0000-4000-8000-0000000009ff", now: T0 }),
      () => P.addPlanItem(before, { exerciseRef: { catalogExerciseId: "test_press_db" }, now: "now", newId: g }),
    ];
    for (const f of bad) assert.throws(f, (e) => e instanceof DomainError);
    assert.equal(JSON.stringify(before), snapshot);
  });
});

// ---- property test: random operation sequences ------------------------------------------------
function checkStep(prev, next, parent, children) {
  // one version step per changed record, unchanged records identical, new records version 1
  for (const [kind, key] of children) {
    const before = new Map(prev[kind].map((r) => [r.id, r]));
    for (const r of next[kind]) {
      const b = before.get(r.id);
      if (!b) assert.equal(r.version, 1, `${kind} new record`);
      else if (b !== r) assert.equal(r.version, b.version + 1, `${kind} changed record`);
    }
    assert.deepEqual(validatePositions(next[kind], key), [], `${kind} positions dense`);
  }
  const d = next[parent].version - prev[parent].version;
  assert.ok(d === 0 || d === 1, `${parent} version step ${d}`);
}

test("plans: 400 random operations keep the contract, dense order, supersets and exact versions", () => {
  const r = rng(11);
  const g = ids(4);
  const now = clock();
  let state = planWith(0, g).state;
  const pick = (a) => a[Math.floor(r() * a.length)];
  let applied = 0;
  for (let i = 0; i < 400; i++) {
    const live = liveSiblings(state.items, "planId", state.plan.id);
    const groups = [...new Set(live.map((x) => x.supersetGroup).filter(Boolean))];
    const liveSets = state.sets.filter((s) => s.deletedAt === null);
    const ops = [
      () => P.addPlanItem(state, { exerciseRef: { catalogExerciseId: pick(["test_press_db", "test_row_cable", "test_pull_bw"]) }, index: live.length ? Math.floor(r() * (live.length + 1)) : null, now: now(), newId: g }).state,
      () => live.length && P.movePlanItem(state, { itemId: pick(live).id, toIndex: Math.floor(r() * live.length), now: now() }),
      () => live.length && P.removePlanItem(state, { itemId: pick(live).id, now: now() }),
      () => live.length > 1 && (() => { const k = Math.floor(r() * (live.length - 1)); return P.joinPlanSuperset(state, { firstId: live[k].id, secondId: live[k + 1].id, now: now(), newId: g }); })(),
      () => live.some((x) => x.supersetGroup) && P.leavePlanSuperset(state, { itemId: pick(live.filter((x) => x.supersetGroup)).id, now: now(), newId: g }),
      () => groups.length && P.movePlanSuperset(state, { group: pick(groups), toIndex: Math.floor(r() * (live.length - 1)), now: now() }),
      () => live.length && P.addPlanItemSet(state, { itemId: pick(live).id, goal: { repsMin: 6, repsMax: 6 + Math.floor(r() * 6) }, now: now(), newId: g }).state,
      () => liveSets.length && P.removePlanItemSet(state, { setId: pick(liveSets).id, now: now() }),
      () => liveSets.length && P.movePlanItemSet(state, { setId: pick(liveSets).id, toIndex: 0, now: now() }),
    ];
    const prev = deepFreeze(state);
    const frozenJson = JSON.stringify(prev);
    let next;
    try {
      next = pick(ops)();
    } catch (e) {
      assert.ok(e instanceof DomainError, String(e));
      assert.equal(JSON.stringify(prev), frozenJson);
      continue;
    }
    if (!next) continue;
    assert.deepEqual(validatePlanState(next), []);
    assert.deepEqual(validateSupersets(liveSiblings(next.items, "planId", next.plan.id)), []);
    checkStep(prev, next, "plan", [["items", "planId"], ["sets", "planItemId"]]);
    state = next;
    applied++;
  }
  assert.ok(applied > 150, `applied ${applied}`);
});

test("workouts: 300 random operations keep the contract, dense order, supersets and exact versions", () => {
  const r = rng(5);
  const g = ids(4);
  const now = clock();
  let state = W.createWorkout({ now: now(), newId: g });
  const pick = (a) => a[Math.floor(r() * a.length)];
  const exIds = ["test_press_db", "test_row_db_one", "test_pull_bw", "test_core_plank"];
  let applied = 0;
  for (let i = 0; i < 300; i++) {
    const live = liveSiblings(state.exercises, "workoutId", state.workout.id);
    const groups = [...new Set(live.map((x) => x.supersetGroup).filter(Boolean))];
    const liveSets = state.sets.filter((s) => s.deletedAt === null);
    const valuesFor = (ex) => (ex.loadSnapshot.loadModel === "time" ? { durationSec: 30 + Math.floor(r() * 30) } : ex.loadSnapshot.loadModel === "bodyweight" ? { reps: 1 + Math.floor(r() * 12) } : { reps: 1 + Math.floor(r() * 12), loadKg: Math.round(r() * 400) / 4 });
    const ops = [
      () => { const id = pick(exIds); return W.addWorkoutExercise(state, { exerciseRef: { catalogExerciseId: id }, loadSnapshot: snap(id), index: live.length ? Math.floor(r() * (live.length + 1)) : null, now: now(), newId: g }).state; },
      () => live.length && W.moveWorkoutExercise(state, { exerciseId: pick(live).id, toIndex: Math.floor(r() * live.length), now: now() }),
      () => live.length && W.removeWorkoutExercise(state, { exerciseId: pick(live).id, now: now() }),
      () => live.length > 1 && (() => { const k = Math.floor(r() * (live.length - 1)); return W.joinWorkoutSuperset(state, { firstId: live[k].id, secondId: live[k + 1].id, now: now(), newId: g }); })(),
      () => live.some((x) => x.supersetGroup) && W.leaveWorkoutSuperset(state, { exerciseId: pick(live.filter((x) => x.supersetGroup)).id, now: now(), newId: g }),
      () => groups.length && W.moveWorkoutSuperset(state, { group: pick(groups), toIndex: Math.floor(r() * (live.length - 1)), now: now() }),
      () => { if (!live.length) return null; const ex = pick(live); return W.addWorkoutSet(state, { exerciseId: ex.id, values: valuesFor(ex), now: now(), newId: g }).state; },
      () => liveSets.length && W.removeWorkoutSet(state, { setId: pick(liveSets).id, now: now() }),
      () => liveSets.length && W.moveWorkoutSet(state, { setId: pick(liveSets).id, toIndex: 0, now: now() }),
    ];
    const prev = deepFreeze(state);
    const frozenJson = JSON.stringify(prev);
    let next;
    try {
      next = pick(ops)();
    } catch (e) {
      assert.ok(e instanceof DomainError, String(e && e.stack));
      assert.equal(JSON.stringify(prev), frozenJson);
      continue;
    }
    if (!next) continue;
    assert.deepEqual(validateWorkoutState(next), []);
    checkStep(prev, next, "workout", [["exercises", "workoutId"], ["sets", "workoutExerciseId"]]);
    state = next;
    applied++;
  }
  assert.ok(applied > 120, `applied ${applied}`);
  const done = W.finishWorkout(state, { now: "2026-10-12T23:00:00.000Z" });
  assert.deepEqual(validateWorkoutState(done, { requireFinished: true }), []);
  const removed = W.removeWorkout(done, { now: "2026-10-13T00:00:00.000Z" });
  assert.ok(removed.workout.deletedAt && removed.exercises.every((x) => x.deletedAt) && removed.sets.every((x) => x.deletedAt));
});

test("plan record in the list and in the plan state: the newer version wins, never going back", () => {
  const g = ids();
  let list = { profile: P.createProfile({ now: T0, newId: g }), plans: [] };
  let r = P.createPlan(list, { name: "A", now: T0, newId: g });
  list = r.list;
  let st = P.addPlanItem(r.state, { exerciseRef: { catalogExerciseId: "test_press_bar" }, now: T0, newId: g }).state;
  list = P.withPlan(list, st.plan);
  assert.equal(list.plans[0].version, st.plan.version);
  r = P.createPlan(list, { name: "B", now: T0, newId: g });
  list = P.movePlan(r.list, { planId: r.state.plan.id, toIndex: 0, now: T0 });
  st = P.refreshPlan(st, list);
  assert.equal(st.plan, list.plans.find((p) => p.id === st.plan.id));
  assert.throws(() => P.withPlan(list, { ...st.plan, version: 1 }), /PLAN_STALE/);
});
