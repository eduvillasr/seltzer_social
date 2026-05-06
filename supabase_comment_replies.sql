-- ─────────────────────────────────────────────────────────────
-- COMMENT REPLIES + REPLY NOTIFICATIONS
-- Adds threading to the comments table and a 'reply' notification
-- type. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- 1. Threaded comments — parent_id references the comment being replied to.
--    NULL = top-level comment. Cascades on parent delete.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_id_idx on public.comments(parent_id);
create index if not exists comments_review_parent_idx on public.comments(review_id, parent_id);

-- 2. Add 'reply' to the allowed notification types.
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
    'reply'
  ));
