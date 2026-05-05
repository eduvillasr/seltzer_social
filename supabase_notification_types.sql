-- ─────────────────────────────────────────────────────────────
-- NOTIFICATION TYPES — expansion
-- Allow likes, comments, follows, and tried-it as notification
-- types so the inbox actually populates from common interactions.
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- Drop the old check constraint (name auto-generated, look it up)
alter table public.notifications
  drop constraint if exists notifications_type_check;

-- Re-add with the expanded type list
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
    'tried_it'
  ));
