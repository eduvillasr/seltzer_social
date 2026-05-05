-- Notifications table for inbox
-- Run this in the Supabase SQL editor

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  type text not null check (type in ('suggestion', 'mention', 'suggestion_approved', 'suggestion_rejected')),
  title text not null,
  body text,
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id);
create index if not exists notifications_unread_idx on notifications(user_id, read);

-- Enable RLS
alter table notifications enable row level security;

-- Users can only see their own notifications
create policy "Users can view own notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- Any authenticated user can insert a notification (for creating notifications for others)
create policy "Authenticated users can insert notifications"
  on notifications for insert
  with check (auth.uid() is not null);

-- Users can only update their own notifications (e.g., mark as read)
create policy "Users can update own notifications"
  on notifications for update
  using (auth.uid() = user_id);

-- Users can delete their own notifications
create policy "Users can delete own notifications"
  on notifications for delete
  using (auth.uid() = user_id);
