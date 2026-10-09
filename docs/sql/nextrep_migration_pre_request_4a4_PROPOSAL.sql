-- =====================================================================================================
-- NEXTREP — Stage 4A.4 F-5: READ GUARD — variant C (PostgREST pre-request)
--                                    *** PROPOSAL v2 — NEEDS SEPARATE APPROVAL; DO NOT RUN ON PRODUCTION ***
-- v2 (Etap 5): the function lives in the NON-exposed schema nextrep_internal → not callable as /rest/v1/rpc/…
--   (Supabase security advisor flagged the public version). Validated on the isolated Supabase test project.
-- Requires DRAFT v3. PostgREST calls the configured pre-request function once per API request, inside the
-- request's transaction, before the actual query (Supabase documents this hook: "check_request").
-- For GET/HEAD on the 10 NEXTREP data tables of an account with a blocking attempt (uploading / abandoned)
-- the request FAILS with NR001 — independent of how many rows exist (also empty tables).
-- Everything else returns immediately: other tables, RPCs, writes (writes are guarded by the v3 trigger),
-- requests without an account (anon / service_role key).
--
-- PREREQUISITE on production (read-only check, separate approval): is a pre-request function already
-- configured?  select rolname, rolconfig from pg_roles where rolname = 'authenticator';
-- PostgREST supports exactly ONE pre-request function; an existing one would have to call this one.
-- =====================================================================================================

begin;

create schema if not exists nextrep_internal;
revoke all on schema nextrep_internal from public;
grant usage on schema nextrep_internal to anon, authenticated, service_role;

create function nextrep_internal.nextrep_pre_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_method text := current_setting('request.method', true);
  v_path   text := current_setting('request.path', true);
  v_table  text;
  v_uid    uuid;
  v_block  public.nextrep_migration_attempts;
begin
  if v_method is null or v_method not in ('GET', 'HEAD') then return; end if;
  v_table := split_part(ltrim(coalesce(v_path, ''), '/'), '/', 1);
  if v_table not in ('nextrep_exercises','nextrep_plans','nextrep_plan_items','nextrep_plan_item_sets',
                     'nextrep_workouts','nextrep_workout_exercises','nextrep_workout_sets',
                     'nextrep_measurements','nextrep_custom_fields','nextrep_profiles') then
    return;
  end if;
  v_uid := auth.uid();
  if v_uid is null then return; end if;
  select * into v_block from public.nextrep_migration_attempts
   where user_id = v_uid and status in ('uploading', 'abandoned');
  if not found then return; end if;
  if v_block.status = 'uploading' and public.nextrep_request_migration_attempt() = v_block.attempt_id then return; end if;
  raise exception 'migration_in_progress' using errcode = 'NR001', detail = 'state=' || v_block.status,
    hint = 'Data of this account is being uploaded by another device (or an interrupted upload is unresolved); reads are paused.';
end;
$$;
revoke all on function nextrep_internal.nextrep_pre_request() from public;
grant execute on function nextrep_internal.nextrep_pre_request() to anon, authenticated, service_role;   -- runs as the request role

-- activation (Supabase: role-level PostgREST setting, then config reload):
-- alter role authenticator set pgrst.db_pre_request = 'nextrep_internal.nextrep_pre_request';
-- notify pgrst, 'reload config';

commit;

-- Rollback (instant, no data involved):
-- alter role authenticator reset pgrst.db_pre_request;
-- notify pgrst, 'reload config';
-- (only AFTER the reset + reload above — a configured but missing function takes the whole Data API down)
-- drop function if exists nextrep_internal.nextrep_pre_request();
-- drop schema if exists nextrep_internal;
