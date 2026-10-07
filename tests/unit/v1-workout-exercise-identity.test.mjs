// Hotfix I-1 — identity of workout exercises written by migration V1.
// Migration V1 used to write nextrep_workout_exercises.legacy_id = "<workoutId>-posN", while the sync
// engine (push AND pull/apply) identifies a workout exercise by its stable local session.exercises[].id.
// After a V1 upload the normal PULL did not recognise the existing local exercise and appended a second
// one (with the same sets under it) → duplicated history, doubled volume, wrong progression input.
// These tests run the REAL production functions against the in-memory fake Supabase (no network).
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, key } from "../harness/account-fixtures.mjs";

let A;
let S;
const clone = (v) => JSON.parse(JSON.stringify(v));
const readJson = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};

before(async () => {
  A = await loadApp();
});
function setup() {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: UA } };
  A.activateDataNamespace(UA);
}
beforeEach(() => setup());

// Two workouts of the same plan; each has two exercises with stable ids and several sets — enough for
// the progression engine to compare the second workout against the first.
const wSet = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const setsDetail = [
  { id: "sd1", target: "8-10", rir: "" },
  { id: "sd2", target: "8-10", rir: "" },
  { id: "sd3", target: "8-10", rir: "" },
];
const HISTORY = [
  {
    id: "w1",
    date: "2026-10-01T10:00:00.000Z",
    planId: null,
    planName: "Plan A",
    exercises: [
      { id: "we-w1-bench", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail, sets: [wSet("s-w1-b1", 80, 8), wSet("s-w1-b2", 80, 8), wSet("s-w1-b3", 80, 8)] },
      { id: "we-w1-squat", exerciseId: "squat_barbell", name: "Przysiad", type: "weight", setsDetail, sets: [wSet("s-w1-q1", 100, 8), wSet("s-w1-q2", 100, 8)] },
    ],
  },
  {
    id: "w2",
    date: "2026-10-04T10:00:00.000Z",
    planId: null,
    planName: "Plan A",
    exercises: [
      { id: "we-w2-bench", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail, sets: [wSet("s-w2-b1", 80, 10), wSet("s-w2-b2", 80, 10), wSet("s-w2-b3", 80, 9)] },
      { id: "we-w2-squat", exerciseId: "squat_barbell", name: "Przysiad", type: "weight", setsDetail, sets: [wSet("s-w2-q1", 100, 9), wSet("s-w2-q2", 100, 9)] },
    ],
  },
];
const EXPECTED_WEX_IDS = ["we-w1-bench", "we-w1-squat", "we-w2-bench", "we-w2-squat"];

function seedHistory(history = HISTORY) {
  localStorage.setItem(key(UA, "history"), JSON.stringify(history));
}
const localHistory = () => readJson(key(UA, "history"));
const wexRows = () => S.tables.nextrep_workout_exercises || [];
const setRows = () => S.tables.nextrep_workout_sets || [];
const isPosLegacy = (lid) => /-pos\d+$/.test(String(lid));
const v1 = async () => {
  const r = await quiet(() => A.runMigrationV1());
  assert.equal(r.success, true, `V1 failed: ${r.error}`);
  return r;
};
// The normal sync path after an upload: account "ready", sync_meta baselines, then PULL + APPLY.
async function pullApply() {
  A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
  await quiet(() => A.bootstrapSyncMetaForExistingData());
  const pull = await quiet(() => A.pullRemoteChanges());
  assert.equal(pull.success, true, `pull failed: ${pull.error}`);
  const apply = await quiet(() => A.applyRemoteChanges(pull));
  assert.equal(apply.success, true, `apply failed: ${apply.error}`);
  return apply;
}
// What the app itself analyses: per session → exercise count, set count, volume; per exercise of the
// latest session → the progression engine's verdict (analyzeSessionExercise, unchanged engine).
function semantics(history) {
  const norm = history.map(A.normalizeHistorySession);
  const perSession = norm.map((s) => ({
    id: s.id,
    exercises: s.exercises.length,
    sets: s.exercises.reduce((n, ex) => n + (ex.sets || []).length, 0),
    volume: s.exercises.reduce((v, ex) => v + A.computeSessionVolume(ex.sets, ex.type), 0),
  }));
  const last = norm.find((s) => s.id === "w2");
  const analysis = last.exercises.map((ex) => {
    const r = A.analyzeSessionExercise(norm, last, ex);
    return { exerciseId: ex.exerciseId, status: r && r.status, message: r && r.message, suggestedWeight: r && r.suggestedWeight };
  });
  return { perSession, analysis };
}
const wexIdsOf = (history) => history.flatMap((s) => s.exercises.map((ex) => ex.id)).sort();
const setIdsOf = (history) => history.flatMap((s) => s.exercises.flatMap((ex) => (ex.sets || []).map((st) => st.id))).sort();

describe("I-1 — V1 upload followed by the normal PULL keeps exactly one workout exercise per local ex.id", () => {
  test("V1 → PULL/APPLY: no duplicated exercise or set, same volume and progression verdict", async () => {
    seedHistory();
    const before = semantics(localHistory());
    await v1();
    const apply = await pullApply();
    const after = localHistory();
    assert.deepEqual(wexIdsOf(after), EXPECTED_WEX_IDS, "exactly one workout exercise per local ex.id (no '<workoutId>-posN' copy)");
    assert.equal(setIdsOf(after).length, 10, "exactly the 10 local sets");
    assert.equal(new Set(setIdsOf(after)).size, 10, "no set appears twice");
    assert.equal(apply.applied.workout_exercises, 0, "PULL recognised every uploaded workout exercise");
    assert.equal(apply.applied.workout_sets, 0, "PULL recognised every uploaded set");
    assert.deepEqual(semantics(after), before, "exercise count, set count, volume and progression verdicts unchanged");
  });

  test("cloud identity: workout_exercises.legacy_id = local ex.id; sets keep their own ids under that parent", async () => {
    seedHistory();
    await v1();
    assert.deepEqual(wexRows().map((r) => r.legacy_id).sort(), EXPECTED_WEX_IDS);
    assert.equal(wexRows().filter((r) => isPosLegacy(r.legacy_id)).length, 0, "no new '-posN' rows");
    const parentByLegacy = Object.fromEntries(wexRows().map((r) => [r.legacy_id, r.id]));
    for (const s of HISTORY) {
      for (const ex of s.exercises) {
        for (const st of ex.sets) {
          const row = setRows().find((r) => r.legacy_id === st.id);
          assert.ok(row, `set ${st.id} uploaded`);
          assert.equal(row.workout_exercise_id, parentByLegacy[ex.id], `set ${st.id} attached to the row of ${ex.id}`);
        }
      }
    }
  });

  test("idempotency: V1 → V1 → PULL → PULL: stable cloud row counts, zero new duplicates", async () => {
    seedHistory();
    const before = semantics(localHistory());
    await v1();
    const counts = () => ({ w: (S.tables.nextrep_workouts || []).length, we: wexRows().length, ws: setRows().length });
    const afterFirst = counts();
    await v1();
    assert.deepEqual(counts(), afterFirst, "a second V1 run creates no new cloud rows");
    assert.deepEqual(afterFirst, { w: 2, we: 4, ws: 10 });
    await pullApply();
    await pullApply();
    const after = localHistory();
    assert.equal(after.length, 2);
    assert.deepEqual(wexIdsOf(after), EXPECTED_WEX_IDS);
    assert.equal(setIdsOf(after).length, 10);
    assert.deepEqual(semantics(after), before);
    assert.deepEqual(counts(), afterFirst);
  });
});

describe("I-1 — set identity is unchanged", () => {
  test("sets with an id keep it as legacy_id; id-less sets keep the old '<workoutId>-posN-setM' legacy_id (no new rows on re-run)", async () => {
    const h = clone(HISTORY);
    h[0].exercises[1].sets = h[0].exercises[1].sets.map(({ id, ...rest }) => rest); // squat sets of w1 without ids
    seedHistory(h);
    await v1();
    const lids = setRows().map((r) => r.legacy_id).sort();
    assert.ok(lids.includes("w1-pos1-set0") && lids.includes("w1-pos1-set1"), "id-less sets: same legacy ids as before the hotfix");
    assert.ok(lids.includes("s-w1-b1") && lids.includes("s-w2-q2"), "sets with an id: legacy_id = set id");
    const squatRow = wexRows().find((r) => r.legacy_id === "we-w1-squat");
    assert.ok(setRows().filter((r) => r.legacy_id.startsWith("w1-pos1-set")).every((r) => r.workout_exercise_id === squatRow.id), "attached to the canonical parent");
    const n = setRows().length;
    await v1();
    assert.equal(setRows().length, n, "re-run creates no set rows");
  });

  test("an ex.id repeated in two sessions (old data) is not used as identity: two rows, one per workout, never moved", async () => {
    const h = clone(HISTORY);
    h[1].exercises[0].id = "we-w1-bench"; // same id in w1 and w2
    seedHistory(h);
    await v1();
    const w = Object.fromEntries((S.tables.nextrep_workouts || []).map((r) => [r.legacy_id, r.id]));
    assert.ok(wexRows().some((r) => r.legacy_id === "w1-pos0" && r.workout_id === w.w1), "w1 keeps its own row");
    assert.ok(wexRows().some((r) => r.legacy_id === "w2-pos0" && r.workout_id === w.w2), "w2 keeps its own row");
    assert.equal(wexRows().filter((r) => r.legacy_id === "we-w1-bench").length, 0, "the repeated id is not a cloud identity");
    assert.equal(wexRows().length, 4);
  });
});

describe("I-1 — backward compatibility with rows already uploaded as '<workoutId>-posN'", () => {
  // Rows exactly as the old V1 wrote them: same row data, legacy_id "<workoutId>-posN".
  async function cloudWithHistoricalRows() {
    seedHistory();
    await v1();
    const posOf = {};
    for (const s of HISTORY) s.exercises.forEach((ex, i) => (posOf[ex.id] = `${s.id}-pos${i}`));
    for (const r of wexRows()) r.legacy_id = posOf[r.legacy_id];
    // a fresh device state: no sync meta, no V1 status — like a device that never pulled; same cloud
    const cloud = clone(S.tables);
    setup();
    S.tables = cloud;
    seedHistory();
    return clone(wexRows());
  }

  test("only '-posN' exists → re-run reuses that row (re-keyed to ex.id): no second row, sets stay attached; PULL adds nothing", async () => {
    const historical = await cloudWithHistoricalRows();
    const setsBefore = clone(setRows());
    const before = semantics(localHistory());
    await v1();
    assert.equal(wexRows().length, 4, "no new workout_exercises row");
    assert.deepEqual(wexRows().map((r) => r.id).sort(), historical.map((r) => r.id).sort(), "the SAME rows (same uuid) are reused");
    assert.deepEqual(wexRows().map((r) => r.legacy_id).sort(), EXPECTED_WEX_IDS, "historical rows now carry the canonical ex.id");
    assert.equal(setRows().length, setsBefore.length, "no new set rows");
    for (const st of setRows()) {
      const was = setsBefore.find((x) => x.id === st.id);
      assert.equal(st.workout_exercise_id, was.workout_exercise_id, `set ${st.legacy_id} still under the same parent row`);
    }
    await pullApply();
    const after = localHistory();
    assert.deepEqual(wexIdsOf(after), EXPECTED_WEX_IDS);
    assert.equal(setIdsOf(after).length, 10);
    assert.deepEqual(semantics(after), before);
  });

  test("manual repair tool (runManualMigrationV1, account ready) twice → no '-posN' row created, no duplicate row or set", async () => {
    await cloudWithHistoricalRows();
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const r1 = await quiet(() => A.runManualMigrationV1());
    assert.equal(r1.success, true, r1.error);
    const r2 = await quiet(() => A.runManualMigrationV1());
    assert.equal(r2.success, true, r2.error);
    assert.equal(wexRows().length, 4);
    assert.equal(wexRows().filter((r) => isPosLegacy(r.legacy_id)).length, 0);
    assert.equal(setRows().length, 10);
  });

  test("canonical AND '-posN' both exist → V1 updates the canonical row, creates nothing, never deletes or re-keys the old row", async () => {
    seedHistory();
    await v1();
    const extra = clone(wexRows().find((r) => r.legacy_id === "we-w1-bench"));
    S.tables.nextrep_workout_exercises.push({ ...extra, id: "old-pos-row", legacy_id: "w1-pos0" });
    const n = wexRows().length;
    await v1();
    assert.equal(wexRows().length, n, "no row created");
    const old = wexRows().find((r) => r.id === "old-pos-row");
    assert.ok(old, "the historical row is never deleted");
    assert.equal(old.legacy_id, "w1-pos0", "and never re-keyed while a canonical row exists");
  });

  test("a '-posN' row that is NOT the same exercise (other exercise / other workout) is never taken over", async () => {
    seedHistory();
    await v1();
    // pretend the old upload happened before the session was edited: position 0 held another exercise
    const bench = wexRows().find((r) => r.legacy_id === "we-w1-bench");
    bench.legacy_id = "w1-pos0";
    bench.exercise_id = "some-other-exercise-uuid";
    await v1();
    const old = wexRows().find((r) => r.id === bench.id);
    assert.equal(old.legacy_id, "w1-pos0", "not re-keyed (different exercise)");
    assert.equal(old.exercise_id, "some-other-exercise-uuid", "not overwritten");
    assert.ok(wexRows().some((r) => r.legacy_id === "we-w1-bench" && r.id !== bench.id), "the canonical row is created instead");
  });

  test("two '-posN' rows with the same legacy_id (ambiguous) → neither is taken over", async () => {
    seedHistory();
    await v1();
    const bench = wexRows().find((r) => r.legacy_id === "we-w1-bench");
    bench.legacy_id = "w1-pos0";
    S.tables.nextrep_workout_exercises.push({ ...clone(bench), id: "dup-pos-row" });
    await v1();
    assert.equal(wexRows().filter((r) => r.legacy_id === "w1-pos0").length, 2, "both historical rows untouched");
    assert.equal(wexRows().filter((r) => r.legacy_id === "we-w1-bench").length, 1, "one canonical row");
  });
});
