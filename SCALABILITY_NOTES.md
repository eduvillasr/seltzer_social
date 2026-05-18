# Seltzer Social — Scalability Roadmap

Where the app is right now, what'll break first as users pile in, and the
in-order fixes. Numbers are rough but honest based on the current code.

## Today's load profile

- 1,092 canonical seltzers
- Reviews table grows linearly with users × drinks-tried
- Feed = `getSmartFeed(uid, 50)` — top 50 follow-graph reviews per pageview
- Tier-list items aggregate via JSONB `rating_contributions`
- Single Supabase project, no read replicas, no CDN cache for API

## What breaks first (in order)

### 1. Autocomplete search at ~10k seltzers — **fix shipped**

`searchSeltzers()` uses `ilike '%query%'` which forces a full scan with no
index. Already at 1,092 rows it's mildly slow; at 10k it's molasses.

**Shipped:** `supabase_scalability_indexes.sql` adds pg_trgm GIN indexes on
`lower(brand)` and `lower(name)`. ILIKE becomes ~10× faster, holds up to
~100k rows.

### 2. Drink page & trending — **fix shipped (materialized view)**

`/trending` and `/drink/[id]` currently re-aggregate `count(*)`, `avg(rating)`,
and pick a latest image on every pageview by scanning the reviews table.
At a few thousand reviews this is fine; at 100k+ it gets sluggish.

**Shipped:** `drink_stats` materialized view + `refresh_drink_stats()` RPC.
Add a Supabase cron job (or trigger refresh after every 50 new reviews) so
trending queries hit the view instead of scanning reviews.

**Wire it up (~2 lines of code each):**
- `app/trending/page.tsx`: query `public.drink_stats` instead of computing
- `app/drink/[id]/page.tsx`: read stats from view, fall back to live query

### 3. Feed query — **on-the-radar**

`getSmartFeed(uid, 50)` joins reviews × follows × likes × comments × tried-it.
At ~1k users + ~100k reviews this'll show as a 200ms+ feed load.

**Plan when needed:**
- Switch follower lookup to a denormalized `following_ids uuid[]` cached on
  `users` row, refreshed by trigger when follow/unfollow fires.
- Add `feed_review_card` materialized view that pre-joins likes/comments
  counts per review (refresh hourly).
- Paginate by `created_at` cursor instead of `offset` — currently
  `.limit(50)` is fine but you'd want `range()` or `lt('created_at', cursor)`
  once feeds get long.

### 4. Image storage — **needs CDN edge**

All canonical + review images are in the `review-images` Supabase storage
bucket. Supabase serves them via Cloudflare CDN globally, so this is OK
short-term. But:

**At scale:**
- Mirror canonical images to a true CDN (Cloudflare R2 or Bunny) with a
  cache-friendly URL pattern. Saves Supabase storage egress.
- Add explicit `Cache-Control: public, max-age=31536000, immutable` on the
  canonical-image upload step (we control it; users won't rename them).
- Generate WebP + AVIF derivatives at build time for the canonical set.

### 5. RLS overhead — **monitor**

Every query runs through Row Level Security. Most policies are simple
(`auth.uid() = X`) so cheap, but a few do subqueries (the curator update
checks `EXISTS (SELECT 1 FROM users ...)`). At high concurrency:

**Plan when needed:**
- Stash `can_curate` in JWT custom claims so the policy is `auth.jwt() ->>
  'can_curate' = 'true'` instead of a table lookup.
- Same for any other policy that joins back to users.

### 6. Client bundle — **modest savings available now**

The bundle is reasonable but a few wins:

- `lib/supabase.ts` is 60KB of mixed concerns. Split into:
  `lib/supabase/{client,seltzers,reviews,tierlists,notifications}.ts`.
  Tree-shaking will then keep route-specific bundles smaller.
- `recharts` (if used) lazy-load on profile only.
- `lucide-react` — already tree-shaken since icons are imported individually.
- Replace any `lodash`/`date-fns` full imports with deep imports.

## Quick wins to do RIGHT NOW

1. ✅ **Run `supabase_scalability_indexes.sql`** — biggest single performance
   win for any DB-backed app: missing indexes.
2. ✅ **Run the trigram extension** (included in the migration). Required
   for the new search indexes.
3. **Schedule the materialized-view refresh.** In Supabase: Database →
   Database Cron → `select public.refresh_drink_stats();` every 10 min.
4. **Wire `/trending` to read from `drink_stats`.** Replace the
   client-side aggregation with `select * from drink_stats order by
   review_count desc limit 20`.
5. **Add an HTTP cache header** to the canonical-image upload (set
   `cacheControl: '31536000'` instead of `'3600'` in
   `uploadCanonicalSeltzerImage`).

## Architecture sketches for "real scale" (10k+ users)

### Read replicas
Supabase Pro+ supports read replicas. Route all non-mutation queries to a
replica. App-side: a single env flag flipped.

### Edge caching
Vercel route handlers + ISR for the public-by-id pages (drink, profile,
shared tier list). Set revalidation to 60s. Massively cuts DB load for
heavily-trafficked drinks.

### Search service
Once seltzers + reviews + users together cross ~50k rows of search target,
move autocomplete off the DB onto Algolia / Meilisearch / Postgres
full-text. Cost is real (~$50/mo at small scale) but it preserves UX.

### Background work
Currently notifications are fired inline in the request that triggers
them. Move to a queue (Supabase Edge Functions + cron, or Inngest) when:
- Notification fanout exceeds 100 recipients per event (e.g. a popular
  user's followers list)
- You want retry-on-failure semantics
- You want notification batching ("3 people liked your review" instead of
  three separate inbox rows)

### Tier-list real-time
Tier list pages currently re-fetch on focus. For the multi-member edit
case, plug into Supabase Realtime to push edits live. ~10 lines of code,
but only worth it when 3+ people are simultaneously editing a single list.

## What NOT to optimize yet

- Database sharding — Postgres scales vertically to billions of rows fine
  with proper indexes. Don't touch.
- Microservices — single Next.js + Supabase scales to ~10k DAU easily.
- Custom Redis cache — Supabase + Vercel ISR covers 99% of needs.
- Streaming SSR — App Router already does it; no further work needed.

## TL;DR action list

1. Run `supabase_scalability_indexes.sql` (ships today)
2. Schedule `refresh_drink_stats()` every 10 min
3. Switch `/trending` and `/drink/[id]` to read the materialized view
4. Bump canonical-image `cacheControl` to a year
5. Stop here until you have actual users feeling slowness — premature
   optimization is the killer everyone warns about
