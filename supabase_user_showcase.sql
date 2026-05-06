-- ─────────────────────────────────────────────────────────────
-- USER ACHIEVEMENT SHOWCASE
-- Lets users pin up to 3 achievement badges to their profile
-- (Battlefield-style "dog tags"). The achievement catalog itself
-- is computed deterministically in code from existing data — only
-- the user's "which ones to display" picks need to persist.
--
-- Idempotent. Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

alter table public.users
  add column if not exists showcase_achievements text[] default '{}'::text[];

-- Cap the array to 3 elements at the app layer (no enforcement at DB level —
-- we just truncate before write).

-- (No new policies needed — owners can update their own users row already.)
