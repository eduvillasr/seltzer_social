// components/AchievementCelebration.tsx
//
// Full-screen "Achievement unlocked!" celebration. Takes a queue of freshly
// earned achievements and reveals them one at a time with confetti, a badge
// pop, and a haptic. Purely presentational — the AchievementWatcher decides
// when (and with what) to show it.

'use client';

import { useEffect, useState } from 'react';
import { Achievement, TIER_META } from '@/lib/achievements';
import { AchievementBadge } from './AchievementBadge';
import { haptic } from '@/lib/haptics';

const CONFETTI_COLORS = ['#22d3ee', '#a78bfa', '#f4c430', '#fb7185', '#2dd4bf'];

function Confetti() {
  // Burst outward + down. Math.random is fine here (client-only render).
  const pieces = Array.from({ length: 38 }, (_, i) => {
    const angle = (i / 38) * Math.PI * 2;
    const cx = Math.round(Math.cos(angle) * (50 + Math.random() * 130));
    const cy = Math.round(110 + Math.random() * 150);
    const cr = Math.round(360 + Math.random() * 540);
    const cd = (0.9 + Math.random() * 0.9).toFixed(2);
    const delay = (Math.random() * 0.15).toFixed(2);
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const w = 6 + Math.round(Math.random() * 5);
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

export function AchievementCelebration({
  achievements,
  onClose,
}: {
  achievements: Achievement[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const current = achievements[idx];
  const total = achievements.length;

  // Pop a success haptic on each reveal.
  useEffect(() => { haptic('success'); }, [idx]);

  if (!current) return null;
  const tier = TIER_META[current.tier];
  const isLast = idx >= total - 1;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-fade-in"
      style={{ background: 'rgba(5,8,16,0.82)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs rounded-3xl text-center overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${tier.color}55`,
          boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 40px ${tier.color}26`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Confetti key={idx} />
        <div className="relative px-6 py-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] mb-4" style={{ color: tier.color }}>
            Achievement unlocked
          </p>
          <div key={idx} className="badge-reveal inline-flex mb-4">
            <AchievementBadge achievement={current} unlocked size="lg" />
          </div>
          <h2 className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {current.name}
          </h2>
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-wider mt-1.5 px-2 py-0.5 rounded-full"
            style={{ background: `${tier.color}22`, color: tier.color }}
          >
            {tier.label}
          </span>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {current.description}
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
            {isLast ? 'Nice!' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
