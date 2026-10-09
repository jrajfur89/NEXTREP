// Stage 4A.4 F-5 (Etap 11) — cloud-safe values for NOT NULL number columns and the pre-start check.
// Old plans without restSeconds, workouts without summaries, decimal / non-numeric values, measurements and
// workouts without a date. REAL production functions against the fake Supabase, with a column guard that
// refuses exactly what the production schema refuses (NOT NULL 23502, integer 22P02, timestamptz 22007).
import { test, describe, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp, resetStorage } from "../harness/load-app.mjs";
import { quiet } from "../harness/fixtures.mjs";
import { UA, key, cloudWrites } from "../harness/account-fixtures.mjs";

let A;
let S;
const ref = () => UA;
const DEV_A = "d0000000-0000-4000-8000-00000000000a";
const LOCKED = new Set(["nextrep_exercises", "nextrep_plans", "nextrep_plan_items", "nextrep_plan_item_sets", "nextrep_workouts", "nextrep_workout_exercises", "nextrep_workout_sets", "nextrep_measurements", "nextrep_custom_fields", "nextrep_profiles"]);
const attempts = () => S.tables.nextrep_migration_attempts || [];
const rows = (t) => S.tables[t] || [];
const net = () => Object.assign(new TypeError("Failed to fetch"), { name: "TypeError" });

// ---- production column rules (information_schema of pyhhvbqcjhpulrmqiguz, read 2026-10-09) ----
const NOT_NULL_DEFAULTED = {
  nextrep_plan_items: ["rest_seconds"],
  nextrep_workouts: ["exercises_count", "total_sets", "total_reps", "total_weight", "volume", "duration_sec", "analysis"],
  nextrep_workout_exercises: ["position", "name", "exercise_type", "sets_detail"],
  nextrep_workout_sets: ["position", "note", "set_type", "done"],
  nextrep_measurements: ["values"],
};
const NOT_NULL_REQUIRED = {
  nextrep_workouts: ["workout_date"],
  nextrep_measurements: ["measurement_date"],
  nextrep_plan_items: ["plan_id"],
  nextrep_plan_item_sets: ["plan_item_id"],
  nextrep_workout_exercises: ["workout_id"],
  nextrep_workout_sets: ["workout_exercise_id"],
};
const INTEGER = { nextrep_plan_items: ["rest_seconds"], nextrep_workouts: ["exercises_count", "total_sets", "total_reps", "duration_sec"], nextrep_workout_exercises: ["position"], nextrep_workout_sets: ["position"] };
const TIMESTAMP = { nextrep_workouts: ["workout_date"], nextrep_measurements: ["measurement_date"] };
const refused = [];
function prodColumnGuard(q) {
  if (!LOCKED.has(q.table) || !["insert", "update", "upsert"].includes(q.op)) return null;
  for (const row of Array.isArray(q.payload) ? q.payload : [q.payload]) {
    for (const col of [...(NOT_NULL_DEFAULTED[q.table] || []), ...(NOT_NULL_REQUIRED[q.table] || [])]) {
      if (Object.prototype.hasOwnProperty.call(row, col) && row[col] === null) return refuse(q, { code: "23502", message: `null value in column "${col}" of relation "${q.table}" violates not-null constraint` });
    }
    if (q.op !== "update") for (const col of NOT_NULL_REQUIRED[q.table] || []) if (!(col in row)) return refuse(q, { code: "23502", message: `null value in column "${col}"` });
    for (const col of INTEGER[q.table] || []) {
      if (col in row && row[col] != null && !(typeof row[col] === "number" && Number.isInteger(row[col]))) return refuse(q, { code: "22P02", message: `invalid input syntax for type integer: "${row[col]}"` });
    }
    for (const col of TIMESTAMP[q.table] || []) {
      if (col in row && row[col] != null && !(typeof row[col] === "string" && Number.isFinite(Date.parse(row[col])))) return refuse(q, { code: "22007", message: `invalid input syntax for type timestamp with time zone: "${row[col]}"` });
    }
  }
  return null;
}
function refuse(q, err) {
  refused.push({ table: q.table, op: q.op, code: err.code });
  return err;
}

// ---- old-format local data (plans before restSeconds, a decimal comma, workouts without summaries) ----
const OLD_PLANS = [
  {
    id: "p-old",
    name: "Stary plan",
    exercises: [
      { id: "pi-norest", exerciseId: "bench_press", targetSets: 3, targetReps: "8" }, // no restSeconds, no setsDetail
      { id: "pi-dec", exerciseId: "bench_press", restSeconds: "90,5", setsDetail: [{ id: "pis-dec-1", target: "8", rir: "" }] },
      { id: "pi-ok", exerciseId: "bench_press", restSeconds: 120, setsDetail: [{ id: "pis-ok-1", target: "6-8", rir: "2" }] },
      { id: "pi-empty", exerciseId: "bench_press", restSeconds: "", setsDetail: [{ id: "pis-empty-1", target: "10", rir: "" }] },
    ],
  },
];
const OLD_HISTORY = [
  {
    id: "h-old",
    date: "2026-09-01T10:00:00.000Z",
    planId: "p-old",
    planName: "Stary plan",
    // no exercisesCount / totalSets / totalReps / totalWeight / volume / durationSec (an old / imported session)
    exercises: [{ id: "we-cardio", exerciseId: "run", name: "Bieg", type: "cardio", sets: [{ id: "s-cardio", duration: "1800", pace: "5:30", distance: "5,2" }] }],
  },
  {
    id: "h-new",
    date: "2026-09-03T10:00:00.000Z",
    planId: null,
    planName: "Trening",
    exercisesCount: 1, totalSets: 1, totalReps: 8, totalWeight: 100, volume: 800, durationSec: 1800.4,
    exercises: [{ id: "we-new", exerciseId: "bench_press", name: "Wyciskanie", type: "weight", sets: [{ id: "s-new", weight: "100", reps: "8", rir: "" }] }],
  },
];
const MEASUREMENTS = [{ id: "m-ok", date: "2026-09-02T08:00:00.000Z", weight: "80" }];
const DATA_KEYS = ["plans", "history", "measurements", "exercises"];
const raw = (ns, name) => localStorage.getItem(key(ns, name));
const snapshot = (ns) => DATA_KEYS.map((n) => raw(ns, n)).join("|");

before(async () => {
  A = await loadApp();
});
function setup({ plans = OLD_PLANS, history = OLD_HISTORY, measurements = MEASUREMENTS, ns = UA, guard = true } = {}) {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.__testState.resetAccountInitBusy();
  A.cancelAllScheduledSyncRetries();
  S = globalThis.__nrSupabase;
  S.session = { user: { id: UA } };
  refused.length = 0;
  S.queryHook = guard ? prodColumnGuard : null;
  A.activateDataNamespace(UA);
  localStorage.setItem(key(UA, "device_id"), DEV_A);
  if (plans) localStorage.setItem(key(ns, "plans"), JSON.stringify(plans));
  if (history) localStorage.setItem(key(ns, "history"), JSON.stringify(history));
  if (measurements) localStorage.setItem(key(ns, "measurements"), JSON.stringify(measurements));
}
beforeEach(() => setup());
afterEach(() => A.cancelAllScheduledSyncRetries());
const upload = () => quiet(() => A.uploadAccountDataToEmptyCloud(UA, ref));
const rowBy = (t, legacyId) => rows(t).find((r) => r.legacy_id === legacyId);

describe("Etap 11 — the column guard models production", () => {
  test("a null in rest_seconds / a summary column is refused exactly like production (23502)", async () => {
    const r1 = await A.supabase.from("nextrep_plan_items").insert({ user_id: UA, plan_id: "x", rest_seconds: null });
    assert.equal(r1.error && r1.error.code, "23502");
    const r2 = await A.supabase.from("nextrep_workouts").insert({ user_id: UA, workout_date: "2026-09-01T10:00:00Z", total_sets: null });
    assert.equal(r2.error && r2.error.code, "23502");
    const r3 = await A.supabase.from("nextrep_plan_items").insert({ user_id: UA, plan_id: "x", rest_seconds: 90.5 });
    assert.equal(r3.error && r3.error.code, "22P02");
    const r4 = await A.supabase.from("nextrep_measurements").insert({ user_id: UA, measurement_date: null });
    assert.equal(r4.error && r4.error.code, "23502");
  });
});

describe("Etap 11 — payload builders (shared by V1 and sync)", () => {
  test("rest_seconds: missing / empty / non-numeric → column left out; decimal comma read; integer rounded; valid values unchanged", () => {
    const p = (restSeconds) => A.buildPlanItemPayload({ restSeconds }, "PLAN", null);
    for (const v of [undefined, null, "", "  ", "abc", NaN, Infinity, true, {}, []]) assert.equal("rest_seconds" in p(v), false, `left out for ${String(v)}`);
    assert.equal(p("90").rest_seconds, 90);
    assert.equal(p(90.5).rest_seconds, 91);
    assert.equal(p("90,5").rest_seconds, 91);
    assert.equal(p(120).rest_seconds, 120);
    assert.equal(p(0).rest_seconds, 0);
    assert.equal(p(-5).rest_seconds, -5, "a value the server accepts is never changed");
    assert.deepEqual(Object.keys(p(undefined)).sort(), ["exercise_id", "plan_id", "superset_group"]);
  });
  test("workout summaries: missing ones left out, present ones exactly as before (Number for numbers); the date is never invented", () => {
    const none = A.buildWorkoutPayload({ id: "w", date: "2026-09-01T10:00:00.000Z" }, null);
    for (const c of ["exercises_count", "total_sets", "total_reps", "total_weight", "volume", "duration_sec"]) assert.equal(c in none, false, c);
    assert.equal(none.workout_date, "2026-09-01T10:00:00.000Z");
    assert.equal(A.buildWorkoutPayload({ id: "w" }, null).workout_date, null, "no date → null (the pre-start check refuses it), never a made-up date");
    const full = A.buildWorkoutPayload({ id: "w", date: "d", exercisesCount: 3, totalSets: 9, totalReps: 72, totalWeight: 812.5, volume: 6500.25, durationSec: 3600 }, null);
    assert.deepEqual([full.exercises_count, full.total_sets, full.total_reps, full.total_weight, full.volume, full.duration_sec], [3, 9, 72, 812.5, 6500.25, 3600]);
    assert.equal(A.buildWorkoutPayload({ durationSec: 1800.4 }, null).duration_sec, 1800, "integer column rounded");
  });
  test("sanitizeCloudRow touches only the defaulted number columns of its table; idempotent", () => {
    const row = { rest_seconds: null, superset_group: null, plan_id: null };
    assert.deepEqual(A.sanitizeCloudRow("nextrep_plan_items", row), { superset_group: null, plan_id: null });
    assert.deepEqual(A.sanitizeCloudRow("nextrep_exercises", { notes: null }), { notes: null }, "other tables unchanged");
    const once = A.sanitizeCloudRow("nextrep_workouts", { total_sets: "9", volume: "1,5", total_reps: "x" });
    assert.deepEqual(once, { total_sets: 9, volume: 1.5 });
    assert.deepEqual(A.sanitizeCloudRow("nextrep_workouts", once), once);
  });
  test("workout set TEXT columns keep the text (V1 used to turn a pace '5:30' into null)", () => {
    const s = A.buildWorkoutSetPayload({ duration: "1800", pace: "5:30", distance: "5,2", reps: "8" }, "WEX", 0);
    assert.equal(s.pace, "5:30");
    assert.equal(s.distance, "5,2");
    assert.equal(s.duration, "1800");
  });
  test("sync comparison: a missing local value is not 'different' from the server default (no false remote-newer → no PULL overwrite)", () => {
    const item = { id: "pi-norest", exerciseId: null };
    assert.equal(A.localRecordMatchesRemote("plan_items", item, { rest_seconds: 0, superset_group: null, exercise_id: null }, { history: [] }, { exercises: [] }), true);
    const sess = { id: "h", date: "2026-09-01T10:00:00.000Z", planId: null, planName: "X" };
    const remote = { workout_date: "2026-09-01T10:00:00+00:00", plan_id: null, plan_name: "X", plan_label: null, exercises_count: 0, total_sets: 0, total_reps: 0, total_weight: 0, volume: 0, duration_sec: 0, analysis: {} };
    assert.equal(A.localRecordMatchesRemote("workouts", sess, remote, { history: [] }, { plans: [] }), true);
  });
});

describe("Etap 11 — pre-start check (cloudUploadBlockers)", () => {
  test("repairable values are not blockers; missing / invalid dates and out-of-range numbers are", () => {
    assert.deepEqual(A.cloudUploadBlockers({ plans: OLD_PLANS, history: OLD_HISTORY, measurements: MEASUREMENTS }), []);
    const b = A.cloudUploadBlockers({
      measurements: [{ id: "m1" }, { id: "m2", date: "wczoraj" }, { id: "m3", date: 1700000000000 }, { id: "m4", date: "2026-09-01" }],
      history: [{ id: "h1" }, { id: "h2", date: "2026-09-01T10:00:00.000Z", totalSets: 1e12 }],
      plans: [{ id: "p", exercises: [{ id: "pi", restSeconds: 3e9 }] }],
    });
    const by = Object.fromEntries(b.map((x) => [x.kind, x]));
    assert.deepEqual(by.measurement_date.sample, ["m1", "m2", "m3"]);
    assert.deepEqual(by.workout_date.sample, ["h1"]);
    assert.deepEqual(by.number_range.sample, ["h2", "pi"]);
    assert.match(A.cloudUploadBlockersText(b), /nie wymyśla dat/);
  });
});

describe("Etap 11 — device upload with old data (account → empty cloud)", () => {
  test("old plans / summaries / decimal comma upload completely; nothing null reaches a NOT NULL column; local data unchanged", async () => {
    const before = snapshot(UA);
    const r = await upload();
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(refused, [], "the production column rules refused nothing");
    assert.equal(attempts().length, 1);
    assert.equal(attempts()[0].status, "completed");
    assert.equal("rest_seconds" in rowBy("nextrep_plan_items", "pi-norest"), false, "left out → server default 0 (timer: 90 s, as before)");
    assert.equal(rowBy("nextrep_plan_items", "pi-dec").rest_seconds, 91);
    assert.equal(rowBy("nextrep_plan_items", "pi-ok").rest_seconds, 120);
    assert.equal("rest_seconds" in rowBy("nextrep_plan_items", "pi-empty"), false);
    const old = rowBy("nextrep_workouts", "h-old");
    for (const c of ["exercises_count", "total_sets", "total_reps", "total_weight", "volume", "duration_sec"]) assert.equal(c in old, false, c);
    assert.equal(rowBy("nextrep_workouts", "h-new").duration_sec, 1800);
    assert.equal(rowBy("nextrep_workouts", "h-new").total_weight, 100);
    const cardio = rows("nextrep_workout_sets").find((x) => x.legacy_id === "s-cardio");
    assert.equal(cardio.pace, "5:30", "text kept");
    assert.equal(snapshot(UA), before, "plans / history / measurements on the device are byte-for-byte unchanged");
  });

  test("a measurement without a date stops the upload BEFORE the attempt: no attempt, no cloud write, no marker, local data unchanged", async () => {
    setup({ measurements: [...MEASUREMENTS, { id: "m-nodate", weight: "81" }] });
    const before = snapshot(UA);
    const calls0 = S.calls.length;
    const r = await upload();
    assert.equal(r.ok, false);
    assert.ok(r.dataBlockers && r.dataBlockers[0].kind === "measurement_date");
    assert.match(r.error, /nie wymyśla dat/);
    assert.equal(attempts().length, 0, "no server attempt — the account is not locked");
    assert.deepEqual(cloudWrites({ calls: S.calls.slice(calls0) }), [], "nothing written to the cloud");
    assert.equal(S.calls.slice(calls0).filter((c) => c.kind === "rpc" && /migration_attempt_start/.test(c.fn || "")).length, 0, "start RPC never called");
    const m = A.getAccountInitMarker(UA);
    assert.ok(!m || m.status !== "uploading_device", "no upload marker");
    assert.equal(snapshot(UA), before);
  });

  test("a workout without a date (raw storage) is a blocker too — never a made-up date", async () => {
    setup({ history: [{ ...OLD_HISTORY[1], id: "h-nodate", date: undefined }] });
    const r = await upload();
    assert.equal(r.ok, false);
    assert.equal(r.dataBlockers[0].kind, "workout_date");
    assert.equal(attempts().length, 0);
  });
});

describe("Etap 11 — resume of an abandoned upload", () => {
  test("interrupted (old data) → abandoned → resume with the SAME attempt completes; no duplicate rows", async () => {
    let seen = 0;
    S.queryHook = (q) => {
      const g = prodColumnGuard(q);
      if (g) return g;
      if (LOCKED.has(q.table) && q.op !== "select" && ++seen > 3) return net();
      return null;
    };
    const r1 = await upload();
    assert.equal(r1.ok, false);
    const id = A.getAccountInitMarker(UA).serverAttemptId;
    const back = await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    assert.equal(back.partial, true);
    assert.equal(attempts()[0].status, "abandoned");
    S.queryHook = prodColumnGuard;
    const r2 = await upload();
    assert.equal(r2.ok, true, r2.error);
    assert.equal(attempts().length, 1);
    assert.equal(attempts()[0].attempt_id, id, "same attempt resumed");
    assert.equal(attempts()[0].status, "completed");
    assert.deepEqual(refused, []);
    for (const t of LOCKED) {
      const ids = rows(t).map((x) => x.legacy_id).filter(Boolean);
      assert.equal(new Set(ids).size, ids.length, `no duplicate legacy ids in ${t}`);
    }
  });

  test("abandoned + now an unrepairable record → the resume is refused BEFORE taking the attempt (stays abandoned, nothing written)", async () => {
    let seen = 0;
    S.queryHook = (q) => (LOCKED.has(q.table) && q.op !== "select" && ++seen > 3 ? net() : prodColumnGuard(q));
    await upload();
    await quiet(() => A.abandonInterruptedDeviceUpload(UA, ref));
    const writes0 = attempts()[0].writes_count;
    S.queryHook = prodColumnGuard;
    localStorage.setItem(key(UA, "measurements"), JSON.stringify([...MEASUREMENTS, { id: "m-nodate" }]));
    const calls0 = S.calls.length;
    const r = await upload();
    assert.equal(r.ok, false);
    assert.equal(r.dataBlockers[0].kind, "measurement_date");
    assert.match(r.error, /przerwanego przenoszenia nie można teraz dokończyć/, "resume wording never claims nothing was sent");
    assert.equal(attempts()[0].status, "abandoned", "not resumed");
    assert.equal(attempts()[0].writes_count, writes0);
    assert.deepEqual(cloudWrites({ calls: S.calls.slice(calls0) }), []);
    assert.equal(S.calls.slice(calls0).filter((c) => c.kind === "rpc" && /resume|start/.test(c.fn || "")).length, 0);
  });
});

describe("Etap 11 — guest → account and the manual tool stop before the attempt", () => {
  test("guest data with a measurement without a date → blocked 'invalid_data': no attempt, no backup marker, guest data untouched", async () => {
    setup({ ns: null, measurements: [{ id: "g-m", weight: "70" }] });
    const before = snapshot(null);
    const r = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r.ok, false);
    assert.equal(r.blocked, "invalid_data");
    assert.equal(attempts().length, 0);
    assert.equal(A.getGuestMigrationMarker(), null);
    assert.equal(A.getAccountInitMarker(UA), null);
    assert.equal(snapshot(null), before);
  });
  test("guest old data (no restSeconds, no summaries) migrates completely under the production rules", async () => {
    setup({ ns: null });
    const r = await quiet(() => A.migrateGuestToEmptyAccount(UA, ref));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(refused, []);
    assert.equal(attempts()[0].status, "completed");
    assert.equal("rest_seconds" in rowBy("nextrep_plan_items", "pi-norest"), false);
  });
  test("manual tool: damaged local data → refused before its server attempt (no empty attempt left open)", async () => {
    setup();
    localStorage.setItem(key(UA, "history"), JSON.stringify([{ date: "2026-09-01T10:00:00.000Z" }])); // a workout without id
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const r = await quiet(() => A.runManualMigrationV1());
    assert.equal(r.success, false);
    assert.match(r.error, /uszkodzone/);
    assert.equal(attempts().length, 0);
  });
  test("manual tool: unrepairable data → refused before its server attempt", async () => {
    setup({ measurements: [{ id: "m-x", date: "nie data" }] });
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
    const r = await quiet(() => A.runManualMigrationV1());
    assert.equal(r.success, false);
    assert.equal(r.dataBlockers[0].kind, "measurement_date");
    assert.equal(attempts().length, 0);
  });
});

describe("Etap 11 — sync queue", () => {
  async function readyWithCloud() {
    const r = await upload();
    assert.equal(r.ok, true, r.error);
    A.setAccountInitMarker(UA, { status: "ready", source: "device", syncPaused: false });
  }
  test("a plan item without restSeconds pushes (insert leaves the column out) — no permanent failure", async () => {
    await readyWithCloud();
    const plans = JSON.parse(raw(UA, "plans"));
    plans[0].exercises.push({ id: "pi-sync", exerciseId: "bench_press", setsDetail: [{ id: "pis-sync", target: "8", rir: "" }] });
    localStorage.setItem(key(UA, "plans"), JSON.stringify(plans));
    A.enqueueSyncChange({ table: "plan_items", recordId: "pi-sync", operation: "upsert", version: 1, deviceId: DEV_A });
    const s = await quiet(() => A.runSync());
    assert.equal(s.started, true, s.message);
    assert.deepEqual(refused, []);
    assert.ok(rowBy("nextrep_plan_items", "pi-sync"), "inserted");
    assert.equal("rest_seconds" in rowBy("nextrep_plan_items", "pi-sync"), false);
    assert.equal(A.loadSyncQueue().filter((q) => q.recordId === "pi-sync").length, 0, "queue item done");
  });
  test("UPDATE never overwrites an existing cloud value with 'unknown' (another device set 120 s; this device has none)", async () => {
    await readyWithCloud();
    rowBy("nextrep_plan_items", "pi-norest").rest_seconds = 120; // set elsewhere
    rowBy("nextrep_plan_items", "pi-norest").version = 1;
    A.enqueueSyncChange({ table: "plan_items", recordId: "pi-norest", operation: "upsert", version: 2, deviceId: DEV_A });
    const s = await quiet(() => A.runSync());
    assert.equal(s.started, true, s.message);
    assert.deepEqual(refused, []);
    assert.equal(rowBy("nextrep_plan_items", "pi-norest").rest_seconds, 120, "kept");
  });
  test("a measurement without a date in the queue: refused by the server, the item is KEPT (no data lost), other items still sync", async () => {
    await readyWithCloud();
    const ms = [...MEASUREMENTS, { id: "m-late" }];
    localStorage.setItem(key(UA, "measurements"), JSON.stringify(ms));
    A.enqueueSyncChange({ table: "measurements", recordId: "m-late", operation: "upsert", version: 1, deviceId: DEV_A });
    const plans = JSON.parse(raw(UA, "plans"));
    plans[0].name = "Zmieniona nazwa";
    localStorage.setItem(key(UA, "plans"), JSON.stringify(plans));
    A.enqueueSyncChange({ table: "plans", recordId: "p-old", operation: "upsert", version: 2, deviceId: DEV_A });
    await quiet(() => A.runSync());
    A.cancelAllScheduledSyncRetries();
    assert.ok(A.loadSyncQueue().some((q) => q.recordId === "m-late"), "the change waits — nothing invented, nothing dropped");
    assert.equal(rowBy("nextrep_measurements", "m-late"), undefined);
    assert.equal(rowBy("nextrep_plans", "p-old").name, "Zmieniona nazwa");
    assert.equal(raw(UA, "measurements"), JSON.stringify(ms), "local record unchanged");
  });
});
