// app/global-error.tsx — Catches errors thrown in the root layout itself.
// In practice this is the last line of defense — only used when error.tsx
// can't be rendered (because the layout broke). MUST include <html> and
// <body> tags since it replaces the root.

'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[seltzer/global-error.tsx]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{
        background: '#0a0e1a', color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        margin: 0, minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center',
      }}>
        <div>
          <h1 style={{ color: '#22d3ee', fontWeight: 800, fontSize: '24px', marginBottom: '8px' }}>
            Crashed hard
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '320px' }}>
            The app blew up in a place we couldn't recover from. Refresh, or
            head back home.
          </p>
          <div style={{ marginTop: '24px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 16px', borderRadius: '999px',
                background: '#22d3ee', color: '#0a0e1a',
                fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <a
              href="/feed"
              style={{
                padding: '10px 16px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
                fontWeight: 600, fontSize: '13px', textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
