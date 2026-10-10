-- =====================================================================================================
-- NEXTREP — Stage 4A.4 (Etap 13): ROLLBACK of nextrep_order_positions_4a4_v1.sql
-- Roll the CLIENT back first (a client that writes `position` fails with PGRST204 once the column is gone).
-- Drops only the three order columns; every value in them can be sent again from the owner's device.
-- Leaving the columns in place is also safe (the old client ignores them).
-- =====================================================================================================

begin;

set local lock_timeout = '5s';

alter table public.nextrep_plans          drop column if exists position;
alter table public.nextrep_plan_items     drop column if exists position;
alter table public.nextrep_plan_item_sets drop column if exists position;

commit;

notify pgrst, 'reload schema';
