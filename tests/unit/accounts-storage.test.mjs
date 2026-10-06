// Per-account local data namespaces + account data-source initialisation (Stage 4A.1 / 4A.2) —
// New suite written 2026-10-06. Uses jsdom localStorage and the in-memory Supabase fake (no network).
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";

let A;
const UA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const UB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
before(async () => {
  A = await loadApp();
});
beforeEach(() => {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
});
const ls = () => globalThis.localStorage;

describe("namespace keys", () => {
  test("guest / user namespaces and key format", () => {
    assert.equal(A.getLocalDataNamespace(null), "guest");
    assert.equal(A.getLocalDataNamespace(""), "guest");
    assert.equal(A.getLocalDataNamespace(UA), `user_${UA}`);
    assert.equal(A.getLocalDataNamespace("AbC-12!@#"), "user_abc-12", "id is lower-cased and sanitised");
    assert.equal(A.getStorageKey("history", null), "nextrep_guest_history_v1");
    assert.equal(A.getStorageKey("history", UA), `nextrep_user_${UA}_history_v1`);
  });
  test("before activation the active namespace is 'pending' (never shown, never synced)", () => {
    assert.equal(A.getActiveDataNamespace(), "pending");
    assert.equal(A.getStorageKey("history"), "nextrep_pending_history_v1");
    assert.equal(A.isActiveNamespaceFor(null), false);
  });
  test("STORAGE_KEYS follow the active namespace; onboarding stays device-level", () => {
    A.activateDataNamespace(UA);
    assert.equal(A.STORAGE_KEYS.history, `nextrep_user_${UA}_history_v1`);
    assert.equal(A.STORAGE_KEYS.proStatus, `nextrep_user_${UA}_pro_status_v1`);
    A.activateDataNamespace(null);
    assert.equal(A.STORAGE_KEYS.history, "nextrep_guest_history_v1");
    assert.equal(A.STORAGE_KEYS.onboardingCompleted, "trainapp_onboarding_completed_v1");
  });
  test("isolation: guest → A → B → A finds A's data again, nothing moved", () => {
    A.activateDataNamespace(null);
    ls().setItem(A.STORAGE_KEYS.history, JSON.stringify([{ id: "g" }]));
    A.activateDataNamespace(UA);
    assert.equal(ls().getItem(A.STORAGE_KEYS.history), null, "guest data NOT imported into the account");
    ls().setItem(A.STORAGE_KEYS.history, JSON.stringify([{ id: "a" }]));
    A.activateDataNamespace(UB);
    assert.equal(ls().getItem(A.STORAGE_KEYS.history), null);
    A.activateDataNamespace(UA);
    assert.deepEqual(JSON.parse(ls().getItem(A.STORAGE_KEYS.history)), [{ id: "a" }]);
    A.activateDataNamespace(null);
    assert.deepEqual(JSON.parse(ls().getItem(A.STORAGE_KEYS.history)), [{ id: "g" }]);
  });
  test("device id is per namespace", async () => {
    A.activateDataNamespace(UA);
    const a = A.getOrCreateDeviceId();
    assert.equal(A.getOrCreateDeviceId(), a, "stable");
    A.activateDataNamespace(UB);
    assert.notEqual(A.getOrCreateDeviceId(), a);
  });
});

describe("one-time NON-destructive legacy migration", () => {
  test("legacy keys are COPIED byte for byte into the first active namespace and kept", () => {
    ls().setItem("trainapp_history_v1", '[{"id":"old","date":"2026-01-01"}]');
    ls().setItem("trainapp_user_name_v1", '"Kuba"');
    const m = A.migrateLegacyLocalDataOnce("guest");
    assert.equal(m.status, "completed");
    assert.deepEqual(m.copied.sort(), ["history", "user_name"]);
    assert.equal(ls().getItem("nextrep_guest_history_v1"), '[{"id":"old","date":"2026-01-01"}]');
    assert.equal(ls().getItem("trainapp_history_v1"), '[{"id":"old","date":"2026-01-01"}]', "old key kept as recovery copy");
  });
  test("existing namespace value is never overwritten", () => {
    ls().setItem("trainapp_history_v1", '["legacy"]');
    ls().setItem("nextrep_guest_history_v1", '["newer"]');
    const m = A.migrateLegacyLocalDataOnce("guest");
    assert.deepEqual(m.keptExisting, ["history"]);
    assert.equal(ls().getItem("nextrep_guest_history_v1"), '["newer"]');
  });
  test("runs once (global marker): a later account does not get a second copy", () => {
    ls().setItem("trainapp_history_v1", '["legacy"]');
    A.activateDataNamespace(UA);
    A.activateDataNamespace(UB);
    assert.equal(ls().getItem(A.getStorageKey("history", UA)), '["legacy"]');
    assert.equal(ls().getItem(A.getStorageKey("history", UB)), null);
  });
});

describe("account init marker and sync gate", () => {
  test("no marker → sync not allowed; ready → allowed; syncPaused → not allowed", () => {
    assert.equal(A.isAccountSyncAllowed(UA), false);
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    assert.equal(A.isAccountSyncAllowed(UA), true);
    A.setAccountInitMarker(UA, { status: "ready", source: "empty", syncPaused: true });
    assert.equal(A.isAccountSyncAllowed(UA), false);
    A.setAccountInitMarker(UA, { status: "pending_cloud_confirm", source: "cloud" });
    assert.equal(A.isAccountSyncAllowed(UA), false);
    assert.equal(A.isAccountSyncAllowed(UB), false, "markers are per account");
  });
  test("corrupt marker → treated as missing", () => {
    ls().setItem(A.getStorageKey("account_init", UA), "{not json");
    assert.equal(A.getAccountInitMarker(UA), null);
  });
});

describe("hasLocalAccountData", () => {
  test("default atlas and technical keys never count as data", () => {
    ls().setItem(A.getStorageKey("exercises", UA), JSON.stringify(A.DEFAULT_EXERCISES));
    ls().setItem(A.getStorageKey("sync_queue", UA), JSON.stringify([{ id: 1 }]));
    ls().setItem(A.getStorageKey("device_id", UA), "dev");
    assert.equal(A.hasLocalAccountData(UA).hasData, false);
  });
  test("own exercise / history / name / draft count", () => {
    ls().setItem(A.getStorageKey("exercises", UA), JSON.stringify([...A.DEFAULT_EXERCISES, { id: "own1" }]));
    const r = A.hasLocalAccountData(UA);
    assert.equal(r.hasData, true);
    assert.equal(r.details.customExercises, 1);
    resetStorage();
    ls().setItem(A.getStorageKey("user_name", UB), JSON.stringify("Ania"));
    assert.equal(A.hasLocalAccountData(UB).details.userName, true);
    ls().setItem(A.getStorageKey("user_name", UB), JSON.stringify("   "));
    assert.equal(A.hasLocalAccountData(UB).hasData, false);
  });
});

describe("snapshot / restore / clear only touch ONE account", () => {
  test("clearAccountNamespace leaves other accounts, guest and device id alone", () => {
    for (const u of [UA, UB, null]) ls().setItem(A.getStorageKey("history", u), `["${u}"]`);
    ls().setItem(A.getStorageKey("device_id", UA), "devA");
    const snap = A.snapshotAccountNamespace(UA);
    A.clearAccountNamespace(UA);
    assert.equal(ls().getItem(A.getStorageKey("history", UA)), null);
    assert.equal(ls().getItem(A.getStorageKey("history", UB)), `["${UB}"]`);
    assert.equal(ls().getItem(A.getStorageKey("history", null)), '["null"]');
    assert.equal(ls().getItem(A.getStorageKey("device_id", UA)), "devA");
    A.restoreAccountNamespace(snap);
    assert.equal(ls().getItem(A.getStorageKey("history", UA)), `["${UA}"]`);
  });
});

describe("startAccountEmpty", () => {
  test("clears only this account, sets marker source=empty; syncPaused when cloud has data", async () => {
    globalThis.__nrSupabase.session = { user: { id: UA } };
    A.activateDataNamespace(UA);
    ls().setItem(A.getStorageKey("history", UA), '[{"id":"h1","date":"2026-09-01T10:00:00Z","exercises":[]}]');
    ls().setItem(A.getStorageKey("history", UB), '["b"]');
    const r = await quiet(() => A.startAccountEmpty(UA, () => UA, true));
    assert.deepEqual(r, { ok: true });
    assert.equal(ls().getItem(A.getStorageKey("history", UA)), null);
    assert.equal(ls().getItem(A.getStorageKey("history", UB)), '["b"]');
    const m = A.getAccountInitMarker(UA);
    assert.deepEqual([m.status, m.source, m.syncPaused], ["ready", "empty", true]);
    assert.equal(globalThis.__nrSupabase.calls.filter((c) => c.kind === "table" && ["insert", "update", "upsert", "delete"].includes(c.op)).length, 0, "nothing written to the cloud");
  });
  test("discarded when the session account changed meanwhile (no data touched)", async () => {
    globalThis.__nrSupabase.session = { user: { id: UB } };
    A.activateDataNamespace(UA);
    ls().setItem(A.getStorageKey("history", UA), '["keep"]');
    const r = await A.startAccountEmpty(UA, () => UA, false);
    assert.equal(r.discarded, true);
    assert.equal(ls().getItem(A.getStorageKey("history", UA)), '["keep"]');
  });
});

describe("checkCloudAccountData (light read, fake Supabase)", () => {
  test("empty cloud → hasData false; only default atlas exercises → still false", async () => {
    globalThis.__nrSupabase.tables.nextrep_exercises = [{ user_id: UA, deleted_at: null, legacy_id: "bench_press" }];
    const r = await A.checkCloudAccountData(UA);
    assert.equal(r.hasData, false);
  });
  test("a workout of THIS user → hasData; another user's rows don't count", async () => {
    globalThis.__nrSupabase.tables.nextrep_workouts = [{ id: "w", user_id: UB, deleted_at: null }];
    assert.equal((await A.checkCloudAccountData(UA)).hasData, false);
    globalThis.__nrSupabase.tables.nextrep_workouts.push({ id: "w2", user_id: UA, deleted_at: null });
    assert.equal((await A.checkCloudAccountData(UA)).details.workouts, true);
  });
  test("soft-deleted rows don't count", async () => {
    globalThis.__nrSupabase.tables.nextrep_plans = [{ id: "p", user_id: UA, deleted_at: "2026-09-01" }];
    assert.equal((await A.checkCloudAccountData(UA)).hasData, false);
  });
  test("network failure THROWS (unknown is never 'empty')", async () => {
    globalThis.__nrSupabase.failNetwork = true;
    await assert.rejects(() => A.checkCloudAccountData(UA));
  });
});

describe("offline / network error texts", () => {
  test("isNetworkError recognises fetch failures, not ordinary errors", () => {
    assert.equal(A.isNetworkError(new TypeError("Failed to fetch")), true);
    assert.equal(A.isNetworkError({ name: "AuthRetryableFetchError", message: "x" }), true);
    assert.equal(A.isNetworkError({ status: 0, message: "fetch error" }), true);
    assert.equal(A.isNetworkError(new Error("Invalid login credentials")), false);
    assert.equal(A.isNetworkError(null), false);
  });
  test("authErrorText never shows raw 'Failed to fetch'", () => {
    assert.equal(A.authErrorText(new TypeError("Failed to fetch")), A.NETWORK_ERROR_TEXT);
    assert.equal(A.authErrorText({ message: "Invalid login credentials" }), "Nieprawidłowy e-mail lub hasło.");
    assert.equal(A.authErrorText(null), "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.");
  });
  test("navigator.onLine === false → network error", () => {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis.navigator), "onLine");
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
    try {
      assert.equal(A.isNetworkError(new Error("anything")), true);
    } finally {
      delete globalThis.navigator.onLine;
      if (desc) assert.equal(globalThis.navigator.onLine, true);
    }
  });
});
