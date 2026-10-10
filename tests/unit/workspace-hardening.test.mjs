// Stage 4A.2 — workspace isolation hardening, unit level.
// D: saveDataToCloud never uploads a workspace that isn't the session's.
// E: the Supabase SDK is pinned (root package.json since F1.3; formerly the importmap).
// B: purgeDeletedAccountData touches only the deleted account.
// C: cancelScheduledSync drops the debounced sync timer.
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const UA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const UB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
let A;
before(async () => {
  A = await loadApp();
});
beforeEach(() => {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
});
const ls = () => globalThis.localStorage;
const upserts = () => globalThis.__nrSupabase.calls.filter((c) => c.kind === "table" && c.table === "user_data" && c.op === "upsert");

describe("D. saveDataToCloud guard", () => {
  test("active workspace of the session → normal save of THAT workspace", async () => {
    globalThis.__nrSupabase.session = { user: { id: UA } };
    A.activateDataNamespace(UA);
    ls().setItem(A.getStorageKey("history", UA), JSON.stringify([{ id: "hA" }]));
    const r = await A.saveDataToCloud();
    assert.equal(r.error, null);
    assert.equal(upserts().length, 1);
    const row = upserts()[0].args[0];
    assert.equal(row.user_id, UA);
    assert.deepEqual(row.data.trainapp_history_v1, [{ id: "hA" }], "payload holds A's own history (field names as in CLOUD_SYNC_FIELDS)");
  });
  test("session A but another workspace active (B / guest) → nothing is sent", async () => {
    globalThis.__nrSupabase.session = { user: { id: UA } };
    for (const other of [UB, null]) {
      A.activateDataNamespace(other);
      ls().setItem(A.getStorageKey("history", other), JSON.stringify([{ id: "not-A" }]));
      const r = await A.saveDataToCloud();
      assert.ok(r.error, "refused with a message");
    }
    assert.equal(upserts().length, 0, "no upsert reached Supabase");
  });
});

describe("E. Supabase SDK version is pinned", () => {
  // Since F1.3 the app is built from npm packages (tools/build-web.mjs) instead of the esm.sh
  // importmap, so the pin lives in the root package.json. Same versions as the former importmap.
  test("package.json pins exactly @supabase/supabase-js 2.117.2 (and React 18.3.1, lucide 0.454.0); no importmap left", () => {
    const pkg = JSON.parse(readFileSync(resolve(here, "../../package.json"), "utf8"));
    assert.equal(pkg.dependencies["@supabase/supabase-js"], "2.117.2");
    assert.equal(pkg.dependencies.react, "18.3.1");
    assert.equal(pkg.dependencies["react-dom"], "18.3.1");
    assert.equal(pkg.dependencies["lucide-react"], "0.454.0");
    const html = readFileSync(resolve(here, "../../index.html"), "utf8");
    assert.doesNotMatch(html, /<script type="importmap">|esm\.sh/);
  });
});

describe("B. purgeDeletedAccountData (unit)", () => {
  test("removes every key of the account and its backups only", () => {
    for (const name of ["history", "plans", "sync_queue", "sync_meta", "sync_conflicts", "device_id", "account_init", "last_cloud_restore", "migration_v1_status", "migration_workout_identity", "active_workout_draft", "pro_status"]) {
      ls().setItem(A.getStorageKey(name, UA), "1");
      ls().setItem(A.getStorageKey(name, UB), "1");
      ls().setItem(A.getStorageKey(name, null), "1");
    }
    ls().setItem("trainapp_onboarding_completed_v1", "true");
    ls().setItem("nextrep_backup_list_v1", JSON.stringify([{ backupId: "a", namespace: `user_${UA}` }, { backupId: "b", namespace: `user_${UB}` }, { backupId: "g", namespace: "guest" }]));
    assert.equal(A.purgeDeletedAccountData(UA), true);
    assert.deepEqual(Object.keys(ls()).filter((x) => x.startsWith(`nextrep_user_${UA}_`)), []);
    assert.equal(Object.keys(ls()).filter((x) => x.startsWith(`nextrep_user_${UB}_`)).length, 12);
    assert.equal(Object.keys(ls()).filter((x) => x.startsWith("nextrep_guest_")).length, 12);
    assert.equal(ls().getItem("trainapp_onboarding_completed_v1"), "true");
    assert.deepEqual(JSON.parse(ls().getItem("nextrep_backup_list_v1")).map((b) => b.backupId), ["b", "g"]);
  });
  test("never purges the guest workspace (null / empty id)", () => {
    ls().setItem(A.getStorageKey("history", null), "1");
    assert.equal(A.purgeDeletedAccountData(null), false);
    assert.equal(A.purgeDeletedAccountData(""), false);
    assert.equal(ls().getItem(A.getStorageKey("history", null)), "1");
  });
});

describe("C. cancelScheduledSync (unit)", () => {
  test("a debounced sync scheduled before the cancel never runs", async () => {
    let ran = 0;
    await quiet(async () => {
      A.scheduleSync(30, async () => { ran++; });
      A.cancelScheduledSync();
      await new Promise((r) => setTimeout(r, 80));
    });
    assert.equal(ran, 0);
  });
});
