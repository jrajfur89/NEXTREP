// Stage 4A.4 F-5 (Etap 6) in the real <App/> (jsdom, fake Supabase with the server model of SQL v3 + read
// guard C v2, no network): why an account is locked, the 24-hour inactivity information (no automatic status
// change), cancel with zero writes, explicit two-step acceptance of incomplete data, the permanent note in the
// account section, an attempt closed on another device, and the "sync safety check failed" banner.
import { test, describe, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, buttonByText } from "../harness/ui.mjs";
import { bootApp, restoreOnline } from "../harness/app-boot.mjs";
import { UA, key, historySession, cloudTablesFor, storageDump } from "../harness/account-fixtures.mjs";

after(unmount);
afterEach(restoreOnline);

const sessA = { user: { id: UA, email: "a@test.pl" } };
const DEV_A = "d0000000-0000-4000-8000-00000000000a";
const DEV_B = "d0000000-0000-4000-8000-00000000000b";
const B_ID = "e0000000-0000-4000-8000-0000000000b1";
const settle = () => flush(30, 10);
const appShown = () => !byTestId("account-init") && !!document.querySelector("nav, [data-testid^='dashboard-']");
const read = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
async function press(testid) {
  const el = byTestId(testid);
  assert.ok(el, `button ${testid} present`);
  await click(el);
  await settle();
}
async function openAccount() {
  await click(buttonByText("Więcej"));
  await settle();
  await click(buttonByText("Moje konto"));
  await settle();
}
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const attemptRow = (o = {}) => ({
  attempt_id: B_ID, user_id: UA, device_id: DEV_B, kind: "device_upload", status: "uploading", started_at: iso(60000), updated_at: iso(30000),
  completed_at: null, abandoned_at: null, cancelled_at: null, resolved_at: null, resolved_by_device: null, resume_count: 0, last_resumed_at: null,
  writes_count: 0, last_write_at: null, verified_counts: null, app_version: "t", ...o,
});
const localA = () => ({
  [key(UA, "device_id")]: DEV_A,
  [key(UA, "history")]: [historySession("hA", "A-DATA")],
});
const attempts = (S) => S.tables.nextrep_migration_attempts || [];

describe("Ready account, another device migrating", () => {
  test("banner explains the pause; account section: lock panel → two-step acceptance → permanent note, V1 blocked", async () => {
    const { S } = await bootApp({
      session: sessA,
      storage: { ...localA(), [key(UA, "account_init")]: { status: "ready", source: "device", syncPaused: false } },
      tables: { nextrep_migration_attempts: [attemptRow({ writes_count: 3, last_write_at: iso(20000) })] },
    });
    await settle();
    assert.ok(appShown());
    const banner = byTestId("migration-banner");
    assert.ok(banner, "the paused sync is explained on the main screens");
    assert.equal(banner.getAttribute("data-kind"), "uploading_other");
    assert.match(banner.textContent, /innym urządzeniu/);
    await openAccount();
    assert.ok(!byTestId("migration-banner"), "no duplicate banner on the account screen");
    assert.match(byTestId("account-lock-text").textContent, /innym urządzeniu/);
    assert.ok(byTestId("account-lock-last"), "last activity shown");
    assert.ok(!byTestId("account-lock-inactive"), "no 24 h note for a fresh attempt");
    assert.ok(!byTestId("account-lock-cancel"), "writes > 0 → no cancel");
    await press("account-lock-accept");
    assert.match(byTestId("account-lock-accept-warning").textContent, /NIEKOMPLETNE/);
    assert.equal(attempts(S)[0].status, "uploading", "the first tap changes nothing");
    await press("account-lock-accept-confirm");
    assert.equal(attempts(S)[0].status, "accepted_incomplete");
    assert.ok(byTestId("account-incomplete-accepted"), "permanent note in the account section");
    assert.ok(!byTestId("account-lock"));
    const migrateBtn = buttonByText("Przenieś dane do konta");
    assert.ok(migrateBtn && migrateBtn.disabled, "no new V1 after the acceptance");
  });

  test("sync safety check failed (status unreadable) → banner, nothing synced", async () => {
    const { S } = await bootApp({
      session: sessA,
      storage: { ...localA(), [key(UA, "account_init")]: { status: "ready", source: "device", syncPaused: false } },
      setupFake: (S) => {
        S.queryHook = (q) => (q.table === "nextrep_migration_attempts" ? { message: "Failed to fetch" } : null);
      },
    });
    await settle();
    const banner = byTestId("migration-banner");
    assert.ok(banner);
    assert.equal(banner.getAttribute("data-kind"), "check_failed");
    assert.match(banner.textContent, /Nie udało się sprawdzić/);
    assert.equal(S.calls.filter((c) => c.kind === "table" && c.table === "nextrep_workouts" && c.op !== "select").length, 0);
    await press("migration-banner-hide");
    assert.ok(!byTestId("migration-banner"));
  });
});

describe("Account init blocked by a migration attempt", () => {
  test("abandoned with writes on another device: explained, no cancel; two-step acceptance → source choice warns the cloud is incomplete", async () => {
    const cloud = await cloudTablesFor(UA, { history: [historySession("hC", "C-PARTIAL")], deviceId: DEV_B });
    const { S } = await bootApp({
      session: sessA,
      storage: { [key(UA, "device_id")]: DEV_A },
      tables: { ...cloud, nextrep_migration_attempts: [attemptRow({ status: "abandoned", writes_count: 5, abandoned_at: iso(10000), last_write_at: iso(20000) })] },
    });
    await settle();
    assert.ok(byTestId("init-migration-blocked"));
    assert.equal(byTestId("init-lock").getAttribute("data-kind"), "abandoned");
    assert.match(byTestId("init-lock-text").textContent, /przerwane/);
    assert.ok(!byTestId("init-lock-cancel"));
    assert.ok(byTestId("init-offline"), "a way to keep working");
    await press("init-lock-accept");
    await press("init-lock-accept-confirm");
    assert.equal(attempts(S)[0].status, "accepted_incomplete");
    assert.ok(byTestId("init-incomplete-accepted"), "the cloud data is never presented as complete");
    assert.ok(byTestId("init-cloud"));
  });

  test("24 h without activity: only information — the status does not change by itself; zero writes → 'close' (cancel) unlocks", async () => {
    const day = 24 * 60 * 60 * 1000;
    const { S } = await bootApp({
      session: sessA,
      storage: localA(),
      tables: { nextrep_migration_attempts: [attemptRow({ status: "abandoned", started_at: iso(3 * day), updated_at: iso(3 * day), abandoned_at: iso(3 * day) })] },
    });
    await settle();
    assert.ok(byTestId("init-migration-blocked"));
    assert.ok(byTestId("init-lock-inactive"), "inactivity note after 24 h");
    assert.match(byTestId("init-lock-last").textContent, /Ostatnia aktywność/);
    assert.equal(attempts(S)[0].status, "abandoned", "no automatic status change");
    await press("init-lock-cancel");
    assert.equal(attempts(S)[0].status, "cancelled");
    assert.ok(!byTestId("init-migration-blocked"), "the account is checked again");
  });
});

describe("Own device upload with a partial result", () => {
  test("interrupted (writes) → back → partial screen (abandoned, locked) → explicit acceptance → app, sync resumed (server policy) + permanent note", async () => {
    const { S } = await bootApp({ session: sessA, storage: localA() });
    await settle();
    let n = 0;
    S.queryHook = (q) => (q.table === "nextrep_workout_sets" && q.op !== "select" && ++n >= 1 ? { message: "Failed to fetch" } : null);
    await press("init-local");
    assert.ok(byTestId("init-retry-upload"), "upload failed → its retry screen");
    S.queryHook = null;
    await press("init-abandon-upload");
    assert.ok(byTestId("init-upload-partial"));
    assert.equal(attempts(S)[0].status, "abandoned");
    assert.equal(read(key(UA, "account_init")).status, "uploading_device", "nothing settled yet");
    await press("init-upload-accept");
    assert.ok(byTestId("init-upload-accept-warning"));
    assert.equal(attempts(S)[0].status, "abandoned");
    await press("init-upload-accept-confirm");
    assert.equal(attempts(S)[0].status, "accepted_incomplete");
    assert.ok(appShown());
    const m = read(key(UA, "account_init"));
    assert.deepEqual([m.status, m.source, m.syncPaused], ["ready", "device", false]);
    assert.ok(m.incompleteAccepted);
    assert.deepEqual(read(key(UA, "history")).map((h) => h.id), ["hA"], "device data unchanged");
    await openAccount();
    assert.ok(byTestId("account-incomplete-accepted"));
  });

  test("interrupted before any write → back → cancelled, normal source choice again (account unlocked)", async () => {
    const { S } = await bootApp({ session: sessA, storage: localA() });
    await settle();
    S.queryHook = (q) => (q.op !== "select" && q.table && q.table.startsWith("nextrep_") && q.table !== "nextrep_devices" && q.table !== "nextrep_migration_attempts" ? { message: "Failed to fetch" } : null);
    await press("init-local");
    S.queryHook = null;
    assert.equal(attempts(S)[0].writes_count, 0);
    await press("init-abandon-upload");
    assert.equal(attempts(S)[0].status, "cancelled");
    assert.equal(read(key(UA, "account_init")), null);
    assert.ok(byTestId("init-local"), "back at the source choice");
  });

  test("the attempt is closed on another device while this one uploads → explained, never ready; back → source choice", async () => {
    const { S } = await bootApp({ session: sessA, storage: localA() });
    await settle();
    let fired = false;
    S.queryGate = async (q) => {
      if (!fired && q.table === "nextrep_workout_sets" && q.op !== "select") {
        fired = true;
        const a = attempts(S)[0];
        await (await import("../harness/load-app.mjs")).loadApp().then((A) => A.supabase.rpc("nextrep_migration_attempt_accept_incomplete", { p_attempt_id: a.attempt_id, p_device_id: DEV_B }));
      }
    };
    await press("init-local");
    S.queryGate = null;
    assert.ok(byTestId("init-migration-closed"));
    assert.match(byTestId("init-migration-closed-text").textContent, /zamknięte na innym urządzeniu/);
    assert.notEqual((read(key(UA, "account_init")) || {}).status, "ready");
    await press("init-closed-back");
    assert.equal(read(key(UA, "account_init")), null);
    assert.ok(byTestId("init-incomplete-accepted"), "the source choice says the cloud data is incomplete");
  });

  test("restart while the upload of THIS device is open: the interrupted screen comes back (same attempt), finishing completes it", async () => {
    const { S } = await bootApp({ session: sessA, storage: localA() });
    await settle();
    S.queryHook = (q) => (q.table === "nextrep_workout_sets" && q.op !== "select" ? { message: "Failed to fetch" } : null);
    await press("init-local");
    const id = attempts(S)[0].attempt_id;
    const { S: S2 } = await bootApp({ session: sessA, storage: storageDump(), tables: JSON.parse(JSON.stringify(S.tables)) });
    await settle();
    assert.ok(byTestId("init-retry-upload"));
    await press("init-retry-upload");
    assert.ok(appShown());
    assert.equal(attempts(S2).length, 1);
    assert.equal(attempts(S2)[0].attempt_id, id);
    assert.equal(attempts(S2)[0].status, "completed");
    assert.equal(read(key(UA, "account_init")).status, "ready");
  });
});

describe("Independent review fixes (UI)", () => {
  test("an open manual upload of this device: 're-choose source' is refused (the marker keeps the way to finish it)", async () => {
    const { S } = await bootApp({
      session: sessA,
      storage: { ...localA(), [key(UA, "account_init")]: { status: "ready", source: "device", syncPaused: false } },
      setupFake: (S) => {
        S.queryHook = (q) => (q.table === "nextrep_workout_sets" && q.op !== "select" ? { message: "Failed to fetch" } : null);
      },
    });
    await settle();
    await openAccount();
    await click(buttonByText("Przenieś dane do konta"));
    await settle();
    S.queryHook = null;
    assert.ok(byTestId("account-lock") || byTestId("account-manual-open"), "the open attempt is shown");
    const btn = byTestId("rechoose-source");
    assert.ok(btn.disabled);
    await click(btn);
    await settle();
    assert.equal(read(key(UA, "account_init")).status, "ready", "marker kept");
    // finish it → completed, re-choose available again
    const resume = byTestId("account-lock-resume") || byTestId("account-manual-resume");
    await click(resume);
    await settle();
    assert.equal(attempts(S)[0].status, "completed");
    assert.ok(!byTestId("rechoose-source").disabled);
  });
  test("device upload hits another device's lock → the lock screen (not a generic error)", async () => {
    const { S } = await bootApp({ session: sessA, storage: localA() });
    await settle();
    assert.ok(byTestId("init-local"));
    S.tables.nextrep_migration_attempts = [attemptRow()];
    await press("init-local");
    assert.ok(byTestId("init-migration-blocked"));
    assert.equal(byTestId("init-lock").getAttribute("data-kind"), "uploading_other");
    assert.ok(byTestId("init-lock-nothing-sent"), "nothing sent yet → finish/close on the owner device is suggested");
    assert.equal(read(key(UA, "account_init")), null, "nothing started on this device");
  });
});
