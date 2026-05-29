-- supabase_moderation_barcode.sql
--
-- Launch-readiness schema for App Store / Play submission:
--   1. users.terms_accepted_at   — EULA/terms agreement gate (Apple 1.2)
--   2. reports                   — report a review / comment / profile (Apple 1.2)
--   3. blocks                    — block a user; their content is hidden (Apple 1.2)
--   4. seltzers.upc              — barcode → drink lookup
--
-- Account deletion (Apple 5.1.1(v)) is handled by the `delete-account`
-- Edge Function (service role) — no schema change needed since every user-
-- owned table already cascades from public.users.
--
-- Safe to run more than once.

-- ─── 1. Terms acceptance ──────────────────────────────────────────
alter table public.users
  add column if not exists terms_accepted_at timestamptz;

-- ─── 2. Reports ───────────────────────────────────────────────────
-- One row per user-flagged piece of content. target_type tells the
-- moderator what target_id points at. target_user_id is the author of
-- the reported thing (denormalized so the queue can show "who").
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.users(id) on delete cascade,
  target_type    text not null check (target_type in ('review', 'comment', 'user')),
  target_id      uuid not null,
  target_user_id uuid references public.users(id) on delete cascade,
  reason         text not null check (char_length(reason) between 1 and 500),
  status         text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.users(id) on delete set null
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);
-- One report per reporter per target (re-reporting is a no-op upsert).
create unique index if not exists reports_unique_per_reporter
  on public.reports (reporter_id, target_type, target_id);

alter table public.reports enable row level security;

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports
  for insert with check (auth.uid() = reporter_id);

-- Reporter can see their own reports; curators can see all (to moderate).
drop policy if exists "reports select own or curator" on public.reports;
create policy "reports select own or curator" on public.reports
  for select using (
    auth.uid() = reporter_id
    or exists (select 1 from public.users u where u.id = auth.uid() and u.can_curate = true)
  );

-- Only curators resolve/dismiss reports.
drop policy if exists "reports update curator" on public.reports;
create policy "reports update curator" on public.reports
  for update using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.can_curate = true)
  );

-- ─── 3. Blocks ────────────────────────────────────────────────────
create table if not exists public.blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.users(id) on delete cascade,
  blocked_id  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (blocker_id <> blocked_id)
);

create unique index if not exists blocks_unique_pair
  on public.blocks (blocker_id, blocked_id);
create index if not exists blocks_blocker_idx on public.blocks (blocker_id);

alter table public.blocks enable row level security;

drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own" on public.blocks
  for insert with check (auth.uid() = blocker_id);

drop policy if exists "blocks select own" on public.blocks;
create policy "blocks select own" on public.blocks
  for select using (auth.uid() = blocker_id);

drop policy if exists "blocks delete own" on public.blocks;
create policy "blocks delete own" on public.blocks
  for delete using (auth.uid() = blocker_id);

-- ─── 4. Barcode (UPC/EAN) on canonical drinks ─────────────────────
alter table public.seltzers
  add column if not exists upc text;

-- At most one drink per barcode. Partial unique index ignores NULLs so
-- drinks without a known barcode don't collide.
create unique index if not exists seltzers_upc_unique
  on public.seltzers (upc) where upc is not null;
