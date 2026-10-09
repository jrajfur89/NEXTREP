-- =====================================================================================================
-- NEXTREP — Stage 4A.4 F-5: READ GUARD — RESTRICTIVE RLS (variant A, v1)       *** NOT DEPLOYED TO PRODUCTION ***
-- Third layer next to SQL v3 (write lock) and C v2 (PostgREST pre-request). Requires both, in this order:
--   1. nextrep_migration_attempts_4a4_DRAFT_v3.sql      (table nextrep_migration_attempts, nextrep_request_migration_attempt())
--   2. nextrep_migration_pre_request_4a4_PROPOSAL.sql    (schema nextrep_internal; usage granted to anon / authenticated / service_role)
--   3. THIS FILE
-- Rollback: nextrep_migration_read_guard_rls_4a4_v1_rollback.sql
--
-- Why: C v2 refuses GET / HEAD whose ROOT is one of the 10 data tables. PostgREST can also read those tables as
-- EMBEDDED resources of a table that is not guarded — e.g. GET /nextrep_devices?select=*,nextrep_workouts(*)
-- (also nested, also `(count)`), and PATCH / POST /nextrep_devices with `Prefer: return=representation` plus an
-- embedding `select` — none of which the pre-request (root path + GET/HEAD) can see. Confirmed on nextrep-f5-test
-- (Etap 10). RLS applies to every row of every table a query touches, embedded or not.
--
-- What it does: ONE additional RESTRICTIVE SELECT policy per data table (AND-combined with the existing permissive
-- "own rows" policies, which stay untouched). The policy calls nextrep_internal.nextrep_migration_read_allowed():
--   • no account context (auth.uid() null)                         → true   (anon has no grants anyway)
--   • the caller's account has no attempt `uploading` / `abandoned` → true   (also completed / cancelled /
--                                                                              accepted_incomplete — normal reads)
--   • `uploading` and the request carries THAT attempt's token        → true   (the uploader itself)
--   • otherwise                                                       → ERROR NR001 migration_in_progress
-- The function looks only at the CALLER's own attempts — never at the row owner — so it reveals nothing about
-- another account (a blocked caller reading someone else's rows gets the usual empty result from the own-rows
-- policy, an unblocked caller is never affected by someone else's lock).
-- Known limit (measured, PG 16 / 17): a table that holds NO row the query reaches returns an empty result
-- without error (the qual is not evaluated) — no data, so nothing partial can be read.
-- Not affected: table owner / service_role / postgres (bypass RLS) — SECURITY DEFINER RPCs owned by postgres
-- (nextrep_admin_*, delete_user, nextrep_migration_*), FK cascades (account deletion, ON DELETE SET NULL).
-- An UPDATE / DELETE that reads the rows it changes (PostgREST always filters) is also checked by SELECT policies:
-- for a blocked account without the token that is the same NR001 the v3 write lock already returns.
-- Cost: `(select …)` makes the function an InitPlan — one indexed lookup in nextrep_migration_attempts per
-- table reference per query (partial unique index nextrep_migration_attempts_one_blocking_uidx).
-- =====================================================================================================

begin;

create schema if not exists nextrep_internal;   -- normally created by C v2; never exposed through the Data API

create function nextrep_internal.nextrep_migration_read_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_block public.nextrep_migration_attempts;
begin
  if v_uid is null then return true; end if;
  select * into v_block from public.nextrep_migration_attempts
   where user_id = v_uid and status in ('uploading', 'abandoned');
  if not found then return true; end if;
  if v_block.status = 'uploading' and public.nextrep_request_migration_attempt() = v_block.attempt_id then
    return true;                                       -- the uploader itself (token of the open attempt)
  end if;
  raise exception 'migration_in_progress' using errcode = 'NR001', detail = 'state=' || v_block.status,
    hint = 'Data of this account is being uploaded by another device (or an interrupted upload is unresolved); reads are paused.';
end;
$$;
revoke all on function nextrep_internal.nextrep_migration_read_allowed() from public, anon;
grant execute on function nextrep_internal.nextrep_migration_read_allowed() to authenticated, service_role;  -- policy expressions run as the caller

do $$
declare t text;
begin
  foreach t in array array['nextrep_exercises','nextrep_plans','nextrep_plan_items','nextrep_plan_item_sets',
                           'nextrep_workouts','nextrep_workout_exercises','nextrep_workout_sets',
                           'nextrep_measurements','nextrep_custom_fields','nextrep_profiles']
  loop
    execute format('create policy nextrep_migration_read_guard on public.%I as restrictive for select to authenticated
                    using ((select nextrep_internal.nextrep_migration_read_allowed()))', t);
  end loop;
end;
$$;

commit;
