// B02 / S2 — Smith machine (B02-D25 A): load model smith_plates_only, optional starting resistance R
// as a per-person exercise setting, snapshot v3, P + R / P calculation, missing-R notice.
// Everything goes through the real engine (load.js, load-snapshot.js, atlas validator) and the real
// SQL draft in an in-process Postgres (PGlite) — no mocks of the rules.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  LOAD_MODELS, normalizeLoad, exerciseTotals, sessionTotals, combineVolumeStatuses, hasClassicKg,
  SMITH_STARTING_RESISTANCE_MISSING, LOAD_NOTICE_MESSAGES,
} from "../../src/engine/load.js";
import {
  buildLoadSnapshot, validateLoadSnapshot, modelFromSnapshot, snapshotToRow, rowToSnapshot, correctLoadSnapshot,
  SNAPSHOT_FIELDS, LOAD_SNAPSHOT_VERSION, LOAD_SNAPSHOT_VERSIONS,
} from "../../src/engine/load-snapshot.js";
import {
  parseStartingResistanceInput, validateExerciseSettings, startingResistanceForSnapshot, supportsStartingResistance,
  createMemoryExerciseSettingsStore, STARTING_RESISTANCE_LIMITS,
} from "../../src/engine/exercise-settings.js";
import { MEASUREMENT_TYPES, LOAD_MODEL_CODES } from "../../src/engine/atlas-schema.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { loadModelOptions, comparabilityKey } from "../../src/engine/load-model-options.js";
import { allowedSetFields, validateWorkoutSet } from "../../src/nr1/contracts/set.js";
import { SQL_PATH, generateSnapshotSql } from "../../tools/gen-snapshot-sql.mjs";

const ATLAS = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const clone = (x) => structuredClone(x);
const NOW = "2026-10-19T08:00:00.000Z";
const LATER = "2026-10-26T08:00:00.000Z";
const SMITH_ID = "test_smith_bench_flat";

// The real Batch 01 atlas + a SYNTHETIC Smith exercise (test only — never written to the repository).
function smithAtlas() {
  const a = clone(ATLAS);
  a.dictionaries.equipment.push({ code: "test_smith_machine", labelPl: "Maszyna Smitha (test)", role: "load", loadModels: ["smith_plates_only"], status: "active" });
  const base = a.exercises.find((x) => x.loadModel === "barbell_total" && x.familyId && x.equipment.includes("bench")) || a.exercises.find((x) => x.loadModel === "barbell_total");
  const ex = { ...clone(base), exerciseId: SMITH_ID, namePl: "Wyciskanie na maszynie Smitha (test)", aliasesPl: [], equipment: ["test_smith_machine", ...base.equipment.filter((c) => c !== "barbell")], loadModel: "smith_plates_only", implements: null, loadIncrementKg: 2.5 };
  a.exercises.push(ex);
  a.issuedIds.push(SMITH_ID);
  return a;
}
const SA = smithAtlas();
const SMITH = SA.exercises.find((x) => x.exerciseId === SMITH_ID);
const BARBELL = SA.exercises.find((x) => x.loadModel === "barbell_total");
const atlasSnap = (exercise, extra = {}) => buildLoadSnapshot({ exercise, atlasVersion: 1, now: NOW, equipment: SA, ...extra });
const set = (loadKg, reps, extra = {}) => ({ loadKg, reps, setType: "working", status: "done", ...extra });
const smithModel = (r) => ({ loadModel: "smith_plates_only", laterality: "bilateral", repsCounting: "total", confidence: "verified", startingResistanceKg: r });

describe("S2 — smith_plates_only is part of every contract", () => {
  test("load model, measurement type, atlas codes, snapshot values and the generated SQL", () => {
    assert.deepEqual(LOAD_MODELS.smith_plates_only, { kg: "plates", unit: "kg", implements: 1 });
    assert.ok(MEASUREMENT_TYPES.weight_reps.loadModels.includes("smith_plates_only"));
    assert.ok(LOAD_MODEL_CODES.includes("smith_plates_only"));
    assert.ok(SNAPSHOT_FIELDS.find((f) => f.name === "loadModel").values.includes("smith_plates_only"));
    assert.ok(hasClassicKg(smithModel(null)));
    const sql = readFileSync(SQL_PATH, "utf8");
    assert.equal(sql, generateSnapshotSql());
    assert.match(sql, /load_model in \([^)]*'smith_plates_only'/);
    assert.match(sql, /add column starting_resistance_kg numeric,/);
    assert.match(sql, /add column starting_resistance_status text check \(starting_resistance_status in \('known', 'unknown'\)\)/);
  });
  test("the validator accepts a Smith exercise on Smith equipment (0 errors, increment allowed)", () => {
    const r = validateAtlas(SA);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.ok(!r.issues.some((i) => i.exerciseId === SMITH_ID && i.level !== "info" && i.code !== "FAMILY_SINGLE_EXERCISE"), JSON.stringify(r.issues.filter((i) => i.exerciseId === SMITH_ID)));
  });
  test("the repository atlas: S2 imported nothing; the only Smith records are the three approved in B02-S5", () => {
    // S2 itself added no atlas content (the test Smith record and equipment live only in memory) …
    assert.ok(!ATLAS.exercises.some((x) => x.exerciseId === SMITH_ID) && !ATLAS.dictionaries.equipment.some((e) => e.code === "test_smith_machine"));
    // … and since B02-S5 the atlas holds exactly the three approved Smith exercises on the Smith equipment
    const smith = ATLAS.exercises.filter((x) => x.loadModel === "smith_plates_only");
    assert.deepEqual(smith.map((x) => x.exerciseId).sort(), ["bench_press_smith_decline", "bench_press_smith_flat", "bench_press_smith_incline"]);
    assert.ok(smith.every((x) => x.approvedIn === "NEXTREP-B02-S5-A-2026-10-22" && x.equipment.includes("smith_machine")));
    assert.deepEqual(ATLAS.dictionaries.equipment.filter((e) => (e.loadModels || []).includes("smith_plates_only")).map((e) => [e.code, e.loadModels]), [["smith_machine", ["smith_plates_only"]]]);
    // R is a per-person card setting, never an atlas field
    assert.ok(smith.every((x) => !("startingResistanceKg" in x)));
  });
  test("Smith is not a machine stack/plates choice (B02-D21): its only model is its own", () => {
    const o = loadModelOptions(SMITH, SA);
    assert.deepEqual([o.choice, [...o.options]], [false, ["smith_plates_only"]]);
  });
  test("nr1 set contract: a Smith set stores loadKg (= P) and reps", () => {
    assert.deepEqual(allowedSetFields("smith_plates_only"), ["reps", "loadKg", "rir"]);
    assert.deepEqual(validateWorkoutSet({ id: "s1", setType: "working", status: "done", reps: 10, loadKg: 40, rir: null }, atlasSnap(SMITH)), []);
  });
});

describe("S2 — calculation: P + R or P, always in the main volume", () => {
  test("P = 40, n = 10, R = 15 → 55 kg per rep, 550 kg volume, exact, no missing R", () => {
    const n = normalizeLoad(set(40, 10), smithModel(15));
    assert.deepEqual([n.platesKg, n.startingResistanceKg, n.effectiveLoadKg, n.externalKg, n.volumeKg], [40, 15, 55, 55, 550]);
    const t = exerciseTotals([set(40, 10)], smithModel(15));
    assert.deepEqual([t.volumeKg, t.volumeStatus, t.loadBasis, t.startingResistanceMissing, t.topExternalKg, t.topPlatesKg], [550, "exact", "plates_plus_starting_resistance", false, 55, 40]);
  });
  test("R = null → 40 kg per rep, 400 kg volume, status plates_only (never a plain exact), R missing", () => {
    const n = normalizeLoad(set(40, 10), smithModel(null));
    assert.deepEqual([n.platesKg, n.startingResistanceKg, n.effectiveLoadKg, n.volumeKg], [40, null, 40, 400]);
    const t = exerciseTotals([set(40, 10)], smithModel(null));
    assert.deepEqual([t.volumeKg, t.volumeStatus, t.loadBasis, t.startingResistanceMissing], [400, "plates_only", "plates_only", true]);
  });
  test("R = 0 → 400 kg, exact, no missing-R warning (a stated zero is not a missing value)", () => {
    const t = exerciseTotals([set(40, 10)], smithModel(0));
    assert.deepEqual([t.volumeKg, t.volumeStatus, t.startingResistanceMissing, t.startingResistanceKg], [400, "exact", false, 0]);
  });
  test("decimals and P = 0 (bar only): 0 + 17.5 = 17.5 per rep; no typed P → no load", () => {
    assert.equal(normalizeLoad(set(0, 10), smithModel(17.5)).volumeKg, 175);
    assert.equal(normalizeLoad(set("22,5", 8), smithModel(7.5)).volumeKg, 240);
    assert.deepEqual([normalizeLoad(set(null, 10), smithModel(15)).effectiveLoadKg, normalizeLoad(set(null, 10), smithModel(15)).volumeKg], [0, 0]);
  });
  test("an invalid R in a model is treated as unknown, never as a number (NaN, -1, '15', Infinity)", () => {
    for (const r of [NaN, -1, "15", Infinity, undefined]) {
      const t = exerciseTotals([set(40, 10)], smithModel(r));
      assert.deepEqual([t.volumeKg, t.volumeStatus], [400, "plates_only"], String(r));
    }
  });
  test("R is ignored by every other model (barbell_total is never reinterpreted)", () => {
    const t = exerciseTotals([set(40, 10)], { loadModel: "barbell_total", confidence: "verified", startingResistanceKg: 15 });
    assert.deepEqual([t.volumeKg, t.volumeStatus, t.loadBasis, t.startingResistanceMissing], [400, "exact", null, false]);
    assert.equal(normalizeLoad(set(40, 10), { loadModel: "barbell_total", startingResistanceKg: 15 }).platesKg, null);
  });
  test("warm-ups and skipped sets add nothing; dropsets count, as for every model", () => {
    const t = exerciseTotals([set(40, 10), set(20, 10, { setType: "warmup" }), set(40, 5, { status: "skipped" }), set(30, 5, { setType: "dropset" })], smithModel(10));
    assert.deepEqual([t.workingSets, t.volumeKg], [2, 500 + 200]);
  });
  test("combineVolumeStatuses: unavailable > estimated > plates_only > exact > none", () => {
    assert.equal(combineVolumeStatuses(["exact", "plates_only"]), "plates_only");
    assert.equal(combineVolumeStatuses(["plates_only", "estimated"]), "estimated");
    assert.equal(combineVolumeStatuses(["plates_only", "unavailable"]), "partial");
    assert.equal(combineVolumeStatuses(["exact"]), "exact");
    assert.equal(combineVolumeStatuses([]), "none");
  });
});

describe("S2 — sessionTotals: Smith counts in volumeKg; the notice only for a performed Smith exercise without R", () => {
  const resolve = (ex) => modelFromSnapshot(ex.loadSnapshot);
  const entry = (snapshot, sets) => ({ exerciseId: snapshot.catalogExerciseId, loadSnapshot: snapshot, sets });
  test("without R: 400 kg included, status plates_only, one notice with the approved message", () => {
    const s = sessionTotals({ exercises: [entry(atlasSnap(BARBELL), [set(60, 5)]), entry(atlasSnap(SMITH), [set(40, 10)])] }, resolve);
    assert.deepEqual([s.volumeKg, s.volumeStatus], [300 + 400, "plates_only"]);
    assert.deepEqual(s.notices, [{ code: SMITH_STARTING_RESISTANCE_MISSING, exerciseId: SMITH_ID, message: LOAD_NOTICE_MESSAGES[SMITH_STARTING_RESISTANCE_MISSING] }]);
    assert.match(s.notices[0].message, /liczono same talerze/);
    assert.match(s.notices[0].message, /karcie ćwiczenia/);
  });
  test("with R = 15: 550 kg included, status exact, no notice; R = 0: 400 kg, no notice", () => {
    const s = sessionTotals({ exercises: [entry(atlasSnap(BARBELL), [set(60, 5)]), entry(atlasSnap(SMITH, { startingResistanceKg: 15 }), [set(40, 10)])] }, resolve);
    assert.deepEqual([s.volumeKg, s.volumeStatus, s.notices], [300 + 550, "exact", []]);
    const z = sessionTotals({ exercises: [entry(atlasSnap(SMITH, { startingResistanceKg: 0 }), [set(40, 10)])] }, resolve);
    assert.deepEqual([z.volumeKg, z.volumeStatus, z.notices], [400, "exact", []]);
  });
  test("no notice when the Smith exercise was not performed (no reps, only warm-ups, skipped)", () => {
    for (const sets of [[], [set(40, 0)], [set(40, 10, { setType: "warmup" })], [set(40, 10, { status: "skipped" })]]) {
      const s = sessionTotals({ exercises: [entry(atlasSnap(SMITH), sets)] }, resolve);
      assert.deepEqual(s.notices, [], JSON.stringify(sets));
    }
  });
  test("no notice for any other model, including B02-D21 stack/plates", () => {
    const s = sessionTotals({ exercises: [entry(atlasSnap(BARBELL), [set(60, 5)])] }, () => ({ loadModel: "plate_loaded", confidence: "verified" }));
    assert.deepEqual(s.notices, []);
  });
});

describe("S2 — exercise setting R: input, validation, store", () => {
  test("parser: empty → null (unknown, NOT 0); 0, 15, '7,5', '7.5' accepted", () => {
    for (const raw of ["", "   ", null, undefined]) assert.deepEqual(parseStartingResistanceInput(raw), { ok: true, value: null, code: null }, String(raw));
    assert.equal(parseStartingResistanceInput("0").value, 0);
    assert.equal(parseStartingResistanceInput(0).value, 0);
    assert.equal(parseStartingResistanceInput("15").value, 15);
    assert.equal(parseStartingResistanceInput("7,5").value, 7.5);
    assert.equal(parseStartingResistanceInput(" 7.5 ").value, 7.5);
  });
  test("parser rejects negative, NaN, Infinity, non-numeric text and implausible values", () => {
    for (const raw of [-1, "-1", NaN, Infinity, -Infinity, "abc", "15kg", "1e3", "7,5,1"]) assert.deepEqual(parseStartingResistanceInput(raw), { ok: false, value: null, code: "STARTING_RESISTANCE_INVALID" }, String(raw));
    assert.equal(parseStartingResistanceInput(STARTING_RESISTANCE_LIMITS.maxKg + 1).code, "STARTING_RESISTANCE_TOO_LARGE");
    assert.equal(parseStartingResistanceInput("1,2345").code, "STARTING_RESISTANCE_TOO_LARGE");
  });
  test("validateExerciseSettings: closed shape, number ≥ 0 or null, only for a Smith exercise", () => {
    assert.deepEqual(validateExerciseSettings({ startingResistanceKg: 15 }, SMITH), []);
    assert.deepEqual(validateExerciseSettings({ startingResistanceKg: null }, SMITH), []);
    assert.deepEqual(validateExerciseSettings({}, SMITH), []);
    assert.deepEqual(validateExerciseSettings({ startingResistanceKg: 0 }, SMITH), []);
    for (const bad of [NaN, -1, Infinity, "15"]) assert.deepEqual(validateExerciseSettings({ startingResistanceKg: bad }, SMITH).map((e) => e.code), ["STARTING_RESISTANCE_INVALID"], String(bad));
    assert.deepEqual(validateExerciseSettings({ startingResistanceKg: 15 }, BARBELL).map((e) => e.code), ["STARTING_RESISTANCE_NOT_APPLICABLE"]);
    assert.deepEqual(validateExerciseSettings({ startingResistance: 15 }, SMITH).map((e) => e.code), ["SETTING_UNKNOWN_FIELD"]);
    assert.deepEqual(validateExerciseSettings(null, SMITH).map((e) => e.code), ["SETTINGS_INVALID"]);
    assert.ok(supportsStartingResistance(SMITH) && !supportsStartingResistance(BARBELL));
  });
  test("startingResistanceForSnapshot: the setting or null (missing never becomes 0)", () => {
    assert.equal(startingResistanceForSnapshot(SMITH, { startingResistanceKg: 15 }), 15);
    assert.equal(startingResistanceForSnapshot(SMITH, { startingResistanceKg: 0 }), 0);
    assert.equal(startingResistanceForSnapshot(SMITH, {}), null);
    assert.equal(startingResistanceForSnapshot(SMITH, undefined), null);
    assert.equal(startingResistanceForSnapshot(BARBELL, { startingResistanceKg: 15 }), null);
  });
  test("store: values are copied, validated, never shared; the atlas record is never changed", () => {
    const before = clone(SMITH);
    const store = createMemoryExerciseSettingsStore();
    assert.deepEqual({ ...store.get(SMITH_ID) }, {});
    assert.deepEqual(store.set(SMITH_ID, { startingResistanceKg: -5 }, SMITH).errors.map((e) => e.code), ["STARTING_RESISTANCE_INVALID"]);
    const input = { startingResistanceKg: 15 };
    assert.equal(store.set(SMITH_ID, input, SMITH).ok, true);
    input.startingResistanceKg = 99;
    assert.equal(store.get(SMITH_ID).startingResistanceKg, 15);
    assert.ok(Object.isFrozen(store.get(SMITH_ID)));
    store.clear(SMITH_ID);
    assert.deepEqual({ ...store.get(SMITH_ID) }, {});
    assert.deepEqual(SMITH, before);
    assert.equal(store.kind, "memory");
  });
});

describe("S2 — two workouts of the same exercise: history never changes after a card edit", () => {
  test("old R = null, new R = 15; editing the setting later changes neither snapshot, volume nor notice", () => {
    const store = createMemoryExerciseSettingsStore();
    const snapAt = (now) => buildLoadSnapshot({ exercise: SMITH, atlasVersion: 1, now, equipment: SA, startingResistanceKg: startingResistanceForSnapshot(SMITH, store.get(SMITH_ID)) });
    const w1 = { exercises: [{ exerciseId: SMITH_ID, loadSnapshot: snapAt(NOW), sets: [set(40, 10)] }] };
    store.set(SMITH_ID, { startingResistanceKg: 15 }, SMITH);
    const w2 = { exercises: [{ exerciseId: SMITH_ID, loadSnapshot: snapAt(LATER), sets: [set(40, 10)] }] };
    const frozen1 = clone(w1);
    const frozen2 = clone(w2);
    const resolve = (ex) => modelFromSnapshot(ex.loadSnapshot);
    const t1 = sessionTotals(w1, resolve);
    const t2 = sessionTotals(w2, resolve);
    assert.deepEqual([w1.exercises[0].loadSnapshot.startingResistanceKg, w1.exercises[0].loadSnapshot.startingResistanceStatus], [null, "unknown"]);
    assert.deepEqual([w2.exercises[0].loadSnapshot.startingResistanceKg, w2.exercises[0].loadSnapshot.startingResistanceStatus], [15, "known"]);
    assert.deepEqual([t1.volumeKg, t1.volumeStatus, t1.notices.length], [400, "plates_only", 1]);
    assert.deepEqual([t2.volumeKg, t2.volumeStatus, t2.notices.length], [550, "exact", 0]);
    // the person edits the card (new machine): R = 20, then removes it
    store.set(SMITH_ID, { startingResistanceKg: 20 }, SMITH);
    store.set(SMITH_ID, { startingResistanceKg: null }, SMITH);
    assert.deepEqual(w1, frozen1);
    assert.deepEqual(w2, frozen2);
    assert.deepEqual(sessionTotals(w1, resolve), t1);
    assert.deepEqual(sessionTotals(w2, resolve), t2);
    // P and R stay separate in the stored data: the plates typed are the same 40 in both workouts
    assert.equal(w1.exercises[0].sets[0].loadKg, w2.exercises[0].sets[0].loadKg);
    assert.deepEqual([t1.exercises[0].totals.topPlatesKg, t2.exercises[0].totals.topPlatesKg], [40, 40]);
    // same comparability key (approved format exerciseId|loadModel|entryRev) — see report: PE-B decision
    assert.equal(comparabilityKey(w1.exercises[0].loadSnapshot), comparabilityKey(w2.exercises[0].loadSnapshot));
  });
});

describe("S2 — snapshot v3: R columns, versions, validator", () => {
  test("new snapshots are v3; Smith has an explicit status; other models have no R columns", () => {
    assert.equal(LOAD_SNAPSHOT_VERSION, 3);
    assert.deepEqual(LOAD_SNAPSHOT_VERSIONS, [2, 3]);
    const u = atlasSnap(SMITH);
    const k = atlasSnap(SMITH, { startingResistanceKg: 15 });
    const z = atlasSnap(SMITH, { startingResistanceKg: 0 });
    const b = atlasSnap(BARBELL);
    assert.deepEqual([u.snapshotVersion, u.startingResistanceKg, u.startingResistanceStatus], [3, null, "unknown"]);
    assert.deepEqual([k.startingResistanceKg, k.startingResistanceStatus], [15, "known"]);
    assert.deepEqual([z.startingResistanceKg, z.startingResistanceStatus], [0, "known"]);
    assert.deepEqual([b.startingResistanceKg, b.startingResistanceStatus], [null, null]);
    for (const s of [u, k, z, b]) assert.deepEqual(validateLoadSnapshot(s), []);
    assert.equal(modelFromSnapshot(k).startingResistanceKg, 15);
    assert.equal(modelFromSnapshot(u).startingResistanceKg, null);
  });
  test("buildLoadSnapshot refuses R for a non-Smith model and an invalid R", () => {
    assert.throws(() => atlasSnap(BARBELL, { startingResistanceKg: 15 }), /STARTING_RESISTANCE_NOT_APPLICABLE/);
    for (const r of [NaN, -1, Infinity, "15"]) assert.throws(() => atlasSnap(SMITH, { startingResistanceKg: r }), /STARTING_RESISTANCE_INVALID/, String(r));
  });
  test("validator rejects inconsistent R columns (ws_starting_resistance)", () => {
    const k = atlasSnap(SMITH, { startingResistanceKg: 15 });
    const bad = (mut) => { const s = clone(k); mut(s); return validateLoadSnapshot(s).map((e) => e.code); };
    assert.ok(bad((s) => { s.startingResistanceStatus = null; }).includes("ws_starting_resistance"));
    assert.ok(bad((s) => { s.startingResistanceKg = null; }).includes("ws_starting_resistance"));
    assert.ok(bad((s) => { s.startingResistanceStatus = "unknown"; }).includes("ws_starting_resistance"));
    assert.ok(bad((s) => { s.startingResistanceKg = -1; }).includes("ws_starting_resistance"));
    assert.ok(bad((s) => { s.startingResistanceStatus = "maybe"; }).includes("VALUE"));
    assert.ok(bad((s) => { s.startingResistanceKg = NaN; }).includes("TYPE"));
    const b = atlasSnap(BARBELL);
    assert.ok(validateLoadSnapshot({ ...b, startingResistanceKg: 15, startingResistanceStatus: "known" }).map((e) => e.code).includes("ws_starting_resistance"));
    assert.ok(validateLoadSnapshot({ ...b, startingResistanceStatus: "unknown" }).map((e) => e.code).includes("ws_starting_resistance"));
  });
  test("version 2 stays readable without migration: a v2 snapshot without R columns is valid; a v2 Smith snapshot is not", () => {
    const v2 = clone(atlasSnap(BARBELL));
    v2.snapshotVersion = 2;
    delete v2.startingResistanceKg;
    delete v2.startingResistanceStatus;
    assert.deepEqual(validateLoadSnapshot(v2), []);
    assert.deepEqual(exerciseTotals([set(60, 5)], modelFromSnapshot(v2)).volumeKg, 300);
    const v2smith = { ...atlasSnap(SMITH), snapshotVersion: 2 };
    assert.ok(validateLoadSnapshot(v2smith).map((e) => e.code).includes("ws_snapshot_version_fields"));
  });
  test("roundtrip snapshot ↔ row is lossless and keeps P (sets) and R (snapshot) separate", () => {
    for (const s of [atlasSnap(SMITH), atlasSnap(SMITH, { startingResistanceKg: 15 }), atlasSnap(SMITH, { startingResistanceKg: 0 }), atlasSnap(BARBELL)]) {
      const row = snapshotToRow(s);
      assert.ok("starting_resistance_kg" in row && "starting_resistance_status" in row);
      assert.deepEqual(rowToSnapshot(row), s);
    }
    assert.equal(rowToSnapshot({ ...snapshotToRow(atlasSnap(SMITH, { startingResistanceKg: 7.5 })), starting_resistance_kg: "7.5" }).startingResistanceKg, 7.5, "numeric from the database");
  });
  test("correction (F2-5): leaving Smith drops R; entering Smith gives 'unknown' (never a guessed R)", () => {
    const k = atlasSnap(SMITH, { startingResistanceKg: 15 });
    const toPlates = correctLoadSnapshot(k, { loadModel: "plate_loaded" }, { reason: "Pomyłka sprzętu", now: LATER }).snapshot;
    assert.deepEqual([toPlates.startingResistanceKg, toPlates.startingResistanceStatus, toPlates.snapshotVersion], [null, null, 3]);
    const keep = correctLoadSnapshot(k, { laterality: "bilateral" }, { reason: "Bez zmiany modelu", now: LATER }).snapshot;
    assert.deepEqual([keep.startingResistanceKg, keep.startingResistanceStatus], [15, "known"]);
    const toSmith = correctLoadSnapshot(atlasSnap(BARBELL), { loadModel: "smith_plates_only" }, { reason: "To był Smith", now: LATER }).snapshot;
    assert.deepEqual([toSmith.startingResistanceKg, toSmith.startingResistanceStatus], [null, "unknown"]);
    assert.deepEqual(validateLoadSnapshot(toSmith), []);
  });
});

describe("S2 — SQL draft ↔ engine: same rows accepted and rejected (PGlite)", () => {
  let db;
  const cols = SNAPSHOT_FIELDS.map((f) => f.column);
  const insert = async (s) => {
    const row = snapshotToRow(s);
    await db.exec("savepoint s");
    try {
      await db.query(`insert into workout_exercises (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c]));
      await db.exec("release savepoint s");
      return { ok: true };
    } catch (e) {
      await db.exec("rollback to savepoint s");
      return { ok: false, error: e.message };
    }
  };
  before(async () => {
    db = await PGlite.create();
    await db.exec("create table workout_exercises (id uuid primary key default gen_random_uuid());");
    await db.exec(readFileSync(SQL_PATH, "utf8"));
    await db.exec("begin");
  });
  after(async () => { if (db) await db.close(); });
  test("valid Smith and non-Smith snapshots are accepted", async () => {
    for (const s of [atlasSnap(SMITH), atlasSnap(SMITH, { startingResistanceKg: 15 }), atlasSnap(SMITH, { startingResistanceKg: 0 }), atlasSnap(BARBELL)]) {
      const r = await insert(s);
      assert.ok(r.ok, r.error);
    }
  });
  test("400 random mutations of the R columns, model and version: engine valid ⇔ database accepts", async () => {
    let s0 = 11;
    const rnd = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const bases = [atlasSnap(SMITH), atlasSnap(SMITH, { startingResistanceKg: 15 }), atlasSnap(BARBELL)];
    const pools = {
      startingResistanceKg: [null, 0, 15, 7.5, -1, 1000],
      startingResistanceStatus: [null, "known", "unknown"],
      loadModel: ["smith_plates_only", "barbell_total", "plate_loaded"],
      snapshotVersion: [2, 3, 1],
      measurementType: ["weight_reps", "band_reps", null],
    };
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < 400; i++) {
      const s = clone(pick(bases));
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) { const f = pick(Object.keys(pools)); s[f] = pick(pools[f]); }
      const engineOk = validateLoadSnapshot(s).length === 0;
      const dbRes = await insert(s);
      assert.equal(dbRes.ok, engineOk, `mismatch on ${JSON.stringify(s)}: engine ${JSON.stringify(validateLoadSnapshot(s))}, db ${dbRes.error || "accepted"}`);
      if (engineOk) accepted++; else rejected++;
    }
    assert.ok(accepted > 40 && rejected > 100, `coverage: ${accepted} accepted, ${rejected} rejected`);
  });
  test("the database refuses NaN and Infinity for R (the engine refuses them as TYPE)", async () => {
    for (const v of ["NaN", "Infinity"]) {
      const row = snapshotToRow(atlasSnap(SMITH, { startingResistanceKg: 15 }));
      row.starting_resistance_kg = v;
      await db.exec("savepoint n");
      await assert.rejects(db.query(`insert into workout_exercises (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c])), /ws_starting_resistance/, v);
      await db.exec("rollback to savepoint n");
    }
  });
});

describe("S2 — regressions of the other models", () => {
  test("B02-D21: stack 50 × 10 = 500, plates 50 × 10 = 500, both exact; separate comparability keys", () => {
    for (const m of ["machine_stack", "plate_loaded"]) {
      const t = exerciseTotals([set(50, 10)], { loadModel: m, confidence: "verified" });
      assert.deepEqual([t.volumeKg, t.volumeStatus, t.loadBasis], [500, "exact", null], m);
    }
    assert.notEqual(comparabilityKey({ exerciseId: "x", loadModel: "machine_stack", entryRev: 1 }), comparabilityKey({ exerciseId: "x", loadModel: "plate_loaded", entryRev: 1 }));
  });
  test("B02-D24: two-arm cable flyes — the sum of two stacks 15 + 15 = 30 × 12 = 360 kg", () => {
    const t = exerciseTotals([set(30, 12)], { loadModel: "cable", laterality: "bilateral", confidence: "verified" });
    assert.deepEqual([t.volumeKg, t.volumeStatus], [360, "exact"]);
  });
  test("barbell, dumbbell pair, unilateral per side, band and bodyweight unchanged", () => {
    assert.equal(exerciseTotals([set(60, 5)], { loadModel: "barbell_total", confidence: "verified" }).volumeKg, 300);
    assert.equal(exerciseTotals([set(20, 10)], { loadModel: "dumbbell_pair", confidence: "verified" }).volumeKg, 400);
    assert.equal(exerciseTotals([set(20, 10)], { loadModel: "cable", laterality: "unilateral", repsCounting: "per_side", confidence: "verified" }).volumeKg, 400);
    assert.deepEqual([exerciseTotals([set(null, 10)], { loadModel: "band", confidence: "verified" }).volumeStatus, exerciseTotals([set(null, 10)], { loadModel: "bodyweight", confidence: "verified" }).volumeStatus], ["none", "none"]);
    assert.deepEqual(sessionTotals({ exercises: [{ sets: [set(60, 5)] }] }, () => ({ loadModel: "barbell_total", confidence: "verified" })).notices, []);
  });
});
