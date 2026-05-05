-- ─────────────────────────────────────────────────────────────
-- CANONICAL DRINKS migration
-- Splits reviews into:
--   • title       (free text, optional — "Ultimate summer drink")
--   • seltzer_id  (FK to canonical seltzers table — Brand · Drink)
-- and back-fills existing rows so nothing breaks.
-- Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────

-- 1. Canonical seltzers table -----------------------------------
create table if not exists public.seltzers (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (char_length(brand) between 1 and 80),
  name  text not null check (char_length(name)  between 1 and 120),
  image_url text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- in case the table existed without these columns, add them
alter table public.seltzers add column if not exists image_url text;
alter table public.seltzers add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.seltzers add column if not exists created_at timestamptz not null default now();

-- canonical uniqueness on (brand, name) — case-insensitive
create unique index if not exists seltzers_brand_name_unique
  on public.seltzers (lower(brand), lower(name));

create index if not exists seltzers_brand_idx on public.seltzers (lower(brand));
create index if not exists seltzers_name_idx  on public.seltzers (lower(name));

-- 2. New columns on reviews ------------------------------------
alter table public.reviews add column if not exists title text;
alter table public.reviews add column if not exists seltzer_id uuid references public.seltzers(id) on delete set null;

-- ensure title is sane
alter table public.reviews drop constraint if exists reviews_title_length;
alter table public.reviews add constraint reviews_title_length check (title is null or char_length(title) between 1 and 80);

create index if not exists reviews_seltzer_id_idx on public.reviews (seltzer_id);

-- 3. Tier list tables also get seltzer_id (for dedup) ----------
alter table public.shared_tier_list_items add column if not exists seltzer_id uuid references public.seltzers(id) on delete set null;
alter table public.shared_tier_list_suggestions add column if not exists seltzer_id uuid references public.seltzers(id) on delete set null;

create index if not exists shared_tier_list_items_seltzer_idx on public.shared_tier_list_items (seltzer_id);
create index if not exists shared_tier_list_suggestions_seltzer_idx on public.shared_tier_list_suggestions (seltzer_id);

-- 4. Back-fill: every distinct (brand, seltzer_name) from reviews
--    becomes a seltzers row, and reviews/items/suggestions get linked.
insert into public.seltzers (brand, name, image_url)
select distinct on (lower(coalesce(brand,'')), lower(seltzer_name))
       coalesce(nullif(trim(brand), ''), 'Unknown'),
       seltzer_name,
       max(image_url)
from public.reviews
where seltzer_name is not null
group by lower(coalesce(brand,'')), lower(seltzer_name), brand, seltzer_name
on conflict do nothing;

-- back-fill reviews.seltzer_id from the canonical table
update public.reviews r
set seltzer_id = s.id
from public.seltzers s
where r.seltzer_id is null
  and lower(s.brand) = lower(coalesce(r.brand, 'Unknown'))
  and lower(s.name)  = lower(r.seltzer_name);

-- back-fill shared_tier_list_items.seltzer_id
update public.shared_tier_list_items i
set seltzer_id = s.id
from public.seltzers s
where i.seltzer_id is null
  and lower(s.brand) = lower(coalesce(i.brand, 'Unknown'))
  and lower(s.name)  = lower(i.seltzer_name);

-- back-fill shared_tier_list_suggestions.seltzer_id
update public.shared_tier_list_suggestions g
set seltzer_id = s.id
from public.seltzers s
where g.seltzer_id is null
  and lower(s.brand) = lower(coalesce(g.brand, 'Unknown'))
  and lower(s.name)  = lower(g.seltzer_name);

-- 5. RLS for the seltzers catalogue ----------------------------
alter table public.seltzers enable row level security;

drop policy if exists "Anyone can read seltzers" on public.seltzers;
create policy "Anyone can read seltzers"
  on public.seltzers for select
  using (true);

drop policy if exists "Authenticated users can add seltzers" on public.seltzers;
create policy "Authenticated users can add seltzers"
  on public.seltzers for insert
  with check (auth.uid() is not null);
