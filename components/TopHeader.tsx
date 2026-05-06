// components/TopHeader.tsx
// Instagram-style fixed top header. The solid background extends up into
// the status-bar safe-area, so on iPhones the time / wifi / battery icons
// sit on a clean colored band instead of overlaying page content.
//
// Pair with `.with-top-header` utility on the page's <main> so the content
// gets pushed below the header.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Droplets, ArrowLeft } from 'lucide-react';

export interface TopHeaderProps {
  /** Page title shown next to / instead of the brand mark. */
  title?: string;
  /** When set, swaps the brand mark for a back-arrow that goes to this URL.
   *  Pass `true` to use browser-back instead. */
  back?: string | boolean;
  /** Right-side slot — typically an icon button or pill. */
  right?: React.ReactNode;
  /** Hide the brand droplet (e.g. when you only want a back button + title). */
  hideBrand?: boolean;
}

export function TopHeader({ title, back, right, hideBrand }: TopHeaderProps) {
  const router = useRouter();

  return (
    <>
      {/* The actual fixed bar */}
      <header
        className="fixed top-0 left-0 right-0 z-40"
        style={{
          // Solid app background covers the status-bar area too
          background: 'var(--bg-primary)',
          // The status-bar inset becomes part of the header's height,
          // so on phones the bar visually extends from the very top of
          // the screen down past the title row.
          paddingTop: 'env(safe-area-inset-top, 0px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="max-w-md mx-auto px-4 h-12 flex items-center gap-3">
          {/* Left — back button OR brand droplet */}
          {back ? (
            typeof back === 'string' ? (
              <Link
                href={back}
                className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors flex-shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </Link>
            ) : (
              <button
                onClick={() => router.back()}
                className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors flex-shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
            )
          ) : !hideBrand ? (
            <Link href="/feed" className="flex items-center gap-2 flex-shrink-0" aria-label="Home">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
                <Droplets size={14} className="text-white" />
              </div>
            </Link>
          ) : null}

          {/* Title */}
          <h1
            className="text-base font-extrabold truncate flex-1 min-w-0"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            {title ?? 'Seltzer Social'}
          </h1>

          {/* Right slot */}
          {right ? <div className="flex-shrink-0">{right}</div> : null}
        </div>
      </header>
    </>
  );
}
