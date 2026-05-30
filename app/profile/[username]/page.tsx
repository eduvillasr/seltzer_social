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

// Flavor families for the taste fingerprint — match keywords in a drink name.
const FLAVOR_FAMILIES: { family: string; color: string; keywords: string[] }[] = [
  { family: 'Citrus',       color: '#fbbf24', keywords: ['lemon', 'lime', 'orange', 'grapefruit', 'citrus', 'yuzu', 'tangerine', 'pamplemousse', 'clementine'] },
  { family: 'Berry',        color: '#f472b6', keywords: ['berry', 'strawberry', 'raspberry', 'blackberry', 'blueberry', 'cranberry', 'acai', 'açai'] },
  { family: 'Tropical',     color: '#34d399', keywords: ['mango', 'pineapple', 'coconut', 'passion', 'guava', 'kiwi', 'peach', 'apricot', 'dragon'] },
  { family: 'Melon',        color: '#a3e635', keywords: ['watermelon', 'melon', 'cantaloupe', 'honeydew'] },
  { family: 'Cherry',       color: '#fb7185', keywords: ['cherry'] },
  { family: 'Apple & Pear', color: '#86efac', keywords: ['apple', 'pear'] },
  { family: 'Cola & Spice', color: '#c084fc', keywords: ['cola', 'root beer', 'ginger', 'cream', 'vanilla', 'chai'] },
  { family: 'Botanical',    color: '#2dd4bf', keywords: ['cucumber', 'mint', 'basil', 'lavender', 'hibiscus', 'elderflower', 'rose', 'lemongrass'] },
];
const FLAVOR_COLOR: Record<string, string> = Object.fromEntries(FLAVOR_FAMILIES.map((f) => [f.family, f.color]));
function flavorFamilyOf(name: string): string | null {
  const n = (name || '').toLowerCase();
  for (const f of FLAVOR_FAMILIES) if (f.keywords.some((k) => n.includes(k))) return f.family;
  return null;
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

  const topRated = useMemo<Review | null>(() => {
    if (reviews.length === 0) return null;
    return [...reviews].sort((a, b) => b.rating - a.rating || (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ))[0];
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

  // ─── advanced taste metrics ──────────────────────────────────
  // We merge full reviews + "tried it" quick-rates so the profile reflects
  // every drink the user has expressed an opinion on, not just ones they
  // wrote a paragraph about.
  const taste = useMemo(() => {
    type Datum = { rating: number; brand: string | null; seltzer_name: string };
    const all: Datum[] = [
      ...reviews.map((r) => ({ rating: r.rating, brand: r.brand, seltzer_name: r.seltzer_name })),
      ...triedIts,
    ];
    if (all.length === 0) return null;

    // Tier distribution
    const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const d of all) tierCounts[ratingToTier(d.rating)]++;

    // Brand stats
    const byBrand: Record<string, { count: number; sum: number }> = {};
    for (const d of all) {
      const b = (d.brand?.trim() || 'Unknown');
      if (!byBrand[b]) byBrand[b] = { count: 0, sum: 0 };
      byBrand[b].count++;
      byBrand[b].sum += d.rating;
    }
    const brandEntries = Object.entries(byBrand);
    const topBrandByCount = brandEntries.sort((a, b) => b[1].count - a[1].count)[0];
    const brandsWith2Plus = brandEntries.filter(([, v]) => v.count >= 2);
    const bestBrand = brandsWith2Plus.length > 0
      ? brandsWith2Plus.sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)[0]
      : null;
    const worstBrand = brandsWith2Plus.length > 0
      ? brandsWith2Plus.sort((a, b) => a[1].sum / a[1].count - b[1].sum / b[1].count)[0]
      : null;

    // Generosity vs. critic — variance from neutral 3.0
    const harshCount    = all.filter((d) => d.rating < 3).length;
    const generousCount = all.filter((d) => d.rating >= 4).length;
    const generosityScore = generousCount / all.length; // 0..1

    // Pickiness — std deviation of ratings (high = wide spread, low = consistent)
    const mean = all.reduce((s, d) => s + d.rating, 0) / all.length;
    const variance = all.reduce((s, d) => s + (d.rating - mean) ** 2, 0) / all.length;
    const stdDev = Math.sqrt(variance);

    // Brand loyalty — % of opinions from top brand
    const loyaltyPct = topBrandByCount
      ? Math.round((topBrandByCount[1].count / all.length) * 100)
      : 0;

    // Sweet spot — most-rated tier
    const sweetTier = (Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0])[0];

    // Variety — unique brands across reviews + tried-its
    const uniqueBrands = brandEntries.length;

    // Flavor fingerprint — which flavor families this palate gravitates toward.
    const flavorCounts: Record<string, number> = {};
    for (const d of all) {
      const fam = flavorFamilyOf(d.seltzer_name);
      if (fam) flavorCounts[fam] = (flavorCounts[fam] || 0) + 1;
    }
    const flavorFamilies = Object.entries(flavorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([family, count]) => ({ family, count }));

    // Generosity label
    const generosityLabel =
      generosityScore >= 0.65 ? 'Generous' :
      generosityScore >= 0.4  ? 'Balanced'  :
      generosityScore >= 0.2  ? 'Selective' :
                                'Harsh critic';

    // Pickiness label (std dev — higher = more polarized opinions)
    const pickinessLabel =
      stdDev >= 1.2 ? 'Polarized'  :
      stdDev >= 0.8 ? 'Opinionated':
      stdDev >= 0.4 ? 'Steady'     :
                      'Lockstep';

    return {
      total: all.length,
      reviewCount: reviews.length,
      triedItCount: triedIts.length,
      tierCounts,
      topBrandByCount,
      bestBrand,
      worstBrand,
      generosityScore,
      generosityLabel,
      stdDev,
      pickinessLabel,
      loyaltyPct,
      sweetTier,
      uniqueBrands,
      harshCount,
      generousCount,
      mean,
      flavorFamilies,
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

        {/* ─── Taste profile (advanced metrics) ─── */}
        {taste && taste.total >= 2 && (
          <div
            className="rounded-3xl overflow-hidden animate-fade-in-up"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.06), rgba(167,139,250,0.06))',
              border: '1px solid var(--border-subtle)',
              padding: '16px',
            }}
          >
            <div className="flex items-center justify-between mb-3 gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
                Taste Profile
              </span>
              <span className="text-[10px] text-right" style={{ color: 'var(--text-muted)' }}>
                {taste.reviewCount} review{taste.reviewCount === 1 ? '' : 's'}
                {taste.triedItCount > 0 && <> · {taste.triedItCount} tried</>}
                {' · avg '}{taste.mean.toFixed(1)}
              </span>
            </div>

            {/* Trait pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              <TraitPill label={taste.generosityLabel} sub="critic style" tone="cyan" />
              <TraitPill label={taste.pickinessLabel} sub="opinion spread" tone="violet" />
              <TraitPill
                label={`${taste.loyaltyPct}% loyal`}
                sub={taste.topBrandByCount?.[0] ?? ''}
                tone="amber"
              />
              <TraitPill label={`Sweet spot ${taste.sweetTier}`} sub="most-rated tier" tone="emerald" />
            </div>

            {/* Flavor fingerprint — what flavor families this palate leans toward */}
            {taste.flavorFamilies.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Flavor fingerprint
                </p>
                <div className="flex h-3 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.08)' }}>
                  {taste.flavorFamilies.slice(0, 6).map((f) => (
                    <div key={f.family} title={`${f.family} · ${f.count}`} style={{ width: `${(f.count / taste.total) * 100}%`, background: FLAVOR_COLOR[f.family] || '#94a3b8' }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {taste.flavorFamilies.slice(0, 4).map((f) => (
                    <span key={f.family} className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: FLAVOR_COLOR[f.family] }} />
                      {f.family} <span style={{ color: 'var(--text-muted)' }}>· {f.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tier distribution bar chart */}
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Tier distribution
              </p>
              <div className="flex items-end gap-1.5 h-16">
                {(['S','A','B','C','D','F'] as const).map((t) => {
                  const c = taste.tierCounts[t];
                  const max = Math.max(...Object.values(taste.tierCounts));
                  const heightPct = max ? (c / max) * 100 : 0;
                  return (
                    <div key={t} className="flex-1 flex flex-col items-center justify-end h-full">
                      <span className="text-[9px] font-bold mb-0.5" style={{ color: c > 0 ? TIER_COLORS[t] : 'var(--text-muted)' }}>
                        {c}
                      </span>
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${Math.max(heightPct, 4)}%`,
                          background: c > 0 ? `${TIER_COLORS[t]}cc` : 'rgba(148,163,184,0.08)',
                          boxShadow: c > 0 ? `0 0 12px ${TIER_COLORS[t]}33` : 'none',
                        }}
                      />
                      <span className="text-[10px] font-extrabold mt-1" style={{ color: TIER_COLORS[t] }}>
                        {t}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Best & worst brand callouts */}
            {(taste.bestBrand || taste.worstBrand) && (
              <div className="grid grid-cols-2 gap-2">
                {taste.bestBrand && (
                  <BrandCallout
                    label="Reaches highest"
                    brand={taste.bestBrand[0]}
                    avg={taste.bestBrand[1].sum / taste.bestBrand[1].count}
                    count={taste.bestBrand[1].count}
                    tone="#10b981"
                  />
                )}
                {taste.worstBrand && taste.bestBrand && taste.worstBrand[0] !== taste.bestBrand[0] && (
                  <BrandCallout
                    label="Falls flattest"
                    brand={taste.worstBrand[0]}
                    avg={taste.worstBrand[1].sum / taste.worstBrand[1].count}
                    count={taste.worstBrand[1].count}
                    tone="#fb7185"
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {taste.uniqueBrands} {taste.uniqueBrands === 1 ? 'brand' : 'brands'} explored
              </p>
              <Link
                href={`/profile/${user.username}/stats`}
                className="text-[11px] font-semibold inline-flex items-center gap-1 hover:underline"
                style={{ color: 'var(--cyan-400)' }}
              >
                <BarChart3 size={11} /> Detailed stats →
              </Link>
            </div>
          </div>
        )}

        {/* ─── Top brands strip ─── */}
        {topBrands.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
              {isOwnProfile ? 'Brands you reach for' : 'Goes back for'}
            </p>
            <div className="flex flex-wrap gap-2">
              {topBrands.map((b) => (
                <Link
                  key={b.brand}
                  href={`/brand/${encodeURIComponent(b.brand)}`}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors hover:bg-white/5"
                  style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  {b.brand} <span style={{ color: 'var(--text-muted)' }}>· {b.count}</span>
                </Link>
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
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {reviewQuery
                      ? `${filteredReviews.length} of ${reviews.length} reviews`
                      : `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}
                  </p>
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

                {reviewLayout === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 stagger-children">
                    {filteredReviews.map((review) => (<ReviewGridTile key={review.id} review={review} />))}
                  </div>
                ) : (
                  <div className="space-y-4 stagger-children">
                    {filteredReviews.map((review) => (<ReviewCard key={review.id} review={review} currentUserId={currentUserId || undefined} />))}
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

const PILL_TONES: Record<string, { fg: string; bg: string; border: string }> = {
  cyan:    { fg: 'var(--cyan-400)',   bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.22)' },
  violet:  { fg: 'var(--violet-400)', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.22)' },
  amber:   { fg: 'var(--amber-400)',  bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.22)' },
  emerald: { fg: '#34d399',           bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.22)' },
};

function TraitPill({ label, sub, tone }: { label: string; sub: string; tone: keyof typeof PILL_TONES }) {
  const t = PILL_TONES[tone];
  return (
    <div
      className="rounded-xl px-3 py-1.5 flex flex-col"
      style={{ background: t.bg, border: `1px solid ${t.border}` }}
    >
      <span className="text-xs font-bold leading-tight" style={{ color: t.fg }}>{label}</span>
      {sub && <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

function BrandCallout({ label, brand, avg, count, tone }: { label: string; brand: string; avg: number; count: number; tone: string }) {
  return (
    <div
      className="rounded-xl p-2.5"
      style={{ background: `${tone}10`, border: `1px solid ${tone}33` }}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: tone }}>{label}</p>
      <p className="text-sm font-extrabold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>{brand}</p>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        avg {avg.toFixed(1)} · {count} reviews
      </p>
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
