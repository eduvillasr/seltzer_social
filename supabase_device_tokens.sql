-- Native push: per-device FCM registration tokens.
-- One row per device token. Tokens are unified on FCM via
-- @capacitor-firebase/messaging (FCM relays to APNs for iOS), so the
-- push-fanout Edge Function only ever talks to FCM HTTP v1.

create table if not exists public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token      text not null unique,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- A user can only see and manage their own device tokens. The Edge Function
-- reads tokens with the service-role key, which bypasses RLS.
drop policy if exists "device_tokens own select" on public.device_tokens;
create policy "device_tokens own select" on public.device_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "device_tokens own insert" on public.device_tokens;
create policy "device_tokens own insert" on public.device_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "device_tokens own update" on public.device_tokens;
create policy "device_tokens own update" on public.device_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "device_tokens own delete" on public.device_tokens;
create policy "device_tokens own delete" on public.device_tokens
  for delete using (auth.uid() = user_id);
