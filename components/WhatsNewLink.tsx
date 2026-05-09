// components/WhatsNewLink.tsx
//
// Compact "What's New" entry-point with an unseen-dot indicator.
// Shows the cyan dot until the user opens /whats-new (which writes
// the current version to localStorage via lib/changelog.ts).
//
// Drop on any page where you want users to discover updates:
//   <WhatsNewLink />                     // pill style with text
//   <WhatsNewLink variant="icon" />      // icon-only with dot
//   <WhatsNewLink variant="row" />       // settings-style full-width row

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import { CURRENT_VERSION, hasUnseenRelease } from '@/lib/changelog';

type Variant = 'pill' | 'icon' | 'row';

export function WhatsNewLink({ variant = 'pill' }: { variant?: Variant }) {
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    setHasUnseen(hasUnseenRelease());
    // Re-check whenever this tab regains focus — the user might have
    // visited the page in another tab.
    const onFocus = () => setHasUnseen(hasUnseenRelease());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (variant === 'icon') {
    return (
      <Link
        href="/whats-new"
        className="relative inline-flex items-center justify-center rounded-full transition-colors hover:bg-white/5"
        style={{ width: 36, height: 36, border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
        title={hasUnseen ? `What's New — v${CURRENT_VERSION}` : "What's New"}
        aria-label="What's New"
      >
        <Sparkles size={15} />
        {hasUnseen && <UnseenDot />}
      </Link>
    );
  }

  if (variant === 'row') {
    return (
      <Link
        href="/whats-new"
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/5"
        style={{ color: 'var(--text-secondary)' }}
      >
        <div className="relative">
          <Sparkles size={18} />
          {hasUnseen && <UnseenDot />}
        </div>
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>What's New</span>
        {hasUnseen && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--cyan-400)' }}
          >
            v{CURRENT_VERSION}
          </span>
        )}
        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
      </Link>
    );
  }

  // default: pill
  return (
    <Link
      href="/whats-new"
      className="relative inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors hover:bg-white/5"
      style={{
        padding: '6px 11px',
        background: hasUnseen ? 'rgba(34,211,238,0.10)' : 'rgba(15,20,36,0.5)',
        color: hasUnseen ? 'var(--cyan-400)' : 'var(--text-tertiary)',
        border: `1px solid ${hasUnseen ? 'rgba(34,211,238,0.30)' : 'var(--border-subtle)'}`,
      }}
    >
      <Sparkles size={12} />
      What's New
      {hasUnseen && <UnseenDot inline />}
    </Link>
  );
}

function UnseenDot({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className="block rounded-full"
      style={{
        position: inline ? 'static' : 'absolute',
        top: inline ? undefined : -2,
        right: inline ? undefined : -2,
        width: 8,
        height: 8,
        marginLeft: inline ? 4 : undefined,
        background: 'var(--cyan-400)',
        boxShadow: '0 0 6px rgba(34,211,238,0.7)',
      }}
      aria-label="New updates"
    />
  );
}
