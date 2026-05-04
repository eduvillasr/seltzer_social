-- Shared tier lists for Seltzer Social
-- Run this in Supabase SQL Editor after your existing users/follows schema exists.

create table if not exists public.shared_tier_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references public.users(id) on delete cascade,
  partner_id uuid not null references public.users(id) on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_tier_lists_not_self check (owner_id <> partner_id)
);

create table if not exists public.shared_tier_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_tier_lists(id) on delete cascade,
  added_by uuid not null references public.users(id) on delete cascade,
  seltzer_name text not null check (char_length(seltzer_name) between 1 and 120),
  brand text,
  rating numeric(2,1) not null check (rating >= 0 and rating <= 5),
  tier text not null check (tier in ('S', 'A', 'B', 'C', 'D', 'F')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_tier_list_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  list_id uuid not null references public.shared_tier_lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint shared_tier_list_subscriptions_unique unique (user_id, list_id)
);

create table if not exists public.shared_tier_list_suggestions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_tier_lists(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  action text not null default 'add' check (action in ('add', 'move', 'remove', 'edit')),
  seltzer_name text not null check (char_length(seltzer_name) between 1 and 120),
  brand text,
  proposed_rating numeric(2,1) not null check (proposed_rating >= 0 and proposed_rating <= 5),
  proposed_tier text not null check (proposed_tier in ('S', 'A', 'B', 'C', 'D', 'F')),
  proposed_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_tier_suggestion_trials (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.shared_tier_list_suggestions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating numeric(2,1) not null check (rating >= 0 and rating <= 5),
  created_at timestamptz not null default now(),
  constraint shared_tier_suggestion_trials_unique unique (suggestion_id, user_id)
);

create table if not exists public.shared_tier_list_votes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.shared_tier_list_suggestions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote text not null check (vote in ('approve', 'reject')),
  created_at timestamptz not null default now(),
  constraint shared_tier_list_votes_unique unique (suggestion_id, user_id)
);

create index if not exists shared_tier_lists_owner_idx on public.shared_tier_lists(owner_id);
create index if not exists shared_tier_lists_partner_idx on public.shared_tier_lists(partner_id);
create index if not exists shared_tier_list_items_list_idx on public.shared_tier_list_items(list_id);
create index if not exists shared_tier_list_items_created_idx on public.shared_tier_list_items(created_at desc);
create index if not exists shared_tier_list_subscriptions_user_idx on public.shared_tier_list_subscriptions(user_id);
create index if not exists shared_tier_list_subscriptions_list_idx on public.shared_tier_list_subscriptions(list_id);
create index if not exists shared_tier_list_suggestions_list_idx on public.shared_tier_list_suggestions(list_id, status);
create index if not exists shared_tier_list_suggestions_created_idx on public.shared_tier_list_suggestions(created_at desc);
create index if not exists shared_tier_suggestion_trials_suggestion_idx on public.shared_tier_suggestion_trials(suggestion_id);
create index if not exists shared_tier_list_votes_suggestion_idx on public.shared_tier_list_votes(suggestion_id);

alter table public.shared_tier_lists enable row level security;
alter table public.shared_tier_list_items enable row level security;
alter table public.shared_tier_list_subscriptions enable row level security;
alter table public.shared_tier_list_suggestions enable row level security;
alter table public.shared_tier_suggestion_trials enable row level security;
alter table public.shared_tier_list_votes enable row level security;

drop policy if exists "Public shared lists are readable" on public.shared_tier_lists;
create policy "Public shared lists are readable"
on public.shared_tier_lists for select
using (is_public = true or auth.uid() in (owner_id, partner_id));

drop policy if exists "Users can create shared lists" on public.shared_tier_lists;
create policy "Users can create shared lists"
on public.shared_tier_lists for insert
with check (auth.uid() = owner_id);

drop policy if exists "List members can update shared lists" on public.shared_tier_lists;
create policy "List members can update shared lists"
on public.shared_tier_lists for update
using (auth.uid() in (owner_id, partner_id))
with check (auth.uid() in (owner_id, partner_id));

drop policy if exists "Public shared list items are readable" on public.shared_tier_list_items;
create policy "Public shared list items are readable"
on public.shared_tier_list_items for select
using (
  exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and (lists.is_public = true or auth.uid() in (lists.owner_id, lists.partner_id))
  )
);

drop policy if exists "List members can add items" on public.shared_tier_list_items;
create policy "List members can add items"
on public.shared_tier_list_items for insert
with check (
  exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
      and added_by in (lists.owner_id, lists.partner_id)
  )
);

drop policy if exists "Users can read own subscriptions" on public.shared_tier_list_subscriptions;
create policy "Users can read own subscriptions"
on public.shared_tier_list_subscriptions for select
using (auth.uid() = user_id);

drop policy if exists "Users can subscribe to public lists" on public.shared_tier_list_subscriptions;
create policy "Users can subscribe to public lists"
on public.shared_tier_list_subscriptions for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and lists.is_public = true
  )
);

drop policy if exists "Users can unsubscribe themselves" on public.shared_tier_list_subscriptions;
create policy "Users can unsubscribe themselves"
on public.shared_tier_list_subscriptions for delete
using (auth.uid() = user_id);

drop policy if exists "Readable shared list suggestions" on public.shared_tier_list_suggestions;
create policy "Readable shared list suggestions"
on public.shared_tier_list_suggestions for select
using (
  exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and (lists.is_public = true or auth.uid() in (lists.owner_id, lists.partner_id))
  )
);

drop policy if exists "List members can suggest changes" on public.shared_tier_list_suggestions;
create policy "List members can suggest changes"
on public.shared_tier_list_suggestions for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1
    from public.shared_tier_lists lists
    where lists.id = list_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
);

drop policy if exists "List members can resolve suggestions" on public.shared_tier_list_suggestions;
create policy "List members can resolve suggestions"
on public.shared_tier_list_suggestions for update
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

drop policy if exists "List members can read tried marks" on public.shared_tier_suggestion_trials;
create policy "List members can read tried marks"
on public.shared_tier_suggestion_trials for select
using (
  exists (
    select 1
    from public.shared_tier_list_suggestions suggestions
    join public.shared_tier_lists lists on lists.id = suggestions.list_id
    where suggestions.id = suggestion_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
);

drop policy if exists "List members can mark tried" on public.shared_tier_suggestion_trials;
create policy "List members can mark tried"
on public.shared_tier_suggestion_trials for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.shared_tier_list_suggestions suggestions
    join public.shared_tier_lists lists on lists.id = suggestions.list_id
    where suggestions.id = suggestion_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
);

drop policy if exists "List members can update tried marks" on public.shared_tier_suggestion_trials;
create policy "List members can update tried marks"
on public.shared_tier_suggestion_trials for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "List members can read votes" on public.shared_tier_list_votes;
create policy "List members can read votes"
on public.shared_tier_list_votes for select
using (
  exists (
    select 1
    from public.shared_tier_list_suggestions suggestions
    join public.shared_tier_lists lists on lists.id = suggestions.list_id
    where suggestions.id = suggestion_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
);

drop policy if exists "List members can vote after trying" on public.shared_tier_list_votes;
create policy "List members can vote after trying"
on public.shared_tier_list_votes for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.shared_tier_list_suggestions suggestions
    join public.shared_tier_lists lists on lists.id = suggestions.list_id
    where suggestions.id = suggestion_id
      and auth.uid() in (lists.owner_id, lists.partner_id)
  )
  and exists (
    select 1
    from public.shared_tier_suggestion_trials trials
    where trials.suggestion_id = suggestion_id
      and trials.user_id = auth.uid()
  )
);

drop policy if exists "List members can update own vote after trying" on public.shared_tier_list_votes;
create policy "List members can update own vote after trying"
on public.shared_tier_list_votes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
