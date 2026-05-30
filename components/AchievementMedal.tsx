// components/AchievementMedal.tsx
//
// Shaped achievement emblems for the trophy case. The shape escalates with
// rarity so rarer honors look different on the shelf:
//   bronze / silver  → round medal (with a ribbon loop)
//   gold             → frilled rosette ribbon (with two tails)
//   platinum / legendary → heraldic shield
// Flat cartoony fills, thick warm outlines, the achievement icon set in white.

'use client';

import { Achievement, TIER_META } from '@/lib/achievements';

const OUT = '#5a3a12';

function shapeFor(tier: string): 'round' | 'rosette' | 'shield' {
  if (tier === 'legendary' || tier === 'platinum') return 'shield';
  if (tier === 'gold') return 'rosette';
  return 'round';
}

export function AchievementMedal({ achievement, height = 64 }: { achievement: Achievement; height?: number }) {
  const color = TIER_META[achievement.tier].color;
  const Icon = achievement.icon;
  const shape = shapeFor(achievement.tier);
  const W = Math.round(height * (60 / 80));
  const iconPx = Math.round(W * 0.3);
  const iconCy = shape === 'round' ? 36 : 30;

  // 12-point frilled rosette edge.
  const rosette = Array.from({ length: 24 }, (_, k) => {
    const ang = (Math.PI / 12) * k - Math.PI / 2;
    const rr = k % 2 === 0 ? 18 : 13.5;
    return `${(30 + rr * Math.cos(ang)).toFixed(1)},${(30 + rr * Math.sin(ang)).toFixed(1)}`;
  }).join(' L');

  return (
    <div className="relative" style={{ width: W, height }}>
      <svg width={W} height={height} viewBox="0 0 60 80" style={{ display: 'block' }}>
        {shape === 'round' && (
          <>
            <rect x="26" y="4" width="8" height="13" rx="1.5" fill={color} stroke={OUT} strokeWidth="2.5" />
            <circle cx="30" cy="36" r="22" fill={color} stroke={OUT} strokeWidth="3" />
            <circle cx="30" cy="36" r="16" fill="none" stroke={OUT} strokeWidth="1.4" opacity="0.5" />
          </>
        )}
        {shape === 'rosette' && (
          <>
            <path d="M22 42 L17 76 L28 67 L31 48 Z" fill={color} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M38 42 L43 76 L32 67 L29 48 Z" fill={color} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
            <path d={`M${rosette} Z`} fill={color} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx="30" cy="30" r="11" fill={color} stroke={OUT} strokeWidth="2" />
          </>
        )}
        {shape === 'shield' && (
          <path d="M30 5 L54 13 L54 35 C54 53 30 66 30 66 C30 66 6 53 6 35 L6 13 Z" fill={color} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
        )}
      </svg>
      <div className="absolute" style={{ left: '50%', top: `${(iconCy / 80) * 100}%`, transform: 'translate(-50%, -50%)' }}>
        <Icon size={iconPx} color="#fff" strokeWidth={2.4} style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }} />
      </div>
    </div>
  );
}
