// components/RouterRefresher.tsx
//
// Global "tab regained focus → refresh the router cache" effect.
//
// Why this exists:
//   Next.js 14 App Router aggressively caches RSC payloads on the client.
//   When a user backgrounds the tab for hours and comes back, the cache
//   can serve stale content — sometimes a stale 404 (when a referenced
//   row was deleted server-side), sometimes a stale list. router.refresh()
//   re-fetches the active segment without a full page reload, so state
//   like scroll position stays intact.
//
// Throttled to once per 30s so a quick alt-tab storm doesn't hammer
// our server. Mounted once globally in app/layout.tsx.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function RouterRefresher() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let last = Date.now();
    const COOLDOWN_MS = 30_000;

    function maybeRefresh() {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < COOLDOWN_MS) return;
      last = now;
      router.refresh();
    }

    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    // Also catch the page-restore from bfcache (browser back/forward swipe).
    window.addEventListener('pageshow', (e) => {
      if ((e as PageTransitionEvent).persisted) maybeRefresh();
    });

    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [router]);

  return null;
}
