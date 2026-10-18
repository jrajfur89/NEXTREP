// F2.1 — generates db/v2-draft/001_load_snapshot.sql from the snapshot contract
// (src/engine/load-snapshot.js, SNAPSHOT_FIELDS) so the database and the engine cannot drift.
// `--check` only verifies that the committed file is what this tool produces (used by the tests).
// The output is a DRAFT for schema v2: it is not a migration and is applied nowhere.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SNAPSHOT_FIELDS } from "../src/engine/load-snapshot.js";
import { MEASUREMENT_TYPES } from "../src/engine/atlas-schema.js";
import { LOAD_MODELS } from "../src/engine/load.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SQL_PATH = resolve(root, "db/v2-draft/001_load_snapshot.sql");

const q = (v) => (typeof v === "number" ? String(v) : `'${v}'`);
const list = (xs) => xs.map(q).join(", ");

export function generateSnapshotSql() {
  const models = Object.keys(LOAD_MODELS);
  const pair = models.filter((m) => LOAD_MODELS[m].kg === "per_implement" && LOAD_MODELS[m].implements === 2);
  const single = models.filter((m) => LOAD_MODELS[m].kg === "per_implement" && LOAD_MODELS[m].implements === 1);
  const kg = models.filter((m) => ["total", "per_implement", "added"].includes(LOAD_MODELS[m].kg));
  const arrays = SNAPSHOT_FIELDS.filter((f) => f.sql === "text[]").map((f) => f.column);
  const columns = SNAPSHOT_FIELDS.map((f) => {
    let l = `  add column ${f.column} ${f.sql}${f.nullable ? "" : " not null"}`;
    if (f.values && f.sql !== "text[]") l += ` check (${f.column} in (${list(f.values)}))`;
    if (f.values && f.sql === "text[]") l += ` check (${f.column} <@ array[${list(f.values)}]::text[])`;
    return l;
  });
  const constraints = [
    ["ws_exactly_one_exercise", "num_nonnulls(catalog_exercise_id, private_exercise_id) = 1"],
    ["ws_atlas_source", "load_source <> 'atlas' or (catalog_exercise_id is not null and atlas_version is not null and load_confidence = 'verified')"],
    ["ws_private_source", "load_source <> 'private' or private_exercise_id is not null"],
    ["ws_bilateral_total", "laterality <> 'bilateral' or reps_counting = 'total'"],
    ["ws_implements_model", `(load_model in (${list(pair)}) and coalesce(load_implements, 0) = 2) or (load_model in (${list(single)}) and coalesce(load_implements, 0) = 1) or (load_model not in (${list([...pair, ...single])}) and load_implements is null)`],
    ["ws_unknown_model_confidence", "load_model <> 'external_unknown' or load_confidence = 'unknown'"],
    ["ws_load_increment", `load_increment_kg is null or (load_increment_kg > 0 and load_model in (${list(kg)}))`],
    ["ws_muscles_disjoint", "not (primary_muscles && secondary_muscles)"],
    ["ws_array_elements", arrays.map((c) => `array_position(${c}, null) is null and not ('' = any(${c}))`).join("\n      and ")],
    ["ws_primary_muscle", "coalesce(measurement_type = 'cardio', false) or cardinality(primary_muscles) >= 1"],
    ["ws_entry_rev", "entry_rev >= 1"],
    ["ws_atlas_version", "atlas_version is null or atlas_version >= 1"],
    ["ws_correction_count", "load_correction_count >= 0 and ((load_source = 'user_correction') = (load_correction_count > 0))"],
    ["ws_measurement_model", "measurement_type is null\n      or " + Object.entries(MEASUREMENT_TYPES).map(([k, v]) => `(measurement_type = ${q(k)} and load_model in (${list(v.loadModels)}))`).join("\n      or ")],
  ];
  return `-- NEXTREP 1.0 / schema v2 — DRAFT, NOT A MIGRATION. Applied nowhere (no Supabase project).
-- Load-model snapshot of an exercise in a workout (D13, F2-4, F2-5; version 2: AT3-D18 — muscles
-- frozen, no stats-group columns; hierarchy nodes are computed at read time). Generated from the contract
-- src/engine/load-snapshot.js (SNAPSHOT_FIELDS) by tools/gen-snapshot-sql.mjs; tests check that
-- every column and constraint matches the contract and that the database and validateLoadSnapshot()
-- accept and reject exactly the same rows. Constraint names = JS rule codes.
-- Expects the v2 table workout_exercises(id uuid primary key, …) to exist.

alter table workout_exercises
${columns.join(",\n")},
${constraints.map(([n, c]) => `  add constraint ${n} check (${c})`).join(",\n")};

-- Explicit user corrections of a finished workout (F2-5): append-only history of previous models.
create table workout_exercise_load_corrections (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  previous_snapshot jsonb not null,
  new_snapshot jsonb not null,
  reason text not null check (length(btrim(reason)) > 0),
  corrected_at timestamptz not null default now()
);

create function forbid_load_correction_change() returns trigger language plpgsql as $$
begin
  raise exception 'load corrections are append-only';
end $$;

create trigger load_corrections_append_only
  before update or delete on workout_exercise_load_corrections
  for each row execute function forbid_load_correction_change();
`;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const sql = generateSnapshotSql();
  if (process.argv.includes("--check")) {
    const ok = readFileSync(SQL_PATH, "utf8") === sql;
    console.log(ok ? "OK   db/v2-draft/001_load_snapshot.sql matches the contract" : "FAIL db/v2-draft/001_load_snapshot.sql differs — run node tools/gen-snapshot-sql.mjs");
    process.exit(ok ? 0 : 1);
  }
  mkdirSync(dirname(SQL_PATH), { recursive: true });
  writeFileSync(SQL_PATH, sql);
  console.log("[gen-snapshot-sql] db/v2-draft/001_load_snapshot.sql written");
}
