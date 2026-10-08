// Stage 4A.4 Part 2 in the real <App/> (jsdom, fake Supabase, no network): D2 notice after success
// (draft kept, cleanup), F-2 damaged guest data, F-5 partial upload → abandon → reload / logout / "start
// without" / later source choice, F-4 guest data bound to another account → explicit release, retry of
// a failed cleanup when the account opens.
import { test, describe, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act, buttonByText } from "../harness/ui.mjs";
import { bootApp, restoreOnline } from "../harness/app-boot.mjs";
import { UA, UB, key, cloudWrites, storageDump } from "../harness/account-fixtures.mjs";

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
const appShown = () => !byTestId("account-init") && !!document.querySelector("nav, [data-testid^='dashboard-']");
async function press(testid) {
  const el = byTestId(testid);
  assert.ok(el, `button ${testid} present`);
  await click(el);
  await settle();
}
const st = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const HISTORY = [
  { id: "g1", date: "2026-10-01T10:00:00.000Z", planId: null, planName: "Gość", exercises: [{ id: "ge-1", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", sets: [st("s1", 60, 8), st("s2", 60, 8)] }] },
  { id: "g2", date: "2026-10-03T10:00:00.000Z", planId: null, planName: "Gość", exercises: [{ id: "ge-2", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", sets: [st("s3", 60, 10)] }] },
];
const guestStorage = (extra = {}) => ({ [key(null, "history")]: HISTORY, [key(null, "user_name")]: JSON.stringify("Gosia"), ...extra });
const failSetsOnce = (S) => {
  let failed = false;
  S.queryHook = (q) => (!failed && q.table === "nextrep_workout_sets" && q.op === "insert" ? ((failed = true), { message: "Failed to fetch" }) : null);
};
async function reboot(session, S) {
  return bootApp({ session, storage: storageDump(), tables: JSON.parse(JSON.stringify(S.tables)) });
}

describe("D2 — after success", () => {
  test("notice: finished data moved, the unfinished workout stayed in guest mode; cleanup done; draft kept", async () => {
    const draft = { version: 1, blocks: [], plan: { name: "DRAFT-G" } };
    await bootApp({ session: sessA, storage: guestStorage({ [key(null, "active_workout_draft")]: draft }) });
    await settle();
    await press("init-guest-migrate");
    assert.ok(byTestId("guest-migration-done"));
    assert.ok(byTestId("guest-migration-draft-kept"), "the user is told the unfinished workout stayed");
    assert.match(byTestId("guest-migration-cleanup").textContent, /usunięto z trybu bez logowania/);
    assert.deepEqual(read(key(null, "active_workout_draft")), draft, "draft survives in the guest workspace");
    assert.equal(read(key(null, "history")), null, "finished guest history cleaned");
    assert.equal(read(key(UA, "active_workout_draft")), null);
  });
});

describe("F-2 — damaged guest data in the real app", () => {
  test("corrupt guest history → explained, nothing moved, nothing decided; 'Nie teraz' → ready/new, damaged value kept", async () => {
    const { S } = await bootApp({ session: sessA, storage: { [key(null, "history")]: '[{"id":"g1",', [key(null, "plans")]: [{ id: "p1", name: "P", exercises: [] }] } });
    await settle();
    assert.ok(byTestId("init-guest-damaged"));
    assert.match(byTestId("init-guest-damaged").textContent, /historia treningów/);
    assert.ok(!byTestId("init-guest-migrate"));
    assert.equal(read(key(UA, "account_init")), null);
    await press("init-guest-later");
    assert.ok(appShown());
    assert.equal(localStorage.getItem(key(null, "history")), '[{"id":"g1",');
    assert.equal(cloudWrites(S).filter((c) => c.table !== "nextrep_devices").length, 0);
  });
});

describe("F-5 — partial upload → abandon", () => {
  async function partialThenAbandon() {
    const { S } = await bootApp({ session: sessA, storage: guestStorage() });
    await settle();
    failSetsOnce(S);
    await press("init-guest-migrate");
    S.queryHook = null;
    await press("init-guest-abandon");
    assert.ok(byTestId("init-guest-partial"), "the partial transfer is explained");
    return S;
  }
  test("→ reload → still the unfinished transfer (never the cloud choice, never ready)", async () => {
    const S = await partialThenAbandon();
    await reboot(sessA, S);
    await settle();
    assert.match(byTestId("account-init").textContent, /PRZENOSZENIE DANYCH ZOSTAŁO PRZERWANE/);
    assert.ok(!byTestId("init-cloud"), "'Wczytaj z chmury' not offered");
    assert.equal(read(key(UA, "account_init")).status, "migrating_guest");
  });
  test("→ logout → login same account → the unfinished transfer again; guest intact", async () => {
    const S = await partialThenAbandon();
    const guestHistory = localStorage.getItem(key(null, "history"));
    await act(async () => S.emitAuth("SIGNED_OUT", null));
    await settle();
    assert.equal(localStorage.getItem(key(null, "history")), guestHistory);
    await act(async () => S.emitAuth("SIGNED_IN", sessA));
    await settle();
    assert.match(byTestId("account-init").textContent, /PRZENOSZENIE DANYCH ZOSTAŁO PRZERWANE/);
  });
  test("→ 'Zacznij konto bez tych danych' → app, sync paused; a later source choice warns the cloud data is incomplete", async () => {
    const S = await partialThenAbandon();
    await press("init-guest-start-without");
    assert.ok(appShown());
    assert.deepEqual([read(key(UA, "account_init")).source, read(key(UA, "account_init")).syncPaused], ["empty", true]);
    assert.equal((read(key(UA, "history")) || []).length, 0, "nothing of the partial cloud on the device");
    await click(buttonByText("Więcej"));
    await settle();
    await click(buttonByText("Moje konto"));
    await settle();
    const rechoose = buttonByText("Wybierz ponownie źródło danych");
    assert.ok(rechoose);
    await click(rechoose);
    await settle();
    assert.ok(byTestId("init-partial-warning"), "incomplete cloud data is flagged");
    assert.match(byTestId("init-cloud").textContent, /niekompletne/);
    assert.ok(S.tables.nextrep_workouts.length > 0);
  });
});

describe("F-4 — guest data bound to another account", () => {
  test("B: explained; release needs an explicit confirmation; then the offer and the migration for B", async () => {
    const { S } = await bootApp({ session: sessB, storage: guestStorage({ [GM_KEY]: { status: "completed", targetUserId: UA, attemptId: "a", backupId: "b", fingerprint: "f" } }) });
    await settle();
    assert.ok(byTestId("init-guest-bound"));
    assert.match(byTestId("init-guest-bound").parentElement.textContent, /już przeniesione na inne konto/);
    await press("init-guest-release");
    assert.ok(byTestId("init-guest-release-warning"), "a confirmation step with the consequences");
    assert.equal(read(GM_KEY).status, "completed", "nothing released before the confirmation");
    await press("init-guest-release-confirm");
    assert.ok(byTestId("init-guest-migrate"), "now offered to B");
    await press("init-guest-migrate");
    assert.ok(byTestId("guest-migration-done"));
    assert.ok((S.tables.nextrep_workouts || []).every((r) => r.user_id === UB));
  });
});

describe("cleanup retry when the account opens", () => {
  test("a failed cleanup is retried on the next start — cleanup only, no upload", async () => {
    const { S } = await bootApp({ session: sessA, storage: guestStorage() });
    await settle();
    const proto = Object.getPrototypeOf(localStorage);
    const orig = proto.removeItem;
    proto.removeItem = function (k) {
      if (k === key(null, "history")) throw new Error("storage locked");
      return orig.call(this, k);
    };
    try {
      await press("init-guest-migrate");
    } finally {
      proto.removeItem = orig;
    }
    assert.match(byTestId("guest-migration-cleanup").textContent, /spróbuje ponownie/);
    assert.equal(read(GM_KEY).cleanup, "failed");
    const again = await reboot(sessA, S);
    again.S.calls = [];
    await settle();
    assert.equal(read(GM_KEY).cleanup, "done");
    assert.equal(read(key(null, "history")), null);
    assert.equal(cloudWrites(again.S).filter((c) => /^nextrep_(workouts|workout_sets|plans|measurements)$/.test(c.table) && c.op === "insert").length, 0, "no re-upload");
  });
});
