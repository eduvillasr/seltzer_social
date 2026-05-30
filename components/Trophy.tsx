// components/Trophy.tsx
//
// Glossy trophy visuals for the showroom. <TrophyMedallion> is the shiny
// circular emblem. Earned trophies get a rarity gradient and glow; locked
// trophies render as dim silhouettes with a lock glyph.

'use client';

import { Lock } from 'lucide-react';
import { Trophy, RARITY_META } from '@/lib/trophies';

function hexA(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export function TrophyMedallion({
  trophy,
  earned,
  size = 72,
}: {
  trophy: Trophy;
  earned: boolean;
  size?: number;
}) {
  const r = RARITY_META[trophy.rarity];
  const Icon = trophy.icon;
  const iconSize = Math.round(size * 0.42);
  const grad =
    r.gradient.length > 2
      ? `linear-gradient(135deg, ${r.gradient.join(', ')})`
      : `linear-gradient(150deg, ${r.gradient[0]}, ${r.gradient[1]})`;

  if (!earned) {
    return (
      <div
        className="relative flex items-center justify-center"
        style={{
          width: size, height: size, borderRadius: '50%',
          background: 'rgba(15,20,36,0.6)',
          border: '1.5px solid var(--border-medium)',
          opacity: 0.5,
        }}
      >
        <Icon size={iconSize} style={{ color: 'var(--text-muted)' }} strokeWidth={2} />
        <span
          className="absolute flex items-center justify-center"
          style={{
            bottom: -3, right: -3, width: Math.max(16, size * 0.26), height: Math.max(16, size * 0.26),
            borderRadius: '50%', background: 'var(--bg-secondary)', border: '1.5px solid var(--border-strong)',
          }}
        >
          <Lock size={Math.max(8, size * 0.13)} style={{ color: 'var(--text-muted)' }} />
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative shine-sweep flex items-center justify-center"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: grad,
        border: `1.5px solid ${hexA(r.color, 0.9)}`,
        boxShadow: `0 0 ${Math.round(size * 0.5)}px ${hexA(r.color, r.glow * 0.6)}, inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -4px 10px rgba(0,0,0,0.25)`,
      }}
    >
      {/* Glossy top highlight */}
      <span
        className="absolute pointer-events-none"
        style={{
          top: '8%', left: '18%', right: '18%', height: '34%', borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)',
          filter: 'blur(1px)',
        }}
      />
      <Icon size={iconSize} color="#fff" strokeWidth={2.2} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }} />
    </div>
  );
}

