-- ─────────────────────────────────────────────────────────────
-- TIER LIST RLS POLICY FIX
-- The original migration only had INSERT/SELECT policies on
-- shared_tier_list_items. Without UPDATE/DELETE policies, those
-- operations silently fail (RLS-default-deny). This fills the gap
-- and adds a delete policy for the list itself.
-- Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────

-- Allow list members to UPDATE items (rating, tier, note)
drop policy if exists "List members can update items" on public.shared_tier_list_items;
create policy "List members can update items"
on public.shared_tier_list_items for update
using (
  exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
)
with check (
  exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
);

-- Allow list members to DELETE items
drop policy if exists "List members can delete items" on public.shared_tier_list_items;
create policy "List members can delete items"
on public.shared_tier_list_items for delete
using (
  exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
);

-- Allow list members to DELETE the list itself.
-- All children (items, suggestions, subscriptions, votes, trials)
-- cascade automatically thanks to the existing FK constraints.
drop policy if exists "List members can delete shared lists" on public.shared_tier_lists;
create policy "List members can delete shared lists"
on public.shared_tier_lists for delete
using (auth.uid() in (owner_id, partner_id));
