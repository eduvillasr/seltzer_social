// components/TrophyArt.tsx
//
// Bold, flat-gold cartoony trophies (no gradients, thick outlines). A wide
// shallow goblet cup with chunky handles sits on a thick fluted block base with
// a name plaque. Rarity shows in the emblem disc, a subtle warm glow aura, and
// floating star sparkles (no glossy shine). Shapes: cup / star / obelisk.

'use client';

import { Trophy, RARITY_META, TrophyShape } from '@/lib/trophies';

// Warm flat palette
const GOLD = '#d4a02e';
const GOLD_DK = '#a8771c';
const OUT = '#6e4e12';
const PLAQUE = '#382712';
const PLAQUE_TEXT = '#e9c873';

const EMBLEM: Record<TrophyShape, { x: number; y: number; r: number }> = {
  cup: { x: 50, y: 31, r: 11 },
  star: { x: 50, y: 34, r: 9 },
  obelisk: { x: 50, y: 41, r: 9 },
};

// Shared thick, fluted block base with a name plaque.
function BlockBase({ name }: { name: string }) {
  return (
    <g>
      {/* top step */}
      <rect x="30" y="67" width="40" height="9" rx="2" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
      {/* main block */}
      <rect x="25" y="75" width="50" height="24" rx="2.5" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
      {/* fluting */}
      {[31, 69].map((x) => <line key={x} x1={x} y1="78" x2={x} y2="96" stroke={GOLD_DK} strokeWidth="1.6" />)}
      {/* name plaque */}
      <rect x="34" y="80" width="32" height="11" rx="1.5" fill={PLAQUE} stroke={OUT} strokeWidth="1.5" />
      <text x="50" y="88.2" textAnchor="middle" fontSize="6" fontWeight="700" fill={PLAQUE_TEXT} style={{ fontFamily: 'var(--font-display)' }}>
        {name.slice(0, 13)}
      </text>
    </g>
  );
}

function ShapeEls({ shape, name }: { shape: TrophyShape; name: string }) {
  if (shape === 'star') {
    return (
      <g>
        <BlockBase name={name} />
        <path d="M50 6 L60 30 L86 30 L65 45 L74 70 L50 55 L26 70 L35 45 L14 30 L40 30 Z" fill={GOLD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    );
  }
  if (shape === 'obelisk') {
    return (
      <g>
        <BlockBase name={name} />
        <path d="M50 8 L66 42 L50 66 L34 42 Z" fill={GOLD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
        <line x1="50" y1="8" x2="50" y2="66" stroke={GOLD_DK} strokeWidth="1.6" />
      </g>
    );
  }
  // cup
  return (
    <g>
      <BlockBase name={name} />
      {/* stem */}
      <rect x="44" y="56" width="12" height="12" fill={GOLD_DK} stroke={OUT} strokeWidth="2.5" />
      {/* chunky handles */}
      <path d="M20 19 C2 19 2 47 23 44 L23 39 C11 41 11 25 20 26 Z" fill={GOLD_DK} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M80 19 C98 19 98 47 77 44 L77 39 C89 41 89 25 80 26 Z" fill={GOLD_DK} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      {/* wide shallow goblet bowl */}
      <path d="M16 17 L84 17 C84 41 66 51 50 51 C34 51 16 41 16 17 Z" fill={GOLD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      {/* rim */}
      <rect x="13" y="13" width="74" height="6" rx="3" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
    </g>
  );
}

export function TrophyArt({
  trophy,
  earned,
  height = 120,
}: {
  trophy: Trophy;
  earned: boolean;
  height?: number;
}) {
  const r = RARITY_META[trophy.rarity];
  const Icon = trophy.icon;
  const shape = (trophy.shape ?? 'cup') as TrophyShape;
  const em = EMBLEM[shape];
  const W = Math.round(height * (100 / 150));
  const emblemPx = Math.round(W * (em.r * 2) / 100);
  const iconPx = Math.round(emblemPx * 0.62);

  if (!earned) {
    return (
      <div className="relative" style={{ width: W, height, opacity: 0.45 }}>
        <svg width={W} height={height} viewBox="0 0 100 150" style={{ display: 'block' }}>
          <g style={{ filter: 'grayscale(1) brightness(0.7)' }}>
            <ShapeEls shape={shape} name={trophy.name} />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: W, height }}>
      {/* subtle warm glow aura */}
      <div className="absolute pointer-events-none" style={{ inset: '-12%', borderRadius: '50%', background: `radial-gradient(ellipse at 50% 42%, ${hexA(r.color, 0.28)}, transparent 68%)`, filter: 'blur(6px)' }} />

      <svg width={W} height={height} viewBox="0 0 100 150" style={{ display: 'block', position: 'relative' }}>
        <ShapeEls shape={shape} name={trophy.name} />
        {/* emblem disc (rarity accent) */}
        <circle cx={em.x} cy={em.y} r={em.r} fill={r.color} stroke={OUT} strokeWidth="2.2" />
      </svg>

      {/* emblem icon */}
      <div className="absolute" style={{ left: `${em.x}%`, top: `${(em.y / 150) * 100}%`, transform: 'translate(-50%, -50%)' }}>
        <Icon size={iconPx} color="#fff" strokeWidth={2.4} />
      </div>

      {/* thin warm shadow underneath */}
      <div className="absolute pointer-events-none" style={{ bottom: -2, left: '50%', transform: 'translateX(-50%)', width: W * 0.6, height: 4, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', filter: 'blur(2px)' }} />

      {/* floating star sparkles (twinkle) */}
      {(trophy.special ? [0, 1, 2, 3] : [0, 1]).map((i) => (
        <span key={i} className="trophy-sparkle absolute pointer-events-none" style={{ left: `${14 + i * 24}%`, top: `${4 + (i % 2) * 20}%`, animationDelay: `${i * 0.6}s` }}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill="#ffe9a8" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function hexA(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}
