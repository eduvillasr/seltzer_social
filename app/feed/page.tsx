// app/feed/page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReviewCard } from '@/components/ReviewCard';
import { TierAddCard } from '@/components/TierAddCard';
import { Navigation } from '@/components/Navigation';
import { Review, AuthUser, SharedTierListItem } from '@/types';
import { getSmartFeed, getFollowingCount, getSubscribedSharedTierActivities, supabase } from '@/lib/supabase';
import { Plus, Droplets, Search, Sparkles, ListPlus, RotateCcw, Flame, UserPlus } from 'lucide-react';
import { FeedSkeleton } from '@/components/Skeletons';
import { TopHeader } from '@/components/TopHeader';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { invalidate } from '@/lib/cache';

type FeedItem =
  | { kind: 'review';  at: number; review: Review }
  | { kind: 'tierAdd'; at: number; activity: SharedTierListItem };

type Section = { label: string; items: FeedItem[] };

export default function FeedPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activities, setActivities] = useState<SharedTierListItem[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [followingCount, setFollowingCount] = useState(0);
  const router = useRouter();

  useEffect(() => { checkUser(); }, []);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/'); return; }
    const uid = data.session.user.id;
    setCurrentUser({ id: uid, email: data.session.user.email || '' });

    // Soft-redirect first-time users (no following + no own reviews) to onboarding,
    // unless they've already opted out via this flag in localStorage.
    const skipKey = `seltzer:skip-onboard:${uid}`;
    if (typeof window !== 'undefined' && !window.localStorage.getItem(skipKey)) {
      const [{ count: followCount }, { count: reviewCount }] = await Promise.all([
        getFollowingCount(uid),
        supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', uid).then(({ count }) => ({ count: count ?? 0 })),
      ]);
      if (followCount === 0 && reviewCount === 0) {
        router.push('/onboarding');
        return;
      }
      window.localStorage.setItem(skipKey, '1');
    }

    loadFeed(uid);
  }

  async function loadFeed(uid: string, withSpinner = true, opts?: { force?: boolean }) {
    if (withSpinner) setLoading(true);

    // SWR pattern: paint cached values instantly, then revalidate in the
    // background. `force` bypasses the cache (used by pull-to-refresh).
    const cache = await import('@/lib/cache');
    if (opts?.force) {
      cache.invalidate(`feed:${uid}`);
    }
    const cached = !opts?.force ? cache.peekCache<{ reviews: Review[]; activities: SharedTierListItem[]; followingCount: number }>(`feed:${uid}`) : undefined;
    if (cached) {
      setReviews(cached.reviews);
      setActivities(cached.activities);
      setFollowingCount(cached.followingCount);
      if (withSpinner) setLoading(false);
    }

    const [{ count: fc }, { data }, { data: acts }] = await Promise.all([
      getFollowingCount(uid),
      getSmartFeed(uid, 50),
      getSubscribedSharedTierActivities(uid, 24),
    ]);
    const reviews = (data as Review[]) || [];
    const activities = (acts as SharedTierListItem[]) || [];
    setFollowingCount(fc);
    setReviews(reviews);
    setActivities(activities);
    cache.setCache(`feed:${uid}`, { reviews, activities, followingCount: fc });
    if (withSpinner) setLoading(false);
  }

  const { pull, progress, isRefreshing, triggered, bind } = usePullToRefresh(async () => {
    // Pull-to-refresh always bypasses the cache for guaranteed-fresh data.
    if (currentUser) await loadFeed(currentUser.id, false, { force: true });
  });

  // Silently refresh when the user comes back to the tab.
  // Throttled so a quick window-switch storm doesn't hammer the DB.
  useEffect(() => {
    if (!currentUser) return;
    let lastRefresh = Date.now();
    const REFRESH_COOLDOWN_MS = 30_000;
    function maybeRefresh() {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastRefresh > REFRESH_COOLDOWN_MS) {
        lastRefresh = now;
        loadFeed(currentUser!.id, false);
      }
    }
    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [currentUser]);

  // ── merge + group ───────────────────────────────────────────
  const sections = useMemo<Section[]>(() => {
    const items: FeedItem[] = [];
    for (const r of reviews) {
      items.push({ kind: 'review', at: new Date(r.created_at).getTime(), review: r });
    }
    for (const a of activities) {
      items.push({ kind: 'tierAdd', at: new Date(a.created_at).getTime(), activity: a });
    }
    items.sort((x, y) => y.at - x.at);

    // group by relative day buckets
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const yesterdayMs = todayMs - dayMs;
    const weekAgoMs = todayMs - 7 * dayMs;

    const buckets: Record<string, FeedItem[]> = {
      'Today': [],
      'Yesterday': [],
      'This week': [],
      'Earlier': [],
    };
    for (const item of items) {
      if (item.at >= todayMs)        buckets['Today'].push(item);
      else if (item.at >= yesterdayMs) buckets['Yesterday'].push(item);
      else if (item.at >= weekAgoMs) buckets['This week'].push(item);
      else                            buckets['Earlier'].push(item);
    }
    return (Object.entries(buckets) as [string, FeedItem[]][])
      .filter(([, arr]) => arr.length > 0)
      .map(([label, arr]) => ({ label, items: arr }));
  }, [reviews, activities]);

  const isEmpty = !loading && sections.length === 0;

  return (
    <>
      <Navigation />

      {/* Pull-to-refresh indicator (mobile) */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center justify-center"
        style={{
          width: 36, height: 36,
          borderRadius: '50%',
          background: 'rgba(15,20,36,0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          opacity: progress,
          transform: `translate(-50%, ${Math.max(8, pull - 24)}px) scale(${0.6 + 0.4 * progress})`,
          transition: pull === 0 ? 'transform 240ms ease, opacity 240ms ease' : 'none',
        }}
      >
        <RotateCcw
          size={16}
          className={isRefreshing ? 'animate-spin' : ''}
          style={{
            color: triggered ? 'var(--cyan-400)' : 'var(--text-muted)',
            transform: `rotate(${progress * -180}deg)`,
            transition: isRefreshing ? 'none' : 'transform 80ms linear',
          }}
        />
      </div>

      <TopHeader
        title="Feed"
        right={
          <Link
            href="/discover"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--cyan-400)' }}
          >
            <Flame size={11} /> Discover
          </Link>
        }
      />

      <main
        {...bind}
        className="max-w-md mx-auto px-4 with-top-header pb-32"
        style={{
          transform: pull > 0 ? `translateY(${pull * 0.4}px)` : undefined,
          transition: pull === 0 ? 'transform 280ms cubic-bezier(0.18, 0.89, 0.32, 1.28)' : 'none',
        }}
      >

        {/* Promo: start a shared list */}
        <Link
          href="/shared/create"
          className="mt-4 mb-5 flex items-center justify-between rounded-2xl px-4 py-3 transition-colors hover:bg-white/5"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(245,158,11,0.06))',
            border: '1px solid rgba(6,182,212,0.18)',
          }}
        >
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Start a shared tier list</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Rank seltzers together with a friend.</p>
          </div>
          <ListPlus size={18} className="text-cyan-400" />
        </Link>

        {/* Feed */}
        {loading ? (
          <FeedSkeleton count={3} />
        ) : isEmpty ? (
          followingCount === 0 ? (
            // No follows yet — point them to Discover, not "write your own."
            <div className="glass-card text-center py-12 animate-fade-in-up">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(167,139,250,0.18))' }}
              >
                <Flame size={22} className="text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Your feed is empty
              </h3>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Follow some people and your feed fills up with their reviews + tier list updates.
                <br />Find them on Discover or via Search.
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Link href="/discover" className="btn-primary inline-flex">
                  <Flame size={14} /> Browse Discover
                </Link>
                <Link href="/discover" className="btn-secondary inline-flex">
                  <UserPlus size={14} /> Find people
                </Link>
              </div>
            </div>
          ) : (
            // They follow people but those people haven't posted lately.
            <div className="glass-card text-center py-12 animate-fade-in-up">
              <Droplets size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Quiet on this end
              </h3>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                Nobody you follow has posted lately. Drop a review — they'll see it.
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Link href="/create" className="btn-primary inline-flex">
                  <Plus size={14} /> Write a Review
                </Link>
                <Link href="/discover" className="btn-secondary inline-flex">
                  <Flame size={14} /> Discover
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-6">
            {sections.map((section, sIdx) => (
              <section key={section.label} className="space-y-3 stagger-children">
                {/* Sticky section header — clings to the top while you scroll its bucket */}
                <div
                  className="flex items-center gap-3 -mx-4 px-4 py-2"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 5,
                    background: 'rgba(10,14,26,0.78)',
                    backdropFilter: 'blur(14px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(14px) saturate(180%)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {section.label}
                  </span>
                  <span className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {section.items.length}
                  </span>
                </div>

                {/* Items */}
                {section.items.map((item, idx) => {
                  if (item.kind === 'review') {
                    return (
                      <ReviewCard
                        key={`r-${item.review.id}`}
                        review={item.review}
                        currentUserId={currentUser?.id}
                      />
                    );
                  }
                  return <TierAddCard key={`t-${item.activity.id}`} activity={item.activity} />;
                })}
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
