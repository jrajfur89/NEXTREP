// Stage 4A.3 — account source selection, hardening part 1: the real <App/> + AccountInitScreen in
// jsdom, fake Supabase, no network. Choice states, cloud load + confirm / go back, draft block,
// restart during an interrupted cloud load (A–D), retry, device → empty cloud upload, guest isolation.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act } from "../harness/ui.mjs";
import { bootApp } from "../harness/app-boot.mjs";
import { UA, key, historySession, cloudTablesFor, cloudWrites } from "../harness/account-fixtures.mjs";

after(unmount);

const session = { user: { id: UA } };
const ns = `user_${UA}`;
const read = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const ids = (list) => (Array.isArray(list) ? list.map((s) => s.id).sort() : list);
const settle = () => flush(30, 10);
const initText = () => (byTestId("account-init") ? byTestId("account-init").textContent : "");
const appShown = () => !byTestId("account-init") && !!document.querySelector("nav, [data-testid^='dashboard-']");
async function press(testid) {
  const el = byTestId(testid);
  assert.ok(el, `button ${testid} present`);
  await click(el);
  await settle();
}

let cloudData; // A's cloud: hC, hC2 + name "Chmura"
before(async () => {
  cloudData = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD"), historySession("hC2", "CLOUD2")], userName: "Chmura" });
});
const deviceStorage = (extra = {}) => ({ [key(UA, "history")]: [historySession("hD", "DEVICE")], [key(UA, "user_name")]: JSON.stringify("Ania"), ...extra }); // bootApp stores strings raw

describe("source-selection screen states", () => {
  test("local + cloud → three options; local only → device + empty; cloud only → cloud + empty", async () => {
    await bootApp({ session, storage: deviceStorage(), tables: cloudData });
    await settle();
    assert.match(initText(), /ZNALEŹLIŚMY DANE NA URZĄDZENIU I W CHMURZE/);
    for (const t of ["init-local", "init-cloud", "init-empty"]) assert.ok(byTestId(t), t);

    await bootApp({ session, storage: deviceStorage() });
    await settle();
    assert.match(initText(), /ZNALEŹLIŚMY DANE NA TYM URZĄDZENIU/);
    assert.ok(byTestId("init-local") && byTestId("init-empty") && !byTestId("init-cloud"));

    await bootApp({ session, storage: {}, tables: cloudData });
    await settle();
    assert.match(initText(), /ZNALEŹLIŚMY TWOJE DANE W CHMURZE/);
    assert.ok(byTestId("init-cloud") && byTestId("init-empty") && !byTestId("init-local"));
  });
});

describe("cloud load", () => {
  test("choose cloud → confirmation → keep cloud data → app, ready/cloud", async () => {
    await bootApp({ session, storage: deviceStorage(), tables: cloudData });
    await settle();
    await press("init-cloud");
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
    assert.equal(read(key(UA, "account_init")).status, "pending_cloud_confirm");
    await press("init-confirm-cloud");
    assert.ok(appShown(), "app shown");
    const m = read(key(UA, "account_init"));
    assert.equal(m.status, "ready");
    assert.equal(m.source, "cloud");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hC", "hC2"]);
  });

  test("choose cloud → go back to the device data (before-restore snapshot) → ready/device, paused", async () => {
    await bootApp({ session, storage: deviceStorage(), tables: cloudData });
    await settle();
    await press("init-cloud");
    await press("init-local"); // "Wróć do danych z urządzenia"
    assert.ok(appShown());
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"]);
    const m = read(key(UA, "account_init"));
    assert.equal(m.source, "device");
    assert.equal(m.syncPaused, true);
  });

  test("an active workout draft blocks the cloud load: clear message, nothing changed, no cloud access", async () => {
    const draft = JSON.stringify({ version: 1, savedAt: "2026-10-07T08:00:00.000Z", blocks: [{ items: [] }], plan: { id: "P1", name: "Push" } });
    const { S } = await bootApp({ session, storage: deviceStorage({ [key(UA, "active_workout_draft")]: draft }), tables: cloudData });
    await settle();
    const callsBefore = S.calls.length;
    await press("init-cloud");
    assert.match(byTestId("init-error").textContent, /rozpoczęty trening/);
    assert.ok(byTestId("init-cloud"), "still on the choice");
    assert.equal(localStorage.getItem(key(UA, "active_workout_draft")), draft);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"]);
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(S.calls.slice(callsBefore).filter((c) => c.kind === "table").length, 0);
  });

  test("cloud load fails → error screen → retry succeeds", async () => {
    const { S } = await bootApp({ session, storage: deviceStorage(), tables: cloudData });
    await settle();
    let failures = 1;
    S.queryHook = (q) => (q.table === "nextrep_workouts" && q.op === "select" && q.rangeWin && failures-- > 0 ? { message: "network down" } : null);
    await press("init-cloud");
    assert.match(initText(), /NIE UDAŁO SIĘ POBRAĆ DANYCH/);
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"], "device data back after the failure");
    assert.equal(read(key(UA, "account_init")), null);
    await press("init-retry-cloud");
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
  });
});

describe("restart during a cloud load (persistent loading_cloud state)", () => {
  const createdAt = () => new Date(Date.now() - 60000).toISOString();
  function interrupted({ history, withSnapshot = true, marker = "loading_cloud" }) {
    const st = {
      [key(UA, "last_cloud_restore")]: { backupId: withSnapshot ? "bk1" : null, noSnapshot: !withSnapshot, userId: UA, namespace: ns, createdAt: new Date(Date.now() - 30000).toISOString(), postFingerprint: null },
      [key(UA, "account_init")]: marker === "loading_cloud" ? { status: "loading_cloud", source: "cloud", syncPaused: true, userId: UA, namespace: ns, backupId: withSnapshot ? "bk1" : null, noSnapshot: !withSnapshot } : { status: "pending_cloud_confirm", source: "cloud", syncPaused: true },
    };
    if (withSnapshot)
      st["nextrep_backup_list_v1"] = [{ backupId: "bk1", createdAt: createdAt(), appVersion: "x", formatVersion: 1, reason: "before-restore", namespace: ns, kind: "BEFORE_CLOUD_RESTORE", userId: UA, source: "cloud-restore", data: { history: [historySession("hD", "DEVICE")], plans: [], measurements: [], customFields: [], userName: "Ania" } }];
    if (history) st[key(UA, "history")] = history;
    return st;
  }
  async function assertInterruptedScreen(S) {
    assert.match(initText(), /WCZYTYWANIE Z CHMURY ZOSTAŁO PRZERWANE/);
    assert.ok(byTestId("init-retry-cloud"), "retry offered");
    assert.ok(!byTestId("init-cloud") && !byTestId("init-empty"), "not the normal choice — the partial data is not 'device data'");
    assert.ok(!appShown(), "app data not shown");
    assert.equal(cloudWrites(S).length, 0, "no sync / upload ran");
  }

  test("A: marker written, device data still complete → interrupted screen; go back → device data, ready/device", async () => {
    const { S } = await bootApp({ session, storage: interrupted({ history: [historySession("hD", "DEVICE")] }), tables: cloudData });
    await settle();
    await assertInterruptedScreen(S);
    await press("init-local");
    assert.ok(appShown());
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"]);
    const m = read(key(UA, "account_init"));
    assert.equal(m.status, "ready");
    assert.equal(m.source, "device");
    assert.equal(m.syncPaused, true);
  });

  test("B: namespace already cleared → interrupted screen; retry → confirmation → cloud data", async () => {
    const { S } = await bootApp({ session, storage: interrupted({ history: null }), tables: cloudData });
    await settle();
    await assertInterruptedScreen(S);
    await press("init-retry-cloud");
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
    await press("init-confirm-cloud");
    assert.ok(appShown());
    assert.deepEqual(ids(read(key(UA, "history"))), ["hC", "hC2"]);
  });

  test("C: only part of the cloud data written → interrupted screen (never a device choice); retry is idempotent", async () => {
    const { S } = await bootApp({ session, storage: interrupted({ history: [historySession("hC", "CLOUD")] }), tables: cloudData });
    await settle();
    await assertInterruptedScreen(S);
    await press("init-retry-cloud");
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
    const backups = read("nextrep_backup_list_v1");
    assert.equal(backups.length, 1, "the partial data was NOT backed up as device data");
    assert.equal(read(key(UA, "last_cloud_restore")).backupId, "bk1");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hC", "hC2"]);
  });

  test("C without a snapshot (device had no data) → go back = drop partial data and choose again", async () => {
    const { S } = await bootApp({ session, storage: interrupted({ history: [historySession("hC", "CLOUD")], withSnapshot: false }), tables: cloudData });
    await settle();
    await assertInterruptedScreen(S);
    assert.ok(!byTestId("init-local"));
    await press("init-abandon-cloud");
    assert.match(initText(), /ZNALEŹLIŚMY TWOJE DANE W CHMURZE/, "back to the choice — cloud only, the partial data is gone");
    assert.equal(read(key(UA, "account_init")), null);
    assert.ok(!(read(key(UA, "history")) || []).length);
  });

  test("D: load finished, restart at pending_cloud_confirm → the existing confirmation step", async () => {
    await bootApp({ session, storage: interrupted({ history: [historySession("hC", "CLOUD"), historySession("hC2", "CLOUD2")], marker: "pending_cloud_confirm" }), tables: cloudData });
    await settle();
    assert.match(initText(), /WCZYTANO DANE Z CHMURY/);
    assert.ok(byTestId("init-confirm-cloud") && byTestId("init-local"));
  });
});

describe("device data → empty cloud", () => {
  test("choose device → upload → app; ready/device with sync ON; cloud holds the device data", async () => {
    const { S } = await bootApp({ session, storage: deviceStorage() });
    await settle();
    await press("init-local");
    assert.ok(appShown(), initText());
    const m = read(key(UA, "account_init"));
    assert.equal(m.status, "ready");
    assert.equal(m.source, "device");
    assert.equal(m.syncPaused, false);
    assert.deepEqual((S.tables.nextrep_workouts || []).map((r) => r.legacy_id), ["hD"]);
    assert.equal(S.tables.nextrep_profiles[0].display_name, "Ania");
  });

  test("upload error → error screen, local intact, no 'ready'; retry → app", async () => {
    const { S } = await bootApp({ session, storage: deviceStorage() });
    await settle();
    S.queryHook = (q) => (q.table === "nextrep_workout_sets" && q.op === "insert" ? { message: "insert failed" } : null);
    await press("init-local");
    assert.match(initText(), /NIE UDAŁO SIĘ WYSŁAĆ DANYCH/);
    assert.equal(read(key(UA, "account_init")).status, "uploading_device", "no false 'ready' — the unfinished upload stays recognisable");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"]);
    S.queryHook = null;
    await press("init-retry-upload");
    assert.ok(appShown(), initText());
    assert.equal(read(key(UA, "account_init")).status, "ready");
    assert.deepEqual((S.tables.nextrep_workouts || []).map((r) => r.legacy_id), ["hD"]);
  });

  test("cloud gets data before the upload → nothing uploaded, back to the choice with a message", async () => {
    const { S } = await bootApp({ session, storage: deviceStorage() });
    await settle();
    assert.ok(!byTestId("init-cloud"), "cloud was empty at the first check");
    // another device uploads meanwhile
    S.tables.nextrep_workouts = [{ id: "w-other", user_id: UA, legacy_id: "hOther", device_id: "other-device", version: 1, deleted_at: null }];
    await press("init-local");
    assert.match(byTestId("init-error").textContent, /zmieniły się/);
    assert.ok(byTestId("init-cloud") && byTestId("init-local"), "the choice now offers both sources");
    assert.equal(cloudWrites(S).length, 0);
    assert.equal(read(key(UA, "account_init")), null);
  });

  test("guest data is not uploaded and stays in the guest workspace", async () => {
    const guestHistory = [historySession("gG1", "GUEST")];
    const { S } = await bootApp({ session, storage: { ...deviceStorage(), [key(null, "history")]: guestHistory } });
    await settle();
    await press("init-local");
    assert.ok(appShown());
    assert.deepEqual((S.tables.nextrep_workouts || []).map((r) => r.legacy_id), ["hD"]);
    assert.deepEqual(read(key(null, "history")), guestHistory);
  });
});
