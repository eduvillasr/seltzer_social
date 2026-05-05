# Beta launch checklist

Production build is green — 16 pages, ~166 kB First Load JS. Below is everything you need to ship.

## 1 · Supabase: run migrations in order

Open Supabase → SQL Editor → paste each file's contents and **Run**. They're idempotent (safe to re-run if you've already done some).

```
supabase_shared_tier_lists.sql      ← base shared-list schema (likely already run)
supabase_add_review_links.sql       ← review_id columns
supabase_comment_reactions.sql      ← comment emoji reactions
supabase_notifications.sql          ← inbox table
supabase_canonical_drinks.sql       ← title/seltzer_id split
supabase_tier_list_policies.sql     ← UPDATE/DELETE policies (latest)
```

Don't skip the last one — without it tier-list edits and deletes silently fail.

## 2 · Supabase: storage buckets

Storage → New bucket. Create both as **public**:
- `avatars`
- `review-images`

Add a permissive read/write policy for authenticated users on each (or use the default public-read template).

## 3 · Supabase: auth settings

Authentication → URL Configuration:
- **Site URL:** `https://your-vercel-domain.vercel.app` (set after deploy)
- **Redirect URLs (allow list):** add both
  - `http://localhost:3000/auth/callback`
  - `https://your-vercel-domain.vercel.app/auth/callback`

Authentication → Providers → Email: confirm "Confirm email" is **on** (matches the new check-your-email signup flow). If you want frictionless signup for beta testers, you can turn it off and the app will short-circuit straight to onboarding.

## 4 · Push to GitHub

```bash
git add .
git commit -m "Beta launch — canonical drinks, onboarding, compare, list deletion"
git push origin main
```

`.env.local` is gitignored, so your keys won't leak.

## 5 · Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → import `eduvillasr/seltzer_social`
2. Framework auto-detected as Next.js — leave the defaults
3. **Environment Variables** — add both:
   ```
   NEXT_PUBLIC_SUPABASE_URL  = https://alprjysmwyezejucotqq.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = (your anon key from .env.local)
   ```
4. **Deploy**

First build takes ~2 min. You'll get a URL like `seltzer-social.vercel.app`.

## 6 · Wire the prod URL back to Supabase

Go back to step 3 — update Site URL + add the Vercel URL to the redirect allow list. Without this the email confirmation links will refuse to redirect.

## 7 · Smoke test

Open the prod URL in an incognito window:

- [ ] Hero loads, all the marketing copy renders
- [ ] Sign up with a fresh email → "check your email" screen
- [ ] Click the email link → /auth/callback → onboarding
- [ ] Onboarding step 2 shows the existing reviewers
- [ ] Skip / finish onboarding → /feed
- [ ] Pull-to-refresh works on mobile
- [ ] Write a review (drink picker → search "lacroix" → pick or add a new one)
- [ ] Toast confirms publish
- [ ] Profile shows top-rated highlight + brand chips
- [ ] Compare with another user (after a second account writes overlapping reviews)
- [ ] Create a shared tier list, add drinks, delete one, delete the list

## 8 · Share with friends

Send them the Vercel URL. Each person who signs up needs to confirm via email.

## Known caveats

- The Supabase free tier rate-limits emails. If 5+ friends sign up in the same minute, some confirmation emails may queue.
- Avatar upload requires the `avatars` bucket to exist (step 2). Without it, the upload errors with a clear message via toast.
- The seltzer canonical catalog starts empty — every "Add new drink" your friends do during signup populates it for everyone else.
