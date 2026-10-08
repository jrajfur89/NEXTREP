// Stage 4A.4 Part 1 (rebuilt) — guest → empty account in the real <App/> (jsdom, fake Supabase, no network):
// offer, migrate, "Nie teraz", no offer for non-empty accounts / another account's migration, interrupted
// attempt after a restart (finish / go back), active guest workout hold (Finish / Interrupt), and the I-1
// regression of the 4A.4 path (upload → normal sync → reload → sync without duplicates).
import { test, describe, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act, $$ } from "../harness/ui.mjs";
import { bootApp, restoreOnline } from "../harness/app-boot.mjs";
import { loadApp } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, UB, key, historySession, cloudTablesFor, cloudWrites, storageDump } from "../harness/account-fixtures.mjs";

after(unmount);
afterEach(restoreOnline);

const sessA = { user: { id: UA, email: "a@test.pl" } };
const sessB = { user: { id: UB, email: "b@test.pl" } };
const GM_KEY = key(null, "guest_migration");
const read = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const settle = () => flush(30, 10);
async function waitFor(fn, rounds = 40) {
  for (let i = 0; i < rounds && !fn(); i++) await flush(25, 2);
  return fn();
}
const appShown = () => !byTestId("account-init") && !!document.querySelector("nav, [data-testid^='dashboard-']");
const initText = () => (byTestId("account-init") ? byTestId("account-init").textContent : "");
async function press(testid) {
  const el = byTestId(testid);
  assert.ok(el, `button ${testid} present`);
  await click(el);
  await settle();
}
function guestDump() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("nextrep_guest_") && k !== GM_KEY) out[k] = localStorage.getItem(k);
  }
  return out;
}
const st = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const SD = [{ id: "sd1", target: "8-10", rir: "" }, { id: "sd2", target: "8-10", rir: "" }];
const GUEST_HISTORY = [
  { id: "g1", date: "2026-10-01T10:00:00.000Z", planId: null, planName: "Gość", exercises: [{ id: "ge-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 60, 8), st("sd2", 60, 8)] }] },
  { id: "g2", date: "2026-10-03T10:00:00.000Z", planId: null, planName: "Gość", exercises: [{ id: "ge-2", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: SD, sets: [st("sd1", 60, 10), st("sd2", 60, 9)] }] },
];
const guestStorage = (extra = {}) => ({ [key(null, "history")]: GUEST_HISTORY, [key(null, "user_name")]: JSON.stringify("Gosia"), ...extra }); // bootApp stores strings raw
function semantics(A, history) {
  const norm = history.map(A.normalizeHistorySession);
  const last = norm.find((s) => s.id === "g2");
  return {
    sessions: norm.map((s) => ({ id: s.id, ex: s.exercises.map((ex) => ({ exerciseId: ex.exerciseId, sets: ex.sets.map((x) => [x.weight, x.reps]) })) })),
    volume: norm.map((s) => s.exercises.reduce((v, ex) => v + A.computeSessionVolume(ex.sets, ex.type), 0)),
    analysis: last.exercises.map((ex) => {
      const r = A.analyzeSessionExercise(norm, last, ex);
      return r && { status: r.status, message: r.message, suggestedWeight: r.suggestedWeight };
    }),
  };
}

describe("offer → migrate → ready/guest", () => {
  test("empty account + guest data → offer (nothing written) → 'Przenieś' → app; guest unchanged; sync + reload + sync without duplicates", async () => {
    const { A, S } = await bootApp({ session: sessA, storage: guestStorage() });
    await settle();
    assert.ok(byTestId("init-guest-migrate"), "offer shown");
    assert.match(byTestId("init-guest-summary").textContent, /2 treningi/);
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(localStorage.getItem(GM_KEY), null);
    assert.equal(cloudWrites(S).length, 0, "nothing happens without a tap");
    const guestBefore = guestDump();
    const before = semantics(A, GUEST_HISTORY);
    await press("init-guest-migrate");
    assert.ok(appShown(), "account opened after the verified upload");
    assert.equal(read(key(UA, "account_init")).source, "guest");
    assert.deepEqual(guestDump(), guestBefore, "guest workspace byte-for-byte unchanged");
    assert.equal(read(key(UA, "user_name")), "Gosia");
    assert.deepEqual((S.tables.nextrep_workouts || []).map((r) => r.legacy_id).sort(), ["g1", "g2"]);
    assert.equal((S.tables.nextrep_workout_exercises || []).filter((r) => /-pos\d+/.test(r.legacy_id)).length, 0);

    await act(async () => {
      await quiet(() => A.runSync());
    });
    await settle();
    assert.deepEqual(semantics(A, read(key(UA, "history"))), before, "after the first normal sync");
    const dump = storageDump();
    const cloud = JSON.parse(JSON.stringify(S.tables));
    const again = await bootApp({ session: sessA, storage: dump, tables: cloud });
    await settle();
    assert.ok(appShown(), "ready/guest opens directly after reload — no second offer");
    await act(async () => {
      await quiet(() => again.A.runSync());
    });
    await settle();
    assert.deepEqual(semantics(again.A, read(key(UA, "history"))), before, "after reload + sync");
    assert.equal((again.S.tables.nextrep_workout_exercises || []).length, 2);
    assert.equal((again.S.tables.nextrep_workout_sets || []).length, 4);
  });

  test("'Nie teraz' → ready/new, no marker / backup / upload; after reload no new offer", async () => {
    const { S } = await bootApp({ session: sessA, storage: guestStorage() });
    await settle();
    const guestBefore = guestDump();
    await press("init-guest-later");
    assert.ok(appShown());
    assert.equal(read(key(UA, "account_init")).source, "new");
    assert.equal(localStorage.getItem(GM_KEY), null);
    assert.equal((read("nextrep_backup_list_v1") || []).filter((b) => b.kind === "BEFORE_GUEST_MIGRATION").length, 0);
    assert.equal(cloudWrites(S).filter((c) => c.table === "nextrep_workouts").length, 0);
    assert.deepEqual(guestDump(), guestBefore);
    await bootApp({ session: sessA, storage: storageDump(), tables: S.tables });
    await settle();
    assert.ok(appShown(), "the offer does not come back by itself");
  });
});

describe("no offer when the account is not genuinely empty / data bound elsewhere (4A.5 boundary)", () => {
  test("account has local data → the 4A.3 choice counts only the account's data; no offer", async () => {
    await bootApp({ session: sessA, storage: guestStorage({ [key(UA, "history")]: [historySession("hA", "A")] }) });
    await settle();
    assert.ok(!byTestId("init-guest-migrate"));
    assert.ok(byTestId("init-local"));
  });
  test("cloud has data → cloud choice; no offer, guest untouched", async () => {
    const cloudA = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD")] });
    const { S } = await bootApp({ session: sessA, storage: guestStorage(), tables: cloudA });
    await settle();
    assert.ok(!byTestId("init-guest-migrate"));
    assert.ok(byTestId("init-cloud"));
    assert.equal(cloudWrites(S).length, 0);
  });
  test("guest data bound to A's migration → B (empty) is not offered it: ready/new, nothing written", async () => {
    const { S } = await bootApp({ session: sessB, storage: guestStorage({ [GM_KEY]: { status: "migrating", targetUserId: UA, attemptId: "a", backupId: "b" } }) });
    await settle();
    assert.ok(appShown());
    assert.equal(read(key(UB, "account_init")).source, "new");
    assert.equal((read(key(UB, "history")) || []).length, 0);
    assert.equal(cloudWrites(S).length, 0);
  });
});

describe("interrupted attempt after a restart", () => {
  async function interrupted() {
    // first run: the upload of sets fails → attempt stays "migrating_guest"; then "restart"
    const { S } = await bootApp({ session: sessA, storage: guestStorage() });
    await settle();
    let failed = false;
    S.queryHook = (q) => (!failed && q.table === "nextrep_workout_sets" && q.op === "insert" ? ((failed = true), { message: "Failed to fetch" }) : null);
    await press("init-guest-migrate");
    assert.ok(byTestId("init-guest-retry"), "error screen with retry");
    assert.match(initText(), /NIE UDAŁO SIĘ PRZENIEŚĆ DANYCH/);
    S.queryHook = null;
    const dump = storageDump();
    const cloud = JSON.parse(JSON.stringify(S.tables));
    const again = await bootApp({ session: sessA, storage: dump, tables: cloud });
    await settle();
    return again;
  }
  test("restart → 'PRZENOSZENIE DANYCH ZOSTAŁO PRZERWANE' → 'Dokończ przenoszenie' → ready/guest, no duplicates", async () => {
    const { S } = await interrupted();
    assert.match(initText(), /PRZENOSZENIE DANYCH ZOSTAŁO PRZERWANE/);
    const guestBefore = guestDump();
    await press("init-guest-retry");
    assert.ok(appShown());
    assert.equal(read(key(UA, "account_init")).source, "guest");
    assert.equal((S.tables.nextrep_workout_sets || []).length, 4);
    assert.deepEqual(guestDump(), guestBefore);
  });
  test("failure before any data row → 'Wróć bez przenoszenia' → account copy removed, guest intact, offer again", async () => {
    const { S } = await bootApp({ session: sessA, storage: guestStorage() });
    await settle();
    const guestBefore = guestDump();
    S.queryHook = (q) => (q.table === "nextrep_exercises" && q.op === "insert" ? { message: "Failed to fetch" } : null);
    await press("init-guest-migrate");
    S.queryHook = null;
    await press("init-guest-abandon");
    assert.ok(byTestId("init-guest-migrate"), "offer again (no data of this attempt in the cloud)");
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(read(key(UA, "history")), null);
    assert.equal(localStorage.getItem(GM_KEY), null);
    assert.deepEqual(guestDump(), guestBefore);
    assert.equal((read("nextrep_backup_list_v1") || []).filter((b) => b.kind === "BEFORE_GUEST_MIGRATION").length, 1, "backup kept");
  });
});

describe("active guest workout: never migrated mid-session", () => {
  const workoutOpen = () => !$$("[data-testid]").some((e) => /^dashboard-/.test(e.dataset.testid)) && $$("input").length > 0;
  const buttonText = (t) => $$("button").filter((b) => b.textContent.trim() === t);
  async function realDraft() {
    const A = await loadApp();
    const plan = { id: "P-G", name: "GUEST-WORKOUT", exercises: [{ id: "pi1", exerciseId: "bench_press", setsDetail: [{ id: "s1", target: "8-10", rir: "" }] }] };
    const nowDate = new Date().toISOString();
    const blocks = A.buildBlocksFromPlan(plan, A.DEFAULT_EXERCISES, [], nowDate);
    blocks[0].items[0].sets[0] = { ...blocks[0].items[0].sets[0], weight: "50", reps: "8" };
    return { version: 1, savedAt: new Date(Date.now() - 60000).toISOString(), plan, backfillInfo: null, nowDate, startTime: Date.now() - 600000, blocks, blockIdx: 0, subIdx: 0, manualDuration: 45 };
  }
  async function openGuestWorkoutThenRecoverA() {
    const { A, S } = await bootApp({
      holdSession: true,
      offline: true,
      storage: { [key(null, "history")]: [historySession("g0", "G", "70", new Date(Date.now() - 86400000).toISOString())], [key(null, "active_workout_draft")]: await realDraft() },
    });
    await flush(100, 25);
    await click(byTestId("session-continue-guest"));
    await flush(20, 5);
    await click(byTestId("dashboard-resume"));
    await flush(20, 4);
    assert.ok(workoutOpen(), "guest workout open");
    await act(async () => S.emitAuth("SIGNED_IN", { user: { id: UA } }));
    S.holdGetSession = false; // the SDK is back online: later getSession() calls answer normally
    S.releaseGetSession({ user: { id: UA } });
    await flush(30, 8);
    restoreOnline();
    // during the hold: guest workspace, no migration, no marker, no cloud write
    assert.ok(workoutOpen(), "workout not torn down");
    assert.equal(A.__testState.activeDataNamespace, "guest");
    assert.equal(localStorage.getItem(GM_KEY), null);
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(cloudWrites(S).length, 0);
    return { A, S };
  }
  test("Finish → switch → the offer counts the finished workout; migrating moves it", async () => {
    const { S } = await openGuestWorkoutThenRecoverA();
    await click(buttonText("Zakończ")[0]);
    await flush(20, 3);
    const confirm = buttonText("Zakończ");
    await click(confirm[confirm.length - 1]);
    assert.ok(await waitFor(() => byTestId("init-guest-migrate")), "offer after the workout ended");
    assert.match(byTestId("init-guest-summary").textContent, /2 treningi/, "the finished workout is part of the guest data");
    assert.ok(!byTestId("init-guest-draft-note"), "no draft left");
    assert.equal(cloudWrites(S).length, 0);
    await press("init-guest-migrate");
    assert.ok(!byTestId("account-init"), "account opened (the app is back on the history screen of the finished workout)");
    assert.equal(read(key(UA, "account_init")).source, "guest");
    assert.equal((read(key(UA, "history")) || []).length, 2);
  });
  test("Interrupt → switch → offer with the draft note; migrating leaves the draft in the guest workspace", async () => {
    await openGuestWorkoutThenRecoverA();
    await click($$("button").find((b) => b.querySelector('[data-icon="MoreVertical"]')));
    await flush(10, 2);
    await click($$("button").find((b) => b.textContent.includes("Przerwij trening")));
    await flush(10, 2);
    const confirm = buttonText("Przerwij trening");
    await click(confirm[confirm.length - 1]);
    assert.ok(await waitFor(() => byTestId("init-guest-draft-note")), "the user is told the unfinished workout stays");
    const draft = localStorage.getItem(key(null, "active_workout_draft"));
    assert.ok(draft);
    await press("init-guest-migrate");
    assert.ok(appShown());
    assert.equal(localStorage.getItem(key(UA, "active_workout_draft")), null, "draft not migrated");
    assert.equal(localStorage.getItem(key(null, "active_workout_draft")), draft, "guest draft unchanged");
    assert.equal((read(key(UA, "history")) || []).length, 1);
  });
});
