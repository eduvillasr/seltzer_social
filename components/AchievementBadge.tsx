// components/AchievementBadge.tsx
// "Dog tag" style achievement chip — the small inline version + a larger
// version for the achievements gallery and pin picker.

'use client';

import { Achievement, TIER_META } from '@/lib/achievements';

interface BadgeProps {
  achievement: Achievement;
  unlocked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** When clicked, e.g. for the pin picker. */
  onClick?: () => void;
  selected?: boolean;
  showName?: boolean;
}

/**
 * Hexagonal-feel circular badge with the achievement's icon + tier glow.
 * Locked badges render greyscale-ish.
 */
export function AchievementBadge({
  achievement, unlocked = true, size = 'md', onClick, selected, showName,
}: BadgeProps) {
  const tier = TIER_META[achievement.tier];
  const Icon = achievement.icon;
  const px =
    size === 'sm' ? 32 :
    size === 'lg' ? 64 :
                    44;
  const iconSize = Math.round(px * 0.45);

  const interactive = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center ${interactive ? 'cursor-pointer' : ''}`}
      style={{ gap: showName ? 6 : 0 }}
    >
      <div
        className={`relative flex items-center justify-center transition-transform ${interactive ? 'hover:scale-110 active:scale-95' : ''}`}
        style={{
          width: px,
          height: px,
          borderRadius: '50%',
          background: unlocked
            ? `linear-gradient(135deg, ${tier.color}33, ${tier.color}10)`
            : 'rgba(15,20,36,0.5)',
          border: unlocked
            ? `1.5px solid ${tier.color}`
            : '1.5px solid var(--border-subtle)',
          boxShadow: unlocked
            ? `0 0 ${px * 0.4}px ${tier.color}${Math.round(tier.glow * 100)
                .toString(16)
                .padStart(2, '0')}, inset 0 0 ${px * 0.2}px ${tier.color}1f`
            : 'none',
          opacity: unlocked ? 1 : 0.45,
          outline: selected ? `2px solid var(--cyan-400)` : undefined,
          outlineOffset: selected ? 3 : undefined,
        }}
        title={`${achievement.name}${unlocked ? '' : ' (locked)'}`}
      >
        <Icon size={iconSize} style={{ color: unlocked ? tier.color : 'var(--text-muted)' }} strokeWidth={2.2} />
        {/* Tier indicator dot */}
        {unlocked && (
          <span
            className="absolute"
            style={{
              bottom: -2, right: -2,
              width: Math.max(8, px * 0.18),
              height: Math.max(8, px * 0.18),
              borderRadius: '50%',
              background: tier.color,
              boxShadow: `0 0 8px ${tier.color}`,
              border: '2px solid var(--bg-primary)',
            }}
          />
        )}
      </div>
      {showName && (
        <p
          className="text-[10px] font-bold text-center max-w-[88px] leading-tight truncate"
          style={{ color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          {achievement.name}
        </p>
      )}
    </div>
  );
}
