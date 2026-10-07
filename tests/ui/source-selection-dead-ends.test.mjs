// Stage 4A.3 (F2) — no source-selection action may leave a spinner without buttons. The account
// re-check inside an operation fails (getSession answers "no session" while the app still shows
// the same account — e.g. a transient SDK error): the operation is cancelled and the screen it came
// from comes back with a message. A stale action (a newer flow replaced it) never touches the screen.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act, buttonByText } from "../harness/ui.mjs";
import { bootApp } from "../harness/app-boot.mjs";
import { UA, key, historySession, cloudTablesFor, cloudWrites } from "../harness/account-fixtures.mjs";

after(unmount);

const sessA = { user: { id: UA, email: "a@test.pl" } };
const ns = `user_${UA}`;
const read = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const ids = (list) => (Array.isArray(list) ? list.map((s) => s.id).sort() : list);
const settle = () => flush(30, 10);
const initText = () => (byTestId("account-init") ? byTestId("account-init").textContent : "");
const json = (v) => JSON.stringify(v);
async function press(testid) {
  const el = byTestId(testid);
  assert.ok(el, `button ${testid} present`);
  await click(el);
  await settle();
}
// the app still shows account A, but the session re-check inside the operation fails
const breakSessionCheck = (S) => {
  S.session = null;
};
function assertInteractive(why) {
  assert.ok(!byTestId("init-progress"), `${why}: no spinner left`);
  assert.ok(byTestId("account-init").querySelectorAll("button").length > 0, `${why}: buttons available`);
  assert.ok(byTestId("init-error"), `${why}: the user is told what happened`);
}

let cloudA;
before(async () => {
  cloudA = await cloudTablesFor(UA, { history: [historySession("hC", "CLOUD")] });
});
const deviceData = () => ({ [key(UA, "history")]: [historySession("hD", "DEVICE")], [key(UA, "user_name")]: json("Ania") });

describe("F2 — every action ends on an interactive screen", () => {
  test("A. choose cloud → account check fails → back on the choice with a message, nothing changed", async () => {
    const { S } = await bootApp({ session: sessA, storage: deviceData(), tables: cloudA });
    await settle();
    breakSessionCheck(S);
    await press("init-cloud");
    assertInteractive("choose cloud");
    assert.ok(byTestId("init-cloud") && byTestId("init-local"), "the same choice is back");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"]);
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(cloudWrites(S).length, 0);
  });

  test("B. choose device (upload to an empty cloud) → account check fails → back on the choice, nothing sent", async () => {
    const { S } = await bootApp({ session: sessA, storage: deviceData() });
    await settle();
    breakSessionCheck(S);
    await press("init-local");
    assertInteractive("device upload");
    assert.ok(byTestId("init-local"));
    assert.equal(read(key(UA, "account_init")), null);
    assert.equal(cloudWrites(S).length, 0);
  });

  test("C. start empty → account check fails → choice stays usable with a message (start empty has no spinner)", async () => {
    const { S } = await bootApp({ session: sessA, storage: deviceData(), tables: cloudA });
    await settle();
    breakSessionCheck(S);
    await press("init-empty");
    assertInteractive("start empty");
    assert.deepEqual(ids(read(key(UA, "history"))), ["hD"], "nothing cleared");
    assert.equal(read(key(UA, "account_init")), null);
  });

  test("D. retry of an interrupted cloud load → account check fails → interrupted screen again, with a message", async () => {
    const storage = {
      [key(UA, "account_init")]: { status: "loading_cloud", source: "cloud", syncPaused: true, userId: UA, namespace: ns, backupId: null, noSnapshot: true },
      [key(UA, "last_cloud_restore")]: { backupId: null, noSnapshot: true, userId: UA, namespace: ns, createdAt: new Date().toISOString(), postFingerprint: null },
      [key(UA, "history")]: [historySession("hC", "CLOUD")],
    };
    const { S } = await bootApp({ session: sessA, storage, tables: cloudA });
    await settle();
    assert.match(initText(), /WCZYTYWANIE Z CHMURY ZOSTAŁO PRZERWANE/);
    breakSessionCheck(S);
    await press("init-retry-cloud");
    assertInteractive("retry cloud");
    assert.match(initText(), /WCZYTYWANIE Z CHMURY ZOSTAŁO PRZERWANE/);
    assert.equal(read(key(UA, "account_init")).status, "loading_cloud", "still recognisable");
  });

  test("E. retry of an interrupted device upload → account check fails → interrupted screen again, with a message", async () => {
    const storage = {
      ...deviceData(),
      [key(UA, "device_id")]: "dev-A",
      [key(UA, "account_init")]: { status: "uploading_device", source: "device", syncPaused: true, userId: UA, namespace: ns, deviceId: "dev-A", startedAt: "2026-10-07T08:00:00.000Z" },
    };
    const { S } = await bootApp({ session: sessA, storage });
    await settle();
    assert.match(initText(), /WYSYŁANIE DANYCH ZOSTAŁO PRZERWANE/);
    breakSessionCheck(S);
    await press("init-retry-upload");
    assertInteractive("retry upload");
    assert.match(initText(), /WYSYŁANIE DANYCH ZOSTAŁO PRZERWANE/);
    assert.equal(read(key(UA, "account_init")).status, "uploading_device");
    assert.equal(cloudWrites(S).length, 0);
  });

  test("F. a stale action (account flow replaced by logout → login) neither runs on nor touches the new screen", async () => {
    const { S } = await bootApp({ session: sessA, storage: deviceData() });
    await settle();
    // pause the device upload at its cloud re-check
    let release;
    let hit;
    const reached = new Promise((r) => (hit = r));
    S.queryGate = async (q) => {
      if (!release && q.table === "nextrep_workouts" && q.op === "select") {
        hit();
        await new Promise((r) => (release = r));
      }
    };
    await click(byTestId("init-local"));
    await reached;
    // the user signs out and in again as A meanwhile → a NEW source-selection flow
    S.queryGate = null;
    await act(async () => S.emitAuth("SIGNED_OUT", null));
    await settle();
    await act(async () => S.emitAuth("SIGNED_IN", sessA));
    await settle();
    assert.match(initText(), /ZNALEŹLIŚMY DANE NA TYM URZĄDZENIU/, "the new flow's choice");
    // the old action now finishes
    release();
    await settle();
    assert.match(initText(), /ZNALEŹLIŚMY DANE NA TYM URZĄDZENIU/, "screen not taken over by the stale action");
    assert.ok(!byTestId("init-error"), "no stale error injected");
    assert.equal(cloudWrites(S).length, 0, "the stale upload stopped at its next account check");
    assert.equal(read(key(UA, "account_init")), null);
  });

  test("G. 'Wybierz ponownie źródło danych' → account check fails → the (read-only) check still runs, no endless 'checking'", async () => {
    const { S } = await bootApp({ session: sessA, storage: { ...deviceData(), [key(UA, "account_init")]: { status: "ready", source: "device", syncPaused: false } }, tables: cloudA });
    await settle();
    await click(buttonByText("Więcej"));
    await settle();
    await click(buttonByText("Moje konto"));
    await settle();
    breakSessionCheck(S);
    await click(buttonByText("Wybierz ponownie źródło danych"));
    await settle();
    assert.ok(!byTestId("init-progress"), "no spinner left");
    assert.match(initText(), /ZNALEŹLIŚMY DANE NA URZĄDZENIU I W CHMURZE/);
  });
});
