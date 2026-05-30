// components/TrophyArt.tsx
//
// Seltzer-themed flat-gold trophies (no gradients, thick outlines). A tall
// ridged CAN with a pull-tab + label band, a fizzy GLASS, or a curvy BOTTLE —
// each on a thick fluted block base with a name plaque, with rising fizz
// bubbles, a rarity-colored label emblem, a subtle warm glow aura, and floating
// star sparkles (no glossy shine).

'use client';

import { Trophy, RARITY_META, TrophyShape } from '@/lib/trophies';

// Warm flat palette
const GOLD = '#d4a02e';
const GOLD_DK = '#a8771c';
const OUT = '#6e4e12';
const PLAQUE = '#382712';
const PLAQUE_TEXT = '#e9c873';

// Where the label emblem disc sits per shape (viewBox 100x150).
const EMBLEM: Record<TrophyShape, { x: number; y: number; r: number }> = {
  can: { x: 50, y: 56, r: 12 },
  glass: { x: 50, y: 52, r: 10 },
  bottle: { x: 50, y: 58, r: 11 },
};

function BlockBase({ name }: { name: string }) {
  return (
    <g>
      <rect x="30" y="100" width="40" height="8" rx="2" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
      <rect x="25" y="107" width="50" height="22" rx="2.5" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
      {[31, 69].map((x) => <line key={x} x1={x} y1="110" x2={x} y2="126" stroke={GOLD_DK} strokeWidth="1.6" />)}
      <rect x="34" y="111" width="32" height="11" rx="1.5" fill={PLAQUE} stroke={OUT} strokeWidth="1.5" />
      <text x="50" y="119.2" textAnchor="middle" fontSize="6" fontWeight="700" fill={PLAQUE_TEXT} style={{ fontFamily: 'var(--font-display)' }}>
        {name.slice(0, 13)}
      </text>
    </g>
  );
}

function ShapeEls({ shape, name }: { shape: TrophyShape; name: string }) {
  if (shape === 'glass') {
    return (
      <g>
        <BlockBase name={name} />
        {/* tapered tumbler */}
        <path d="M34 22 L66 22 L60 96 L40 96 Z" fill={GOLD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
        {/* rim */}
        <rect x="31" y="18" width="38" height="6" rx="3" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
        {/* fizz inside */}
        {[[44, 40], [54, 52], [47, 64], [56, 74]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 2 ? 2 : 2.6} fill="none" stroke={GOLD_DK} strokeWidth="1.4" />
        ))}
      </g>
    );
  }
  if (shape === 'bottle') {
    return (
      <g>
        <BlockBase name={name} />
        {/* cap */}
        <rect x="44" y="8" width="12" height="8" rx="1.5" fill={GOLD_DK} stroke={OUT} strokeWidth="2.5" />
        {/* body with neck + shoulders */}
        <path d="M44 16 L56 16 L56 28 C64 33 66 42 66 52 L66 96 L34 96 L34 52 C34 42 36 33 44 28 Z" fill={GOLD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
        {/* label band */}
        <rect x="34" y="50" width="32" height="20" fill={GOLD_DK} stroke={OUT} strokeWidth="2.2" />
      </g>
    );
  }
  // can
  return (
    <g>
      <BlockBase name={name} />
      {/* pull-tab */}
      <ellipse cx="50" cy="13" rx="7" ry="2.6" fill={GOLD_DK} stroke={OUT} strokeWidth="2" />
      <circle cx="50" cy="13" r="3" fill="none" stroke={OUT} strokeWidth="1.6" />
      {/* body */}
      <rect x="32" y="16" width="36" height="82" rx="7" fill={GOLD} stroke={OUT} strokeWidth="2.5" />
      {/* top + bottom ridges */}
      {[22, 26, 88, 92].map((y) => <line key={y} x1="34" y1={y} x2="66" y2={y} stroke={GOLD_DK} strokeWidth="1.4" />)}
      {/* condensation line */}
      <path d="M60 30 Q63 44 60 58 Q57 72 60 84" fill="none" stroke="#f3e6bf" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      {/* label band */}
      <rect x="30" y="46" width="40" height="22" fill={GOLD_DK} stroke={OUT} strokeWidth="2.4" />
      <line x1="30" y1="46" x2="70" y2="46" stroke={OUT} strokeWidth="1.4" />
      <line x1="30" y1="68" x2="70" y2="68" stroke={OUT} strokeWidth="1.4" />
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
  const shape = (trophy.shape ?? 'can') as TrophyShape;
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
      {/* warm glow aura */}
      <div className="absolute pointer-events-none" style={{ inset: '-12%', borderRadius: '50%', background: `radial-gradient(ellipse at 50% 44%, ${hexA(r.color, 0.26)}, transparent 68%)`, filter: 'blur(6px)' }} />

      <svg width={W} height={height} viewBox="0 0 100 150" style={{ display: 'block', position: 'relative' }}>
        <ShapeEls shape={shape} name={trophy.name} />
        {/* label emblem disc (rarity accent) */}
        <circle cx={em.x} cy={em.y} r={em.r} fill={r.color} stroke={OUT} strokeWidth="2.2" />
      </svg>

      {/* emblem icon (the "logo" on the label) */}
      <div className="absolute" style={{ left: `${em.x}%`, top: `${(em.y / 150) * 100}%`, transform: 'translate(-50%, -50%)' }}>
        <Icon size={iconPx} color="#fff" strokeWidth={2.4} />
      </div>

      {/* rising fizz bubbles off the top */}
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="fizz-bubble"
          style={{ left: `${36 + i * 9}%`, top: `${10 + (i % 2) * 6}%`, width: 3 + (i % 2) * 2, height: 3 + (i % 2) * 2, animationDuration: `${2.4 + i * 0.5}s`, animationDelay: `${i * 0.4}s` }}
        />
      ))}

      {/* thin warm shadow underneath */}
      <div className="absolute pointer-events-none" style={{ bottom: -2, left: '50%', transform: 'translateX(-50%)', width: W * 0.6, height: 4, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', filter: 'blur(2px)' }} />

      {/* floating star sparkles */}
      {(trophy.special ? [0, 1, 2] : [0, 1]).map((i) => (
        <span key={`s${i}`} className="trophy-sparkle absolute pointer-events-none" style={{ left: `${12 + i * 30}%`, top: `${24 + (i % 2) * 18}%`, animationDelay: `${i * 0.6}s` }}>
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
