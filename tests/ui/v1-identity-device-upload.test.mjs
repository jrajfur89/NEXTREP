// Hotfix I-1 — Stage 4A.3 regression in the real <App/>: account device data + EMPTY cloud →
// "Wczytaj z urządzenia" → V1 upload → ready/device → the normal sync (PUSH + PULL/APPLY) → reload →
// sync again. The history must stay exactly the device history: one workout exercise per local ex.id,
// the same sets, the same volume and progression verdicts (fake Supabase, no network).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, byTestId, click, flush, act } from "../harness/ui.mjs";
import { bootApp } from "../harness/app-boot.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, key, storageDump } from "../harness/account-fixtures.mjs";

after(unmount);

const session = { user: { id: UA } };
const read = (k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(raw) : null;
};
const settle = () => flush(30, 10);
const appShown = () => !byTestId("account-init") && !!document.querySelector("nav, [data-testid^='dashboard-']");

const sd = [{ id: "sd1", target: "8-10", rir: "" }, { id: "sd2", target: "8-10", rir: "" }];
const set = (id, weight, reps) => ({ id, weight: String(weight), reps: String(reps), rir: "" });
const HISTORY = [
  { id: "d1", date: "2026-10-01T10:00:00.000Z", planId: null, planName: "Plan D", exercises: [{ id: "we-d1-a", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: sd, sets: [set("s-d1-1", 70, 8), set("s-d1-2", 70, 8)] }] },
  { id: "d2", date: "2026-10-03T10:00:00.000Z", planId: null, planName: "Plan D", exercises: [{ id: "we-d2-a", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", setsDetail: sd, sets: [set("s-d2-1", 70, 10), set("s-d2-2", 70, 10)] }] },
];

function semantics(A, history) {
  const norm = history.map(A.normalizeHistorySession);
  const last = norm.find((s) => s.id === "d2");
  return {
    wex: norm.flatMap((s) => s.exercises.map((ex) => ex.id)).sort(),
    sets: norm.flatMap((s) => s.exercises.flatMap((ex) => ex.sets.map((st) => st.id))).sort(),
    volume: norm.map((s) => s.exercises.reduce((v, ex) => v + A.computeSessionVolume(ex.sets, ex.type), 0)),
    analysis: last.exercises.map((ex) => {
      const r = A.analyzeSessionExercise(norm, last, ex);
      return r && { status: r.status, message: r.message, suggestedWeight: r.suggestedWeight };
    }),
  };
}

describe("Stage 4A.3 device → empty cloud, then normal sync and reload (hotfix I-1)", () => {
  test("no duplicated workout exercises or sets; history, volume and progression unchanged after sync + reload + sync", async () => {
    const { A, S } = await bootApp({ session, storage: { [key(UA, "history")]: HISTORY } });
    await settle();
    const before = semantics(A, HISTORY);
    await click(byTestId("init-local"));
    await settle();
    assert.ok(appShown(), "account opened after the upload");
    assert.equal(read(key(UA, "account_init")).source, "device");
    assert.deepEqual((S.tables.nextrep_workout_exercises || []).map((r) => r.legacy_id).sort(), ["we-d1-a", "we-d2-a"]);

    await act(async () => {
      const r = await quiet(() => A.runSync());
      assert.ok(r, "sync ran");
    });
    await settle();
    assert.deepEqual(semantics(A, read(key(UA, "history"))), before, "after the first normal sync");

    // reload: same device storage, same cloud
    const dump = storageDump();
    const cloud = JSON.parse(JSON.stringify(S.tables));
    const again = await bootApp({ session, storage: dump, tables: cloud });
    await settle();
    assert.ok(appShown(), "ready account opens directly after reload");
    await act(async () => {
      await quiet(() => again.A.runSync());
    });
    await settle();
    assert.deepEqual(semantics(again.A, read(key(UA, "history"))), before, "after reload + sync");
    assert.equal((again.S.tables.nextrep_workout_exercises || []).length, 2, "cloud: one row per workout exercise");
    assert.equal((again.S.tables.nextrep_workout_sets || []).length, 4, "cloud: one row per set");
  });
});
