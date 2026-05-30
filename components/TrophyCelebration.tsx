// components/TrophyCelebration.tsx
//
// "Trophy earned!" celebration — the higher-prestige sibling of
// AchievementCelebration. Bigger confetti, rarity-colored glow, and the glossy
// TrophyMedallion front and center. Steps through a queue if several land at
// once. Purely presentational; the AchievementWatcher decides when to show it.

'use client';

import { useEffect, useState } from 'react';
import { Trophy, RARITY_META } from '@/lib/trophies';
import { TrophyMedallion } from './Trophy';
import { haptic } from '@/lib/haptics';

function Confetti({ colors }: { colors: string[] }) {
  const pieces = Array.from({ length: 48 }, (_, i) => {
    const angle = (i / 48) * Math.PI * 2;
    const cx = Math.round(Math.cos(angle) * (60 + Math.random() * 150));
    const cy = Math.round(120 + Math.random() * 160);
    const cr = Math.round(360 + Math.random() * 640);
    const cd = (0.9 + Math.random() * 1).toFixed(2);
    const delay = (Math.random() * 0.18).toFixed(2);
    const color = colors[i % colors.length];
    const w = 6 + Math.round(Math.random() * 6);
    return { i, cx, cy, cr, cd, delay, color, w };
  });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p) => (
        <span
          key={p.i}
          className="confetti-piece"
          style={{
            ['--cx' as any]: `${p.cx}px`,
            ['--cy' as any]: `${p.cy}px`,
            ['--cr' as any]: `${p.cr}deg`,
            ['--cd' as any]: `${p.cd}s`,
            ['--cdelay' as any]: `${p.delay}s`,
            width: p.w,
            height: Math.round(p.w * 0.45) + 3,
            background: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

export function TrophyCelebration({
  trophies,
  onClose,
}: {
  trophies: Trophy[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const current = trophies[idx];
  const total = trophies.length;

  useEffect(() => { haptic('heavy'); }, [idx]);

  if (!current) return null;
  const r = RARITY_META[current.rarity];
  const isLast = idx >= total - 1;
  const confettiColors = r.gradient.length > 1 ? r.gradient : [r.color, '#ffffff'];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-6 animate-fade-in"
      style={{ background: 'rgba(5,8,16,0.86)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs rounded-3xl text-center overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${r.color}66`,
          boxShadow: `0 24px 70px rgba(0,0,0,0.55), 0 0 56px ${r.color}3a`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Confetti key={idx} colors={confettiColors} />
        <div className="relative px-6 py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] mb-5" style={{ color: r.color }}>
            Trophy earned
          </p>
          <div key={idx} className="badge-reveal inline-flex mb-4">
            <TrophyMedallion trophy={current} earned size={112} />
          </div>
          <h2 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {current.name}
          </h2>
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-wider mt-2 px-2.5 py-0.5 rounded-full"
            style={{ background: `${r.color}22`, color: r.color }}
          >
            {r.label}
          </span>
          <p className="text-sm mt-3 italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            “{current.tagline}”
          </p>
          {total > 1 && (
            <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
              {idx + 1} of {total} new
            </p>
          )}
          <button
            onClick={() => { haptic('light'); if (isLast) onClose(); else setIdx((i) => i + 1); }}
            className="btn-primary w-full justify-center mt-5"
            style={{ padding: '12px' }}
          >
            {isLast ? 'Add to showroom' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
