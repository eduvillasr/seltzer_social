-- ─────────────────────────────────────────────────────────────
-- TIER LIST INVITES
-- Adds an acceptance step before a partner gets pulled into a
-- shared tier list. Existing lists are auto-marked 'active' so
-- nothing breaks. Run in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────

alter table public.shared_tier_lists
  add column if not exists status text not null default 'active'
  check (status in ('pending_invite', 'active', 'declined'));

create index if not exists shared_tier_lists_status_idx on public.shared_tier_lists(status);

-- Existing lists: leave them as 'active' (already grandfathered by default).
-- New lists created with a partner OTHER than the creator should be set to
-- 'pending_invite' from the application layer.

-- Add 'tier_list_invite' to the notification types so we can fan one out
-- when the invite is sent.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'suggestion',
    'suggestion_approved',
    'suggestion_rejected',
    'mention',
    'like',
    'comment',
    'follow',
    'tried_it',
    'reply',
    'tier_list_invite',
    'tier_list_invite_accepted',
    'tier_list_invite_declined'
  ));
