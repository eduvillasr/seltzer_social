// components/RatingInput.tsx

'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

interface RatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingInput({ value, onChange, label = 'Rating', size = 'md' }: RatingInputProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const displayRating = hoveredRating !== null ? hoveredRating : value;

  const starSize = size === 'sm' ? 18 : size === 'lg' ? 26 : 22;

  function updateRating(nextValue: number) {
    const clamped = Math.max(0, Math.min(5, nextValue));
    onChange(Math.round(clamped * 10) / 10);
  }

  const stars = Array(5)
    .fill(0)
    .map((_, i) => (
      <button
        key={i}
        type="button"
        className="transition-transform hover:scale-110 active:scale-95"
        aria-label={`Set rating to ${i + 1}`}
        onMouseEnter={() => setHoveredRating(i + 1)}
        onMouseLeave={() => setHoveredRating(null)}
        onClick={() => updateRating(i + 1)}
      >
        <Star
          size={starSize}
          className={`transition-colors ${
            i < Math.floor(displayRating)
              ? 'fill-amber-400 text-amber-400'
              : i === Math.floor(displayRating) && displayRating % 1 !== 0
              ? 'fill-amber-400 text-amber-400 opacity-50'
              : 'text-slate-200 hover:text-amber-200'
          }`}
        />
      </button>
    ));

  return (
    <div>
      <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>

      <div className="flex items-center gap-3">
        <div className="flex gap-1">{stars}</div>
        <input
          type="number"
          min="0"
          max="5"
          step="0.1"
          value={Number.isFinite(value) ? value.toFixed(1) : ''}
          onChange={(e) => updateRating(parseFloat(e.target.value) || 0)}
          className="input-field text-center font-bold"
          style={{
            width: size === 'sm' ? '66px' : '76px',
            padding: size === 'sm' ? '7px 8px' : '9px 10px',
          }}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/ 5</span>
      </div>
    </div>
  );
}
