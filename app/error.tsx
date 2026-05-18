// app/error.tsx — Per-route error boundary.
//
// Triggered when a Server Component or a render throws (or a client
// component throws during render). Without this file, Next.js falls
// through to its raw global error screen, which often gets reported as
// "404 / page not found" by users even when it's actually a transient
// failure (auth expired, network blip, stale router cache, etc.).
//
// We give them a Try Again button (re-runs the segment) and a Back to
// Feed escape hatch so they're never trapped.

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Droplets, RotateCcw, Home } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Surface for debugging — won't ship to a server, just shows in DevTools.
    // eslint-disable-next-line no-console
    console.error('[seltzer/error.tsx]', error);
  }, [error]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(251,113,133,0.10)' }}>
        <Droplets size={26} style={{ color: '#fb7185' }} />
      </div>
      <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        Something went sideways
      </h1>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
        We hit an error rendering this page. It's usually a stale session or a
        network hiccup — try again should fix it.
      </p>
      <div className="mt-6 flex gap-2 flex-wrap justify-center">
        <button
          onClick={() => { reset(); router.refresh(); }}
          className="btn-primary inline-flex items-center gap-1.5"
          style={{ padding: '10px 16px', fontSize: '13px' }}
        >
          <RotateCcw size={14} /> Try again
        </button>
        <Link href="/feed" className="btn-secondary inline-flex items-center gap-1.5" style={{ padding: '10px 16px', fontSize: '13px' }}>
          <Home size={14} /> Back to feed
        </Link>
      </div>
      {process.env.NODE_ENV === 'development' && error.message && (
        <pre
          className="mt-6 text-[10px] max-w-md overflow-x-auto rounded-lg p-3"
          style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          {error.message}
        </pre>
      )}
    </main>
  );
}
