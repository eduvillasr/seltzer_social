-- supabase_referrals.sql
--
-- App-level referrals: records which existing user referred a newly-signed-up
-- user. Powers the Recruiter / Ambassador / Evangelist trophies.
--
-- Run this once in the Supabase SQL editor before shipping the referral feature.

-- 1. Add the column (self-referencing FK to users).
alter table public.users
  add column if not exists referred_by uuid references public.users(id) on delete set null;

-- 2. Index it so counting "people I referred" stays fast.
create index if not exists idx_users_referred_by on public.users(referred_by);

-- Notes:
--  • referred_by is written at sign-up time when a ?ref=<username> link was
--    used. A user's own row is inserted under their session, so the existing
--    "insert your own row" RLS policy already permits writing this column —
--    no extra policy is required.
--  • The referral count for a user U is simply:
--        select count(*) from public.users where referred_by = U;
--    which getAchievementStats() runs as `referralsMade`.
--  • Self-referral is prevented in app code (resolveReferrer ignores a ref that
--    resolves to the signing-up user).
