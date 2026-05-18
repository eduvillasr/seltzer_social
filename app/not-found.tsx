// app/not-found.tsx — Friendly catch-all for 404s.
//
// Replaces Next.js's default blank "404 / This page could not be found"
// with a styled page that lets the user recover. Triggered by any route
// that doesn't match, plus any `notFound()` call we add later.

import Link from 'next/link';
import { Droplets, Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(34,211,238,0.10)' }}>
        <Droplets size={26} className="text-cyan-400" />
      </div>
      <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        Page not found
      </h1>
      <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
        The drink, list, or profile you were looking for isn't here anymore — it
        may have been renamed, merged, or removed.
      </p>
      <div className="mt-6 flex gap-2 flex-wrap justify-center">
        <Link href="/feed" className="btn-primary inline-flex items-center gap-1.5" style={{ padding: '10px 16px', fontSize: '13px' }}>
          <Home size={14} /> Back to feed
        </Link>
        <Link href="/discover" className="btn-secondary inline-flex items-center gap-1.5" style={{ padding: '10px 16px', fontSize: '13px' }}>
          <Search size={14} /> Discover
        </Link>
      </div>
    </main>
  );
}
