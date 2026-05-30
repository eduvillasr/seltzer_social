// lib/referral.ts
//
// App-level referrals. A user shares /auth/signup?ref=<their-username>; we stash
// the ref on the signup screen, then — at whichever point the new user's profile
// row is first created — resolve it to the referrer's id and write it to
// users.referred_by. Best-effort and never blocks signup.

import { getUserByUsername } from './supabase';

const REF_KEY = 'seltzer:ref';

/** Stash a referral username (from a ?ref= link) for use after signup. */
export function stashReferral(username: string | null | undefined) {
  if (typeof window === 'undefined' || !username) return;
  const clean = username.trim().replace(/^@/, '');
  if (!clean) return;
  try { window.localStorage.setItem(REF_KEY, clean); } catch { /* storage off */ }
}

/**
 * Resolve the stashed referral to the referrer's user id. Does NOT clear it —
 * call clearReferral() once the new profile row is successfully created, so a
 * mid-signup hiccup (e.g. username collision) doesn't drop the referral.
 * Returns null when there's no referral, the referrer doesn't exist, or it
 * would be a self-referral.
 */
export async function resolveReferrer(currentUserId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  let name: string | null = null;
  try { name = window.localStorage.getItem(REF_KEY); } catch { /* storage off */ }
  if (!name) return null;
  try {
    const { data } = await getUserByUsername(name);
    if (data?.id && data.id !== currentUserId) return data.id;
  } catch { /* not found / error — no referral */ }
  return null;
}

export function clearReferral() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(REF_KEY); } catch { /* storage off */ }
}

/** The shareable invite link for a given username. */
export function referralLink(username: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/auth/signup?ref=${encodeURIComponent(username)}`;
}
