// components/CanImage.tsx
// Canonical seltzer-can image. Cans are tall product shots, so object-cover
// crops the top/bottom off. This shows the WHOLE can via object-contain on a
// light "shelf" plate, so it always fits its box no matter the aspect ratio.
//
// Sizing + rounding come from the caller via `className` (e.g. "w-16 h-20
// rounded-lg"). Use this for canonical/product cans only — avatars and user
// lifestyle photos should keep object-cover.

import type { CSSProperties, ReactNode } from 'react';

interface CanImageProps {
  src?: string | null;
  alt?: string;
  /** Sizing + rounding, e.g. "w-16 h-20 rounded-lg". Applied to the plate. */
  className?: string;
  /** Inline styles passed to the plate (e.g. a border). */
  style?: CSSProperties;
  /** Shown when there's no image. Defaults to a blank plate. */
  fallback?: ReactNode;
  loading?: 'lazy' | 'eager';
  /** Inner breathing room so the can doesn't touch the edges. Default true. */
  padded?: boolean;
}

// Soft light "studio" plate — a centered spotlight so the can looks like a
// product shot, with a gentle vignette toward the edges instead of a flat fill.
const PLATE =
  'radial-gradient(120% 100% at 50% 28%, #ffffff 0%, #f1f5f9 55%, #dbe3ee 100%)';
// Faint inner ring so the light plate has a defined edge against the dark UI.
const PLATE_RING = 'inset 0 0 0 1px rgba(15,23,42,0.06)';

export function CanImage({
  src,
  alt = '',
  className = '',
  style,
  fallback,
  loading = 'lazy',
  padded = true,
}: CanImageProps) {
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{
        background: src ? PLATE : 'rgba(148,163,184,0.06)',
        boxShadow: src ? PLATE_RING : undefined,
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          className={`w-full h-full object-contain ${padded ? 'p-2' : ''}`}
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(15,23,42,0.18))',
          }}
        />
      ) : (
        fallback ?? null
      )}
    </div>
  );
}
