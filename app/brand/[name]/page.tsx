// app/brand/[name]/page.tsx
//
// Brand hub. Tap any brand name anywhere in the app → land here.
// Shows the brand's full catalog, community stats per drink, and the
// signed-in user's own activity for any of those drinks.
//
// Data model: brands are not their own table; they're a string column on
// seltzers. We look up case-insensitively and use ilike so URLs are tolerant
// of casing differences.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { CanImage } from '@/components/CanImage';
import { TopHeader } from '@/components/TopHeader';
import { CanLoader } from '@/components/CanLoader';
import { StarRating } from '@/components/StarRating';
import { getBrandHubData, supabase } from '@/lib/supabase';
import {
  Droplets, Users, Star, TrendingUp, Trophy, ArrowUpDown, Check,
} from 'lucide-react';

type SortMode = 'top' | 'popular' | 'name' | 'new';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};
function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2) return 'C'; if (v >= 1) return 'D'; return 'F';
}

interface DrinkRow {
  id: string;
  name: string;
  image_url: string | null;
  count: number;
  avg: number;
  myRating: number | null;
  createdAt: string;
}

export default function BrandHubPage({ params }: { params: { name: string } }) {
  const decodedBrand = useMemo(() => {
    try { return decodeURIComponent(params.name); } catch { return params.name; }
  }, [params.name]);

  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState(decodedBrand);
  const [rows, setRows] = useState<DrinkRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('top');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => { boot(); /* eslint-disable-line */ }, [decodedBrand]);

  async function boot() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user?.id ?? null;
    setCurrentUserId(uid);

    const { brand: displayBrand, drinks, stats, myReviews } = await getBrandHubData(decodedBrand, uid);

    setBrand(displayBrand || decodedBrand);
    setRows(
      drinks.map((d: any) => {
        // Coerce id to string up front — TypeScript's strict mode refuses
        // to use an `any` value as a Record<string, …> index, and the
        // production build (tsc) flags it as an implicit-any error.
        const id: string = String(d.id);
        return {
          id,
          name: d.name,
          image_url: stats[id]?.image ?? d.image_url ?? null,
          count: stats[id]?.count ?? 0,
          avg: stats[id]?.avg ?? 0,
          myRating: myReviews[id] ?? null,
          createdAt: d.created_at,
        };
      })
    );
    setLoading(false);
  }

  // Brand-wide aggregates
  const aggregate = useMemo(() => {
    if (rows.length === 0) return null;
    let totalReviews = 0, weightedSum = 0, weightedCount = 0;
    let bestDrink: DrinkRow | null = null;
    let myReviewedCount = 0;
    for (const r of rows) {
      totalReviews += r.count;
      if (r.count > 0) {
        weightedSum += r.avg * r.count;
        weightedCount += r.count;
        if (!bestDrink || r.avg > bestDrink.avg) bestDrink = r;
      }
      if (r.myRating !== null) myReviewedCount++;
    }
    return {
      drinkCount: rows.length,
      totalReviews,
      avgRating: weightedCount > 0 ? weightedSum / weightedCount : 0,
      bestDrink,
      myReviewedCount,
      myExploredPct: rows.length > 0 ? myReviewedCount / rows.length : 0,
    };
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    switch (sortMode) {
      case 'top': arr.sort((a, b) => b.avg - a.avg || b.count - a.count); break;
      case 'popular': arr.sort((a, b) => b.count - a.count || b.avg - a.avg); break;
      case 'new': arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'name': arr.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return arr;
  }, [rows, sortMode]);

  if (loading) {
    return (<><Navigation /><TopHeader title={brand} back /><main className="max-w-md mx-auto px-4 with-top-header pb-32"><CanLoader /></main></>);
  }

  if (rows.length === 0) {
    return (
      <>
        <Navigation />
        <TopHeader title={decodedBrand} back />
        <main className="max-w-md mx-auto px-4 with-top-header pb-32">
          <div className="glass-card text-center py-12">
            <Droplets size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No drinks for "{decodedBrand}"</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Maybe the brand is spelled differently — try searching.
            </p>
            <Link href="/discover" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>
              Search
            </Link>
          </div>
        </main>
      </>
    );
  }

  const tierColor = aggregate && aggregate.avgRating > 0
    ? TIER_COLORS[ratingToTier(aggregate.avgRating)]
    : 'var(--cyan-400)';

  return (
    <>
      <Navigation />
      <TopHeader title={brand} back />
      <main className="max-w-md mx-auto px-4 with-top-header pb-32 space-y-5">
        <div className="h-1" />

        {/* ─── Brand hero ─── */}
        <div
          className="rounded-3xl overflow-hidden animate-fade-in-up"
          style={{
            background: `linear-gradient(160deg, ${tierColor}10, rgba(15,20,36,0.6))`,
            border: `1px solid ${tierColor}33`,
            padding: '20px',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: tierColor }}>
            Brand hub
          </p>
          <h1 className="text-2xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {brand}
          </h1>

          {aggregate && (
            <div className="mt-4 grid grid-cols-3 gap-2 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <Stat label="drinks" value={aggregate.drinkCount} color="var(--text-primary)" />
              <Stat label="reviews" value={aggregate.totalReviews} color="var(--violet-400)" />
              <Stat
                label="avg rating"
                value={aggregate.avgRating > 0 ? aggregate.avgRating.toFixed(1) : '—'}
                color={tierColor}
              />
            </div>
          )}

          {/* Your activity strip (only for signed-in users with ≥1 review of this brand) */}
          {currentUserId && aggregate && aggregate.myReviewedCount > 0 && (
            <div
              className="mt-3 rounded-xl px-3 py-2 flex items-center gap-2"
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.18)' }}
            >
              <Check size={13} style={{ color: 'var(--cyan-400)' }} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                You've reviewed <span style={{ fontWeight: 700, color: 'var(--cyan-400)' }}>
                  {aggregate.myReviewedCount} of {aggregate.drinkCount}
                </span> · {(aggregate.myExploredPct * 100).toFixed(0)}% explored
              </p>
            </div>
          )}

          {/* Top pick callout */}
          {aggregate?.bestDrink && aggregate.bestDrink.count > 0 && (
            <Link
              href={`/drink/${aggregate.bestDrink.id}`}
              className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}
            >
              <Trophy size={13} style={{ color: '#f59e0b' }} />
              <p className="text-xs flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
                Community top pick: <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {aggregate.bestDrink.name}
                </span>
              </p>
              <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                {aggregate.bestDrink.avg.toFixed(1)}
              </span>
            </Link>
          )}
        </div>

        {/* ─── Sort + drink list ─── */}
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
            Every flavor
          </p>
          <SortControl mode={sortMode} onChange={setSortMode} />
        </div>

        <div className="space-y-2">
          {sorted.map((row) => (
            <DrinkRowCard key={row.id} row={row} />
          ))}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function DrinkRowCard({ row }: { row: DrinkRow }) {
  const tier = row.count > 0 ? ratingToTier(row.avg) : null;
  const tierColor = tier ? TIER_COLORS[tier] : 'var(--text-muted)';
  return (
    <Link
      href={`/drink/${row.id}`}
      className="glass-card flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
      style={{ padding: '12px' }}
    >
      {row.image_url ? (
        <CanImage
          src={row.image_url}
          alt={row.name}
          className="w-14 h-16 rounded-lg flex-shrink-0"
          style={{ border: '1px solid var(--border-subtle)' }}
        />
      ) : (
        <div
          className="w-14 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid var(--border-subtle)' }}
        >
          <Droplets size={20} style={{ color: 'var(--text-muted)' }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
          {row.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {row.count > 0 ? (
            <>
              <StarRating value={row.avg} size={11} />
              <span className="text-[11px] tabular-nums" style={{ color: tierColor, fontWeight: 700 }}>
                {row.avg.toFixed(1)}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                · {row.count} {row.count === 1 ? 'review' : 'reviews'}
              </span>
            </>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No reviews yet</span>
          )}
        </div>
        {row.myRating !== null && (
          <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--cyan-400)' }}>
            <Check size={10} /> You rated <span className="font-bold">{row.myRating.toFixed(1)}</span>
          </p>
        )}
      </div>
      {tier && (
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0"
          style={{ background: `${tierColor}1a`, color: tierColor, border: `1px solid ${tierColor}33` }}
        >
          {tier}
        </span>
      )}
    </Link>
  );
}

const SORT_LABELS: Record<SortMode, string> = {
  top: 'Top rated',
  popular: 'Most reviewed',
  new: 'Newest first',
  name: 'A → Z',
};

function SortControl({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)' }}
    >
      <ArrowUpDown size={11} style={{ color: 'var(--text-muted)' }} />
      <select
        value={mode}
        onChange={(e) => onChange(e.target.value as SortMode)}
        className="bg-transparent text-[11px] font-semibold outline-none"
        style={{ color: 'var(--text-primary)' }}
      >
        {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
          <option key={k} value={k} style={{ background: '#0a0e1a' }}>{SORT_LABELS[k]}</option>
        ))}
      </select>
    </label>
  );
}
