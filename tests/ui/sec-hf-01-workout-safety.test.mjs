// SEC-HF-01 (18.10.2026) — workout data safety: P0-1 (a new workout never silently replaces an
// unfinished one), P0-2 (a finished workout is shown as saved only after the history is on disk;
// the draft is removed only after that; retries never duplicate), P1-A (a failed draft write is
// visible and can be retried). Full <App/> in jsdom, isolated test storage, no network.
import { test, describe, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { React, mount, unmount, byTestId, click, flush, act, $$, type } from "../harness/ui.mjs";
import { bootGuestApp, bootApp, restoreOnline } from "../harness/app-boot.mjs";
import { loadApp } from "../harness/load-app.mjs";

after(unmount);
afterEach(() => {
  restoreStorage();
  restoreOnline();
});

const GUEST = (name) => `nextrep_guest_${name}_v1`;
const UA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const USER = (name) => `nextrep_user_${UA}_${name}_v1`;
const read = (key) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};
const workoutOpen = () => !$$("[data-testid]").some((e) => /^dashboard-/.test(e.dataset.testid)) && $$("input").length > 0;
const btn = (re) => $$("button").find((b) => re.test(b.textContent.trim()));

// ---- storage fault injection (test storage only) ----
let restoreFns = [];
function failWrites(match, name = "QuotaExceededError") {
  const proto = Object.getPrototypeOf(globalThis.localStorage);
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    if (match(k)) {
      const e = new Error(name);
      e.name = name;
      throw e;
    }
    return orig.call(this, k, v);
  };
  const undo = () => { proto.setItem = orig; };
  restoreFns.push(undo);
  return undo;
}
function failRemove(match) {
  const proto = Object.getPrototypeOf(globalThis.localStorage);
  const orig = proto.removeItem;
  proto.removeItem = function (k) {
    if (match(k)) throw new Error("removeItem failed");
    return orig.call(this, k);
  };
  const undo = () => { proto.removeItem = orig; };
  restoreFns.push(undo);
  return undo;
}
function restoreStorage() {
  while (restoreFns.length) restoreFns.pop()();
}

// A REAL draft (blocks from the app's own buildBlocksFromPlan), one performed set of 100 kg × 8.
async function realDraft(planName = "Push Day", extra = {}) {
  const A = await loadApp();
  const plan = { id: `P-${planName}`, name: planName, exercises: [{ id: "pi1", exerciseId: "bench_press", setsDetail: [{ id: "s1", target: "8-10", rir: "" }, { id: "s2", target: "8-10", rir: "" }] }] };
  const nowDate = new Date().toISOString();
  const blocks = A.buildBlocksFromPlan(plan, A.DEFAULT_EXERCISES, [], nowDate);
  blocks[0].items[0].sets[0] = { ...blocks[0].items[0].sets[0], weight: "100", reps: "8" };
  return { version: 1, savedAt: new Date(Date.now() - 60000).toISOString(), plan, backfillInfo: null, nowDate, startTime: Date.now() - 600000, blocks, blockIdx: 0, subIdx: 0, manualDuration: 45, ...extra };
}
const PLAN_B = { id: "PB", name: "Leg Day", exercises: [{ id: "pb1", exerciseId: "bench_press", setsDetail: [{ id: "x1", target: "8-10", rir: "" }] }] };
const draftHasPushDay = (key = GUEST("active_workout_draft")) => {
  const d = read(key);
  return Boolean(d && d.plan && d.plan.name === "Push Day" && JSON.stringify(d.blocks).includes('"weight":"100"'));
};

async function openTrening() {
  await click(btn(/^Trening$/));
  await flush(10, 3);
}
async function finishWorkout() {
  await click(btn(/^Zakończ/));
  await flush(10, 3);
  const dialogBtn = $$("button").filter((b) => b.textContent.trim() === "Zakończ").pop();
  await click(dialogBtn);
  await flush(10, 5);
}

describe("P0-1 — a new workout never replaces an unfinished one silently", () => {
  test("plan start (Trening → Własne plany → plan) with a draft: choice dialog, the draft untouched", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft(), plans: [PLAN_B] });
    await openTrening();
    await click(btn(/WŁASNE PLANY TRENINGOWE/));
    await flush(10, 3);
    await click(btn(/Leg Day/));
    await flush(10, 4);
    assert.ok(byTestId("start-conflict"), "dialog shown");
    assert.ok(!workoutOpen(), "no workout started");
    assert.ok(draftHasPushDay(), "the unfinished workout is untouched");
  });

  test("no-plan start with a draft: choice dialog, the draft untouched", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await openTrening();
    await click(btn(/TRENING BEZ PLANU/));
    await flush(10, 4);
    assert.ok(byTestId("start-conflict"));
    assert.ok(draftHasPushDay());
  });

  test("back-filled start (Historia → Dodaj zaległy trening) with a draft: choice dialog, the draft untouched", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await click(btn(/^Historia$/));
    await flush(10, 3);
    await click($$("button").find((b) => b.getAttribute("aria-label") === "Dodaj zaległy trening"));
    await flush(10, 3);
    await click(btn(/^Rozpocznij wpisywanie$/));
    await flush(10, 4);
    assert.ok(byTestId("start-conflict"));
    assert.ok(!workoutOpen());
    assert.ok(draftHasPushDay());
  });

  test("Kontynuuj trening: the unfinished workout opens as it was left", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await openTrening();
    await click(btn(/TRENING BEZ PLANU/));
    await flush(10, 3);
    await click(byTestId("start-conflict-resume"));
    await flush(10, 4);
    assert.ok(workoutOpen());
    assert.ok($$("input").some((i) => i.value === "100"), "the 100 kg set is restored");
    assert.ok(draftHasPushDay());
  });

  test("Anuluj: dialog closed, the screen and the draft unchanged", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await openTrening();
    await click(btn(/TRENING BEZ PLANU/));
    await flush(10, 3);
    await click(byTestId("start-conflict-cancel"));
    await flush(10, 3);
    assert.ok(!byTestId("start-conflict"));
    assert.ok(btn(/TRENING BEZ PLANU/), "still on the Trening screen");
    assert.ok(draftHasPushDay());
  });

  test("Odrzuć i zacznij nowy: only after the explicit confirmation", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await openTrening();
    await click(btn(/TRENING BEZ PLANU/));
    await flush(10, 3);
    await click(byTestId("start-conflict-discard"));
    await flush(10, 3);
    assert.ok(draftHasPushDay(), "the first tap only asks");
    assert.ok(byTestId("start-conflict-discard-confirm"));
    await click(byTestId("start-conflict-back"));
    await flush(10, 2);
    assert.ok(byTestId("start-conflict-resume"), "Wróć returns to the choice");
    await click(byTestId("start-conflict-discard"));
    await flush(10, 2);
    await click(byTestId("start-conflict-discard-confirm"));
    await flush(10, 5);
    assert.ok(!byTestId("start-conflict"));
    assert.ok(!draftHasPushDay(), "the old draft is gone only now");
    const d = read(GUEST("active_workout_draft"));
    assert.ok(d && d.workoutInstanceId, "the new workout has its own draft");
  });

  test("the storage layer refuses to overwrite a draft of another workoutInstanceId", async () => {
    const { A } = await bootGuestApp({ active_workout_draft: await realDraft("Push Day", { workoutInstanceId: "W-OLD" }) });
    const other = await realDraft("Other", { workoutInstanceId: "W-NEW" });
    assert.deepEqual(A.saveActiveWorkoutDraft(other, { id: "W-NEW", legacy: false }), { ok: false, reason: "conflict" });
    assert.ok(draftHasPushDay());
    assert.equal(A.clearOwnActiveWorkoutDraft({ id: "W-NEW", legacy: false }), false, "nor remove it");
    assert.ok(draftHasPushDay());
    assert.deepEqual(A.saveActiveWorkoutDraft({ ...(await realDraft()), workoutInstanceId: "W-OLD" }, { id: "W-OLD", legacy: false }), { ok: true, reason: null }, "its own workout may write");
    // a legacy draft (no id) is protected too, except from the workout that resumed it
    localStorage.setItem(GUEST("active_workout_draft"), JSON.stringify(await realDraft()));
    assert.equal(A.saveActiveWorkoutDraft(other, { id: "W-NEW", legacy: false }).reason, "conflict");
    assert.equal(A.saveActiveWorkoutDraft(other, { id: "W-NEW", legacy: true }).ok, true);
  });

  test("start without an unfinished workout: no dialog, the workout opens", async () => {
    await bootGuestApp();
    await openTrening();
    await click(btn(/TRENING BEZ PLANU/));
    await flush(10, 4);
    assert.ok(!byTestId("start-conflict"));
    assert.ok(btn(/Dodaj ćwiczenie/), "the (empty) workout is open");
  });

  test("an older draft without workoutInstanceId is resumed and kept (adopted, not reset)", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    assert.equal(read(GUEST("active_workout_draft")).workoutInstanceId, undefined);
    await click(byTestId("dashboard-resume"));
    await flush(10, 4);
    assert.ok(workoutOpen());
    assert.ok($$("input").some((i) => i.value === "100"));
    const d = read(GUEST("active_workout_draft"));
    assert.ok(d.workoutInstanceId, "the instance id is added on the first save");
    assert.equal(d.sessionId, null, "the session id appears only with the first finish attempt");
    assert.ok(draftHasPushDay(), "content unchanged");
    assert.ok(!byTestId("draft-save-warning"));
  });
});

describe("P0-2 — finishing a workout", () => {
  const resumeAndOpen = async (seed = {}) => {
    const r = await bootGuestApp({ active_workout_draft: await realDraft(), ...seed });
    await click(byTestId("dashboard-resume"));
    await flush(10, 4);
    return r;
  };

  test("QuotaExceededError on the history write: no false success, the workout and its draft stay", async () => {
    await resumeAndOpen();
    failWrites((k) => k === GUEST("history"));
    await finishWorkout();
    assert.ok(byTestId("finish-error"), "an error is shown");
    assert.match(byTestId("finish-error").textContent, /Nie udało się zapisać treningu/);
    assert.ok(workoutOpen(), "the workout stays open");
    assert.ok(!btn(/Zobacz pełny raport treningowy/), "no summary (no false success)");
    assert.equal(localStorage.getItem(GUEST("history")), null, "nothing claimed saved");
    assert.ok(draftHasPushDay(), "the draft is kept");
  });

  test("retry after the cause is gone: exactly one session, even after several failed attempts", async () => {
    await resumeAndOpen();
    const undo = failWrites((k) => k === GUEST("history"));
    await finishWorkout();
    await click(byTestId("finish-retry"));
    await flush(10, 3);
    await click(byTestId("finish-retry"));
    await flush(10, 3);
    assert.ok(byTestId("finish-error"));
    const sessionId = read(GUEST("active_workout_draft")).sessionId;
    undo();
    await click(byTestId("finish-retry"));
    await flush(10, 5);
    const history = read(GUEST("history"));
    assert.equal(history.length, 1);
    assert.equal(history[0].id, sessionId, "the session keeps the id fixed for this workout");
    assert.equal(localStorage.getItem(GUEST("active_workout_draft")), null, "the draft is removed only after the save");
    assert.ok(btn(/Zobacz pełny raport treningowy/), "the summary is shown now");
  });

  test("double tap on the final Zakończ adds one session", async () => {
    await resumeAndOpen();
    await click(btn(/^Zakończ/));
    await flush(10, 3);
    const dialogBtn = $$("button").filter((b) => b.textContent.trim() === "Zakończ").pop();
    await act(async () => {
      dialogBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      dialogBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush(10, 5);
    assert.equal(read(GUEST("history")).length, 1);
  });

  test("history saved, the backup write then fails: the session is kept and the finish succeeds", async () => {
    await resumeAndOpen();
    failWrites((k) => /backup/.test(k));
    await finishWorkout();
    assert.equal(read(GUEST("history")).length, 1);
    assert.ok(btn(/Zobacz pełny raport treningowy/));
    assert.equal(localStorage.getItem(GUEST("active_workout_draft")), null);
  });

  test("history saved, the draft cannot be removed: no second session when that draft is finished again", async () => {
    const { A } = await resumeAndOpen();
    failRemove((k) => k === GUEST("active_workout_draft"));
    await finishWorkout();
    assert.equal(read(GUEST("history")).length, 1);
    assert.ok(read(GUEST("active_workout_draft")), "the draft is still there");
    restoreStorage();
    await unmount(); // reopen the app (same storage)
    await mount(React.createElement(A.App));
    const video = document.querySelector("video");
    if (video) await act(async () => video.dispatchEvent(new Event("ended")));
    await flush(20, 5);
    await click(byTestId("dashboard-resume"));
    await flush(10, 4);
    await finishWorkout();
    const history = read(GUEST("history"));
    assert.equal(history.length, 1, "the same session id replaces, never appends");
    assert.equal(localStorage.getItem(GUEST("active_workout_draft")), null);
  });

  test("restart after a confirmed save: the session is in history, no unfinished workout", async () => {
    const { A } = await resumeAndOpen();
    await finishWorkout();
    const saved = read(GUEST("history"));
    assert.equal(saved.length, 1);
    await unmount();
    await mount(React.createElement(A.App)); // same storage — like reopening the app
    const video = document.querySelector("video");
    if (video) await act(async () => video.dispatchEvent(new Event("ended")));
    await flush(20, 5);
    assert.ok(!byTestId("dashboard-active-workout"), "no unfinished workout offered");
    assert.deepEqual(read(GUEST("history")).map((s) => s.id), saved.map((s) => s.id));
  });

  test("offline: finishing is local and does not need the network", async () => {
    await resumeAndOpen();
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
    await finishWorkout();
    assert.equal(read(GUEST("history")).length, 1);
    assert.ok(btn(/Zobacz pełny raport treningowy/));
  });

  test("signed-in account: a failed write then a retry queue the session for sync exactly once", async () => {
    await bootApp({ session: { user: { id: UA } }, storage: { [USER("account_init")]: { status: "ready", source: "device", syncPaused: false }, [USER("active_workout_draft")]: await realDraft() } });
    await click(byTestId("dashboard-resume"));
    await flush(10, 4);
    assert.ok(workoutOpen());
    const undo = failWrites((k) => k === USER("history"));
    await finishWorkout();
    assert.ok(byTestId("finish-error"));
    assert.equal((read(USER("sync_queue")) || []).filter((q) => q.table === "workouts").length, 0, "nothing queued for an unsaved session");
    undo();
    await click(byTestId("finish-retry"));
    await flush(10, 5);
    const history = read(USER("history"));
    assert.equal(history.length, 1);
    const queued = (read(USER("sync_queue")) || []).filter((q) => q.table === "workouts" && q.recordId === history[0].id);
    assert.equal(queued.length, 1, "the session is queued once");
  });
});

describe("P1-A — a failed draft write is visible", () => {
  test("failure while editing a set: warning; retry after recovery saves and removes it", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await click(byTestId("dashboard-resume"));
    await flush(10, 4);
    assert.ok(!byTestId("draft-save-warning"));
    const before = localStorage.getItem(GUEST("active_workout_draft"));
    const undo = failWrites((k) => k === GUEST("active_workout_draft"));
    const input = $$("input").find((i) => i.value === "100");
    await type(input, "105");
    await flush(10, 3);
    assert.ok(byTestId("draft-save-warning"), "warning shown");
    assert.match(byTestId("draft-save-warning").textContent, /NIE jest zapisany/);
    assert.equal(localStorage.getItem(GUEST("active_workout_draft")), before, "the stored draft (previous version) is kept, not removed");
    await click(byTestId("draft-save-retry"));
    await flush(10, 2);
    assert.ok(byTestId("draft-save-warning"), "still failing → still warned");
    undo();
    await click(byTestId("draft-save-retry"));
    await flush(10, 3);
    assert.ok(!byTestId("draft-save-warning"), "gone only after a confirmed save");
    assert.ok(localStorage.getItem(GUEST("active_workout_draft")).includes('"weight":"105"'));
  });

  test("failure when the workout opens: warning at once", async () => {
    await bootGuestApp();
    failWrites((k) => k === GUEST("active_workout_draft"));
    await openTrening();
    await click(btn(/TRENING BEZ PLANU/));
    await flush(10, 4);
    assert.ok(byTestId("draft-save-warning"));
  });

  test("leaving with unsaved progress: no 'will be saved' message; leaving needs 'Opuść bez zapisu'", async () => {
    await bootGuestApp({ active_workout_draft: await realDraft() });
    await click(byTestId("dashboard-resume"));
    await flush(10, 4);
    failWrites((k) => k === GUEST("active_workout_draft"));
    await type($$("input").find((i) => i.value === "100"), "110");
    await flush(10, 3);
    await act(async () => window.dispatchEvent(new Event("popstate"))); // Android Back
    await flush(10, 3);
    assert.ok(byTestId("leave-unsaved-warning"));
    assert.ok(!document.body.textContent.includes("Twój aktualny postęp zostanie zapisany"));
    await click(btn(/^Opuść trening$/));
    await flush(10, 3);
    assert.ok(workoutOpen(), "a failed save keeps the workout open");
    assert.ok(byTestId("leave-without-saving"));
    await click(byTestId("leave-without-saving"));
    await flush(10, 4);
    assert.ok(!workoutOpen(), "left only on the explicit choice");
    assert.ok(draftHasPushDay(), "the last saved version is still there");
  });
});
