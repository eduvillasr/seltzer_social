-- Run this in Supabase SQL Editor to enable comment reactions

create table if not exists comment_reactions (
  id uuid default gen_random_uuid() primary key,
  comment_id uuid references comments(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default now(),
  unique(comment_id, user_id, emoji)
);

alter table comment_reactions enable row level security;

create policy "Anyone can read reactions"
  on comment_reactions for select using (true);

create policy "Users can manage own reactions"
  on comment_reactions for all using (auth.uid() = user_id);

create index if not exists comment_reactions_comment_id_idx on comment_reactions(comment_id);
