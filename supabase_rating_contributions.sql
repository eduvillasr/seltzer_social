-- ─────────────────────────────────────────────────────────────
-- TIER LIST RATING CONTRIBUTIONS
-- Tracks each member's individual rating per item so we can show
-- a true average when multiple people add the same drink.
--
-- Idempotent. Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- A jsonb map of { user_id: rating } per item. The item's `rating` column
-- is kept as the AVERAGE of all values in this map for fast reads.
alter table public.shared_tier_list_items
  add column if not exists rating_contributions jsonb not null default '{}'::jsonb;

-- Backfill: for existing rows, seed the contributions map with the original
-- adder's rating so averaging logic works on legacy data too.
update public.shared_tier_list_items
set rating_contributions = jsonb_build_object(added_by::text, rating)
where rating_contributions = '{}'::jsonb;

create index if not exists shared_tier_list_items_seltzer_per_list_idx
  on public.shared_tier_list_items(list_id, seltzer_id)
  where seltzer_id is not null;
