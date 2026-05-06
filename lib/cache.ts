// lib/cache.ts
// In-memory stale-while-revalidate cache for client-side data fetches.
//
// Why: every navigation re-runs the same Supabase queries from scratch.
// With this cache, going back to a page paints instantly with the last
// known data, then quietly revalidates in the background. Cuts the
// "feel" of latency without adding a real fetching library.

interface Entry<T = any> {
  data: T;
  ts: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<any>>();

const DEFAULT_FRESH_MS = 30_000;     // 30s — within this window, no revalidate
const DEFAULT_STALE_MS = 10 * 60_000; // 10m — drop entirely after this

/**
 * Run `fetcher`, optionally returning a cached value first. Caller is
 * responsible for invoking the returned function as needed (this is the
 * lower-level primitive — most components should use `useCachedFetch`).
 */
export async function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  freshMs: number = DEFAULT_FRESH_MS,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < freshMs) {
    return hit.data as T;
  }
  // Coalesce parallel requests for the same key.
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { data, ts: Date.now() });
      return data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Read whatever's cached without fetching. Used to render instantly. */
export function peekCache<T>(key: string, staleMs: number = DEFAULT_STALE_MS): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > staleMs) {
    cache.delete(key);
    return undefined;
  }
  return hit.data as T;
}

/** Manually swap in a value (e.g. after an optimistic update). */
export function setCache<T>(key: string, data: T) {
  cache.set(key, { data, ts: Date.now() });
}

/** Drop everything matching a prefix (e.g. `feed:` or `profile:alice`). */
export function invalidate(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Drop everything. Useful on sign-out. */
export function clearCache() {
  cache.clear();
  inflight.clear();
}
