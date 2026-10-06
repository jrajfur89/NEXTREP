// Stage 4A.2 — workspace isolation hardening (full <App/> in jsdom, fake Supabase, no network).
// A: guest offline → session recovered DURING a guest workout → switch held until it ends.
// B: delete account → that account's workspace, queue and backups purged; others untouched.
// C: workspace switch cancels scheduled sync retries / the debounced sync.
// F/G/H: A → logout → B → logout → A: data, draft and local PRO stay with their own account.
import { test, describe, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act, $$ } from "../harness/ui.mjs";
import { bootApp, restoreOnline } from "../harness/app-boot.mjs";
import { loadApp } from "../harness/load-app.mjs";

after(unmount);
afterEach(restoreOnline);

const UA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const UB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const k = (userId, name) => (userId ? `nextrep_user_${userId}_${name}_v1` : `nextrep_guest_${name}_v1`);
const ready = { status: "ready", source: "device", syncPaused: false };
const read = (key) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};
const session = (id, date, planName, weight = "100") => ({ id, date, planId: null, planName, exercises: [{ id: `e-${id}`, exerciseId: "bench_press", name: "Wyciskanie", type: "weight", sets: [{ id: `s-${id}`, weight, reps: "8", rir: "" }] }] });
async function realDraft(planName) {
  const A = await loadApp();
  const plan = { id: `P-${planName}`, name: planName, exercises: [{ id: "pi1", exerciseId: "bench_press", setsDetail: [{ id: "s1", target: "8-10", rir: "" }] }] };
  const nowDate = new Date().toISOString();
  const blocks = A.buildBlocksFromPlan(plan, A.DEFAULT_EXERCISES, [], nowDate);
  blocks[0].items[0].sets[0] = { ...blocks[0].items[0].sets[0], weight: "50", reps: "8" };
  return { version: 1, savedAt: new Date(Date.now() - 60000).toISOString(), plan, backfillInfo: null, nowDate, startTime: Date.now() - 600000, blocks, blockIdx: 0, subIdx: 0, manualDuration: 45 };
}
const cloudWrites = (S) => S.calls.filter((c) => c.kind === "table" && ["insert", "update", "upsert", "delete"].includes(c.op)).length;
const workoutOpen = () => !$$("[data-testid]").some((e) => /^dashboard-/.test(e.dataset.testid)) && $$("input").length > 0;
const buttonText = (t) => $$("button").filter((b) => b.textContent.trim() === t);
async function emit(S, event, sess) {
  await act(async () => S.emitAuth(event, sess));
  await flush(30, 8);
}

describe("A. guest offline → session recovered during an active guest workout", () => {
  async function openGuestWorkoutOfflineThenRecover() {
    const { A, S } = await bootApp({
      holdSession: true,
      offline: true,
      storage: {
        [k(UA, "account_init")]: ready,
        [k(UA, "history")]: [session("hA", new Date(Date.now() - 86400000).toISOString(), "A-PLAN-MARKER")],
        [k(null, "active_workout_draft")]: await realDraft("GUEST-WORKOUT"),
      },
    });
    await flush(100, 25); // the app's 2 s offline check
    assert.ok(byTestId("session-unconfirmed"), "offline screen shown");
    assert.match(byTestId("session-unconfirmed").textContent, /JESTEŚ OFFLINE/);
    await click(byTestId("session-continue-guest"));
    await flush(20, 5);
    assert.equal(A.__testState.activeDataNamespace, "guest");
    await click(byTestId("dashboard-resume"));
    await flush(20, 4);
    assert.ok(workoutOpen(), "guest workout open");
    // the SDK recovers the session of account A (as after reconnecting)
    await emit(S, "SIGNED_IN", { user: { id: UA } });
    S.releaseGetSession({ user: { id: UA } });
    await flush(30, 5);
    return { A, S };
  }

  test("workout stays open, workspace stays guest; finishing it performs the held switch", async () => {
    const { A, S } = await openGuestWorkoutOfflineThenRecover();
    assert.ok(workoutOpen(), "workout NOT torn down by the recovered session");
    assert.equal(A.__testState.activeDataNamespace, "guest", "switch held");
    assert.ok(!byTestId("session-recovered-notice"));
    // finish the guest workout
    await click(buttonText("Zakończ")[0]);
    await flush(20, 3);
    const confirm = buttonText("Zakończ");
    await click(confirm[confirm.length - 1]);
    await flush(40, 10);
    assert.equal(A.__testState.activeDataNamespace, `user_${UA}`, "held switch performed after finishing");
    assert.ok(byTestId("session-recovered-notice"), "user is told the account session was recovered");
    // guest data stayed guest; nothing went to the account
    assert.equal((read(k(null, "history")) || []).length, 1, "finished workout saved in the GUEST workspace");
    assert.deepEqual((read(k(UA, "history")) || []).map((s) => s.id), ["hA"], "account history untouched");
    assert.equal(read(k(UA, "active_workout_draft")), null);
    assert.deepEqual(read(k(null, "sync_queue")) || [], [], "nothing queued in the guest workspace");
    assert.deepEqual(read(k(UA, "sync_queue")) || [], [], "nothing queued for the account");
    assert.equal(cloudWrites(S), 0);
    assert.doesNotMatch(document.body.textContent, /GUEST-WORKOUT/, "the guest workout is not shown in the account workspace");
    await click(buttonText("OK")[0]);
    assert.ok(!byTestId("session-recovered-notice"));
  });

  test("interrupting the guest workout also performs the held switch; the guest draft stays guest", async () => {
    const { A } = await openGuestWorkoutOfflineThenRecover();
    assert.equal(A.__testState.activeDataNamespace, "guest");
    await click($$("button").find((b) => b.querySelector('[data-icon="MoreVertical"]')));
    await flush(10, 2);
    await click($$("button").find((b) => b.textContent.includes("Przerwij trening")));
    await flush(10, 2);
    const confirm = buttonText("Przerwij trening");
    await click(confirm[confirm.length - 1]);
    await flush(40, 10);
    assert.equal(A.__testState.activeDataNamespace, `user_${UA}`);
    assert.ok(byTestId("session-recovered-notice"));
    assert.ok(read(k(null, "active_workout_draft")), "interrupted guest draft kept in the guest workspace");
    assert.equal(read(k(UA, "active_workout_draft")), null, "never copied to the account");
    assert.ok(!byTestId("dashboard-active-workout"), "account dashboard does not offer the guest draft");
  });

  test("without an open workout the recovered session switches immediately (unchanged behaviour)", async () => {
    const { A, S } = await bootApp({ holdSession: true, offline: true, storage: { [k(UA, "account_init")]: ready } });
    await flush(100, 25);
    await click(byTestId("session-continue-guest"));
    await flush(20, 5);
    await emit(S, "SIGNED_IN", { user: { id: UA } });
    assert.equal(A.__testState.activeDataNamespace, `user_${UA}`);
    assert.ok(!byTestId("session-recovered-notice"), "no notice when nothing was held");
  });
});

describe("B. delete account cleanup", () => {
  const seedAll = () => ({
    [k(UA, "account_init")]: ready,
    [k(UA, "history")]: [session("hA", "2026-09-01T10:00:00.000Z", "A")],
    [k(UA, "sync_queue")]: [{ id: "q1", table: "workouts", recordId: "hA", operation: "upsert", status: "pending" }],
    [k(UA, "sync_meta")]: { workouts: { hA: { version: 1 } } },
    [k(UA, "device_id")]: "dev-A",
    [k(UB, "account_init")]: ready,
    [k(UB, "history")]: [session("hB", "2026-09-02T10:00:00.000Z", "B")],
    [k(null, "history")]: [session("hG", "2026-09-03T10:00:00.000Z", "G")],
    nextrep_backup_list_v1: [
      { backupId: "bA", namespace: `user_${UA}`, createdAt: "2026-09-01T00:00:00Z", data: {} },
      { backupId: "bB", namespace: `user_${UB}`, createdAt: "2026-09-01T00:00:00Z", data: {} },
      { backupId: "bG", namespace: "guest", createdAt: "2026-09-01T00:00:00Z", data: {} },
    ],
  });
  async function openAccountScreen() {
    await click($$("button").find((b) => b.textContent.trim() === "Więcej"));
    await flush(10, 2);
    const entry = $$("button").find((b) => /Moje konto|Konto/.test(b.textContent) && b.textContent.length < 80);
    assert.ok(entry, "account entry in the More menu");
    await click(entry);
    await flush(20, 4);
  }
  async function deleteAccount() {
    await click($$("button").find((b) => /Usuń konto/.test(b.textContent)));
    await flush(10, 2);
    const confirm = $$("button").filter((b) => /Usuń/.test(b.textContent.trim()) && !/Anuluj/.test(b.textContent));
    await click(confirm[confirm.length - 1]);
    await flush(40, 10);
  }

  test("after a successful delete_user: account A purged; B, guest and onboarding untouched", async () => {
    const { S } = await bootApp({ session: { user: { id: UA } }, storage: seedAll() });
    S.rpc.delete_user = () => ({ data: null, error: null });
    await openAccountScreen();
    await deleteAccount();
    assert.ok(S.calls.some((c) => c.kind === "rpc" && c.fn === "delete_user"));
    const leftA = Object.keys(localStorage).filter((x) => x.startsWith(`nextrep_user_${UA}_`));
    assert.deepEqual(leftA, [], "no key of the deleted account remains");
    assert.deepEqual(read(k(UB, "history")).map((s) => s.id), ["hB"], "account B untouched");
    assert.deepEqual(read(k(null, "history")).map((s) => s.id), ["hG"], "guest untouched");
    assert.deepEqual(read("nextrep_backup_list_v1").map((b) => b.backupId).sort(), ["bB", "bG"], "only A's backups removed");
    assert.equal(localStorage.getItem("trainapp_onboarding_completed_v1"), "true");
  });

  test("when delete_user fails: nothing is purged and the error is shown", async () => {
    const { S } = await bootApp({ session: { user: { id: UA } }, storage: seedAll() });
    S.rpc.delete_user = () => ({ data: null, error: { message: "boom" } });
    await openAccountScreen();
    await deleteAccount();
    assert.deepEqual(read(k(UA, "history")).map((s) => s.id), ["hA"]);
    assert.equal(read(k(UA, "sync_queue")).length, 1);
    assert.equal(read("nextrep_backup_list_v1").length, 3);
    assert.match(document.body.textContent, /Nie udało się usunąć konta/);
  });
});

describe("C. workspace switch cancels scheduled sync work", () => {
  test("a scheduled retry and a debounced sync of A never run after A → guest", async () => {
    const { A, S } = await bootApp({ session: { user: { id: UA } }, storage: { [k(UA, "account_init")]: ready } });
    assert.equal(A.__testState.activeDataNamespace, `user_${UA}`);
    let retryRan = 0;
    let debouncedRan = 0;
    A.scheduleSyncRetry("item-of-A", 150, async () => { retryRan++; });
    A.scheduleSync(150, async () => { debouncedRan++; });
    await emit(S, "SIGNED_OUT", null);
    assert.equal(A.__testState.activeDataNamespace, "guest");
    await flush(100, 4);
    assert.equal(retryRan, 0, "retry timer cancelled");
    assert.equal(debouncedRan, 0, "debounced sync cancelled");
  });
});

describe("F/G/H. A → logout → B → logout → A", () => {
  test("data, draft and local PRO stay with their own account", async () => {
    const { A, S } = await bootApp({
      session: { user: { id: UA } },
      storage: {
        [k(UA, "account_init")]: ready,
        [k(UB, "account_init")]: ready,
        [k(UA, "history")]: [session("hA", new Date(Date.now() - 86400000).toISOString(), "A")],
        [k(UA, "plans")]: [{ id: "PA", name: "A-PLAN-MARKER", exercises: [{ id: "x", exerciseId: "bench_press" }] }],
        [k(UA, "active_workout_draft")]: await realDraft("A-DRAFT-MARKER"),
        [k(UA, "pro_status")]: { manualPro: true, adUnlockExpiresAt: null },
      },
    });
    const isPro = async () => {
      await click($$("button").find((b) => b.textContent.trim() === "Statystyki"));
      await flush(20, 3);
      const paywall = /NEXTREP PRO analizuje/.test(document.body.textContent);
      await click($$("button").find((b) => b.textContent.trim() === "Start"));
      await flush(20, 3);
      return !paywall;
    };
    const view = () => ({
      ns: A.__testState.activeDataNamespace,
      draft: !!byTestId("dashboard-active-workout") && /A-DRAFT-MARKER/.test(byTestId("dashboard-active-workout").textContent),
      aData: /A-PLAN-MARKER|A-DRAFT-MARKER/.test(document.body.textContent),
    });
    assert.deepEqual(view(), { ns: `user_${UA}`, draft: true, aData: true });
    assert.equal(await isPro(), true, "A has local PRO");
    await emit(S, "SIGNED_OUT", null);
    assert.deepEqual(view(), { ns: "guest", draft: false, aData: false });
    await emit(S, "SIGNED_IN", { user: { id: UB } });
    assert.deepEqual(view(), { ns: `user_${UB}`, draft: false, aData: false });
    assert.equal(await isPro(), false, "A's local PRO is not visible to B");
    assert.equal(read(k(UB, "active_workout_draft")), null);
    assert.equal(read(k(UB, "pro_status")), null);
    await emit(S, "SIGNED_OUT", null);
    await emit(S, "SIGNED_IN", { user: { id: UA } });
    assert.deepEqual(view(), { ns: `user_${UA}`, draft: true, aData: true });
    assert.equal(await isPro(), true, "A gets its local PRO back");
    assert.equal(cloudWrites(S), 0);
  });
});
