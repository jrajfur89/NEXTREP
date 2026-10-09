-- =====================================================================================================
-- NEXTREP — Stage 4A.4 F-5: server-side migration markers                   *** DRAFT v3 — DO NOT RUN ON SUPABASE ***
-- Validated only on a local PostgreSQL 16 (+ real PostgREST 12.2.12 / 13.0.7) with a Supabase stand-in.
--
-- Changes against v2 (Etap 3 findings + Etap 4 decisions):
--   [A] Own SQLSTATEs instead of the built-in PL/pgSQL P0002 / P0003:
--         NR001 migration_in_progress   — account writes paused (attempt uploading, or abandoned & unresolved)
--         NR002 migration_attempt_closed — the request's token belongs to an attempt that is no longer uploading
--       Class "NR" is an implementation-defined class (PostgreSQL reserves 0-4 / A-H for the standard);
--       PostgREST maps it to HTTP 400 (P0002/P0003 were HTTP 500). Message texts are unchanged.
--   [B] Counter race: the increment only matches a row that is STILL `uploading`; if the attempt was closed in
--       between (accept / abandon / cancel committed), the write fails with NR002 — not a CHECK violation.
--   [C] Cross-account: a write whose target account is not the caller's (auth.uid()) is left to RLS without
--       touching any attempt state → no "this account is uploading" oracle, no waiting on foreign locks.
--   [D] `abandoned` BLOCKS account writes (no token passes) until a conscious resolution:
--         uploading            → active lock (only the token of that attempt writes)
--         abandoned            → locked for everybody until resume / accept_incomplete / cancel(0 writes)
--         accepted_incomplete  → unlocked consciously (terminal, stays as permanent history)
--         completed            → unlocked (terminal)
--         cancelled            → unlocked, only possible with server-counted writes_count = 0 (terminal)
--   [E] resume: abandoned → uploading, ONLY by the device that started it, same attempt_id/token, same kind.
--       Safe without any 4A.5 merge because while abandoned nobody else could write: the account's cloud
--       holds nothing but this attempt's own rows; V1 re-runs idempotently by legacy_id.
--   [F] No new upload on top of accepted-incomplete data: start() refuses while the account has an
--       accepted_incomplete attempt (merging partial + new data is 4A.5 territory).
--   [G] No time-based transitions anywhere (updated_at / last_write_at are informational only).
-- Reads are NOT guarded here — see the separate READ GUARD PROPOSAL (needs its own approval).
-- =====================================================================================================

begin;

-- -----------------------------------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------------------------------
create table public.nextrep_migration_attempts (
  attempt_id          uuid        primary key,                                   -- client-generated; also the lock token
  user_id             uuid        not null references auth.users (id) on delete cascade,
  device_id           uuid        not null,                                      -- uploading device (no FK: device row is created later, best-effort)
  kind                text        not null,
  status              text        not null default 'uploading',
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz null,
  abandoned_at        timestamptz null,                                          -- last time it was abandoned (kept as history)
  cancelled_at        timestamptz null,
  resolved_at         timestamptz null,                                          -- accepted_incomplete: when
  resolved_by_device  uuid        null,                                          -- accepted_incomplete: which device
  resume_count        integer     not null default 0,                            -- abandoned → uploading by the owner
  last_resumed_at     timestamptz null,
  writes_count        bigint      not null default 0,                            -- token-authorised data writes (server-counted)
  last_write_at       timestamptz null,
  verified_counts     jsonb       null,                                          -- numbers only, set with "completed"
  app_version         text        null,

  constraint nextrep_migration_attempts_kind_chk
    check (kind in ('guest_to_account', 'device_upload')),
  constraint nextrep_migration_attempts_status_chk
    check (status in ('uploading', 'completed', 'abandoned', 'cancelled', 'accepted_incomplete')),
  constraint nextrep_migration_attempts_completed_chk
    check ((status = 'completed') = (completed_at is not null)),
  constraint nextrep_migration_attempts_cancelled_chk
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint nextrep_migration_attempts_cancelled_empty_chk
    check (status <> 'cancelled' or writes_count = 0),
  constraint nextrep_migration_attempts_abandoned_chk
    check (status <> 'abandoned' or abandoned_at is not null),
  constraint nextrep_migration_attempts_resolved_chk
    check ((status = 'accepted_incomplete') = (resolved_at is not null and resolved_by_device is not null)),
  constraint nextrep_migration_attempts_counts_chk
    check (verified_counts is null or (status = 'completed' and jsonb_typeof(verified_counts) = 'object')),
  constraint nextrep_migration_attempts_writes_chk
    check (writes_count >= 0),
  constraint nextrep_migration_attempts_resume_chk
    check (resume_count >= 0 and ((resume_count = 0) = (last_resumed_at is null))),
  constraint nextrep_migration_attempts_app_version_chk
    check (app_version is null or char_length(app_version) <= 40)
);

comment on table public.nextrep_migration_attempts is
  'Stage 4A.4 F-5: one row per cloud upload attempt. uploading/abandoned = account cloud may be incomplete and account writes are paused; '
  'completed = client-verified; accepted_incomplete = accepted WITHOUT proof of completeness (permanent); cancelled = nothing written (server-counted). No user data.';

-- -----------------------------------------------------------------------------------------------------
-- 2. Indexes — at most ONE blocking (uploading or abandoned) attempt per account
-- -----------------------------------------------------------------------------------------------------
create unique index nextrep_migration_attempts_one_blocking_uidx
  on public.nextrep_migration_attempts (user_id) where status in ('uploading', 'abandoned');
create index nextrep_migration_attempts_user_idx
  on public.nextrep_migration_attempts (user_id, started_at desc);

-- -----------------------------------------------------------------------------------------------------
-- 3. RLS — SELECT own rows only; no write policies, no direct write privileges
-- -----------------------------------------------------------------------------------------------------
alter table public.nextrep_migration_attempts enable row level security;
create policy "Users can select own migration attempts"
  on public.nextrep_migration_attempts for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.nextrep_migration_attempts from public, anon, authenticated;
grant select on public.nextrep_migration_attempts to authenticated;

-- -----------------------------------------------------------------------------------------------------
-- 4. Helpers
-- -----------------------------------------------------------------------------------------------------
-- the lock token of the current HTTP request (null when absent / not a uuid)
create function public.nextrep_request_migration_attempt()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers text := current_setting('request.headers', true);
  v_token   text;
begin
  if v_headers is null or v_headers = '' then return null; end if;
  begin
    v_token := (v_headers::jsonb) ->> 'x-nextrep-migration-attempt';
    if v_token is null or v_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
    return v_token::uuid;
  exception when others then
    return null;
  end;
end;
$$;

-- per-account advisory lock key (collisions only cause extra waiting, never wrong results)
create function public.nextrep_migration_lock_key(p_user_id uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$ select hashtextextended('nextrep_migration:' || p_user_id::text, 0) $$;

revoke all on function public.nextrep_request_migration_attempt() from public, anon, authenticated;
revoke all on function public.nextrep_migration_lock_key(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------------
-- 5. Guard trigger on the attempts table — immutable identity + allowed transitions, for EVERY writer
-- -----------------------------------------------------------------------------------------------------
create function public.nextrep_migration_attempts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'uploading' then
      raise exception 'migration attempt must start as uploading' using errcode = 'check_violation';
    end if;
    new.started_at := now(); new.updated_at := now();
    new.completed_at := null; new.abandoned_at := null; new.cancelled_at := null;
    new.resolved_at := null; new.resolved_by_device := null;
    new.resume_count := 0; new.last_resumed_at := null;
    new.writes_count := 0; new.last_write_at := null; new.verified_counts := null;
    return new;
  end if;

  if new.attempt_id is distinct from old.attempt_id or new.user_id is distinct from old.user_id
     or new.device_id is distinct from old.device_id or new.kind is distinct from old.kind
     or new.started_at is distinct from old.started_at or new.app_version is distinct from old.app_version then
    raise exception 'immutable migration attempt columns' using errcode = 'check_violation';
  end if;
  if new.writes_count < old.writes_count then
    raise exception 'writes_count can only grow' using errcode = 'check_violation';
  end if;
  if new.writes_count <> old.writes_count and not (old.status = 'uploading' and new.status = 'uploading') then
    raise exception 'writes are only counted while uploading' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'uploading' and new.status in ('completed', 'abandoned', 'cancelled', 'accepted_incomplete'))
      or (old.status = 'abandoned' and new.status in ('uploading', 'accepted_incomplete', 'cancelled'))
    ) then
      raise exception 'migration attempt transition % -> % not allowed', old.status, new.status
        using errcode = 'check_violation';
    end if;
    if new.resume_count <> old.resume_count + (case when new.status = 'uploading' then 1 else 0 end) then
      raise exception 'resume_count only grows by one with a resume' using errcode = 'check_violation';
    end if;
    -- timestamps of the transition are set here, never by the caller
    new.completed_at := old.completed_at; new.abandoned_at := old.abandoned_at; new.cancelled_at := old.cancelled_at;
    new.resolved_at := old.resolved_at; new.last_resumed_at := old.last_resumed_at;
    if new.status = 'completed' then new.completed_at := now(); end if;
    if new.status = 'abandoned' then new.abandoned_at := now(); end if;
    if new.status = 'cancelled' then new.cancelled_at := now(); end if;
    if new.status = 'accepted_incomplete' then new.resolved_at := now(); end if;
    if new.status = 'uploading' then new.last_resumed_at := now(); end if;
    if new.status <> 'accepted_incomplete' and new.resolved_by_device is distinct from old.resolved_by_device then
      raise exception 'resolved_by_device only with accepted_incomplete' using errcode = 'check_violation';
    end if;
    if new.status <> 'completed' and new.verified_counts is distinct from old.verified_counts then
      raise exception 'verified_counts only with completed' using errcode = 'check_violation';
    end if;
  elsif new.completed_at is distinct from old.completed_at or new.abandoned_at is distinct from old.abandoned_at
     or new.cancelled_at is distinct from old.cancelled_at or new.resolved_at is distinct from old.resolved_at
     or new.resolved_by_device is distinct from old.resolved_by_device or new.verified_counts is distinct from old.verified_counts
     or new.resume_count is distinct from old.resume_count or new.last_resumed_at is distinct from old.last_resumed_at then
    raise exception 'migration attempt columns can only change with a status transition' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.nextrep_migration_attempts_guard() from public, anon, authenticated;

create trigger nextrep_migration_attempts_guard
  before insert or update on public.nextrep_migration_attempts
  for each row execute function public.nextrep_migration_attempts_guard();

-- -----------------------------------------------------------------------------------------------------
-- 6. Write functions (SECURITY DEFINER; own account only; explicit device + expected status)
--    Every function returns the CURRENT row: the client decides on what it gets back, never on guesses.
-- -----------------------------------------------------------------------------------------------------
create function public.nextrep_migration_attempt_start(p_attempt_id uuid, p_device_id uuid, p_kind text, p_app_version text default null)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_attempt_id is null or p_device_id is null then raise exception 'attempt and device required' using errcode = '22004'; end if;
  if p_kind is null or p_kind not in ('guest_to_account', 'device_upload') then raise exception 'invalid kind' using errcode = '22023'; end if;

  -- waits until every in-flight data write of this account has committed (they hold the shared lock)
  perform pg_advisory_xact_lock(public.nextrep_migration_lock_key(v_uid));

  select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id;
  if found then
    if v_row.user_id <> v_uid or v_row.device_id <> p_device_id or v_row.kind <> p_kind then
      raise exception 'attempt_not_yours' using errcode = 'P0001';
    end if;
    return v_row; -- idempotent retry (whatever its status is now — the client reads it)
  end if;
  -- [D] one blocking attempt per account (uploading OR abandoned-and-unresolved)
  select * into v_row from public.nextrep_migration_attempts where user_id = v_uid and status in ('uploading', 'abandoned');
  if found then
    raise exception 'active_attempt_exists' using errcode = 'P0001', detail = 'state=' || v_row.status;
  end if;
  -- [F] never start an upload on top of data accepted as incomplete (would merge partial + new data)
  if exists (select 1 from public.nextrep_migration_attempts where user_id = v_uid and status = 'accepted_incomplete') then
    raise exception 'incomplete_data_accepted' using errcode = 'P0001',
      hint = 'This account holds data accepted as incomplete; a new upload would merge with it (not supported).';
  end if;
  begin
    insert into public.nextrep_migration_attempts (attempt_id, user_id, device_id, kind, status, app_version)
    values (p_attempt_id, v_uid, p_device_id, p_kind, 'uploading', left(p_app_version, 40))
    returning * into v_row;
  exception when unique_violation then
    raise exception 'active_attempt_exists' using errcode = 'P0001';
  end;
  return v_row;
end;
$$;

-- [E] abandoned → uploading: only the device that started it, same token. While abandoned nobody else could
-- write, so the account holds only this attempt's own rows — continuing needs no merge.
create function public.nextrep_migration_attempt_resume(p_attempt_id uuid, p_device_id uuid)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(public.nextrep_migration_lock_key(v_uid));
  update public.nextrep_migration_attempts set status = 'uploading', resume_count = resume_count + 1
   where attempt_id = p_attempt_id and user_id = v_uid and device_id = p_device_id and status = 'abandoned'
  returning * into v_row;
  if not found then select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id and user_id = v_uid; end if;
  return v_row;
end;
$$;

create function public.nextrep_migration_attempt_complete(p_attempt_id uuid, p_device_id uuid, p_verified_counts jsonb)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_verified_counts is null or jsonb_typeof(p_verified_counts) <> 'object' then raise exception 'verified counts required' using errcode = '22004'; end if;
  update public.nextrep_migration_attempts set status = 'completed', verified_counts = p_verified_counts
   where attempt_id = p_attempt_id and user_id = v_uid and device_id = p_device_id and status = 'uploading'
  returning * into v_row;
  if not found then select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id and user_id = v_uid; end if;
  return v_row;
end;
$$;

create function public.nextrep_migration_attempt_abandon(p_attempt_id uuid, p_device_id uuid)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.nextrep_migration_attempts set status = 'abandoned'
   where attempt_id = p_attempt_id and user_id = v_uid and device_id = p_device_id and status = 'uploading'
  returning * into v_row;
  if not found then select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id and user_id = v_uid; end if;
  return v_row;
end;
$$;

-- → cancelled only when the server counted NO data write of the attempt:
--   uploading: by the owning device; abandoned: by any device of the account (nothing was written, so there is
--   nothing to accept as incomplete). The row lock of this UPDATE serialises with a concurrent counter UPDATE.
create function public.nextrep_migration_attempt_cancel(p_attempt_id uuid, p_device_id uuid)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_device_id is null then raise exception 'device required' using errcode = '22004'; end if;
  update public.nextrep_migration_attempts set status = 'cancelled'
   where attempt_id = p_attempt_id and user_id = v_uid and writes_count = 0
     and ((status = 'uploading' and device_id = p_device_id) or status = 'abandoned')
  returning * into v_row;
  if not found then select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id and user_id = v_uid; end if;
  return v_row; -- unchanged status when data was written → the client must use abandon / accept_incomplete
end;
$$;

create function public.nextrep_migration_attempt_accept_incomplete(p_attempt_id uuid, p_device_id uuid)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_device_id is null then raise exception 'device required' using errcode = '22004'; end if;
  update public.nextrep_migration_attempts set status = 'accepted_incomplete', resolved_by_device = p_device_id
   where attempt_id = p_attempt_id and user_id = v_uid and status in ('uploading', 'abandoned')
  returning * into v_row;
  if not found then select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id and user_id = v_uid; end if;
  return v_row;
end;
$$;

create function public.nextrep_migration_attempt_touch(p_attempt_id uuid, p_device_id uuid)
returns public.nextrep_migration_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nextrep_migration_attempts;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.nextrep_migration_attempts set updated_at = now()
   where attempt_id = p_attempt_id and user_id = v_uid and device_id = p_device_id and status = 'uploading'
  returning * into v_row;
  if not found then select * into v_row from public.nextrep_migration_attempts where attempt_id = p_attempt_id and user_id = v_uid; end if;
  return v_row;
end;
$$;

revoke all on function public.nextrep_migration_attempt_start(uuid, uuid, text, text) from public, anon;
revoke all on function public.nextrep_migration_attempt_resume(uuid, uuid) from public, anon;
revoke all on function public.nextrep_migration_attempt_complete(uuid, uuid, jsonb) from public, anon;
revoke all on function public.nextrep_migration_attempt_abandon(uuid, uuid) from public, anon;
revoke all on function public.nextrep_migration_attempt_cancel(uuid, uuid) from public, anon;
revoke all on function public.nextrep_migration_attempt_accept_incomplete(uuid, uuid) from public, anon;
revoke all on function public.nextrep_migration_attempt_touch(uuid, uuid) from public, anon;
grant execute on function public.nextrep_migration_attempt_start(uuid, uuid, text, text) to authenticated;
grant execute on function public.nextrep_migration_attempt_resume(uuid, uuid) to authenticated;
grant execute on function public.nextrep_migration_attempt_complete(uuid, uuid, jsonb) to authenticated;
grant execute on function public.nextrep_migration_attempt_abandon(uuid, uuid) to authenticated;
grant execute on function public.nextrep_migration_attempt_cancel(uuid, uuid) to authenticated;
grant execute on function public.nextrep_migration_attempt_accept_incomplete(uuid, uuid) to authenticated;
grant execute on function public.nextrep_migration_attempt_touch(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------------------------------
-- 7. Write lock on the 9 data tables + nextrep_profiles (token-based; counts authorised writes)
-- -----------------------------------------------------------------------------------------------------
create function public.nextrep_migration_write_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- the account whose data is touched: the new row for INSERT, the existing row for UPDATE / DELETE
  v_user    uuid := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
  v_caller  uuid := auth.uid();
  v_token   uuid := public.nextrep_request_migration_attempt();
  v_block   public.nextrep_migration_attempts;
  v_tok_row public.nextrep_migration_attempts;
begin
  -- account deletion: the cascade from auth.users removes everything (attempts included) — never blocked
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = v_user) then
    return old;
  end if;
  -- [C] somebody else's account: reveal nothing, take no lock — RLS (WITH CHECK / USING) rejects the write
  if v_caller is not null and v_user is distinct from v_caller then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- serialise with start() / resume(): a write either commits before a new attempt exists, or sees it
  perform pg_advisory_xact_lock_shared(public.nextrep_migration_lock_key(v_user));

  if v_token is not null then
    select * into v_tok_row from public.nextrep_migration_attempts where attempt_id = v_token;
    if found and v_tok_row.user_id = v_user and v_tok_row.status <> 'uploading' then
      -- stale uploader: its attempt was completed / abandoned / cancelled / accepted (here or elsewhere)
      raise exception 'migration_attempt_closed' using errcode = 'NR002',
        hint = 'This upload attempt is no longer active; stop uploading and re-read its status.';
    end if;
  end if;

  select * into v_block from public.nextrep_migration_attempts where user_id = v_user and status in ('uploading', 'abandoned');
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_block.status = 'abandoned' then
    -- [D] an interrupted upload is not resolved yet: the cloud may be incomplete → nobody writes
    raise exception 'migration_in_progress' using errcode = 'NR001', detail = 'state=abandoned',
      hint = 'An interrupted upload of this account is not resolved yet; writes are paused until it is.';
  end if;
  if v_token is distinct from v_block.attempt_id then
    raise exception 'migration_in_progress' using errcode = 'NR001', detail = 'state=uploading',
      hint = 'Another device of this account is uploading data; writes are paused until it ends.';
  end if;
  -- [B] count only while STILL uploading (READ COMMITTED re-checks the row after a concurrent close)
  update public.nextrep_migration_attempts
     set writes_count = writes_count + 1, last_write_at = now()
   where attempt_id = v_block.attempt_id and status = 'uploading';
  if not found then
    raise exception 'migration_attempt_closed' using errcode = 'NR002',
      hint = 'This upload attempt is no longer active; stop uploading and re-read its status.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.nextrep_migration_write_lock() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['nextrep_exercises','nextrep_plans','nextrep_plan_items','nextrep_plan_item_sets',
                           'nextrep_workouts','nextrep_workout_exercises','nextrep_workout_sets',
                           'nextrep_measurements','nextrep_custom_fields','nextrep_profiles']
  loop
    execute format('create trigger nextrep_migration_write_lock before insert or update or delete on public.%I
                    for each row execute function public.nextrep_migration_write_lock()', t);
  end loop;
end;
$$;

commit;

-- Rollback (not to be executed without a decision; data tables are untouched by this file):
-- begin;
-- do $$ declare t text; begin foreach t in array array['nextrep_exercises','nextrep_plans','nextrep_plan_items',
--   'nextrep_plan_item_sets','nextrep_workouts','nextrep_workout_exercises','nextrep_workout_sets','nextrep_measurements',
--   'nextrep_custom_fields','nextrep_profiles'] loop execute format('drop trigger if exists nextrep_migration_write_lock on public.%I', t); end loop; end $$;
-- drop function if exists public.nextrep_migration_write_lock();
-- drop function if exists public.nextrep_migration_attempt_touch(uuid, uuid);
-- drop function if exists public.nextrep_migration_attempt_accept_incomplete(uuid, uuid);
-- drop function if exists public.nextrep_migration_attempt_cancel(uuid, uuid);
-- drop function if exists public.nextrep_migration_attempt_abandon(uuid, uuid);
-- drop function if exists public.nextrep_migration_attempt_complete(uuid, uuid, jsonb);
-- drop function if exists public.nextrep_migration_attempt_resume(uuid, uuid);
-- drop function if exists public.nextrep_migration_attempt_start(uuid, uuid, text, text);
-- drop table if exists public.nextrep_migration_attempts;
-- drop function if exists public.nextrep_migration_attempts_guard();
-- drop function if exists public.nextrep_migration_lock_key(uuid);
-- drop function if exists public.nextrep_request_migration_attempt();
-- commit;
