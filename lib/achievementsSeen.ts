// lib/achievementsSeen.ts
//
// Tracks which achievement IDs a user has already "seen unlocked" so we can
// celebrate only the ones they JUST earned — the achievements system itself is
// stateless (it recomputes the full earned set every time), so this localStorage
// layer is what turns "you have these badges" into "you just unlocked this one!".
//
// First-run behavior is important: if we've never recorded anything for this
// user, we seed the store with everything currently unlocked and celebrate
// NOTHING. Otherwise a long-time user would get hit with a confetti storm for
// every badge they earned months ago the first time this ships.

const ACH_PREFIX = 'seltzer:ach-seen:';
const TROPHY_PREFIX = 'seltzer:trophy-seen:';

function keyFor(prefix: string, userId: string) {
  return `${prefix}${userId}`;
}

function read(prefix: string, userId: string): Set<string> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(prefix, userId));
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function write(prefix: string, userId: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(prefix, userId), JSON.stringify([...ids]));
  } catch {
    // storage full / disabled — non-fatal, we just won't track seen state.
  }
}

/**
 * Generic "what's new since we last looked" diff against a localStorage record.
 * Returns the subset of `currentIds` not previously seen, and records the new
 * state so each id only ever surfaces once. Returns [] (and seeds silently) on
 * the very first run for this user — so long-time users aren't spammed with a
 * storm of things they earned long ago.
 */
function pickNewly(prefix: string, userId: string, currentIds: string[]): string[] {
  if (!userId) return [];
  const seen = read(prefix, userId);

  if (seen === null) {
    write(prefix, userId, new Set(currentIds));
    return [];
  }

  const fresh = currentIds.filter((id) => !seen.has(id));
  if (fresh.length > 0) {
    for (const id of currentIds) seen.add(id);
    write(prefix, userId, seen);
  }
  return fresh;
}

/** Newly-unlocked achievement ids since last check (silent-seed on first run). */
export function pickNewlyUnlocked(userId: string, unlockedIds: string[]): string[] {
  return pickNewly(ACH_PREFIX, userId, unlockedIds);
}

/** Newly-earned trophy ids since last check (silent-seed on first run). */
export function pickNewlyEarnedTrophies(userId: string, earnedIds: string[]): string[] {
  return pickNewly(TROPHY_PREFIX, userId, earnedIds);
}
