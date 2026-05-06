// public/sw.js
// Minimal service worker. Job: be present so Chrome shows the "Install"
// prompt on Android, AND give us a tiny offline fallback. We're explicitly
// NOT caching app routes — Next.js handles that better, and aggressive
// caching would mask deploys. Just network-first with a fallback page.

const CACHE_NAME = 'seltzer-social-v1';

self.addEventListener('install', (event) => {
  // Activate immediately on first install (don't wait for old tabs to close).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any open pages without requiring a reload.
  event.waitUntil(self.clients.claim());
  // Drop old caches if we ever bumped the version
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET, only for our own origin. Pass everything else through
  // (Supabase requests, API routes, etc. should never go through this SW).
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first — never serve a stale page if we're online.
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((hit) => hit || new Response(
        '<!doctype html><meta charset=utf-8><title>Offline</title>' +
        '<style>body{font:16px/1.5 system-ui;background:#0a0e1a;color:#94a3b8;' +
        'display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center;padding:24px}</style>' +
        '<h1 style="color:#22d3ee;font-weight:800">You’re offline</h1>' +
        '<p>Reconnect and pull to refresh.</p>',
        { headers: { 'content-type': 'text/html;charset=utf-8' } },
      )),
    ),
  );
});
