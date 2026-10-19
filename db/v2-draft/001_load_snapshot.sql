-- NEXTREP 1.0 / schema v2 — DRAFT, NOT A MIGRATION. Applied nowhere (no Supabase project).
-- Load-model snapshot of an exercise in a workout (D13, F2-4, F2-5; version 2: AT3-D18 — muscles
-- frozen, no stats-group columns; hierarchy nodes are computed at read time; version 3: B02/S2 — Smith
-- starting resistance R and its explicit status). Generated from the contract
-- src/engine/load-snapshot.js (SNAPSHOT_FIELDS) by tools/gen-snapshot-sql.mjs; tests check that
-- every column and constraint matches the contract and that the database and validateLoadSnapshot()
-- accept and reject exactly the same rows. Constraint names = JS rule codes.
-- Expects the v2 table workout_exercises(id uuid primary key, …) to exist.

alter table workout_exercises
  add column load_snapshot_version smallint not null check (load_snapshot_version in (2, 3)),
  add column load_source text not null check (load_source in ('atlas', 'private', 'user_correction')),
  add column catalog_exercise_id text,
  add column private_exercise_id uuid,
  add column atlas_version integer,
  add column entry_rev integer not null,
  add column family_id text,
  add column measurement_type text check (measurement_type in ('weight_reps', 'bodyweight_reps', 'band_reps', 'time', 'cardio', 'sets_only')),
  add column load_model text not null check (load_model in ('barbell_total', 'dumbbell_pair', 'dumbbell_single', 'kettlebell_pair', 'kettlebell_single', 'machine_stack', 'plate_loaded', 'cable', 'smith_plates_only', 'external_unknown', 'bodyweight', 'bodyweight_plus', 'assisted', 'band', 'time', 'cardio', 'sets_only')),
  add column load_implements smallint check (load_implements in (1, 2)),
  add column laterality text not null check (laterality in ('bilateral', 'unilateral', 'alternating')),
  add column reps_counting text not null check (reps_counting in ('total', 'per_side')),
  add column load_increment_kg numeric,
  add column primary_muscles text[] not null,
  add column secondary_muscles text[] not null,
  add column weight_unit text not null check (weight_unit in ('kg')),
  add column load_confidence text not null check (load_confidence in ('verified', 'high', 'low', 'unknown')),
  add column volume_formula_version smallint not null check (volume_formula_version in (1)),
  add column load_captured_at timestamptz not null,
  add column load_correction_count integer not null,
  add column starting_resistance_kg numeric,
  add column starting_resistance_status text check (starting_resistance_status in ('known', 'unknown')),
  add constraint ws_exactly_one_exercise check (num_nonnulls(catalog_exercise_id, private_exercise_id) = 1),
  add constraint ws_atlas_source check (load_source <> 'atlas' or (catalog_exercise_id is not null and atlas_version is not null and load_confidence = 'verified')),
  add constraint ws_private_source check (load_source <> 'private' or private_exercise_id is not null),
  add constraint ws_bilateral_total check (laterality <> 'bilateral' or reps_counting = 'total'),
  add constraint ws_implements_model check ((load_model in ('dumbbell_pair', 'kettlebell_pair') and coalesce(load_implements, 0) = 2) or (load_model in ('dumbbell_single', 'kettlebell_single') and coalesce(load_implements, 0) = 1) or (load_model not in ('dumbbell_pair', 'kettlebell_pair', 'dumbbell_single', 'kettlebell_single') and load_implements is null)),
  add constraint ws_unknown_model_confidence check (load_model <> 'external_unknown' or load_confidence = 'unknown'),
  add constraint ws_load_increment check (load_increment_kg is null or (load_increment_kg > 0 and load_model in ('barbell_total', 'dumbbell_pair', 'dumbbell_single', 'kettlebell_pair', 'kettlebell_single', 'machine_stack', 'plate_loaded', 'cable', 'smith_plates_only', 'external_unknown', 'bodyweight_plus'))),
  add constraint ws_muscles_disjoint check (not (primary_muscles && secondary_muscles)),
  add constraint ws_array_elements check (array_position(primary_muscles, null) is null and not ('' = any(primary_muscles))
      and array_position(secondary_muscles, null) is null and not ('' = any(secondary_muscles))),
  add constraint ws_primary_muscle check (coalesce(measurement_type = 'cardio', false) or cardinality(primary_muscles) >= 1),
  add constraint ws_entry_rev check (entry_rev >= 1),
  add constraint ws_atlas_version check (atlas_version is null or atlas_version >= 1),
  add constraint ws_correction_count check (load_correction_count >= 0 and ((load_source = 'user_correction') = (load_correction_count > 0))),
  add constraint ws_starting_resistance check ((load_model in ('smith_plates_only') and starting_resistance_status is not null and (starting_resistance_status = 'known') = (starting_resistance_kg is not null) and (starting_resistance_kg is null or (starting_resistance_kg >= 0 and starting_resistance_kg < 'Infinity'::numeric)))
      or (load_model not in ('smith_plates_only') and starting_resistance_status is null and starting_resistance_kg is null)),
  add constraint ws_snapshot_version_fields check (load_snapshot_version >= 3 or starting_resistance_status is null),
  add constraint ws_measurement_model check (measurement_type is null
      or (measurement_type = 'weight_reps' and load_model in ('barbell_total', 'dumbbell_pair', 'dumbbell_single', 'kettlebell_pair', 'kettlebell_single', 'machine_stack', 'plate_loaded', 'cable', 'smith_plates_only'))
      or (measurement_type = 'bodyweight_reps' and load_model in ('bodyweight', 'bodyweight_plus', 'assisted'))
      or (measurement_type = 'band_reps' and load_model in ('band'))
      or (measurement_type = 'time' and load_model in ('time'))
      or (measurement_type = 'cardio' and load_model in ('cardio'))
      or (measurement_type = 'sets_only' and load_model in ('sets_only')));

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
