-- ─────────────────────────────────────────────────────────────
-- DATA STANDARDIZATION + CURATOR ROLE
-- One-shot migration that:
--   1. Normalizes seltzer naming (" + " → " ", smart-quotes → ", etc.)
--   2. Adds image_quality_flag for review-queue tracking
--   3. Adds can_curate flag on users (founders + beta testers)
--   4. Adds RLS policy so curators can update canonical image_urls
--   5. Adds image_curation_log for audit trail of canonical-image changes
-- Idempotent. Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- 1. Normalize separators in seltzer names ─────────────────────
-- Replace " + " with a single space (AHA lineup), then collapse
-- runs of whitespace to a single space, then trim.
update public.seltzers
set name = regexp_replace(replace(name, ' + ', ' '), '\s+', ' ', 'g')
where name like '% + %';

-- Replace specific hyphenated flavor pairs with spaces.
-- (Keep dashes that are part of a real word like "Half-and-Half" or "Pesca-Tea".)
update public.seltzers set name = 'Razz Cranberry'  where name = 'Razz-Cranberry';
update public.seltzers set name = 'Lemon Lime'      where name = 'Lemon-Lime'
  or  name = 'Schweppes Lemon-Lime Sparkling Water';
-- (Schweppes Lemon-Lime fix — strip product-line suffix too)
update public.seltzers set name = 'Lemon Lime Sparkling Water'
  where name = 'Lemon-Lime Sparkling Water';

-- Smart quotes/apostrophes → straight (eliminates duplicate-key bugs)
update public.seltzers set
  brand = replace(replace(brand, '’', ''''), '‘', ''''),
  name  = replace(replace(name,  '’', ''''), '‘', '''');

-- 2. Guardrail: forbid " + " in new names ──────────────────────
alter table public.seltzers drop constraint if exists seltzers_name_no_plus;
alter table public.seltzers add constraint seltzers_name_no_plus
  check (name not like '% + %');

-- 3. Image quality flag ────────────────────────────────────────
alter table public.seltzers
  add column if not exists image_quality_flag text
  check (image_quality_flag in ('ok', 'needs_review', 'replaced'))
  default null;

create index if not exists seltzers_image_quality_idx
  on public.seltzers (image_quality_flag)
  where image_quality_flag is not null;

-- 4. Curator role on users ─────────────────────────────────────
-- Founders + beta testers can replace canonical images. Seed flag from
-- the hardcoded lists. (Username comparison is case-insensitive.)
alter table public.users
  add column if not exists can_curate boolean not null default false;

update public.users
set can_curate = true
where lower(username) in (
  'eduvillasr', 'nicepantsuit',           -- founders
  'cts', 'colinmonaco'                    -- beta testers
);

-- 5. RLS so curators can update seltzers.image_url ────────────
drop policy if exists "Curators can update canonical images" on public.seltzers;
create policy "Curators can update canonical images"
  on public.seltzers for update
  using (
    exists (select 1 from public.users u
            where u.id = auth.uid() and u.can_curate = true)
  )
  with check (
    exists (select 1 from public.users u
            where u.id = auth.uid() and u.can_curate = true)
  );

-- 6. Audit log for canonical-image changes ─────────────────────
create table if not exists public.image_curation_log (
  id          uuid primary key default gen_random_uuid(),
  seltzer_id  uuid not null references public.seltzers(id) on delete cascade,
  changed_by  uuid not null references public.users(id)    on delete set null,
  old_url     text,
  new_url     text,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists image_curation_log_seltzer_idx
  on public.image_curation_log (seltzer_id, created_at desc);

alter table public.image_curation_log enable row level security;

drop policy if exists "Curation log readable by everyone" on public.image_curation_log;
create policy "Curation log readable by everyone"
  on public.image_curation_log for select using (true);

drop policy if exists "Curators can insert curation log" on public.image_curation_log;
create policy "Curators can insert curation log"
  on public.image_curation_log for insert
  with check (
    auth.uid() = changed_by
    and exists (select 1 from public.users u
                where u.id = auth.uid() and u.can_curate = true)
  );

-- Report what's left
select 'Normalized — seltzers with " + " remaining (should be 0):' as note,
       count(*) as count
from public.seltzers where name like '% + %';
