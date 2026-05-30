-- supabase_showroom_layout.sql
--
-- Stores how a user has arranged trophies in their physical Trophy Showroom:
-- a JSON object mapping pedestal-slot id -> trophy id, e.g. {"0":"centurion","3":"cult_leader"}.
-- Visitors see the owner's saved arrangement; the owner drags trophies around
-- and saves. If a placed trophy isn't actually earned (or no longer exists),
-- the app just ignores it when rendering — no integrity constraints needed.
--
-- Run once in the Supabase SQL editor.

alter table public.users
  add column if not exists showroom_layout jsonb not null default '{}'::jsonb;

-- The owner updates their own row, which the existing "update your own user
-- row" RLS policy already allows — no extra policy required.
