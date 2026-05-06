// components/RatingInput.tsx

'use client';

import { useRef, useState } from 'react';
import { Star, StarHalf, Minus, Plus } from 'lucide-react';

interface RatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingInput({ value, onChange, label = 'Rating', size = 'md' }: RatingInputProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const displayRating = hoveredRating !== null ? hoveredRating : value;
  const starSize = size === 'sm' ? 22 : size === 'lg' ? 30 : 26;

  function clampStep(next: number): number {
    const clamped = Math.max(0, Math.min(5, next));
    return Math.round(clamped * 10) / 10;
  }

  function updateRating(nextValue: number) {
    onChange(clampStep(nextValue));
  }

  function bump(delta: number) {
    updateRating((Number.isFinite(value) ? value : 0) + delta);
  }

  // Translate a horizontal pointer x-coordinate into a 0–5 rating in 0.1 steps.
  // Used by both tap-to-set and touch-drag.
  function ratingFromPointerX(clientX: number): number {
    const el = containerRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampStep(ratio * 5);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updateRating(ratingFromPointerX(e.clientX));
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    updateRating(ratingFromPointerX(e.clientX));
  }
  function onPointerUp() {
    dragging.current = false;
  }

  // Render each star slot. Floor to nearest 0.5 so the half-fill icon shows
  // up nicely when the value falls in the middle of a star.
  const stepped = Math.floor(displayRating * 2) / 2;

  return (
    <div>
      <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Tap-to-set + drag-to-fine-tune track */}
        <div
          ref={containerRef}
          className="flex gap-1 select-none"
          style={{ touchAction: 'none', cursor: 'pointer' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => { dragging.current = false; }}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={value}
        >
          {Array.from({ length: 5 }).map((_, i) => {
            const full = i < Math.floor(stepped);
            const half = !full && i === Math.floor(stepped) && stepped % 1 === 0.5;
            return (
              <span
                key={i}
                onMouseEnter={() => setHoveredRating(i + 1)}
                onMouseLeave={() => setHoveredRating(null)}
                style={{ position: 'relative', display: 'inline-flex', width: starSize, height: starSize }}
              >
                {/* Empty base star */}
                <Star size={starSize} className="absolute inset-0 text-slate-200" style={{ opacity: 0.25 }} />
                {/* Full overlay */}
                {full && <Star size={starSize} className="absolute inset-0 fill-amber-400 text-amber-400" />}
                {/* Half overlay */}
                {half && <StarHalf size={starSize} className="absolute inset-0 fill-amber-400 text-amber-400" />}
              </span>
            );
          })}
        </div>

        {/* Numeric input + bump buttons. Decimal keyboard on mobile. */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => bump(-0.1)}
            className="rounded-full flex items-center justify-center transition-colors hover:bg-white/5 active:scale-95"
            style={{
              width: size === 'sm' ? 28 : 32,
              height: size === 'sm' ? 28 : 32,
              border: '1px solid var(--border-medium)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Decrease rating"
          >
            <Minus size={13} />
          </button>

          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="5"
            step="0.1"
            value={Number.isFinite(value) ? value.toFixed(1) : ''}
            onChange={(e) => updateRating(parseFloat(e.target.value) || 0)}
            className="input-field text-center font-bold"
            style={{
              width: size === 'sm' ? 60 : 70,
              padding: size === 'sm' ? '7px 4px' : '9px 6px',
            }}
          />

          <button
            type="button"
            onClick={() => bump(0.1)}
            className="rounded-full flex items-center justify-center transition-colors hover:bg-white/5 active:scale-95"
            style={{
              width: size === 'sm' ? 28 : 32,
              height: size === 'sm' ? 28 : 32,
              border: '1px solid var(--border-medium)',
              color: 'var(--text-secondary)',
            }}
            aria-label="Increase rating"
          >
            <Plus size={13} />
          </button>

          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>/ 5</span>
        </div>
      </div>

      <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
        Tap a star, slide along the row for a half-step, or use ± for 0.1 precision.
      </p>
    </div>
  );
}
