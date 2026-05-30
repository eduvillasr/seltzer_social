// components/TrophyArt.tsx
//
// Real sports-trophy silhouettes drawn as SVG — a handled cup, a star trophy,
// or a faceted obelisk — filled with the rarity gradient, with the trophy's
// icon set into an emblem on the front. Earned trophies glow + twinkle; the
// one-of-a-kind "special" trophy adds an occasional gleam. Locked trophies are
// dim silhouettes.

'use client';

import { Trophy, RARITY_META, TrophyShape } from '@/lib/trophies';

const EMBLEM: Record<TrophyShape, { x: number; y: number; r: number }> = {
  cup:     { x: 50, y: 36, r: 12 },
  star:    { x: 50, y: 33, r: 10 },
  obelisk: { x: 50, y: 46, r: 10 },
};

function ShapeEls({ shape, fillId, light, dark }: { shape: TrophyShape; fillId: string; light: string; dark: string }) {
  const fill = `url(#${fillId})`;
  switch (shape) {
    case 'star':
      return (
        <g>
          <rect x="46" y="56" width="8" height="12" fill={dark} />
          <rect x="37" y="68" width="26" height="6" rx="2" fill={dark} />
          <rect x="31" y="74" width="38" height="10" rx="2" fill={dark} />
          <path d="M50 10 L57 27 L75 27 L60 38 L66 56 L50 45 L34 56 L40 38 L25 27 L43 27 Z"
            fill={fill} stroke={light} strokeWidth="1" strokeLinejoin="round" />
        </g>
      );
    case 'obelisk':
      return (
        <g>
          <rect x="36" y="84" width="28" height="7" rx="2" fill={dark} />
          <rect x="31" y="90" width="38" height="10" rx="2" fill={dark} />
          <path d="M50 6 L64 50 L50 86 L36 50 Z" fill={fill} stroke={light} strokeWidth="1" strokeLinejoin="round" />
          <path d="M50 6 L50 86 L36 50 Z" fill="rgba(0,0,0,0.18)" />
        </g>
      );
    case 'cup':
    default:
      return (
        <g>
          {/* handles */}
          <path d="M28 26 C10 26 10 48 27 46" fill="none" stroke={fill} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M72 26 C90 26 90 48 73 46" fill="none" stroke={fill} strokeWidth="4.5" strokeLinecap="round" />
          {/* base */}
          <rect x="46" y="60" width="8" height="12" fill={dark} />
          <rect x="37" y="72" width="26" height="6" rx="2" fill={dark} />
          <rect x="31" y="78" width="38" height="10" rx="2" fill={dark} />
          {/* bowl */}
          <path d="M28 20 C28 50 40 60 50 60 C60 60 72 50 72 20 Z" fill={fill} stroke={light} strokeWidth="1" />
          <ellipse cx="50" cy="20" rx="22" ry="4" fill={light} opacity="0.55" />
        </g>
      );
  }
}

export function TrophyArt({
  trophy,
  earned,
  height = 110,
}: {
  trophy: Trophy;
  earned: boolean;
  height?: number;
}) {
  const r = RARITY_META[trophy.rarity];
  const Icon = trophy.icon;
  const shape = (trophy.shape ?? 'cup') as TrophyShape;
  const em = EMBLEM[shape];
  const W = Math.round(height * (100 / 140));
  const gid = `tg-${trophy.id}-${earned ? 'e' : 'l'}`;

  const stops = r.gradient;
  const light = stops[0];
  const dark = stops[stops.length - 1];
  const glowPx = Math.round(height * 0.16);

  const emblemPx = Math.round(W * (em.r * 2) / 100);
  const iconPx = Math.round(emblemPx * 0.66);

  if (!earned) {
    return (
      <div className="relative" style={{ width: W, height, opacity: 0.5 }}>
        <svg width={W} height={height} viewBox="0 0 100 140" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#39415c" />
              <stop offset="100%" stopColor="#222a40" />
            </linearGradient>
          </defs>
          <ShapeEls shape={shape} fillId={gid} light="#39415c" dark="#222a40" />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: W, height, filter: `drop-shadow(0 0 ${glowPx}px ${dark}88)` }}>
      <svg width={W} height={height} viewBox="0 0 100 140" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            {stops.map((c, i) => (
              <stop key={i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
        <ShapeEls shape={shape} fillId={gid} light={light} dark={dark} />
        {/* emblem disc */}
        <circle cx={em.x} cy={em.y} r={em.r} fill="rgba(0,0,0,0.22)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" />
      </svg>

      {/* emblem icon (HTML overlay, sits on the disc) */}
      <div
        className="absolute"
        style={{ left: `${em.x}%`, top: `${(em.y / 140) * 100}%`, transform: 'translate(-50%, -50%)' }}
      >
        <Icon size={iconPx} color="#fff" strokeWidth={2.2} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
      </div>

      {/* occasional gleam for the special trophy */}
      {trophy.special && (
        <div className="gleam-overlay absolute inset-0 pointer-events-none" style={{ overflow: 'hidden', borderRadius: 10 }} />
      )}

      {/* sparkles */}
      {(trophy.special ? [0, 1, 2] : [0]).map((i) => (
        <span
          key={i}
          className="trophy-sparkle absolute pointer-events-none"
          style={{ left: `${18 + i * 30}%`, top: `${4 + (i % 2) * 24}%`, animationDelay: `${i * 0.7}s` }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10">
            <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill="#fff" />
          </svg>
        </span>
      ))}
    </div>
  );
}
