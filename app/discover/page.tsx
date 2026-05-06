// app/discover/page.tsx
// Trending / discover landing — what's hot across the whole app.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, Flame, Trophy, Users, ListPlus, ArrowRight, Droplets, Star,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Avatar } from '@/components/Avatar';
import { FounderBadge, FOUNDERS } from '@/components/FounderBadge';
import { FeedSkeleton } from '@/components/Skeletons';
import {
  getTrendingDrinks, getTopRatedDrinks, getTrendingTierLists, getActiveReviewers,
  TrendingDrink,
} from '@/lib/supabase';
import { SharedTierList } from '@/types';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};
function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2)   return 'C'; if (v >= 1) return 'D'; return 'F';
}

export default function DiscoverPage() {
  const [trending, setTrending] = useState<TrendingDrink[]>([]);
  const [topRated, setTopRated] = useState<TrendingDrink[]>([]);
  const [lists, setLists] = useState<SharedTierList[]>([]);
  const [reviewers, setReviewers] = useState<{ user: any; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [a, b, c, d] = await Promise.all([
      getTrendingDrinks(30, 8),
      getTopRatedDrinks(2, 6),
      getTrendingTierLists(6),
      getActiveReviewers(30, 6),
    ]);
    setTrending(a.data);
    setTopRated(b.data);
    setLists(c.data as SharedTierList[]);
    setReviewers(d.data);
    setLoading(false);
  }

  const empty = !loading && trending.length === 0 && lists.length === 0 && reviewers.length === 0;

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-10 pb-32 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 animate-fade-in-up">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(167,139,250,0.18))' }}
          >
            <Flame size={17} style={{ color: 'var(--cyan-400)' }} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Discover
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              What's trending across Seltzer Social right now.
            </p>
          </div>
        </div>

        {loading ? (
          <FeedSkeleton count={2} />
        ) : empty ? (
          <div className="glass-card text-center py-12">
            <Sparkles size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Quiet week</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No trending content yet — be the first to drop a review.
            </p>
            <Link href="/create" className="btn-primary inline-flex mt-5" style={{ fontSize: '12px', padding: '8px 16px' }}>
              Write a Review <ArrowRight size={12} />
            </Link>
          </div>
        ) : (
          <>
            {/* ═══════ Trending drinks ═══════ */}
            {trending.length > 0 && (
              <section className="space-y-3 stagger-children">
                <SectionHeader icon={<Flame size={12} />} label="Trending drinks" sub="Most reviewed this month" tone="amber" />
                <div className="grid grid-cols-2 gap-2.5">
                  {trending.map((d) => <DrinkCard key={d.seltzer_id} drink={d} />)}
                </div>
              </section>
            )}

            {/* ═══════ Top rated ═══════ */}
            {topRated.length > 0 && (
              <section className="space-y-3 stagger-children">
                <SectionHeader icon={<Trophy size={12} />} label="Highest rated" sub="2+ community reviews" tone="emerald" />
                <div className="space-y-2">
                  {topRated.map((d, idx) => <TopRatedRow key={d.seltzer_id} drink={d} rank={idx + 1} />)}
                </div>
              </section>
            )}

            {/* ═══════ Trending tier lists ═══════ */}
            {lists.length > 0 && (
              <section className="space-y-3 stagger-children">
                <SectionHeader icon={<ListPlus size={12} />} label="Active tier lists" sub="Recently updated public lists" tone="cyan" />
                <div className="space-y-2">
                  {lists.map((list) => <ListRow key={list.id} list={list} />)}
                </div>
              </section>
            )}

            {/* ═══════ Top reviewers ═══════ */}
            {reviewers.length > 0 && (
              <section className="space-y-3 stagger-children">
                <SectionHeader icon={<Users size={12} />} label="Active reviewers" sub="Most reviews this month" tone="violet" />
                <div className="grid grid-cols-3 gap-2">
                  {reviewers.map((r) => (
                    <Link
                      key={r.user.id}
                      href={`/profile/${r.user.username}`}
                      className="rounded-2xl p-3 flex flex-col items-center text-center transition-colors hover:bg-white/5"
                      style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
                    >
                      <Avatar username={r.user.username} avatarUrl={r.user.avatar_url} size={44} />
                      <p className="text-xs font-bold mt-2 truncate w-full inline-flex items-center justify-center gap-1" style={{ color: 'var(--text-primary)' }}>
                        @{r.user.username}
                        {FOUNDERS.has(r.user.username) && <FounderBadge />}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {r.count} {r.count === 1 ? 'review' : 'reviews'}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function SectionHeader({
  icon, label, sub, tone,
}: { icon: React.ReactNode; label: string; sub: string; tone: 'cyan' | 'amber' | 'emerald' | 'violet' }) {
  const colors: Record<string, string> = {
    cyan: 'var(--cyan-400)',
    amber: 'var(--amber-400)',
    emerald: '#34d399',
    violet: 'var(--violet-400)',
  };
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <div className="flex items-center gap-2">
        <span style={{ color: colors[tone] }}>{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: colors[tone] }}>
          {label}
        </h2>
      </div>
      <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{sub}</span>
    </div>
  );
}

function DrinkCard({ drink }: { drink: TrendingDrink }) {
  const tier = ratingToTier(drink.avgRating);
  const color = TIER_COLORS[tier];
  return (
    <Link
      href={`/drink/${drink.seltzer_id}`}
      className="rounded-2xl overflow-hidden block transition-all hover:scale-[1.01]"
      style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="relative aspect-square overflow-hidden">
        {drink.latestImage ? (
          <img src={drink.latestImage} alt={drink.seltzer_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `${color}1a` }}>
            <Droplets size={26} style={{ color }} />
          </div>
        )}
        <span
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold"
          style={{ background: color, color: '#0a0e1a', boxShadow: `0 0 12px ${color}66` }}
        >
          {tier}
        </span>
      </div>
      <div className="p-2.5">
        <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{drink.seltzer_name}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{drink.brand ?? 'No brand'}</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          ⭐ {drink.avgRating.toFixed(1)} · {drink.reviewCount} {drink.reviewCount === 1 ? 'review' : 'reviews'}
        </p>
      </div>
    </Link>
  );
}

function TopRatedRow({ drink, rank }: { drink: TrendingDrink; rank: number }) {
  const tier = ratingToTier(drink.avgRating);
  const color = TIER_COLORS[tier];
  return (
    <Link
      href={`/drink/${drink.seltzer_id}`}
      className="flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-white/5"
      style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
    >
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0"
        style={{ background: rank <= 3 ? `${color}25` : 'rgba(148,163,184,0.08)', color: rank <= 3 ? color : 'var(--text-muted)' }}
      >
        {rank}
      </span>
      {drink.latestImage ? (
        <img src={drink.latestImage} alt={drink.seltzer_name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: `${color}1a` }}>
          <Droplets size={16} style={{ color }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{drink.seltzer_name}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{drink.brand ?? 'No brand'}</p>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-sm font-extrabold" style={{ color }}>{drink.avgRating.toFixed(1)}</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{drink.reviewCount}× rated</span>
      </div>
    </Link>
  );
}

function ListRow({ list }: { list: SharedTierList }) {
  return (
    <Link
      href={`/shared/${list.id}`}
      className="block rounded-2xl p-3 transition-colors hover:bg-white/5"
      style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{list.name}</p>
          <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
            @{list.owner?.username} <span style={{ color: 'var(--border-strong)' }}>×</span> @{list.partner?.username}
          </p>
        </div>
        <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
    </Link>
  );
}
