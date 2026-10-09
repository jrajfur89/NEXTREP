-- =====================================================================================================
-- NEXTREP — Stage 4A.4 F-5: ROLLBACK of nextrep_migration_read_guard_rls_4a4_v1.sql (restrictive RLS read guard)
-- Instant, no data involved. Removes ONLY the 10 restrictive policies and their function; SQL v3 (write lock) and
-- C v2 (pre-request) stay as they are. Idempotent (if exists). The schema nextrep_internal is NOT dropped — it
-- belongs to C v2 (its own rollback drops it).
-- =====================================================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array['nextrep_exercises','nextrep_plans','nextrep_plan_items','nextrep_plan_item_sets',
                           'nextrep_workouts','nextrep_workout_exercises','nextrep_workout_sets',
                           'nextrep_measurements','nextrep_custom_fields','nextrep_profiles']
  loop
    execute format('drop policy if exists nextrep_migration_read_guard on public.%I', t);
  end loop;
end;
$$;

drop function if exists nextrep_internal.nextrep_migration_read_allowed();

commit;
