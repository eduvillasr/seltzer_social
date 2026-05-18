-- ─────────────────────────────────────────────────────────────
-- SCALABILITY INDEXES & MATERIALIZED VIEWS
-- One-shot migration adding the indexes that matter once you've got
-- more than a few thousand reviews. Idempotent.
--
-- Hot paths covered:
--   1. Trigram search on seltzers (brand/name)  — autocomplete
--   2. Reviews by seltzer (drink page)           — already indexed?
--   3. Reviews by user (profile feed)            — common
--   4. Feed query (reviews joined with follows)  — common
--   5. Likes/comments/tried-it counts by review  — every feed page
--   6. Per-drink aggregates as a materialized view (cheap reads)
-- ─────────────────────────────────────────────────────────────

-- Enable trigram extension for fast ILIKE search
create extension if not exists pg_trgm;

-- 1. Seltzer search — trigram index makes `ilike '%query%'` ~10× faster
create index if not exists seltzers_brand_trgm  on public.seltzers using gin (lower(brand)  gin_trgm_ops);
create index if not exists seltzers_name_trgm   on public.seltzers using gin (lower(name)   gin_trgm_ops);

-- 2. Drink page — fetch every review of a single seltzer, newest first
create index if not exists reviews_seltzer_created_idx
  on public.reviews (seltzer_id, created_at desc);

-- 3. Profile reviews — fetch a user's reviews, newest first
create index if not exists reviews_user_created_idx
  on public.reviews (user_id, created_at desc);

-- 4. Likes / comments / tried-it lookups by review
create index if not exists likes_review_user_idx     on public.likes (review_id, user_id);
create index if not exists comments_review_idx       on public.comments (review_id, created_at);
create index if not exists tried_it_review_idx       on public.tried_it (review_id);
create index if not exists tried_it_user_idx         on public.tried_it (user_id);

-- 5. Follows — feed-building lookups
create index if not exists follows_follower_idx      on public.follows (follower_id);
create index if not exists follows_following_idx     on public.follows (following_id);

-- 6. Notifications — inbox queries by user, newest first, unread filter
--    (column is `read` on your schema, not `is_read`)
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read)
  where read = false;

-- 7. Tier list activity feed — subscribed-list updates by created_at
create index if not exists shared_tier_list_items_list_added_idx
  on public.shared_tier_list_items (list_id, added_by);
create index if not exists shared_tier_list_items_seltzer_idx
  on public.shared_tier_list_items (seltzer_id);

-- 8. Reviews JSONB — speed up rating_contributions lookups (not used yet,
--    but cheap to add). Skipped — only add if profile aggregations grow.

-- ───── MATERIALIZED VIEW: drink stats ─────
-- For 1,000+ canonical drinks × thousands of reviews, computing
-- (count, avg_rating, latest_image_url) on every /trending and /drink
-- pageview is wasteful. This view recomputes on a schedule (cron).

drop materialized view if exists public.drink_stats cascade;
create materialized view public.drink_stats as
select
  r.seltzer_id              as seltzer_id,
  count(*)                  as review_count,
  round(avg(r.rating)::numeric, 2) as avg_rating,
  max(r.created_at)         as latest_review_at,
  -- Pick the freshest image URL from any review of this drink
  (array_agg(r.image_url order by r.created_at desc) filter (where r.image_url is not null))[1]
                            as latest_image_url
from public.reviews r
where r.seltzer_id is not null
group by r.seltzer_id;

create unique index drink_stats_seltzer_uniq on public.drink_stats (seltzer_id);
create index       drink_stats_review_count   on public.drink_stats (review_count desc);
create index       drink_stats_avg_rating     on public.drink_stats (avg_rating desc);

-- Initial populate
refresh materialized view public.drink_stats;

-- ───── Helper RPC to refresh on demand ─────
create or replace function public.refresh_drink_stats()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.drink_stats;
end;
$$;

-- Anyone authenticated can trigger a refresh (cheap; rate-limit upstream)
grant execute on function public.refresh_drink_stats() to authenticated;

-- ───── Sanity ─────
select 'Drink stats rows:' as note, count(*) as count from public.drink_stats;

