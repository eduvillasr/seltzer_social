// components/BackHeader.tsx
//
// A sticky, glass-blur header that pins to the top of the scrolling main
// area on inner pages. Replaces the bare "<Link>...<ArrowLeft />..." back
// button so it stays reachable when the user has scrolled down.
//
// Usage:
//   <BackHeader href="/feed" />
//   <BackHeader href="/trending" label="Back to trending" />
//
// Drop this in as the first child of <main> on any inner page. It expects
// the parent to have left/right padding (most pages use `px-4`) and works
// inside a `max-w-md` column.

'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function BackHeader({
  href,
  label = 'Back',
}: {
  href: string;
  label?: string;
}) {
  return (
    <div
      className="sticky z-30 -mx-4 px-4 py-2"
      style={{
        // Sit just above the page content; visually flush with the top.
        top: 0,
        background: 'rgba(10, 14, 26, 0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <Link
        href={href}
        className="inline-flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <ArrowLeft size={16} /> {label}
      </Link>
    </div>
  );
}
