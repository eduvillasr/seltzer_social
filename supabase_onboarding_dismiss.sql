-- ─────────────────────────────────────────────────────────────
-- ONBOARDING DISMISS COLUMN
-- Adds users.onboarding_dismissed so the "Getting Started" checklist
-- on the feed can hide itself permanently once the user clicks
-- "I'm done" or completes every step. Idempotent.
-- ─────────────────────────────────────────────────────────────

alter table public.users
  add column if not exists onboarding_dismissed boolean not null default false;

-- Tiny RPC so the client can flip this without a service-role key.
-- The RLS policy below restricts updates to your own row, so this is
-- safe to expose to authenticated callers.
create or replace function public.dismiss_onboarding(uid uuid)
returns void
language sql
security invoker
as $$
  update public.users
     set onboarding_dismissed = true
   where id = uid
     and id = auth.uid();
$$;

grant execute on function public.dismiss_onboarding(uuid) to authenticated;

-- Sanity
select 'Onboarding dismiss column ready' as note;
