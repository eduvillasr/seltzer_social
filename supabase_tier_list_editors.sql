-- ─────────────────────────────────────────────────────────────
-- TIER LIST EDITORS (multi-member invites)
-- Lets the owner of a shared tier list invite N additional users
-- with edit access (beyond the original owner+partner pair).
-- Run in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.shared_tier_list_editors (
  list_id    uuid not null references public.shared_tier_lists(id) on delete cascade,
  user_id    uuid not null references public.users(id)             on delete cascade,
  status     text not null default 'pending_invite' check (status in ('pending_invite','active','declined')),
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (list_id, user_id)
);

create index if not exists shared_tier_list_editors_user_idx
  on public.shared_tier_list_editors (user_id);
create index if not exists shared_tier_list_editors_list_status_idx
  on public.shared_tier_list_editors (list_id, status);

-- ─── Row-Level Security ────────────────────────────────────
alter table public.shared_tier_list_editors enable row level security;

-- Anyone can read editor rows so the UI can show "X invited you" / "Y, Z editing"
drop policy if exists "Editors readable by anyone" on public.shared_tier_list_editors;
create policy "Editors readable by anyone"
  on public.shared_tier_list_editors for select
  using (true);

-- Only the list's OWNER can invite (insert) someone as editor
drop policy if exists "Owner can invite editors" on public.shared_tier_list_editors;
create policy "Owner can invite editors"
  on public.shared_tier_list_editors for insert
  with check (
    auth.uid() = invited_by
    and exists (
      select 1 from public.shared_tier_lists l
      where l.id = list_id and l.owner_id = auth.uid()
    )
  );

-- The invited user can accept/decline (update their own row's status).
-- The owner can also update (e.g. revoke) any editor row on their list.
drop policy if exists "Editor can update own status" on public.shared_tier_list_editors;
create policy "Editor can update own status"
  on public.shared_tier_list_editors for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.shared_tier_lists l
      where l.id = list_id and l.owner_id = auth.uid()
    )
  );

-- Owner can remove an editor; an editor can remove themselves
drop policy if exists "Owner or self can delete editor row" on public.shared_tier_list_editors;
create policy "Owner or self can delete editor row"
  on public.shared_tier_list_editors for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.shared_tier_lists l
      where l.id = list_id and l.owner_id = auth.uid()
    )
  );

-- ─── Allow accepted editors to write to list items / suggestions ──
-- The existing RLS on shared_tier_list_items / _suggestions checks
-- (user is owner_id or partner_id). We need to extend that to also
-- accept any user with status='active' in shared_tier_list_editors.
-- These wrappers replace the previous policies.

drop policy if exists "Members can manage items" on public.shared_tier_list_items;
create policy "Members can manage items"
  on public.shared_tier_list_items for all
  using (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_items.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_items.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_items.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_items.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "Members can manage suggestions" on public.shared_tier_list_suggestions;
create policy "Members can manage suggestions"
  on public.shared_tier_list_suggestions for all
  using (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_suggestions.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_suggestions.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.shared_tier_lists l
      where l.id = shared_tier_list_suggestions.list_id
        and (l.owner_id = auth.uid() or l.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.shared_tier_list_editors e
      where e.list_id = shared_tier_list_suggestions.list_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  );
