// Stage 4A.2 — workspace isolation hardening, unit level.
// D: saveDataToCloud never uploads a workspace that isn't the session's.
// E: the Supabase SDK is pinned in the importmap.
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
  test("importmap points exactly to @supabase/supabase-js@2.117.2", () => {
    const html = readFileSync(resolve(here, "../../index.html"), "utf8");
    const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    assert.ok(m, "importmap present");
    const map = JSON.parse(m[1]).imports;
    assert.equal(map["@supabase/supabase-js"], "https://esm.sh/@supabase/supabase-js@2.117.2");
    // nothing else changed: React, ReactDOM and lucide stay on their existing versions
    assert.equal(map.react, "https://esm.sh/react@18.3.1");
    assert.equal(map["react-dom/client"], "https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1");
    assert.equal(map["lucide-react"], "https://esm.sh/lucide-react@0.454.0?deps=react@18.3.1&external=react");
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
