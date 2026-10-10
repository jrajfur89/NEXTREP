-- =====================================================================================================
-- NEXTREP — Stage 4A.4 (Etap 13): explicit ORDER of plans, plan items and plan item sets      *** NOT DEPLOYED TO PRODUCTION ***
-- Rollback: nextrep_order_positions_4a4_v1_rollback.sql
--
-- nextrep_workout_exercises / nextrep_workout_sets already have `position integer NOT NULL DEFAULT 0`. The three plan
-- tables had no order column, so a device that loaded plans from the cloud got them in UUID order (plans list, items
-- of a plan — breaking supersets — and the series of an item). This adds the same kind of column there.
--
--   • NULL, no default, no NOT NULL, no unique constraint: rows written before this change and rows written by the
--     old client (origin/main, which does not know the column) keep `position = NULL` — the new client treats NULL
--     as "order unknown" and never reorders a device's lists from it.
--   • Existing rows are NOT backfilled here (created_at is not the true order). The true order lives on the
--     owner's device; it is sent explicitly with "Zapisz kolejność planów z tego urządzenia" in the app.
--   • F-5: the write lock trigger and the restrictive read policies are row-level — unchanged by a new column.
--     RLS policies are unchanged; existing column grants (table-level) cover the new column.
--   • ADD COLUMN … NULL without a default is a catalog-only change (no table rewrite); it takes a short ACCESS
--     EXCLUSIVE lock — run with a lock_timeout.
--   • After this file: `notify pgrst, 'reload schema';` — until the schema cache reloads, writes that include
--     `position` on these tables fail with PGRST204. Deploy BEFORE the client that writes the column.
-- =====================================================================================================

begin;

set local lock_timeout = '5s';

alter table public.nextrep_plans          add column position integer null;
alter table public.nextrep_plan_items     add column position integer null;
alter table public.nextrep_plan_item_sets add column position integer null;

comment on column public.nextrep_plans.position          is 'Stage 4A.4: index in the user''s plan list (0-based). NULL = unknown (older rows / old client).';
comment on column public.nextrep_plan_items.position     is 'Stage 4A.4: index of the item in its plan (0-based). NULL = unknown (older rows / old client).';
comment on column public.nextrep_plan_item_sets.position is 'Stage 4A.4: index of the series in its plan item (0-based). NULL = unknown (older rows / old client).';

commit;

notify pgrst, 'reload schema';
