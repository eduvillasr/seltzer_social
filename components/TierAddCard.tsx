// components/TierAddCard.tsx
// Compact feed card shown when someone adds a drink to a shared tier list.

'use client';

import Link from 'next/link';
import { ListPlus, Droplets } from 'lucide-react';
import { Avatar } from './Avatar';
import { CanImage } from './CanImage';
import { FounderBadge, FOUNDERS, BetaTesterBadge, BETA_TESTERS } from './FounderBadge';
import { SharedTierListItem } from '@/types';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};

export function TierAddCard({ activity }: { activity: SharedTierListItem }) {
  const tierColor = TIER_COLORS[activity.tier] || '#22d3ee';
  const adder = activity.added_by_user;
  const list  = activity.list;
  const imageUrl = activity.review?.image_url;

  return (
    <Link
      href={`/shared/${activity.list_id}`}
      className="block rounded-2xl overflow-hidden transition-all hover:scale-[1.005] hover:bg-white/[0.02]"
      style={{
        background: 'linear-gradient(135deg, rgba(15,20,36,0.55), rgba(15,20,36,0.4))',
        border: '1px solid var(--border-subtle)',
        // accent stripe on the left
        borderLeft: `3px solid ${tierColor}`,
      }}
    >
      <div className="flex items-stretch gap-3 p-3">
        {/* Drink thumbnail with tier badge */}
        <div className="relative flex-shrink-0">
          <CanImage
            src={imageUrl}
            alt={activity.seltzer_name}
            className="w-14 h-14 rounded-xl"
            padded={false}
            style={{ border: '1px solid var(--border-subtle)' }}
            fallback={
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: `${tierColor}1f` }}
              >
                <Droplets size={20} style={{ color: tierColor }} />
              </div>
            }
          />
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold"
            style={{
              background: tierColor,
              color: '#0a0e1a',
              boxShadow: `0 0 10px ${tierColor}66`,
            }}
          >
            {activity.tier}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ListPlus size={11} style={{ color: tierColor }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tierColor }}>
              Tier list update
            </span>
            <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
              {timeAgo(activity.created_at)}
            </span>
          </div>

          <p className="text-sm leading-snug" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-bold inline-flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
              {adder?.username ? `@${adder.username}` : 'Someone'}
              {adder?.username && FOUNDERS.has(adder.username) && <FounderBadge />}
              {adder?.username && BETA_TESTERS.has(adder.username) && !FOUNDERS.has(adder.username) && <BetaTesterBadge />}
            </span>
            {' added '}
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{activity.seltzer_name}</span>
            {' to '}
            <span className="font-bold" style={{ color: tierColor }}>{list?.name}</span>
          </p>

          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {activity.brand && <>{activity.brand} · </>}
            ⭐ {Number(activity.rating).toFixed(1)} · {activity.tier} tier
          </p>
        </div>

        {/* Adder avatar (right side) */}
        {adder && (
          <div className="flex-shrink-0 self-center opacity-80">
            <Avatar username={adder.username} avatarUrl={adder.avatar_url} size={28} />
          </div>
        )}
      </div>
    </Link>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)    return 'just now';
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
