// components/FirstTimeTip.tsx
//
// A one-time inline tooltip card. Pass a stable `tipId` and the card
// only renders if localStorage doesn't already have that ID marked seen.
// Tapping the X (or the dismiss button) marks it seen forever.
//
// Use sparingly — these are for genuinely first-touch hints, not running
// commentary. Good targets: the first Tried-It pill on the feed, the
// sort dropdown on a brand page, etc.

'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

const STORAGE_KEY_PREFIX = 'seltzer:tip-seen:';

/** Returns [shown, dismiss]. Server-safe (always false until mounted). */
export function useFirstTimeTip(tipId: string) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(STORAGE_KEY_PREFIX + tipId) === '1';
    setShown(!seen);
  }, [tipId]);

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY_PREFIX + tipId, '1');
    }
    setShown(false);
  }

  return { shown, dismiss };
}

interface FirstTimeTipProps {
  tipId: string;
  title: string;
  body: string;
  /** Optional CTA text — if set, renders a primary button that dismisses. */
  ctaText?: string;
  /** Optional pointer arrow direction. Defaults to no arrow. */
  arrow?: 'up' | 'down' | 'left' | 'right' | 'none';
}

export function FirstTimeTip({ tipId, title, body, ctaText, arrow = 'none' }: FirstTimeTipProps) {
  const { shown, dismiss } = useFirstTimeTip(tipId);
  if (!shown) return null;

  return (
    <div
      className="relative rounded-2xl p-3 animate-fade-in-up"
      style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(167,139,250,0.08))',
        border: '1px solid rgba(34,211,238,0.30)',
        boxShadow: '0 8px 24px rgba(6,182,212,0.10)',
      }}
    >
      {/* Arrow tip — tiny chevron pointing at whatever this tip is anchored to */}
      {arrow !== 'none' && <ArrowPip dir={arrow} />}

      <div className="flex items-start gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(34,211,238,0.18)' }}
        >
          <Sparkles size={13} style={{ color: 'var(--cyan-400)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>{title}</p>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{body}</p>
          {ctaText && (
            <button
              onClick={dismiss}
              className="text-[11px] font-semibold mt-2 hover:underline"
              style={{ color: 'var(--cyan-400)' }}
            >
              {ctaText} →
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="rounded-full w-6 h-6 flex items-center justify-center hover:bg-white/5 flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Got it"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function ArrowPip({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    width: 0, height: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
  };
  // Border-color hack to draw a CSS triangle whose tip points at `dir`.
  // Use the same translucent cyan as the card border so it visually
  // belongs to the same surface.
  const tipColor = 'rgba(34,211,238,0.30)';
  switch (dir) {
    case 'up':
      Object.assign(style, {
        top: -8, left: 24, borderWidth: '0 8px 8px 8px',
        borderBottomColor: tipColor,
      });
      break;
    case 'down':
      Object.assign(style, {
        bottom: -8, left: 24, borderWidth: '8px 8px 0 8px',
        borderTopColor: tipColor,
      });
      break;
    case 'left':
      Object.assign(style, {
        left: -8, top: 16, borderWidth: '8px 8px 8px 0',
        borderRightColor: tipColor,
      });
      break;
    case 'right':
      Object.assign(style, {
        right: -8, top: 16, borderWidth: '8px 0 8px 8px',
        borderLeftColor: tipColor,
      });
      break;
  }
  return <span style={style} aria-hidden />;
}
