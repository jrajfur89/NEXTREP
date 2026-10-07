// Stage 4A.3 — source selection, hardening part 2 + test closure: the real <App/> in jsdom, fake
// Supabase, no network. Scenarios A–J of the 4A.3 audit (C/D also in ui/source-selection.test.mjs),
// unknown marker, "device restore possible" only when real, restore-pointer lifecycle, interrupted
// device upload after a restart, start-empty and repair-tool guards, legacy cloud actions removed.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act, buttonByText } from "../harness/ui.mjs";
import { bootApp } from "../harness/app-boot.mjs";
import { UA, UB, key, historySession, cloudTablesFor, cloudWrites } from "../harness/account-fixtures.mjs";

after(unmount);

const sessA = { user: { id: UA, email: "a@test.pl" } };
const sessB = { user: { id: UB, email: "b@test.pl" } };
const ns = `user_${UA}`;
const read = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const ids = (list) => (Array.isArray(list) ? list.map((s) => s.id).sort() : list);
const settle = () => flush(30, 10);
const initText = () => (byTestId("account-init") ? byTestId("account-init").textContent : "");
const appShown = () => !byTestId("account-init") && !!document.querySelector("nav, [data-testid^='dashboard-']");
const json = (v) => JSON.stringify(v); // bootApp stores strings raw
async function press(testid) {
  const el = byTestId(testid);
  assert.ok(el, `button ${testid} present`);
  await click(el);
  await settle();
}
async function emit(S, event, session) {
  await act(async () => S.emitAuth(event, session));
  await settle();
}
async function openAccountScreen() {
  await click(buttonByText("Więcej"));
  await settle();
  await click(buttonByText("Moje konto"));
  await settle();
}

let cloudA; // A's cloud: hC + name "Chmura"
before(async () => {
  cloudA = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD")], userName: "Chmura" });
});

describe("A–J — final coverage of the 4A.3 scenarios", () => {
  test("A: new account, nothing local, nothing in the cloud → no question, ready/new, sync allowed", async () => {
    const { A } = await bootApp({ session: sessA });
    await settle();
    assert.ok(appShown(), initText());
    const m = read(key(UA, "account_init"));
    assert.equal(m.status, "ready");
    assert.equal(m.source, "new");
    assert.equal(A.isAccountSyncAllowed(UA), true);
  });

  test("B: nothing local, cloud has data → cloud only offered → load → confirm (no device restore offered) → cloud data", async () => {
    await bootApp({ session: sessA, tables: cloudA });
    await settle();
    assert.ok(byTestId("init-cloud") && !byTestId("init-local"));
    await press("init-cloud");
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
    assert.ok(!byTestId("init-local"), "nothing on the device before → no 'go back'");
    await press("init-confirm-cloud");
    assert.ok(appShown());
    assert.deepEqual(ids(read(key(UA, "history"))), ["hC"]);
    assert.equal(read(key(UA, "account_init")).source, "cloud");
    assert.equal(read(key(UA, "last_cloud_restore")), null, "pointer gone once settled");
  });

  test("E: already initialised account → straight into the app, no cloud check, marker untouched", async () => {
    const marker = { status: "ready", source: "device", syncPaused: true, at: "2026-10-01T00:00:00.000Z" };
    const { S } = await bootApp({ session: sessA, storage: { [key(UA, "account_init")]: marker, [key(UA, "history")]: [historySession("hD", "DEVICE")] }, tables: cloudA });
    await settle();
    assert.ok(appShown());
    assert.ok(!S.calls.some((c) => c.table === "nextrep_workouts" && c.op === "limit"), "no source check ran");
    assert.deepEqual(read(key(UA, "account_init")), marker);
  });

  test("F: A → logout → B → logout → A: markers are per account, B's choice never affects A, A is not asked again", async () => {
    const markerA = { status: "ready", source: "device", syncPaused: false };
    const { S } = await bootApp({ session: sessA, storage: { [key(UA, "account_init")]: markerA, [key(UA, "history")]: [historySession("hA", "A")] } });
    await settle();
    assert.ok(appShown());
    await emit(S, "SIGNED_OUT", null);
    await emit(S, "SIGNED_IN", sessB);
    assert.ok(appShown(), "B is new and empty → no question");
    assert.equal(read(key(UB, "account_init")).source, "new");
    await emit(S, "SIGNED_OUT", null);
    await emit(S, "SIGNED_IN", sessA);
    assert.ok(appShown(), "A not asked again");
    assert.deepEqual(read(key(UA, "account_init")), markerA);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hA"]);
  });

  test("G: guest has data, A has its own local + cloud data → the choice counts only A's data; guest untouched", async () => {
    const guestHistory = [historySession("g1", "G"), historySession("g2", "G"), historySession("g3", "G")];
    await bootApp({ session: sessA, storage: { [key(null, "history")]: guestHistory, [key(UA, "history")]: [historySession("hA", "A")] }, tables: cloudA });
    await settle();
    assert.match(initText(), /DANE NA URZĄDZENIU I W CHMURZE/);
    assert.match(initText(), /Na urządzeniu: 1 trening/, "A's one workout, not the guest's three");
    await press("init-local");
    assert.ok(appShown());
    assert.deepEqual(ids(read(key(UA, "history"))), ["hA"]);
    assert.deepEqual(read(key(null, "history")), guestHistory);
  });

  test("H: guest has data, brand-new empty account → no automatic import (boundary of 4A.4)", async () => {
    const guestHistory = [historySession("g1", "G")];
    const { S } = await bootApp({ session: sessA, storage: { [key(null, "history")]: guestHistory } });
    await settle();
    assert.ok(appShown());
    assert.equal(read(key(UA, "account_init")).source, "new");
    assert.ok(!(read(key(UA, "history")) || []).length, "account workspace empty");
    assert.deepEqual(read(key(null, "history")), guestHistory);
    assert.equal(cloudWrites(S).filter((c) => c.table === "nextrep_workouts").length, 0, "guest workouts never uploaded");
  });

  test("I: session recovered at start-up → loading screen until it is known, then the account's source choice (never guest data)", async () => {
    const { S } = await bootApp({ session: null, holdSession: true, storage: { [key(null, "history")]: [historySession("g1", "GUEST-VISIBLE")], [key(UA, "history")]: [historySession("hA", "A")] }, tables: cloudA });
    await settle();
    assert.ok(!appShown() && !byTestId("account-init"), "nothing shown while the session is unknown");
    assert.doesNotMatch(document.body.textContent, /GUEST-VISIBLE/);
    S.session = sessA;
    await act(async () => S.releaseGetSession(sessA));
    await settle();
    assert.match(initText(), /DANE NA URZĄDZENIU I W CHMURZE/);
    assert.doesNotMatch(document.body.textContent, /GUEST-VISIBLE/);
  });

  test("J: cloud check fails → explicit 'no connection' screen, no marker; work offline keeps sync off", async () => {
    const failCheck = (S) => (S.queryHook = (q) => (q.table === "nextrep_workouts" ? { message: "Failed to fetch" } : null));
    const { A, S } = await bootApp({ session: sessA, storage: { [key(UA, "history")]: [historySession("hA", "A")] }, tables: cloudA, setupFake: failCheck });
    await settle();
    assert.match(initText(), /BRAK POŁĄCZENIA Z CHMURĄ/);
    assert.equal(read(key(UA, "account_init")), null, "unknown is never 'empty' — no marker");
    await press("init-offline");
    assert.ok(appShown());
    assert.equal(read(key(UA, "account_init")), null, "still not initialised");
    assert.equal(A.isAccountSyncAllowed(UA), false);
    assert.equal(cloudWrites(S).length, 0);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hA"]);
  });

  test("J: retry after the failed check → the normal choice", async () => {
    let fail = true;
    const { S } = await bootApp({ session: sessA, storage: { [key(UA, "history")]: [historySession("hA", "A")] }, tables: cloudA, setupFake: (S) => (S.queryHook = (q) => (fail && q.table === "nextrep_workouts" ? { message: "Failed to fetch" } : null)) });
    await settle();
    assert.match(initText(), /BRAK POŁĄCZENIA Z CHMURĄ/);
    fail = false;
    await press("init-retry");
    assert.match(initText(), /DANE NA URZĄDZENIU I W CHMURZE/);
    assert.ok(S);
  });
});

describe("unknown / damaged init marker", () => {
  test("unknown status or damaged JSON → not 'ready', no sync, data intact, the normal choice appears (no endless check)", async () => {
    for (const raw of [json({ status: "weird-status", source: "x" }), "{not json"]) {
      const { A, S } = await bootApp({ session: sessA, storage: { [key(UA, "account_init")]: raw, [key(UA, "history")]: [historySession("hA", "A")] }, tables: cloudA });
      await settle();
      assert.match(initText(), /DANE NA URZĄDZENIU I W CHMURZE/, `marker ${raw}`);
      assert.equal(A.isAccountSyncAllowed(UA), false);
      assert.deepEqual(ids(read(key(UA, "history"))), ["hA"]);
      assert.equal(cloudWrites(S).length, 0);
    }
  });
});

describe("'go back to the device data' only when that restore can really happen", () => {
  const pending = { status: "pending_cloud_confirm", source: "cloud", syncPaused: true };
  const at = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const bk = { backupId: "bk1", createdAt: at(60000), appVersion: "x", formatVersion: 1, reason: "before-restore", namespace: ns, kind: "BEFORE_CLOUD_RESTORE", userId: UA, source: "cloud-restore", data: { history: [historySession("hD", "DEVICE")] } };
  const pointer = (extra) => ({ backupId: "bk1", noSnapshot: false, userId: UA, namespace: ns, createdAt: at(30000), postFingerprint: null, ...extra });
  async function bootPending(storage) {
    await bootApp({ session: sessA, storage: { [key(UA, "account_init")]: pending, [key(UA, "history")]: [historySession("hC", "CLOUD")], ...storage }, tables: cloudA });
    await settle();
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
  }
  test("ok → offered", async () => {
    await bootPending({ [key(UA, "last_cloud_restore")]: pointer(), nextrep_backup_list_v1: [bk] });
    assert.ok(byTestId("init-local"));
  });
  test("no_snapshot → not offered", async () => {
    await bootPending({ [key(UA, "last_cloud_restore")]: pointer({ backupId: null, noSnapshot: true }) });
    assert.ok(!byTestId("init-local"));
    assert.match(initText(), /nie było danych tego konta/);
  });
  test("changed → not offered", async () => {
    await bootPending({ [key(UA, "last_cloud_restore")]: pointer({ postFingerprint: "deadbeef" }), nextrep_backup_list_v1: [bk] });
    assert.ok(!byTestId("init-local"));
  });
  test("invalid (backup missing) → not offered", async () => {
    await bootPending({ [key(UA, "last_cloud_restore")]: pointer({ backupId: "missing" }), nextrep_backup_list_v1: [bk] });
    assert.ok(!byTestId("init-local"));
  });
});

describe("restore pointer lifecycle", () => {
  test("cloud load → confirm → ready/cloud, pointer removed → 'Wybierz ponownie' → the old snapshot is not offered", async () => {
    await bootApp({ session: sessA, storage: { [key(UA, "history")]: [historySession("hD", "DEVICE")] }, tables: cloudA });
    await settle();
    await press("init-cloud");
    assert.ok(read(key(UA, "last_cloud_restore")), "pointer exists while a way back is needed");
    await press("init-confirm-cloud");
    assert.ok(appShown());
    assert.equal(read(key(UA, "account_init")).source, "cloud");
    assert.equal(read(key(UA, "last_cloud_restore")), null);
    await openAccountScreen();
    await click(buttonByText("Wybierz ponownie źródło danych"));
    await settle();
    assert.match(initText(), /DANE NA URZĄDZENIU I W CHMURZE/);
    assert.doesNotMatch(initText(), /wersja sprzed wczytania z chmury/, "no stale snapshot offered");
    await press("init-local"); // "device" = the current (cloud-loaded) data, no error
    assert.ok(!byTestId("account-init"), initText()); // back in the app (on "Moje konto")
    assert.equal(read(key(UA, "account_init")).status, "ready");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hC"]);
  });
});

describe("interrupted device → empty cloud upload (restart)", () => {
  async function partialOwnUpload() {
    const t = await cloudTablesFor(UA, { history: [historySession("hD", "DEVICE"), historySession("hD2", "DEVICE2")], userName: "Ania", deviceId: "dev-A" });
    // the upload was killed after the first workout: drop the second one and its children
    const w2 = t.nextrep_workouts.find((r) => r.legacy_id === "hD2");
    t.nextrep_workouts = t.nextrep_workouts.filter((r) => r !== w2);
    const we2 = t.nextrep_workout_exercises.filter((r) => r.workout_id === w2.id).map((r) => r.id);
    t.nextrep_workout_exercises = t.nextrep_workout_exercises.filter((r) => r.workout_id !== w2.id);
    t.nextrep_workout_sets = t.nextrep_workout_sets.filter((r) => !we2.includes(r.workout_exercise_id));
    return t;
  }
  const deviceStorage = (extra = {}) => ({
    [key(UA, "history")]: [historySession("hD", "DEVICE"), historySession("hD2", "DEVICE2")],
    [key(UA, "user_name")]: json("Ania"),
    [key(UA, "device_id")]: "dev-A",
    [key(UA, "account_init")]: { status: "uploading_device", source: "device", syncPaused: true, userId: UA, namespace: ns, deviceId: "dev-A", startedAt: "2026-10-07T08:00:00.000Z" },
    ...extra,
  });

  test("restart → 'upload interrupted' (own partial rows are not treated as a foreign cloud) → retry → ready/device, no duplicates", async () => {
    const { S } = await bootApp({ session: sessA, storage: deviceStorage(), tables: await partialOwnUpload() });
    await settle();
    assert.match(initText(), /WYSYŁANIE DANYCH ZOSTAŁO PRZERWANE/);
    assert.ok(!byTestId("init-cloud"), "not the normal choice with a 'cloud' source");
    assert.equal(cloudWrites(S).length, 0, "nothing sent before the user decides");
    await press("init-retry-upload");
    assert.ok(appShown(), initText());
    const m = read(key(UA, "account_init"));
    assert.equal(m.status, "ready");
    assert.equal(m.source, "device");
    assert.equal(m.syncPaused, false);
    assert.deepEqual(S.tables.nextrep_workouts.map((r) => r.legacy_id).sort(), ["hD", "hD2"]);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD", "hD2"], "local data intact");
  });

  test("restart, another device wrote to the cloud meanwhile → retry stops, nothing overwritten, back to the choice", async () => {
    const t = await partialOwnUpload();
    t.nextrep_measurements = [{ id: "m-x", user_id: UA, legacy_id: "mX", device_id: "dev-OTHER", version: 1, deleted_at: null }];
    const { S } = await bootApp({ session: sessA, storage: deviceStorage(), tables: t });
    await settle();
    await press("init-retry-upload");
    assert.match(byTestId("init-error").textContent, /zmieniły się/);
    assert.ok(byTestId("init-cloud") && byTestId("init-local"));
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(read(key(UA, "account_init")), null, "upload abandoned — the normal choice decides now");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD", "hD2"]);
  });

  test("restart → give up the upload → normal check (own rows now count as cloud data), local data intact", async () => {
    const { S } = await bootApp({ session: sessA, storage: deviceStorage(), tables: await partialOwnUpload() });
    await settle();
    await press("init-abandon-upload");
    assert.match(initText(), /DANE NA URZĄDZENIU I W CHMURZE/);
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(cloudWrites(S).length, 0);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD", "hD2"]);
  });
});

describe("guards in the UI", () => {
  test("'Zacznij od pustych danych' with a started workout → blocked with a message, draft and data kept", async () => {
    const draft = json({ version: 1, blocks: [{ items: [] }] });
    await bootApp({ session: sessA, storage: { [key(UA, "history")]: [historySession("hA", "A")], [key(UA, "active_workout_draft")]: draft }, tables: cloudA });
    await settle();
    await press("init-empty");
    assert.match(byTestId("init-error").textContent, /rozpoczęty trening/);
    assert.equal(localStorage.getItem(key(UA, "active_workout_draft")), draft);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hA"]);
    assert.equal(read(key(UA, "account_init")), null);
  });

  test("Moje konto: no legacy 'Pobierz / Przywróć dane z chmury'; 'Przenieś dane do konta' blocked while sync is paused", async () => {
    const { S } = await bootApp({ session: sessA, storage: { [key(UA, "account_init")]: { status: "ready", source: "device", syncPaused: true }, [key(UA, "history")]: [historySession("hA", "A")] }, tables: cloudA });
    await settle();
    await openAccountScreen();
    const text = document.body.textContent;
    assert.doesNotMatch(text, /Pobierz dane z chmury/);
    assert.doesNotMatch(text, /Przywróć dane z chmury/);
    assert.ok(buttonByText("Wybierz ponownie źródło danych"), "the safe path is there");
    assert.ok(byTestId("cloud-load-hint"));
    const writesBefore = cloudWrites(S).length;
    await click(buttonByText("Przenieś dane do konta"));
    await settle();
    assert.match(document.body.textContent, /wstrzymana/);
    assert.equal(cloudWrites(S).length, writesBefore, "zero cloud writes");
  });
});
