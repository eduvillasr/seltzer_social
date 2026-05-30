// components/TrophyStatue.tsx
//
// A tall, museum-piece trophy — a glossy chalice form in the trophy's rarity
// colors with the icon embossed, a stem, and a base. Earned trophies shine and
// twinkle; the one-of-a-kind "special" trophy gets extra sparkles and an
// occasional bright gleam. Locked trophies are dim silhouettes.

'use client';

import { Trophy, RARITY_META } from '@/lib/trophies';

function hexA(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export function TrophyStatue({
  trophy,
  earned,
  height = 96,
}: {
  trophy: Trophy;
  earned: boolean;
  height?: number;
}) {
  const r = RARITY_META[trophy.rarity];
  const Icon = trophy.icon;

  const bodyW = Math.round(height * 0.6);
  const bodyH = Math.round(height * 0.62);
  const stemH = Math.round(height * 0.1);
  const baseW = Math.round(height * 0.5);
  const baseH = Math.round(height * 0.09);
  const iconSize = Math.round(bodyW * 0.5);
  const chalice = '46% 46% 38% 38% / 58% 58% 42% 42%';

  const grad = r.gradient.length > 2
    ? `linear-gradient(135deg, ${r.gradient.join(', ')})`
    : `linear-gradient(160deg, ${r.gradient[0]}, ${r.gradient[1]})`;
  const lastStop = r.gradient[r.gradient.length - 1];

  if (!earned) {
    return (
      <div className="flex flex-col items-center" style={{ width: bodyW, height }}>
        <div
          className="flex items-center justify-center"
          style={{ width: bodyW, height: bodyH, borderRadius: chalice, background: 'rgba(15,20,36,0.6)', border: '1.5px solid var(--border-medium)', opacity: 0.5 }}
        >
          <Icon size={iconSize} style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
        </div>
        <div style={{ width: Math.round(bodyW * 0.12), height: stemH, background: 'rgba(148,163,184,0.2)' }} />
        <div style={{ width: baseW, height: baseH, borderRadius: '42%', background: 'rgba(148,163,184,0.15)' }} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center" style={{ width: bodyW, height }}>
      {/* body / cup */}
      <div
        className={`relative shine-sweep ${trophy.special ? 'gleam-overlay' : ''} flex items-center justify-center`}
        style={{
          width: bodyW, height: bodyH, borderRadius: chalice, background: grad,
          border: `1.5px solid ${hexA(r.color, 0.9)}`,
          boxShadow: `0 0 ${Math.round(height * 0.42)}px ${hexA(r.color, r.glow * 0.55)}, inset 0 3px 8px rgba(255,255,255,0.4), inset 0 -6px 12px rgba(0,0,0,0.3)`,
          overflow: 'hidden',
        }}
      >
        {/* top gloss */}
        <span
          className="absolute pointer-events-none"
          style={{ top: '6%', left: '16%', right: '16%', height: '30%', borderRadius: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent)', filter: 'blur(1px)' }}
        />
        <Icon size={iconSize} color="#fff" strokeWidth={2.2} style={{ position: 'relative', zIndex: 1, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))' }} />
      </div>

      {/* stem */}
      <div style={{ width: Math.round(bodyW * 0.12), height: stemH, background: `linear-gradient(180deg, ${lastStop}, ${hexA(r.color, 0.6)})` }} />
      {/* base */}
      <div
        style={{ width: baseW, height: baseH, borderRadius: '42%', background: `linear-gradient(180deg, ${r.gradient[0]}, ${hexA(r.color, 0.7)})`, boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.45)' }}
      />

      {/* sparkles — more for the special trophy */}
      {(trophy.special ? [0, 1, 2] : [0]).map((i) => (
        <span
          key={i}
          className="trophy-sparkle absolute pointer-events-none"
          style={{ left: `${16 + i * 30}%`, top: `${6 + (i % 2) * 28}%`, animationDelay: `${i * 0.7}s` }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10">
            <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill="#fff" />
          </svg>
        </span>
      ))}
    </div>
  );
}
