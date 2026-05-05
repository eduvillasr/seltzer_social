// app/profile/[username]/page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Review, SharedTierList, User } from '@/types';
import { Navigation } from '@/components/Navigation';
import { ReviewCard } from '@/components/ReviewCard';
import { Avatar } from '@/components/Avatar';
import { FounderBadge, FOUNDERS } from '@/components/FounderBadge';
import { CanLoader } from '@/components/CanLoader';
import { showToast } from '@/components/Toast';
import {
  getUserByUsername, getUserReviews, supabase,
  followUser, unfollowUser, isFollowing as checkIsFollowing,
  getFollowerCount, getFollowingCount, getSharedTierLists, getUserSubscribedSharedTierLists,
} from '@/lib/supabase';
import {
  ArrowLeft, Calendar, Droplets, UserPlus, UserMinus, List, Settings, ListPlus,
  Star, Trophy, GitCompare,
} from 'lucide-react';

interface ProfilePageProps {
  params: { username: string };
}

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};

function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2)   return 'C'; if (v >= 1) return 'D'; return 'F';
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeLists, setActiveLists] = useState<SharedTierList[]>([]);
  const [subscribedLists, setSubscribedLists] = useState<SharedTierList[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lists' | 'reviews'>('reviews');

  useEffect(() => { checkUser(); }, []);
  useEffect(() => { loadProfile(); }, [params.username, currentUserId]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) setCurrentUserId(data.session.user.id);
  }

  async function loadProfile() {
    setLoading(true);
    const { data: userData, error: userError } = await getUserByUsername(params.username);
    if (!userError && userData) {
      setUser(userData);
      const { data: reviewsData } = await getUserReviews(userData.id);
      const [{ data: activeListData }, { data: subscribedListData }] = await Promise.all([
        getSharedTierLists(userData.id),
        getUserSubscribedSharedTierLists(userData.id),
      ]);
      setReviews(reviewsData || []);
      setActiveLists(activeListData || []);
      setSubscribedLists(subscribedListData || []);
      const { count: fc } = await getFollowerCount(userData.id);
      const { count: fgc } = await getFollowingCount(userData.id);
      setFollowerCount(fc);
      setFollowingCount(fgc);
      if (currentUserId) {
        const { isFollowing: following } = await checkIsFollowing(currentUserId, userData.id);
        setIsFollowing(following);
      }
    }
    setLoading(false);
  }

  async function handleFollowToggle() {
    if (!currentUserId || !user) return;
    if (isFollowing) {
      await unfollowUser(currentUserId, user.id);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
      showToast('Unfollowed', 'info', `@${user.username}`);
    } else {
      await followUser(currentUserId, user.id);
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
      showToast('Following', 'success', `@${user.username}`);
    }
  }

  // ── derived ─────────────────────────────────────────────────
  const topRated = useMemo<Review | null>(() => {
    if (reviews.length === 0) return null;
    return [...reviews].sort((a, b) => b.rating - a.rating || (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ))[0];
  }, [reviews]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  }, [reviews]);

  const topBrands = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reviews) {
      const b = r.brand?.trim();
      if (!b) continue;
      counts[b] = (counts[b] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([brand, count]) => ({ brand, count }));
  }, [reviews]);

  if (loading) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32"><CanLoader /></main></>);
  }

  if (!user) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  const isOwnProfile = currentUserId === user.id;
  const allListsCount = activeLists.length + subscribedLists.length;
  const tier = topRated ? ratingToTier(topRated.rating) : 'B';
  const tierColor = TIER_COLORS[tier];

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm transition-colors hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back
        </Link>

        {/* ─── Profile hero — bigger, more confident ─── */}
        <div
          className="relative rounded-3xl overflow-hidden animate-fade-in-up"
          style={{
            background: 'linear-gradient(160deg, rgba(34,211,238,0.08) 0%, rgba(15,20,36,0.6) 60%)',
            border: '1px solid var(--border-subtle)',
            padding: '20px',
          }}
        >
          {/* glow blobs */}
          <div className="pointer-events-none absolute -top-12 -right-10 w-44 h-44 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(34,211,238,0.18), transparent)' }} />
          <div className="pointer-events-none absolute -bottom-16 -left-8 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(167,139,250,0.12), transparent)' }} />

          <div className="relative flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <div style={{ filter: 'drop-shadow(0 8px 24px rgba(6,182,212,0.25))' }}>
                <Avatar username={user.username} avatarUrl={user.avatar_url} size={84} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold flex items-center gap-2 flex-wrap leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                @{user.username}
                {FOUNDERS.has(user.username) && <FounderBadge />}
              </h1>
              {user.bio && <p className="text-sm mt-1.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{user.bio}</p>}
              <p className="text-[11px] mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Calendar size={10} /> Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Action row */}
          <div className="relative flex gap-2 mt-4">
            {isOwnProfile ? (
              <Link href="/settings" className="btn-secondary flex-1 justify-center" style={{ padding: '10px', fontSize: '12px' }}>
                <Settings size={13} /> Edit Profile
              </Link>
            ) : currentUserId ? (
              <>
                <button onClick={handleFollowToggle} className={isFollowing ? 'btn-secondary flex-1 justify-center' : 'btn-primary flex-1 justify-center'} style={{ padding: '10px', fontSize: '12px' }}>
                  {isFollowing ? <><UserMinus size={13} /> Unfollow</> : <><UserPlus size={13} /> Follow</>}
                </button>
                <Link
                  href={`/compare/${user.username}`}
                  className="btn-secondary justify-center"
                  style={{ padding: '10px 14px', fontSize: '12px' }}
                  title="Compare your tastes"
                >
                  <GitCompare size={13} /> Compare
                </Link>
              </>
            ) : null}
          </div>

          {/* Stats grid */}
          <div className="relative grid grid-cols-4 gap-2 pt-4 mt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <Stat label="Reviews" value={reviews.length} color="var(--text-primary)" />
            <Stat label="Lists"   value={allListsCount}  color="var(--cyan-400)" />
            <Link href={`/profile/${user.username}/followers`} className="hover:opacity-80 transition-opacity">
              <Stat label="Followers" value={followerCount} color="var(--violet-400)" />
            </Link>
            <Link href={`/profile/${user.username}/following`} className="hover:opacity-80 transition-opacity">
              <Stat label="Following" value={followingCount} color="var(--amber-400)" />
            </Link>
          </div>
        </div>

        {/* ─── Top-rated highlight ─── */}
        {topRated && (
          <Link
            href={`/review/${topRated.id}`}
            className="block rounded-2xl overflow-hidden transition-all hover:scale-[1.005] animate-fade-in-up"
            style={{
              background: `linear-gradient(135deg, ${tierColor}10, rgba(15,20,36,0.5))`,
              border: `1px solid ${tierColor}33`,
              padding: '14px',
            }}
          >
            <div className="flex items-center gap-3">
              {/* image with floating tier badge */}
              <div className="relative flex-shrink-0">
                {topRated.image_url ? (
                  <img src={topRated.image_url} alt={topRated.seltzer_name} className="w-16 h-16 rounded-xl object-cover" style={{ border: '1px solid var(--border-subtle)' }} />
                ) : (
                  <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: `${tierColor}1a`, border: `1px solid ${tierColor}33` }}>
                    <Droplets size={22} style={{ color: tierColor }} />
                  </div>
                )}
                <span
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold"
                  style={{ background: tierColor, color: '#0a0e1a', boxShadow: `0 0 12px ${tierColor}66` }}
                >
                  {tier}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] flex items-center gap-1" style={{ color: tierColor }}>
                  <Trophy size={10} /> {isOwnProfile ? 'Your top rated' : `@${user.username}'s top pick`}
                </p>
                <p className="font-bold text-sm truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {topRated.title?.trim() || topRated.seltzer_name}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {topRated.brand && <>{topRated.brand} · </>}
                  <span style={{ color: tierColor, fontWeight: 600 }}>⭐ {topRated.rating.toFixed(1)}</span>
                  {reviews.length > 1 && <> · avg {avgRating.toFixed(1)} across {reviews.length}</>}
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* ─── Top brands strip ─── */}
        {topBrands.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
              {isOwnProfile ? 'Brands you reach for' : 'Goes back for'}
            </p>
            <div className="flex flex-wrap gap-2">
              {topBrands.map((b) => (
                <span key={b.brand} className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {b.brand} <span style={{ color: 'var(--text-muted)' }}>· {b.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── View toggle ─── */}
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['reviews', 'lists'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: view === v ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-tertiary)',
                boxShadow: view === v ? '0 0 12px rgba(6,182,212,0.25)' : 'none',
              }}
            >
              {v === 'reviews' ? <><Star size={12} /> Reviews</> : <><ListPlus size={13} /> Lists</>}
            </button>
          ))}
        </div>

        {view === 'lists' && (
          <div className="animate-fade-in-up">
            {activeLists.length === 0 && subscribedLists.length === 0 ? (
              <div className="glass-card text-center py-10">
                <ListPlus size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No tier list activity yet</p>
                {isOwnProfile && (
                  <Link href="/shared/create" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>
                    <ListPlus size={13} /> Start a List
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {activeLists.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] px-1" style={{ color: 'var(--text-muted)' }}>Contributes To</p>
                    {activeLists.map((list) => <ListRow key={list.id} list={list} badge="Active" />)}
                  </div>
                )}
                {subscribedLists.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] px-1" style={{ color: 'var(--text-muted)' }}>Subscribed</p>
                    {subscribedLists.map((list) => <ListRow key={list.id} list={list} badge="Subscribed" />)}
                  </div>
                )}
                {isOwnProfile && (
                  <Link href="/shared/create" className="btn-secondary w-full justify-center" style={{ padding: '10px', fontSize: '12px' }}>
                    <ListPlus size={13} /> Create shared tier list
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'reviews' && (
          <div>
            {reviews.length === 0 ? (
              <div className="glass-card text-center py-10">
                <Droplets size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No reviews yet</p>
                {isOwnProfile && (<Link href="/create" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>Write Your First Review</Link>)}
              </div>
            ) : (
              <div className="space-y-4 stagger-children">
                {reviews.map((review) => (<ReviewCard key={review.id} review={review} currentUserId={currentUserId || undefined} />))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-base font-extrabold" style={{ color }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function ListRow({ list, badge }: { list: SharedTierList; badge: string }) {
  return (
    <Link href={`/shared/${list.id}`} className="glass-card block transition-colors hover:bg-white/5" style={{ padding: '14px' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{list.name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            @{list.owner?.username} + @{list.partner?.username}
          </p>
        </div>
        <span className="badge-cyan flex-shrink-0" style={{ fontSize: '10px', padding: '3px 8px' }}>{badge}</span>
      </div>
    </Link>
  );
}
