// components/StarRating.tsx
// Read-only star display that supports half-step increments.
// A rating of 4.8 floors to 4.5 → shows 4 full + 1 half + 0 empty.

import { Star, StarHalf } from 'lucide-react';

interface StarRatingProps {
  value: number;
  size?: number;
  /** Max stars (default 5). */
  total?: number;
  className?: string;
}

/**
 * Floors the rating to the nearest 0.5. Examples:
 *   4.0  → 4.0   (4 full)
 *   4.4  → 4.0   (4 full)
 *   4.5  → 4.5   (4 full + 1 half)
 *   4.8  → 4.5   (4 full + 1 half)
 *   5.0  → 5.0   (5 full)
 */
export function toHalfStep(value: number): number {
  return Math.floor(value * 2) / 2;
}

export function StarRating({ value, size = 16, total = 5, className }: StarRatingProps) {
  const stepped = toHalfStep(Math.max(0, Math.min(total, value)));
  const fullCount = Math.floor(stepped);
  const hasHalf   = stepped - fullCount === 0.5;

  return (
    <div className={`flex gap-0.5 ${className ?? ''}`}>
      {Array.from({ length: total }).map((_, i) => {
        if (i < fullCount) {
          return <Star key={i} size={size} className="star-filled" />;
        }
        if (i === fullCount && hasHalf) {
          // The Lucide StarHalf glyph is a half-filled star outline; we render
          // it filled in amber to match the `star-filled` palette.
          return (
            <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
              {/* Empty base star for the unfilled half */}
              <Star
                size={size}
                className="star-empty absolute inset-0"
              />
              {/* Half-filled overlay */}
              <StarHalf
                size={size}
                className="star-filled absolute inset-0"
              />
            </span>
          );
        }
        return <Star key={i} size={size} className="star-empty" />;
      })}
    </div>
  );
}
