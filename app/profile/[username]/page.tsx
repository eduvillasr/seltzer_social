// app/profile/[username]/page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Review, SharedTierList, User } from '@/types';
import { CanImage } from '@/components/CanImage';
import { TopHeader } from '@/components/TopHeader';
import { ReviewCard } from '@/components/ReviewCard';
import { Avatar } from '@/components/Avatar';
import { FounderBadge, FOUNDERS, BetaTesterBadge, BETA_TESTERS } from '@/components/FounderBadge';
import { WhatsNewLink } from '@/components/WhatsNewLink';
import { CanLoader } from '@/components/CanLoader';
import { PullIndicator, pullContentStyle } from '@/components/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { showToast } from '@/components/Toast';
import {
  getUserByUsername, getUserReviews, supabase,
  followUser, unfollowUser, isFollowing as checkIsFollowing,
  getFollowerCount, getFollowingCount, getSharedTierLists, getUserSubscribedSharedTierLists,
  getUserTriedIts,
} from '@/lib/supabase';
import {
  ArrowLeft, Calendar, Droplets, UserPlus, UserMinus, List, Settings, ListPlus,
  Star, Trophy, GitCompare, Award, Search, X, BarChart3, LayoutGrid, ChevronRight, Share2,
} from 'lucide-react';
import { StarRating } from '@/components/StarRating';
import { CountUp } from '@/components/CountUp';
import { reviewHeadline, reviewDrinkLabel } from '@/lib/reviewDisplay';
import { AchievementBadge } from '@/components/AchievementBadge';
import { ContentMenu } from '@/components/ContentMenu';
import { ACHIEVEMENTS } from '@/lib/achievements';

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

// Seltzer rank — a title derived from how many reviews you've written
// (mirrors the reviewer achievement ladder). Shown under the username.
const RANKS: { min: number; title: string }[] = [
  { min: 250, title: 'Cellar Master' },
  { min: 100, title: 'Sommelier' },
  { min: 50,  title: 'Connoisseur' },
  { min: 10,  title: 'Regular' },
  { min: 1,   title: 'First Sip' },
  { min: 0,   title: 'Newcomer' },
];
function seltzerRank(reviewCount: number): string {
  return (RANKS.find((r) => reviewCount >= r.min) ?? RANKS[RANKS.length - 1]).title;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [triedIts, setTriedIts] = useState<Array<{ rating: number; brand: string | null; seltzer_name: string }>>([]);
  const [activeLists, setActiveLists] = useState<SharedTierList[]>([]);
  const [subscribedLists, setSubscribedLists] = useState<SharedTierList[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lists' | 'reviews'>('reviews');
  // Reviews tab layout: full list cards vs. a compact 2-up grid you can scan.
  const [reviewLayout, setReviewLayout] = useState<'list' | 'grid'>('list');
  const [reviewSort, setReviewSort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  // Brand/drink-name filter on the Reviews tab. Empty string = no filter.
  // Initial value may be seeded from a ?brand= query param (used when
  // jumping in from the stats page brand explorer).
  const searchParams = useSearchParams();
  const [reviewQuery, setReviewQuery] = useState(() => searchParams?.get('brand') ?? '');

  // If the query param changes (e.g. back/forward nav), keep the input in sync.
  useEffect(() => {
    const next = searchParams?.get('brand') ?? '';
    setReviewQuery(next);
  }, [searchParams]);

  useEffect(() => { checkUser(); }, []);
  useEffect(() => { loadProfile(); }, [params.username, currentUserId]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) setCurrentUserId(data.session.user.id);
  }

  async function loadProfile() {
    // Try cache first — paint immediately if we have a snapshot.
    const cache = await import('@/lib/cache');
    const cacheKey = `profile:${params.username}:${currentUserId ?? 'anon'}`;
    const cached = cache.peekCache<any>(cacheKey);
    if (cached) {
      setUser(cached.user);
      setReviews(cached.reviews);
      setTriedIts(cached.triedIts);
      setActiveLists(cached.activeLists);
      setSubscribedLists(cached.subscribedLists);
      setFollowerCount(cached.followerCount);
      setFollowingCount(cached.followingCount);
      setIsFollowing(cached.isFollowing);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const { data: userData, error: userError } = await getUserByUsername(params.username);
    if (userError || !userData) { setLoading(false); return; }

    // All independent reads in one round trip — was 8 sequential, now 1 batch.
    const [
      { data: reviewsData },
      { data: triedItsData },
      { data: activeListData },
      { data: subscribedListData },
      { count: fc },
      { count: fgc },
      followStatus,
    ] = await Promise.all([
      getUserReviews(userData.id),
      getUserTriedIts(userData.id),
      getSharedTierLists(userData.id),
      getUserSubscribedSharedTierLists(userData.id),
      getFollowerCount(userData.id),
      getFollowingCount(userData.id),
      currentUserId ? checkIsFollowing(currentUserId, userData.id) : Promise.resolve({ isFollowing: false }),
    ]);

    const reviews = reviewsData || [];
    const triedIts = (triedItsData || []).map((t: any) => ({
      rating: t.rating,
      brand: t.review?.brand ?? null,
      seltzer_name: t.review?.seltzer_name ?? '',
    }));
    const activeLists = activeListData || [];
    const subscribedLists = subscribedListData || [];
    const isFollowing = (followStatus as any).isFollowing;

    setUser(userData);
    setReviews(reviews);
    setTriedIts(triedIts);
    setActiveLists(activeLists);
    setSubscribedLists(subscribedLists);
    setFollowerCount(fc);
    setFollowingCount(fgc);
    setIsFollowing(isFollowing);
    cache.setCache(cacheKey, {
      user: userData, reviews, triedIts, activeLists, subscribedLists,
      followerCount: fc, followingCount: fgc, isFollowing,
    });
    setLoading(false);
  }

  async function handleFollowToggle() {
    if (!currentUserId || !user || followBusy) return;
    setFollowBusy(true);
    try {
      const cache = await import('@/lib/cache');
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
      // Invalidate any cached snapshots that depend on this relationship.
      // Trailing colon so we don't also clobber e.g. `profile:alice2:...`.
      cache.invalidate(`profile:${user.username}:`);
      cache.invalidate(`feed:${currentUserId}`);
    } finally {
      setFollowBusy(false);
    }
  }

  // ── derived ─────────────────────────────────────────────────
  // Brand-or-drink-name filter for the Reviews tab. Case-insensitive.
  // Matches against brand, seltzer_name, and the optional title — so a
  // search for "Blackberry" finds anything blackberry-flavored, and a
  // search for "AHA" finds every AHA review.
  const filteredReviews = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((r) => {
      const brand = (r.brand ?? '').toLowerCase();
      const name = (r.seltzer_name ?? '').toLowerCase();
      const title = (r.title ?? '').toLowerCase();
      return brand.includes(q) || name.includes(q) || title.includes(q);
    });
  }, [reviews, reviewQuery]);

  const sortedReviews = useMemo(() => {
    const arr = [...filteredReviews];
    const byNewest = (a: Review, b: Review) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    switch (reviewSort) {
      case 'newest':  arr.sort(byNewest); break;
      case 'oldest':  arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case 'highest': arr.sort((a, b) => b.rating - a.rating || byNewest(a, b)); break;
      case 'lowest':  arr.sort((a, b) => a.rating - b.rating || byNewest(a, b)); break;
    }
    return arr;
  }, [filteredReviews, reviewSort]);

  const topRated = useMemo<Review | null>(() => {
    if (reviews.length === 0) return null;
    return [...reviews].sort((a, b) => b.rating - a.rating || (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ))[0];
  }, [reviews]);

  // ─── advanced taste metrics ──────────────────────────────────
  // We merge full reviews + "tried it" quick-rates so the profile reflects
  // every drink the user has expressed an opinion on, not just ones they
  // wrote a paragraph about.
  // Lightweight taste summary — just the figures the analytics-entry chips
  // need. The full breakdown (tiers, flavor families, generosity, etc.) now
  // lives on the dedicated stats page.
  const taste = useMemo(() => {
    type Datum = { rating: number; brand: string | null };
    const all: Datum[] = [
      ...reviews.map((r) => ({ rating: r.rating, brand: r.brand })),
      ...triedIts.map((t) => ({ rating: t.rating, brand: t.brand })),
    ];
    if (all.length === 0) return null;

    // Brand stats — count + sum per brand, for unique-brand count and best brand.
    const byBrand: Record<string, { count: number; sum: number }> = {};
    for (const d of all) {
      const b = (d.brand?.trim() || 'Unknown');
      if (!byBrand[b]) byBrand[b] = { count: 0, sum: 0 };
      byBrand[b].count++;
      byBrand[b].sum += d.rating;
    }
    const brandEntries = Object.entries(byBrand);
    const brandsWith2Plus = brandEntries.filter(([, v]) => v.count >= 2);
    const bestBrand = brandsWith2Plus.length > 0
      ? brandsWith2Plus.sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)[0]
      : null;

    const mean = all.reduce((s, d) => s + d.rating, 0) / all.length;

    return {
      total: all.length,
      uniqueBrands: brandEntries.length,
      bestBrand,
      mean,
    };
  }, [reviews, triedIts]);

  const ptr = usePullToRefresh(async () => {
    const cache = await import('@/lib/cache');
    cache.invalidate(`profile:${params.username}:`);
    await loadProfile();
  });

  if (loading) {
    return (<><main className="max-w-md mx-auto px-4 pt-20 pb-32"><CanLoader /></main></>);
  }

  if (!user) {
    return (<><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  const isOwnProfile = currentUserId === user.id;
  const tier = topRated ? ratingToTier(topRated.rating) : 'B';
  const tierColor = TIER_COLORS[tier];
  const rank = seltzerRank(reviews.length);

  async function handleShareProfile() {
    const url = `${window.location.origin}/profile/${user?.username}`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title: `@${user?.username} on Seltzer Social`, url }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); showToast('Profile link copied 🔗', 'success'); }
    catch { showToast('Could not copy', 'error', url); }
  }

  return (
    <>
      <PullIndicator ptr={ptr} />
      <TopHeader title={`@${user.username}`} back="/feed" />
      <main {...ptr.bind} style={pullContentStyle(ptr)} className="max-w-md mx-auto px-4 with-top-header pb-32 space-y-5">
        <div className="h-1" />{/* breathing room below the fixed header */}

        {/* ─── Profile hero — tier-themed by their top pick ─── */}
        {/* The gradient + glow color is driven by the tier of the user's
            highest-rated review. Users with no reviews fall back to cyan. */}
        <div
          className="relative rounded-3xl overflow-hidden animate-fade-in-up"
          style={{
            background: `linear-gradient(160deg, ${tierColor}14 0%, rgba(15,20,36,0.6) 60%)`,
            border: `1px solid ${tierColor}33`,
            padding: '20px',
          }}
        >
          {/* glow blobs — primary tinted by tier, secondary stays violet for contrast */}
          <div className="pointer-events-none absolute -top-12 -right-10 w-44 h-44 rounded-full" style={{ background: `radial-gradient(closest-side, ${tierColor}33, transparent)` }} />
          <div className="pointer-events-none absolute -bottom-16 -left-8 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(167,139,250,0.12), transparent)' }} />

          {/* tier-tinted cover banner */}
          <div className="relative -mx-5 -mt-5 overflow-hidden" style={{ height: 66, background: `linear-gradient(120deg, ${tierColor}66, ${tierColor}22 55%, rgba(15,20,36,0))` }}>
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.6px)', backgroundSize: '14px 14px' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(15,20,36,0.55))' }} />
          </div>

          <div className="relative flex items-end gap-4" style={{ marginTop: -36 }}>
            <div className="relative flex-shrink-0 rounded-full" style={{ padding: 3, background: 'var(--bg-primary)', boxShadow: `0 8px 24px ${tierColor}44` }}>
              <Avatar username={user.username} avatarUrl={user.avatar_url} size={84} />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-xl font-extrabold flex items-center gap-2 flex-wrap leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                @{user.username}
                {FOUNDERS.has(user.username) && <FounderBadge />}
                {BETA_TESTERS.has(user.username) && !FOUNDERS.has(user.username) && <BetaTesterBadge />}
              </h1>
              {/* seltzer rank */}
              <span
                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: `${tierColor}1f`, border: `1px solid ${tierColor}55`, color: tierColor }}
              >
                <Star size={9} className="fill-current" /> {rank}
              </span>
              {user.bio && <p className="text-sm mt-1.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{user.bio}</p>}
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Calendar size={10} /> Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Trophies & Honors — one entry into the showroom (trophies + achievements) */}
          {(() => {
            const pins = (user.showcase_achievements ?? [])
              .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
              .filter((a): a is NonNullable<typeof a> => !!a);
            return (
              <>
                <Link
                  href={`/profile/${user.username}/showroom`}
                  className="shine-sweep relative mt-4 flex items-center gap-3 rounded-2xl p-3 overflow-hidden transition-transform hover:scale-[1.01]"
                  style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.16), rgba(34,211,238,0.10))', border: '1px solid rgba(167,139,250,0.30)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(150deg, #fde68a, #f59e0b)', boxShadow: '0 0 16px rgba(245,158,11,0.4)' }}>
                    <Trophy size={20} color="#fff" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--violet-400)' }}>Trophies &amp; Honors</p>
                    {pins.length > 0 ? (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex gap-1.5 flex-shrink-0">{pins.map((a) => <AchievementBadge key={a.id} achievement={a} size="sm" />)}</div>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{isOwnProfile ? 'Your showcase' : 'Visit the case'}</p>
                      </div>
                    ) : (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-primary)' }}>
                        {isOwnProfile ? 'Build your trophy case' : `See @${user.username}'s case`}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </Link>
                {isOwnProfile && (
                  <Link href={`/profile/${user.username}/achievements`} className="block text-center text-[11px] mt-2 hover:underline" style={{ color: 'var(--text-muted)' }}>
                    <Award size={10} className="inline mr-1 mb-0.5" />Manage badges &amp; all achievements →
                  </Link>
                )}
              </>
            );
          })()}

          {/* Action row */}
          <div className="relative flex gap-2 mt-4">
            {isOwnProfile ? (
              <>
                <Link href="/settings" className="btn-secondary flex-1 justify-center" style={{ padding: '10px', fontSize: '12px' }}>
                  <Settings size={13} /> Edit Profile
                </Link>
                <button onClick={handleShareProfile} className="btn-secondary justify-center" style={{ padding: '10px 12px' }} aria-label="Share profile" title="Share profile">
                  <Share2 size={14} />
                </button>
                <WhatsNewLink variant="icon" />
              </>
            ) : currentUserId ? (
              <>
                <button onClick={handleFollowToggle} disabled={followBusy} className={isFollowing ? 'btn-secondary flex-1 justify-center' : 'btn-primary flex-1 justify-center'} style={{ padding: '10px', fontSize: '12px', opacity: followBusy ? 0.6 : 1 }}>
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
                <button onClick={handleShareProfile} className="btn-secondary justify-center" style={{ padding: '10px 12px' }} aria-label="Share profile" title="Share profile">
                  <Share2 size={14} />
                </button>
                <div className="btn-secondary justify-center" style={{ padding: '10px 12px' }}>
                  <ContentMenu
                    currentUserId={currentUserId ?? undefined}
                    targetType="user"
                    targetId={user.id}
                    targetUserId={user.id}
                    targetUsername={user.username}
                    onBlocked={() => { showToast('User blocked'); window.location.href = '/'; }}
                    size={15}
                  />
                </div>
              </>
            ) : null}
          </div>

          {/* Stats grid */}
          <div className="relative grid grid-cols-4 gap-2 pt-4 mt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <Stat label="Reviews" value={reviews.length} color="var(--cyan-400)" />
            <Stat label="Tried"   value={triedIts.length} color="var(--teal-400)" />
            <Link href={`/profile/${user.username}/followers`} className="hover:opacity-80 transition-opacity">
              <Stat label="Followers" value={followerCount} color="var(--violet-400)" />
            </Link>
            <Link href={`/profile/${user.username}/following`} className="hover:opacity-80 transition-opacity">
              <Stat label="Following" value={followingCount} color="var(--amber-400)" />
            </Link>
          </div>
        </div>

        {/* ─── Analytics entry (full breakdown lives on the stats page) ─── */}
        {taste && taste.total >= 2 && (
          <Link
            href={`/profile/${user.username}/stats`}
            className="block rounded-3xl overflow-hidden animate-fade-in-up transition-transform hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.1), rgba(167,139,250,0.1))',
              border: '1px solid rgba(34,211,238,0.25)',
              boxShadow: '0 0 24px rgba(6,182,212,0.12)',
              padding: '16px',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))', boxShadow: '0 0 16px rgba(6,182,212,0.3)' }}
              >
                <BarChart3 size={20} color="#fff" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  {isOwnProfile ? 'Your seltzer analytics' : `@${user.username}'s analytics`}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Flavor radar, rating trends, brand podium &amp; more
                </p>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--cyan-400)' }} className="flex-shrink-0" />
            </div>

            {/* Quick-glance chips so the entry still teases the data */}
            <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <MiniChip label="Drinks rated" value={`${taste.total}`} tone="var(--cyan-400)" />
              <MiniChip label="Brands" value={`${taste.uniqueBrands}`} tone="var(--violet-400)" />
              <MiniChip label="Avg rating" value={taste.mean.toFixed(1)} tone="var(--amber-400)" />
              {taste.bestBrand && (
                <MiniChip label="Top brand" value={taste.bestBrand[0]} tone="#34d399" />
              )}
            </div>
          </Link>
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
          <div className="space-y-4">
            {/* Brand / drink name filter — hidden when the profile is empty */}
            {reviews.length > 0 && (
              <div
                className="flex items-center gap-2 rounded-2xl px-3"
                style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)' }}
              >
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={reviewQuery}
                  onChange={(e) => setReviewQuery(e.target.value)}
                  placeholder={isOwnProfile ? 'Search your reviews by brand or flavor…' : 'Search by brand or flavor…'}
                  className="flex-1 bg-transparent border-none outline-none py-2.5 text-sm"
                  style={{ color: 'var(--text-primary)' }}
                  aria-label="Filter reviews"
                />
                {reviewQuery && (
                  <button
                    onClick={() => setReviewQuery('')}
                    className="rounded-full p-1 transition-colors hover:bg-white/10"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {reviews.length === 0 ? (
              <div className="glass-card text-center py-10">
                <Droplets size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No reviews yet</p>
                {isOwnProfile && (<Link href="/create" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>Write Your First Review</Link>)}
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="glass-card text-center py-10">
                <Search size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No reviews match "{reviewQuery}"
                </p>
                <button
                  onClick={() => setReviewQuery('')}
                  className="text-xs mt-3 underline"
                  style={{ color: 'var(--cyan-400)' }}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {reviewQuery
                      ? `${filteredReviews.length} of ${reviews.length} reviews`
                      : `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}
                  </p>
                  <div className="flex items-center gap-2">
                  {/* sort */}
                  <select
                    value={reviewSort}
                    onChange={(e) => setReviewSort(e.target.value as typeof reviewSort)}
                    className="bg-transparent text-[11px] font-semibold outline-none rounded-full px-2.5 py-1"
                    style={{ color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', background: 'rgba(10,14,26,0.5)' }}
                    aria-label="Sort reviews"
                  >
                    <option value="newest" style={{ background: '#0a0e1a' }}>Newest</option>
                    <option value="oldest" style={{ background: '#0a0e1a' }}>Oldest</option>
                    <option value="highest" style={{ background: '#0a0e1a' }}>Highest rated</option>
                    <option value="lowest" style={{ background: '#0a0e1a' }}>Lowest rated</option>
                  </select>
                  <div className="inline-flex rounded-full p-0.5" style={{ background: 'rgba(10,14,26,0.5)', border: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => setReviewLayout('list')}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      style={reviewLayout === 'list'
                        ? { background: 'var(--cyan-400)', color: '#0a0e1a' }
                        : { background: 'transparent', color: 'var(--text-muted)' }}
                      aria-label="List view"
                      aria-pressed={reviewLayout === 'list'}
                      title="List view"
                    >
                      <List size={14} />
                    </button>
                    <button
                      onClick={() => setReviewLayout('grid')}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      style={reviewLayout === 'grid'
                        ? { background: 'var(--cyan-400)', color: '#0a0e1a' }
                        : { background: 'transparent', color: 'var(--text-muted)' }}
                      aria-label="Grid view"
                      aria-pressed={reviewLayout === 'grid'}
                      title="Grid view"
                    >
                      <LayoutGrid size={14} />
                    </button>
                  </div>
                  </div>
                </div>

                {reviewLayout === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 stagger-children">
                    {sortedReviews.map((review) => (<ReviewGridTile key={review.id} review={review} />))}
                  </div>
                ) : (
                  <div className="space-y-4 stagger-children">
                    {sortedReviews.map((review) => (<ReviewCard key={review.id} review={review} currentUserId={currentUserId || undefined} />))}
                  </div>
                )}
              </>
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
      <CountUp value={value} className="text-base font-extrabold block" style={{ color }} />
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

// Compact review tile for the Reviews-tab grid layout. Tapping it opens the
// full review, so it stays a lightweight, link-only card (no like/comment
// actions — those live on the list view and the review page).
function ReviewGridTile({ review }: { review: Review }) {
  const img = review.image_url || review.seltzer?.image_url || null;
  const label = reviewDrinkLabel(review);
  const headline = reviewHeadline(review);
  return (
    <Link
      href={`/review/${review.id}`}
      className="rounded-2xl overflow-hidden transition-transform duration-300 hover:scale-[1.02] flex flex-col"
      style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="relative">
        <CanImage src={img} alt={review.seltzer_name} className="w-full aspect-square" />
        <div
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
          style={{ background: 'rgba(5,8,16,0.78)', color: '#fff', backdropFilter: 'blur(4px)' }}
        >
          <Star size={11} className="fill-current" style={{ color: 'var(--amber-400)' }} />
          {review.rating.toFixed(1)}
        </div>
      </div>
      <div className="p-2.5 flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{headline}</p>
        {label && label !== headline && (
          <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        )}
        <div className="mt-1.5"><StarRating value={review.rating} size={11} /></div>
      </div>
    </Link>
  );
}

function MiniChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="rounded-xl px-2.5 py-1.5 flex flex-col min-w-0"
      style={{ background: `${tone === 'var(--cyan-400)' || tone.startsWith('var') ? 'rgba(255,255,255,0.04)' : `${tone}14`}`, border: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-extrabold leading-tight truncate" style={{ color: tone }}>{value}</span>
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
