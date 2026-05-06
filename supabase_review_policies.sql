-- ─────────────────────────────────────────────────────────────
-- REVIEW UPDATE POLICY
-- Make sure review owners can update their own reviews. If your
-- existing setup already has an UPDATE policy on reviews this is
-- a no-op (we drop and re-create with the same effect).
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- Make sure RLS is enabled (idempotent)
alter table public.reviews enable row level security;

-- Allow review owners to UPDATE their own reviews
drop policy if exists "Review owners can update reviews" on public.reviews;
create policy "Review owners can update reviews"
on public.reviews for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- (Sanity) make sure DELETE is owner-only too
drop policy if exists "Review owners can delete reviews" on public.reviews;
create policy "Review owners can delete reviews"
on public.reviews for delete
using (auth.uid() = user_id);
