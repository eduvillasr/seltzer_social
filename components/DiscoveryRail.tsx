// components/DiscoveryRail.tsx
//
// Empty-feed discovery surface. Shown on /feed when the user follows
// nobody, or when they follow people but those people haven't posted
// lately. Surfaces fresh content so the feed isn't a dead-end.
//
// Three rails:
//   1. Trending drinks this week
//   2. Suggested users to follow
//   3. Quick link to the brand catalog
//
// Each rail fetches lazily on mount. If a fetch fails or returns empty,
// that rail just hides — the rest still render.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Flame, UserPlus, UserMinus, ArrowRight, Droplets, Trophy,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { CanImage } from './CanImage';
import { FounderBadge, FOUNDERS, BetaTesterBadge, BETA_TESTERS } from './FounderBadge';
import { showToast } from './Toast';
import {
  getTrendingDrinks, getSuggestedUsersToFollow,
  followUser, unfollowUser,
} from '@/lib/supabase';

interface DiscoveryRailProps {
  currentUserId: string | null;
  /** Tighter spacing when shown alongside actual feed content. */
  compact?: boolean;
}

export function DiscoveryRail({ currentUserId, compact }: DiscoveryRailProps) {
  const [trending, setTrending] = useState<any[]>([]);
  const [people, setPeople] = useState<Array<{
    id: string; username: string; avatar_url: string | null; bio: string | null;
    followerCount: number; isFollowing?: boolean;
  }>>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [{ data: t }, p] = await Promise.all([
        getTrendingDrinks(14, 6),
        getSuggestedUsersToFollow(currentUserId, 5),
      ]);
      if (!cancelled) {
        setTrending(t || []);
        setPeople(p.map((u: any) => ({ ...u, isFollowing: false })));
      }
    })();

    return () => { cancelled = true; };
  }, [currentUserId]);

  async function toggleFollow(userId: string, currentlyFollowing: boolean) {
    if (!currentUserId) return;
    const target = people.find((u) => u.id === userId);
    if (currentlyFollowing) await unfollowUser(currentUserId, userId);
    else await followUser(currentUserId, userId);
    setPeople((prev) => prev.map((u) =>
      u.id === userId
        ? { ...u, isFollowing: !currentlyFollowing, followerCount: u.followerCount + (currentlyFollowing ? -1 : 1) }
        : u
    ));
    showToast(currentlyFollowing ? 'Unfollowed' : 'Following', currentlyFollowing ? 'info' : 'success', target ? `@${target.username}` : undefined);
  }

  if (trending.length === 0 && people.length === 0) return null;

  return (
    <div className={compact ? 'space-y-5 mt-4' : 'space-y-6 mt-6'}>
      {/* ─── Trending drinks ─── */}
      {trending.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-2 mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: 'var(--cyan-400)' }}>
              <Flame size={12} /> Trending this week
            </h2>
            <Link href="/trending" className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--text-muted)' }}>
              See all →
            </Link>
          </div>
          {/* Horizontal scroll snap rail */}
          <div
            className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none' }}
          >
            {trending.map((d) => (
              <Link
                key={d.seltzer_id}
                href={`/drink/${d.seltzer_id}`}
                className="snap-start flex-shrink-0 w-36 rounded-2xl p-3 transition-transform hover:scale-[1.02]"
                style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)' }}
              >
                <CanImage
                  src={d.latestImage}
                  alt={d.seltzer_name}
                  className="w-full h-24 rounded-lg mb-2"
                  fallback={
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.06)' }}>
                      <Droplets size={22} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  }
                />
                <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{d.seltzer_name}</p>
                {d.brand && <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{d.brand}</p>}
                <div className="flex items-center gap-1 mt-1.5">
                  <Trophy size={9} style={{ color: 'var(--amber-400)' }} />
                  <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--amber-400)' }}>
                    {d.avgRating.toFixed(1)}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {d.reviewCount} rev.</span>
                </div>
              </Link>
            ))}
            <div className="flex-shrink-0 w-1" />
          </div>
        </section>
      )}

      {/* ─── Suggested users ─── */}
      {people.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-2 mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: 'var(--violet-400)' }}>
              <UserPlus size={12} /> People to follow
            </h2>
            <Link href="/discover" className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--text-muted)' }}>
              Find more →
            </Link>
          </div>
          <div className="space-y-2">
            {people.map((u) => (
              <div key={u.id} className="glass-card flex items-center gap-3" style={{ padding: '10px 12px' }}>
                <Link href={`/profile/${u.username}`} className="flex-shrink-0">
                  <Avatar username={u.username} avatarUrl={u.avatar_url} size={36} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${u.username}`}>
                    <p className="font-bold text-sm hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-center gap-1.5 truncate" style={{ color: 'var(--text-primary)' }}>
                      @{u.username}
                      {FOUNDERS.has(u.username) && <FounderBadge />}
                      {BETA_TESTERS.has(u.username) && !FOUNDERS.has(u.username) && <BetaTesterBadge />}
                    </p>
                  </Link>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {u.followerCount} {u.followerCount === 1 ? 'follower' : 'followers'}
                    {u.bio ? <> · <span className="truncate">{u.bio.slice(0, 40)}</span></> : null}
                  </p>
                </div>
                {currentUserId && (
                  <button
                    onClick={() => toggleFollow(u.id, !!u.isFollowing)}
                    className={u.isFollowing ? 'btn-secondary flex-shrink-0' : 'btn-primary flex-shrink-0'}
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                  >
                    {u.isFollowing ? <><UserMinus size={11} /> Following</> : <><UserPlus size={11} /> Follow</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
