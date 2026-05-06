// hooks/useCachedFetch.ts
// Stale-while-revalidate hook for any async data fetch.
// Returns cached data instantly when available, then refetches in the
// background. Components render twice in the cache-hit case but the second
// render is usually with identical data so React skips DOM updates.

'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCached, peekCache } from '@/lib/cache';

interface Options {
  /** ms within which the cache is considered fresh — no revalidate fires. */
  freshMs?: number;
  /** Skip the fetch entirely (e.g. waiting on an auth token). */
  enabled?: boolean;
}

interface Result<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  /** Force a refetch (used by pull-to-refresh). */
  refetch: () => Promise<void>;
}

export function useCachedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: Options = {},
): Result<T> {
  const { freshMs = 30_000, enabled = true } = opts;

  // Snapshot whatever's in cache so the first render shows real data.
  const [data, setData] = useState<T | undefined>(() => (key ? peekCache<T>(key) : undefined));
  const [loading, setLoading] = useState<boolean>(() => !data && enabled && !!key);
  const [error, setError] = useState<Error | null>(null);

  // Hold the latest fetcher in a ref so we don't have to put it in the dep array
  // (otherwise inline-defined fetchers would loop forever).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Track the live key so a stale fetch doesn't write into a remounted hook.
  const liveKey = useRef(key);
  liveKey.current = key;

  useEffect(() => {
    if (!key || !enabled) { setLoading(false); return; }

    let cancelled = false;
    const startedFor = key;

    // If we have nothing cached, show loading state. Otherwise stay on the
    // cached value but kick off a revalidate in the background.
    const had = peekCache<T>(key);
    if (!had) setLoading(true);

    fetchCached<T>(key, () => fetcherRef.current(), freshMs)
      .then((next) => {
        if (cancelled || liveKey.current !== startedFor) return;
        setData(next);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled || liveKey.current !== startedFor) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [key, enabled, freshMs]);

  async function refetch() {
    if (!key) return;
    setLoading(true);
    try {
      // Pass a 0ms freshness window to bypass any cached value.
      const next = await fetchCached<T>(key, () => fetcherRef.current(), 0);
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, error, refetch };
}
