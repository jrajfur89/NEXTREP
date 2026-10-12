// N1 — supersets: contiguous groups of at least two neighbours; every operation keeps the invariant
// or refuses without changing anything; members moved or regrouped get exactly one version step.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as P from "../../src/nr1/domain/plan.js";
import * as W from "../../src/nr1/domain/workout.js";
import { validateSupersets } from "../../src/nr1/domain/superset.js";
import { liveSiblings } from "../../src/nr1/domain/ordering.js";
import { DomainError } from "../../src/nr1/domain/entity.js";
import { ids, snap, deepFreeze } from "./helpers.mjs";

const T = "2026-10-12T10:00:00.000Z";
function plan(n) {
  const g = ids();
  let { state } = P.createPlan({ profile: P.createProfile({ now: T, newId: g }), plans: [] }, { name: "S", now: T, newId: g });
  for (let i = 0; i < n; i++) state = P.addPlanItem(state, { exerciseRef: { catalogExerciseId: "test_press_db" }, now: T, newId: g }).state;
  return { state, g, order: () => liveSiblings(state.items, "planId", state.plan.id) };
}
const live = (s) => liveSiblings(s.items, "planId", s.plan.id);
const groupsOf = (s) => live(s).map((i) => i.supersetGroup);

describe("join", () => {
  test("two neighbours form a group; both + 1; plan + 1", () => {
    const { state, g } = plan(3);
    const [a, b] = live(state);
    const s = P.joinPlanSuperset(deepFreeze(state), { firstId: b.id, secondId: a.id, now: T, newId: g });
    const [ga, gb, gc] = groupsOf(s);
    assert.ok(ga && ga === gb && gc === null);
    assert.deepEqual(live(s).slice(0, 2).map((x) => x.version), [a.version + 1, b.version + 1]);
    assert.equal(s.plan.version, state.plan.version + 1);
  });
  test("non-neighbours are refused; already joined is refused", () => {
    const { state, g } = plan(3);
    const [a, b, c] = live(state);
    assert.throws(() => P.joinPlanSuperset(state, { firstId: a.id, secondId: c.id, now: T, newId: g }), /SUPERSET_NOT_NEIGHBOURS/);
    const s = P.joinPlanSuperset(state, { firstId: a.id, secondId: b.id, now: T, newId: g });
    assert.throws(() => P.joinPlanSuperset(s, { firstId: a.id, secondId: b.id, now: T, newId: g }), /SUPERSET_ALREADY_JOINED/);
  });
  test("joining a neighbour to a group extends it; joining two groups merges them into the first", () => {
    const { state, g } = plan(5);
    const [a, b, c, d, e] = live(state);
    let s = P.joinPlanSuperset(state, { firstId: a.id, secondId: b.id, now: T, newId: g });
    s = P.joinPlanSuperset(s, { firstId: b.id, secondId: c.id, now: T, newId: g });
    s = P.joinPlanSuperset(s, { firstId: d.id, secondId: e.id, now: T, newId: g });
    const g1 = groupsOf(s)[0];
    s = P.joinPlanSuperset(s, { firstId: c.id, secondId: d.id, now: T, newId: g });
    assert.deepEqual(groupsOf(s), [g1, g1, g1, g1, g1]);
  });
});

describe("leave", () => {
  test("leaving a two-member group dissolves it", () => {
    const { state, g } = plan(2);
    const [a, b] = live(state);
    const s = P.leavePlanSuperset(P.joinPlanSuperset(state, { firstId: a.id, secondId: b.id, now: T, newId: g }), { itemId: a.id, now: T, newId: g });
    assert.deepEqual(groupsOf(s), [null, null]);
  });
  test("leaving from the middle splits the group into two (each part >= 2) or drops a single", () => {
    const { state, g } = plan(5);
    const [a, b, c, d, e] = live(state);
    let s = state;
    for (const [x, y] of [[a, b], [b, c], [c, d], [d, e]]) s = P.joinPlanSuperset(s, { firstId: x.id, secondId: y.id, now: T, newId: g });
    const split = P.leavePlanSuperset(s, { itemId: c.id, now: T, newId: g });
    const [g1, g2, g3, g4, g5] = groupsOf(split);
    assert.ok(g1 && g1 === g2 && g3 === null && g4 && g4 === g5 && g4 !== g1);
    const drop = P.leavePlanSuperset(s, { itemId: b.id, now: T, newId: g });
    const [h1, h2, h3, h4, h5] = groupsOf(drop);
    assert.ok(h1 === null && h2 === null && h3 && h3 === h4 && h4 === h5);
  });
  test("leaving when not in a group is refused", () => {
    const { state, g } = plan(2);
    assert.throws(() => P.leavePlanSuperset(state, { itemId: live(state)[0].id, now: T, newId: g }), /NOT_IN_SUPERSET/);
  });
});

describe("moves keep groups contiguous", () => {
  function grouped() {
    const { state, g } = plan(5);
    const [a, b, c, d, e] = live(state);
    let s = P.joinPlanSuperset(state, { firstId: b.id, secondId: c.id, now: T, newId: g });
    s = P.joinPlanSuperset(s, { firstId: c.id, secondId: d.id, now: T, newId: g });
    return { s: deepFreeze(s), a, b, c, d, e, g };
  }
  test("a member moves inside its group", () => {
    const { s, b, d } = grouped();
    const n = P.movePlanItem(s, { itemId: d.id, toIndex: 1, now: T });
    assert.deepEqual(live(n).map((x) => x.id).slice(1, 4), [d.id, b.id, live(s)[2].id]);
    assert.deepEqual(validateSupersets(live(n)), []);
  });
  test("a member cannot leave its group by moving; a single cannot land inside a group", () => {
    const { s, a, b } = grouped();
    const json = JSON.stringify(s);
    assert.throws(() => P.movePlanItem(s, { itemId: b.id, toIndex: 4, now: T }), /SUPERSET_MEMBER_OUT_OF_GROUP/);
    assert.throws(() => P.movePlanItem(s, { itemId: a.id, toIndex: 2, now: T }), /MOVE_INTO_SUPERSET/);
    assert.equal(JSON.stringify(s), json);
  });
  test("a new item cannot be inserted inside a group", () => {
    const { s, g } = grouped();
    assert.throws(() => P.addPlanItem(s, { exerciseRef: { catalogExerciseId: "test_press_bar" }, index: 2, now: T, newId: g }), (e) => e instanceof DomainError && /MOVE_INTO_SUPERSET/.test(e.message));
  });
  test("a whole group moves as one block; members and shifted items + 1, plan + 1", () => {
    const { s, a, b, c, d, e } = grouped();
    const group = live(s)[1].supersetGroup;
    const n = P.movePlanSuperset(s, { group, toIndex: 0, now: T });
    assert.deepEqual(live(n).map((x) => x.id), [b.id, c.id, d.id, a.id, e.id]);
    assert.equal(n.items.find((x) => x.id === e.id), s.items.find((x) => x.id === e.id));
    for (const r of [a, b, c, d]) assert.equal(n.items.find((x) => x.id === r.id).version, s.items.find((x) => x.id === r.id).version + 1);
    assert.equal(n.plan.version, s.plan.version + 1);
    assert.throws(() => P.movePlanSuperset(s, { group, toIndex: 3, now: T }), /INDEX_OUT_OF_RANGE/);
    assert.deepEqual(live(P.movePlanSuperset(s, { group, toIndex: 2, now: T })).map((x) => x.id), [a.id, e.id, b.id, c.id, d.id]);
  });
  test("removing a member of a two-member group dissolves the group (one step for the survivor)", () => {
    const { state, g } = plan(3);
    const [a, b] = live(state);
    const s = deepFreeze(P.joinPlanSuperset(state, { firstId: a.id, secondId: b.id, now: T, newId: g }));
    const n = P.removePlanItem(s, { itemId: a.id, now: T });
    const survivor = n.items.find((x) => x.id === b.id);
    assert.equal(survivor.supersetGroup, null);
    assert.equal(survivor.version, s.items.find((x) => x.id === b.id).version + 1, "position and group changed: still one step");
  });
});

describe("validator and workouts", () => {
  test("validateSupersets reports a broken or single-member group", () => {
    const G = "00000000-0000-4000-8000-0000000000aa";
    const mk = (id, grp) => ({ id, supersetGroup: grp });
    assert.deepEqual(validateSupersets([mk("1", G), mk("2", G), mk("3", null)]), []);
    assert.equal(validateSupersets([mk("1", G), mk("2", null), mk("3", G)])[0].code, "SUPERSET_NOT_CONTIGUOUS");
    assert.equal(validateSupersets([mk("1", G), mk("2", null)])[0].code, "SUPERSET_TOO_SMALL");
    assert.equal(validateSupersets([mk("1", "x"), mk("2", "x")])[0].code, "SUPERSET_GROUP_INVALID");
  });
  test("the same rules hold for workout exercises", () => {
    const g = ids();
    let s = W.createWorkout({ now: T, newId: g });
    for (const id of ["test_press_db", "test_row_db_one", "test_pull_bw"]) s = W.addWorkoutExercise(s, { exerciseRef: { catalogExerciseId: id }, loadSnapshot: snap(id), now: T, newId: g }).state;
    const [a, b, c] = liveSiblings(s.exercises, "workoutId", s.workout.id);
    s = W.joinWorkoutSuperset(s, { firstId: a.id, secondId: b.id, now: T, newId: g });
    assert.throws(() => W.moveWorkoutExercise(s, { exerciseId: c.id, toIndex: 1, now: T }), /MOVE_INTO_SUPERSET/);
    const moved = W.moveWorkoutSuperset(s, { group: liveSiblings(s.exercises, "workoutId", s.workout.id)[0].supersetGroup, toIndex: 1, now: T });
    assert.deepEqual(liveSiblings(moved.exercises, "workoutId", moved.workout.id).map((x) => x.id), [c.id, a.id, b.id]);
  });
});
