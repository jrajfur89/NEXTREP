// DES-01 / D2 §5 — verification of the D1 data BEFORE the D2 screens, on the whole app as it ships (S1):
// 1 data read after a restart, 2 isolation guest / A / B, 3 data kept across account switches, 4 broken local
// data, 5 export / import, 6 no silent removal of plan / history references by the app's start-up.
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import { useS1Profile, resetStorage } from "../harness/load-app.mjs";
import { React, mount, unmount, flush, act, $, byTestId, loadApp } from "../harness/ui.mjs";
import { UA, UB } from "../harness/account-fixtures.mjs";

useS1Profile();
const h = React.createElement;
const K = (n, ns = "guest") => `nextrep1_${ns}_${n}_v1`;
const NOW = "2026-10-26T10:00:00.000Z";
const HOME_BENCH = { namePl: "Wyciskanie w garażu", equipment: ["barbell", "bench"], primaryMuscles: ["pectoralis_major"], measurementType: "weight_reps", loadModel: "barbell_total" };
const D1_KEYS = ["user_exercises", "favourites", "exercise_names", "exercise_media"];
let A;
after(async () => {
  await unmount();
});
const dump = () => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
async function startApp() {
  // a restart: nothing in memory, the namespace resolved again by the app's own start-up
  await unmount();
  A.__testState.resetActiveDataNamespace();
  A.atlasBrowseReset();
  await mount(h(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
}
async function fresh() {
  A = A || (await loadApp());
  await unmount();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  localStorage.setItem("nextrep1_onboarding_completed_v1", "true");
  A.activateDataNamespace(null);
}

describe("D1 verification before D2", () => {
  test("1. after a restart the D1 data is read back as written, and the start-up writes none of the D1 keys", async () => {
    await fresh();
    const x = A.addUserExercise(HOME_BENCH, { now: NOW }).record;
    A.toggleFavouriteExercise(x.exerciseId, { now: NOW });
    A.setCustomExerciseNameFor("bench_press_barbell_flat", "Klata płasko", { now: NOW });
    const before = Object.fromEntries(D1_KEYS.map((k) => [k, localStorage.getItem(K(k))]));
    await startApp();
    assert.equal(A.getActiveDataNamespace(), "guest");
    assert.ok(byTestId("dashboard"), "the app started");
    assert.deepEqual(Object.fromEntries(D1_KEYS.map((k) => [k, localStorage.getItem(K(k))])), before);
    assert.deepEqual(A.loadUserExercises().map((r) => r.exerciseId), [x.exerciseId]);
    assert.equal(A.getUserExerciseCatalog().displayName("bench_press_barbell_flat"), "Klata płasko");
  });
  test("2 + 3. guest / A / B isolated; switching back and forth keeps each namespace's data", async () => {
    await fresh();
    const g = A.addUserExercise({ ...HOME_BENCH, namePl: "Gość" }, { now: NOW }).record;
    A.activateDataNamespace(UA);
    const a = A.addUserExercise({ ...HOME_BENCH, namePl: "A" }, { now: NOW }).record;
    A.toggleFavouriteExercise(a.exerciseId, { now: NOW });
    A.activateDataNamespace(UB);
    assert.deepEqual(A.loadUserExercises(), []);
    assert.deepEqual(A.loadFavouriteExercises(), []);
    for (const [ns, want] of [[UA, [a.exerciseId]], [null, [g.exerciseId]], [UB, []], [UA, [a.exerciseId]]]) {
      A.activateDataNamespace(ns);
      assert.deepEqual(A.loadUserExercises().map((r) => r.exerciseId), want, String(ns));
      assert.deepEqual(A.getUserExerciseCatalog().list({ sources: ["private"] }).map((e) => e.exerciseId), want, `catalog ${ns}`);
    }
    assert.deepEqual(A.loadFavouriteExercises().map((f) => f.exerciseId), [a.exerciseId]);
  });
  test("4. broken local D1 data: the app starts, E01 renders, nothing is overwritten", async () => {
    await fresh();
    localStorage.setItem(K("user_exercises"), "{zepsute");
    localStorage.setItem(K("favourites"), JSON.stringify("nie lista"));
    localStorage.setItem(K("exercise_names"), JSON.stringify([1, 2]));
    localStorage.setItem(K("exercise_media"), "null-ish{");
    const before = Object.fromEntries(D1_KEYS.map((k) => [k, localStorage.getItem(K(k))]));
    await startApp();
    const { click } = await import("../harness/ui.mjs");
    await click(byTestId("nav-exercises"));
    await flush(10, 3);
    assert.ok(byTestId("atlas-home"), "E01 renders");
    assert.deepEqual(Object.fromEntries(D1_KEYS.map((k) => [k, localStorage.getItem(K(k))])), before);
    assert.equal(A.addUserExercise(HOME_BENCH).code, "STORE_UNREADABLE");
  });
  test("5. export → import into another namespace gives the same D1 data; a broken copy changes nothing", async () => {
    await fresh();
    const x = A.addUserExercise(HOME_BENCH, { now: NOW }).record;
    A.toggleFavouriteExercise(x.exerciseId, { now: NOW });
    const data = JSON.parse(JSON.stringify(A.readAllAppData()));
    A.activateDataNamespace(UB);
    assert.equal(A.applyImportedAppData(data).ok, true);
    assert.deepEqual(A.loadUserExercises(), data.userExercises);
    const before = dump();
    assert.equal(A.applyImportedAppData({ ...data, userExercises: [{ ...x, exerciseId: "zle" }] }).ok, false);
    assert.deepEqual(dump(), before);
  });
  test("6. the app's start-up never removes plan items or workout entries that point at own exercises", async () => {
    await fresh();
    const x = A.addUserExercise(HOME_BENCH, { now: NOW }).record;
    const plans = [{ id: "plan-1", name: "Push", exercises: [{ id: "pi-1", exerciseId: x.exerciseId, privateExerciseId: x.exerciseId, setsDetail: [{ id: "d1", target: "8-10", rir: "1-2" }] }] }];
    const history = [{ id: "s1", date: "2026-10-20T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: x.exerciseId, name: "Wyciskanie w garażu", loadSnapshot: { source: "private", privateExerciseId: x.exerciseId }, sets: [{ weight: "60", reps: "8" }] }] }];
    localStorage.setItem(K("plans"), JSON.stringify(plans));
    localStorage.setItem(K("history"), JSON.stringify(history));
    A.archiveUserExercise(x.exerciseId, { now: NOW });
    await startApp();
    const { click } = await import("../harness/ui.mjs");
    for (const tab of ["nav-plans", "nav-history", "nav-exercises", "nav-dashboard"]) {
      await click(byTestId(tab));
      await flush(10, 3);
    }
    const p = JSON.parse(localStorage.getItem(K("plans")));
    const s = JSON.parse(localStorage.getItem(K("history")));
    assert.deepEqual(p[0].exercises.map((i) => i.exerciseId), [x.exerciseId], "plan item kept");
    assert.deepEqual(s[0].exercises.map((e) => e.exerciseId), [x.exerciseId], "workout entry kept");
    assert.equal(A.userExerciseUsage(x.exerciseId).total, 2);
    assert.ok(!$('[role="alert"][data-crash]'));
  });
});
