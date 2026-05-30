// components/Trophy.tsx
//
// Glossy trophy visuals for the showroom. <TrophyMedallion> is the shiny
// circular emblem; <TrophyCard> wraps it with name, rarity, tagline, and a
// locked/progress state for the grid. Earned trophies get a rarity gradient,
// glow, and a slow shine sweep (.shine-sweep from globals.css). Locked trophies
// render as dim silhouettes with a progress bar to entice.

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

export function TrophyCard({
  trophy,
  earned,
  progress,
}: {
  trophy: Trophy;
  earned: boolean;
  progress?: [number, number];
}) {
  const r = RARITY_META[trophy.rarity];
  const pct = progress && progress[1] > 0 ? Math.min(100, (progress[0] / progress[1]) * 100) : 0;

  return (
    <div
      className="rounded-2xl p-4 flex flex-col items-center text-center transition-transform duration-300 hover:scale-[1.02]"
      style={{
        background: earned
          ? `linear-gradient(160deg, ${hexA(r.color, 0.10)}, rgba(15,20,36,0.5))`
          : 'rgba(15,20,36,0.45)',
        border: `1px solid ${earned ? hexA(r.color, 0.4) : 'var(--border-subtle)'}`,
        boxShadow: earned ? `0 0 24px ${hexA(r.color, r.glow * 0.18)}` : 'none',
      }}
    >
      <TrophyMedallion trophy={trophy} earned={earned} size={72} />

      <p
        className="text-sm font-extrabold mt-3 leading-tight"
        style={{ fontFamily: 'var(--font-display)', color: earned ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {trophy.name}
      </p>

      <span
        className="inline-block text-[9px] font-bold uppercase tracking-wider mt-1 px-2 py-0.5 rounded-full"
        style={{
          background: earned ? hexA(r.color, 0.18) : 'rgba(148,163,184,0.10)',
          color: earned ? r.color : 'var(--text-muted)',
        }}
      >
        {r.label}
      </span>

      <p className="text-[11px] mt-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {earned ? trophy.tagline : trophy.description}
      </p>

      {!earned && progress && (
        <div className="w-full mt-2.5">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${r.gradient.join(', ')})` }}
            />
          </div>
          <p className="text-[10px] mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {progress[0].toLocaleString()} / {progress[1].toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
