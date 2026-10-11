// F2.1 — the database side of the snapshot contract. The SQL DRAFT (db/v2-draft/001_load_snapshot.sql)
// is run in an in-process Postgres (PGlite, WebAssembly — no server, no Supabase, no network) and
// compared with the engine contract: same columns and types, same constraints, and the database
// accepts and rejects exactly the rows validateLoadSnapshot() accepts and rejects.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { buildLoadSnapshot, validateLoadSnapshot, snapshotToRow, correctLoadSnapshot, SNAPSHOT_FIELDS } from "../../src/engine/load-snapshot.js";
import { generateSnapshotSql, SQL_PATH } from "../../tools/gen-snapshot-sql.mjs";
import { baseAtlas, clone } from "../fixtures/atlas/synthetic.mjs";

let db;
const atlas = baseAtlas();
const NOW = "2026-10-11T10:00:00.000Z";
const snapshots = atlas.exercises.map((e) => buildLoadSnapshot({ exercise: e, atlasVersion: 1, muscles: atlas.dictionaries.muscles, now: NOW }));
const cols = SNAPSHOT_FIELDS.map((f) => f.column);
async function insert(snapshot) {
  const row = snapshotToRow(snapshot);
  const sql = `insert into workout_exercises (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`;
  await db.exec("savepoint s");
  try {
    const r = await db.query(sql, cols.map((c) => row[c]));
    await db.exec("release savepoint s");
    return { ok: true, id: r.rows[0].id };
  } catch (e) {
    await db.exec("rollback to savepoint s");
    return { ok: false, error: e.message };
  }
}

before(async () => {
  db = await PGlite.create();
  await db.exec("create table workout_exercises (id uuid primary key default gen_random_uuid());");
  await db.exec(readFileSync(SQL_PATH, "utf8"));
  await db.exec("begin");
});
after(async () => {
  if (db) await db.close();
});

describe("SQL draft = engine contract", () => {
  test("the committed SQL is exactly what tools/gen-snapshot-sql.mjs generates from SNAPSHOT_FIELDS", () => {
    assert.equal(readFileSync(SQL_PATH, "utf8"), generateSnapshotSql());
    assert.match(readFileSync(SQL_PATH, "utf8"), /^-- NEXTREP 1\.0 \/ schema v2 — DRAFT, NOT A MIGRATION/);
  });
  test("columns, types and nullability match the contract", async () => {
    const r = await db.query("select column_name, data_type, udt_name, is_nullable from information_schema.columns where table_name = 'workout_exercises' and column_name <> 'id'");
    const typeOf = { smallint: "smallint", integer: "integer", text: "text", uuid: "uuid", numeric: "numeric", timestamptz: "timestamp with time zone", "text[]": "ARRAY" };
    const got = Object.fromEntries(r.rows.map((x) => [x.column_name, x]));
    assert.deepEqual(Object.keys(got).sort(), cols.slice().sort());
    for (const f of SNAPSHOT_FIELDS) {
      assert.equal(got[f.column].data_type, typeOf[f.sql], f.column);
      assert.equal(got[f.column].is_nullable === "YES", f.nullable, `${f.column} nullability`);
    }
  });
  test("every cross-field rule of the engine has a constraint of the same name (and back)", async () => {
    const js = [...readFileSync(new URL("../../src/engine/load-snapshot.js", import.meta.url), "utf8").matchAll(/e\("(ws_[a-z_]+)"/g)].map((m) => m[1]);
    const r = await db.query("select conname from pg_constraint where conrelid = 'workout_exercises'::regclass and conname like 'ws\\_%'");
    const sql = r.rows.map((x) => x.conname);
    assert.deepEqual([...new Set(js)].sort(), sql.filter((n) => n !== "ws_array_elements").sort());
    assert.ok(sql.includes("ws_array_elements")); // the SQL form of the engine's list TYPE check
  });
});

describe("database and engine accept and reject the same rows", () => {
  test("every valid synthetic snapshot is accepted", async () => {
    for (const s of snapshots) {
      assert.deepEqual(validateLoadSnapshot(s), []);
      const r = await insert(s);
      assert.ok(r.ok, r.error);
    }
  });
  test("600 random mutations: engine valid ⇔ database accepts", async () => {
    let s0 = 7;
    const r = () => ((s0 = (s0 * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const UUID = "00000000-0000-4000-8000-0000000000aa";
    const pools = {
      snapshotVersion: [1, 2, 0, null], source: ["atlas", "private", "user_correction", "custom", null],
      catalogExerciseId: ["test_press_bar", null, "x"], privateExerciseId: [UUID, null], atlasVersion: [1, 3, 0, null, -1],
      entryRev: [1, 2, 0, null], familyId: ["test_family_press", null], measurementType: ["weight_reps", "bodyweight_reps", "band_reps", "time", null, "weight"],
      loadModel: ["barbell_total", "dumbbell_pair", "dumbbell_single", "bodyweight", "band", "external_unknown", "time", null, "rocket"],
      implements: [1, 2, null, 3], laterality: ["bilateral", "unilateral", "alternating", null, "left"], repsCounting: ["total", "per_side", null],
      loadIncrementKg: [2.5, 0.5, null, 0, -1], primaryMuscles: [["test.m.chest_a"], [], ["test.m.chest_a", "test.m.back_a"], ["", "x"], [null]],
      secondaryMuscles: [[], ["test.m.triceps_a"], ["test.m.chest_a"]], primaryGroups: [["chest"], [], ["chest", "back"], ["legs"]],
      secondaryGroups: [[], ["triceps"], ["chest"], ["legs"]], weightUnit: ["kg", "lb", null], confidence: ["verified", "high", "low", "unknown", null, "sure"],
      volumeFormulaVersion: [1, 2, null], capturedAt: [NOW, null], correctionCount: [0, 1, 2, -1, null],
    };
    let accepted = 0;
    let rejected = 0;
    for (let i = 0; i < 600; i++) {
      const s = clone(pick(snapshots));
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const f = pick(Object.keys(pools));
        s[f] = clone(pick(pools[f]));
      }
      const engineOk = validateLoadSnapshot(s).length === 0;
      const dbRes = await insert(s);
      assert.equal(dbRes.ok, engineOk, `mismatch on ${JSON.stringify(s)}: engine ${JSON.stringify(validateLoadSnapshot(s))}, db ${dbRes.error || "accepted"}`);
      if (engineOk) accepted++;
      else rejected++;
    }
    assert.ok(accepted > 30 && rejected > 300, `coverage: ${accepted} accepted, ${rejected} rejected`);
  });
});

describe("correction history is append-only (F2-5)", () => {
  test("a correction is stored with both snapshots; update and delete are refused", async () => {
    const original = snapshots.find((s) => s.catalogExerciseId === "test_row_cable");
    const { snapshot, correction } = correctLoadSnapshot(original, { laterality: "unilateral", repsCounting: "per_side" }, { reason: "Testowa korekta", now: NOW });
    const row = await insert(snapshot);
    assert.ok(row.ok, row.error);
    const ins = await db.query("insert into workout_exercise_load_corrections (workout_exercise_id, previous_snapshot, new_snapshot, reason, corrected_at) values ($1, $2, $3, $4, $5) returning id", [row.id, JSON.stringify(correction.previousSnapshot), JSON.stringify(correction.newSnapshot), correction.reason, correction.correctedAt]);
    const id = ins.rows[0].id;
    for (const sql of ["update workout_exercise_load_corrections set reason = 'x' where id = $1", "delete from workout_exercise_load_corrections where id = $1"]) {
      await db.exec("savepoint c");
      await assert.rejects(db.query(sql, [id]), /append-only/);
      await db.exec("rollback to savepoint c");
    }
    const back = await db.query("select previous_snapshot, new_snapshot from workout_exercise_load_corrections where id = $1", [id]);
    assert.deepEqual(back.rows[0].previous_snapshot, original);
    assert.deepEqual(back.rows[0].new_snapshot, snapshot);
  });
});
