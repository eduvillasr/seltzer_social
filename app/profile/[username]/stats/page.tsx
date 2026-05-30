// app/profile/[username]/stats/page.tsx
//
// Advanced stats / "taste analytics" for a user. Linked from the profile's
// Taste Profile card. Premium-tier in the future — currently free for all
// users (no visual paywall hint per product call).
//
// Metrics shown:
//  • Catalog completion (X of Y drinks reviewed)
//  • Brand diversity (X of Y brands explored)
//  • Generosity vs. global (their avg compared to platform avg)
//  • Hot streak (30-day avg rating)
//  • Rating histogram (bucketed 0.5 increments)
//  • Per-brand explorer with sortable rows showing % explored,
//    personal avg, review count, and a progress bar
//
// All computation is client-side off three batched queries — no extra DB
// trip for each metric. Catalog totals and the global avg are cached at
// the lib level so flipping back and forth between users is fast.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TopHeader } from '@/components/TopHeader';
import { CanLoader } from '@/components/CanLoader';
import {
  getUserByUsername, getUserReviews, getUserTriedIts,
  getBrandCatalogTotals, getCatalogSize, getGlobalAvgRating,
} from '@/lib/supabase';
import { User } from '@/types';
import {
  BarChart3, Droplets, Flame, Star, TrendingUp, TrendingDown,
  Compass, Layers, ArrowUpDown, Trophy,
} from 'lucide-react';

type SortMode = 'explored' | 'count' | 'avg' | 'name';

interface BrandRow {
  brand: string;
  count: number;       // how many of this brand the user has rated
  total: number;       // brand's full catalog size
  exploredPct: number; // count / total clamped to 0..1
  avgRating: number;
  highest: number;
  lowest: number;
}

interface TasteDatum {
  rating: number;
  brand: string | null;
  seltzer_name: string;
  created_at: string;
}

export default function StatsPage({ params }: { params: { username: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TasteDatum[]>([]);
  const [brandCatalog, setBrandCatalog] = useState<Record<string, number>>({});
  const [catalogSize, setCatalogSize] = useState(0);
  const [globalAvg, setGlobalAvg] = useState(3.5);
  const [sortMode, setSortMode] = useState<SortMode>('explored');

  useEffect(() => { boot(); /* eslint-disable-line */ }, [params.username]);

  async function boot() {
    setLoading(true);
    const { data: u } = await getUserByUsername(params.username);
    if (!u) { setLoading(false); return; }
    setUser(u as User);

    // Batch every read in parallel. Most of these are <10kB per user.
    const [
      { data: reviews },
      { data: triedIts },
      catalog,
      size,
      gAvg,
    ] = await Promise.all([
      getUserReviews((u as User).id),
      getUserTriedIts((u as User).id),
      getBrandCatalogTotals(),
      getCatalogSize(),
      getGlobalAvgRating(),
    ]);

    const reviewRows: TasteDatum[] = (reviews || []).map((r: any) => ({
      rating: r.rating,
      brand: r.brand,
      seltzer_name: r.seltzer_name,
      created_at: r.created_at,
    }));
    const triedRows: TasteDatum[] = (triedIts || []).map((t: any) => ({
      rating: t.rating,
      brand: t.review?.brand ?? null,
      seltzer_name: t.review?.seltzer_name ?? '',
      created_at: t.created_at,
    }));

    setData([...reviewRows, ...triedRows]);
    setBrandCatalog(catalog);
    setCatalogSize(size);
    setGlobalAvg(gAvg);
    setLoading(false);
  }

  // ─── derived metrics ──────────────────────────────────────────
  const metrics = useMemo(() => {
    if (data.length === 0) return null;

    // Personal average across reviews + tried-its
    const personalAvg = data.reduce((s, d) => s + d.rating, 0) / data.length;

    // Build brand rows. Deduplicate by drink name within each brand so the
    // count reflects unique drinks tried, not raw review entries.
    const byBrand: Record<string, { drinks: Map<string, number[]> }> = {};
    for (const d of data) {
      const brand = (d.brand ?? '').trim();
      if (!brand) continue;
      if (!byBrand[brand]) byBrand[brand] = { drinks: new Map() };
      const key = d.seltzer_name.trim().toLowerCase();
      const arr = byBrand[brand].drinks.get(key) ?? [];
      arr.push(d.rating);
      byBrand[brand].drinks.set(key, arr);
    }

    const brandRows: BrandRow[] = Object.entries(byBrand).map(([brand, v]) => {
      // Per-drink avg across review + tried-it on the same drink
      const drinkAvgs: number[] = [];
      for (const ratings of v.drinks.values()) {
        drinkAvgs.push(ratings.reduce((a, b) => a + b, 0) / ratings.length);
      }
      const count = drinkAvgs.length;
      const total = Math.max(brandCatalog[brand] ?? count, count);
      const avgRating = drinkAvgs.reduce((a, b) => a + b, 0) / count;
      return {
        brand,
        count,
        total,
        exploredPct: total > 0 ? count / total : 0,
        avgRating,
        highest: Math.max(...drinkAvgs),
        lowest: Math.min(...drinkAvgs),
      };
    });

    // Unique drinks rated (dedupe by brand+name)
    const uniqueDrinkKeys = new Set<string>();
    for (const d of data) {
      const key = `${(d.brand ?? '').toLowerCase()}|${d.seltzer_name.toLowerCase()}`;
      uniqueDrinkKeys.add(key);
    }
    const uniqueDrinks = uniqueDrinkKeys.size;
    const totalBrands = Object.keys(brandCatalog).length;

    // Catalog completion as a percentage of all canonical drinks
    const catalogCompletionPct = catalogSize > 0 ? uniqueDrinks / catalogSize : 0;

    // Brand diversity as a percentage of all known brands
    const brandDiversityPct = totalBrands > 0 ? brandRows.length / totalBrands : 0;

    // 0.5-bucket histogram of ratings (0.5 .. 5.0)
    const histogram: { bucket: number; count: number }[] = [];
    for (let b = 0.5; b <= 5; b += 0.5) histogram.push({ bucket: b, count: 0 });
    for (const d of data) {
      const idx = Math.min(9, Math.max(0, Math.round(d.rating * 2) - 1));
      histogram[idx].count++;
    }
    const histMax = Math.max(...histogram.map((h) => h.count));

    // 30-day hot streak (and 90-day for "warming up?" sanity)
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const last30 = data.filter((d) => now - new Date(d.created_at).getTime() <= 30 * day);
    const hot30 = last30.length > 0
      ? last30.reduce((s, d) => s + d.rating, 0) / last30.length
      : null;

    // Generosity delta vs global
    const generosityDelta = personalAvg - globalAvg;

    return {
      personalAvg,
      globalAvg,
      generosityDelta,
      brandRows,
      uniqueDrinks,
      catalogCompletionPct,
      brandDiversityPct,
      totalBrands,
      catalogSize,
      reviewCount: data.length,
      histogram,
      histMax,
      hot30,
      hot30Count: last30.length,
    };
  }, [data, brandCatalog, catalogSize, globalAvg]);

  const sortedBrands = useMemo<BrandRow[]>(() => {
    if (!metrics) return [];
    const rows = [...metrics.brandRows];
    switch (sortMode) {
      case 'explored': rows.sort((a, b) => b.exploredPct - a.exploredPct || b.count - a.count); break;
      case 'count':    rows.sort((a, b) => b.count - a.count); break;
      case 'avg':      rows.sort((a, b) => b.avgRating - a.avgRating); break;
      case 'name':     rows.sort((a, b) => a.brand.localeCompare(b.brand)); break;
    }
    return rows;
  }, [metrics, sortMode]);

  if (loading) {
    return (<><TopHeader title="Stats" back={`/profile/${params.username}`} /><main className="max-w-md mx-auto px-4 with-top-header pb-32"><CanLoader /></main></>);
  }

  if (!user) {
    return (<><TopHeader title="Stats" back="/feed" /><main className="max-w-md mx-auto px-4 with-top-header pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  if (!metrics) {
    return (
      <>
        <TopHeader title="Stats" back={`/profile/${user.username}`} />
        <main className="max-w-md mx-auto px-4 with-top-header pb-32">
          <div className="glass-card text-center py-12">
            <BarChart3 size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No data yet — review a drink or two and check back.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopHeader title="Stats" back={`/profile/${user.username}`} />
      <main className="max-w-md mx-auto px-4 with-top-header pb-32 space-y-5">
        <div className="h-1" />

        <h1 className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
          @{user.username}'s seltzer analytics
        </h1>
        <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>
          Across {metrics.reviewCount} rated drink{metrics.reviewCount === 1 ? '' : 's'} (reviews + tried-its)
        </p>

        {/* ─── Headline KPIs ─── */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            icon={<Compass size={14} />}
            label="Catalog explored"
            primary={`${(metrics.catalogCompletionPct * 100).toFixed(metrics.catalogCompletionPct < 0.1 ? 2 : 1)}%`}
            secondary={`${metrics.uniqueDrinks} of ${metrics.catalogSize.toLocaleString()} drinks`}
            tone="cyan"
            progress={metrics.catalogCompletionPct}
          />
          <KpiCard
            icon={<Layers size={14} />}
            label="Brands explored"
            primary={`${metrics.brandRows.length}`}
            secondary={`of ${metrics.totalBrands || metrics.brandRows.length} brands · ${(metrics.brandDiversityPct * 100).toFixed(0)}%`}
            tone="violet"
            progress={metrics.brandDiversityPct}
          />
          <KpiCard
            icon={metrics.generosityDelta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            label="Vs. platform avg"
            primary={`${metrics.generosityDelta >= 0 ? '+' : ''}${metrics.generosityDelta.toFixed(2)}`}
            secondary={`${metrics.personalAvg.toFixed(2)} vs ${metrics.globalAvg.toFixed(2)} global`}
            tone={metrics.generosityDelta >= 0 ? 'emerald' : 'coral'}
          />
          <KpiCard
            icon={<Flame size={14} />}
            label="Last 30 days"
            primary={metrics.hot30 !== null ? metrics.hot30.toFixed(2) : '—'}
            secondary={metrics.hot30 !== null ? `avg across ${metrics.hot30Count} recent` : 'No recent ratings'}
            tone="amber"
          />
        </div>

        {/* ─── Rating distribution histogram ─── */}
        <div
          className="rounded-3xl p-4"
          style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
              Rating distribution
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              0.5 buckets
            </span>
          </div>
          <div className="flex items-end gap-1 h-20">
            {metrics.histogram.map((h) => {
              const heightPct = metrics.histMax > 0 ? (h.count / metrics.histMax) * 100 : 0;
              const isPeak = h.count === metrics.histMax && h.count > 0;
              return (
                <div key={h.bucket} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span
                    className="text-[9px] font-bold mb-0.5"
                    style={{ color: h.count > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                  >
                    {h.count > 0 ? h.count : ''}
                  </span>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${Math.max(heightPct, 4)}%`,
                      background: isPeak
                        ? 'linear-gradient(to top, var(--cyan-600), var(--cyan-400))'
                        : h.count > 0
                          ? 'rgba(34,211,238,0.35)'
                          : 'rgba(148,163,184,0.08)',
                      boxShadow: isPeak ? '0 0 14px rgba(34,211,238,0.4)' : 'none',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            {metrics.histogram.map((h) => (
              <span
                key={h.bucket}
                className="text-[9px] flex-1 text-center"
                style={{ color: 'var(--text-muted)' }}
              >
                {h.bucket}
              </span>
            ))}
          </div>
        </div>

        {/* ─── Per-brand explorer ─── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2 p-4 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--violet-400)' }}>
              Brand explorer
            </span>
            <SortControl mode={sortMode} onChange={setSortMode} />
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {sortedBrands.map((b) => (
              <BrandStatRow key={b.brand} row={b} username={user.username} />
            ))}
          </div>
        </div>

        {/* ─── Fun extras ─── */}
        <div
          className="rounded-3xl p-4"
          style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(167,139,250,0.08))', border: '1px solid var(--border-subtle)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--amber-400)' }}>
            Superlatives
          </span>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Superlative
              icon={<Trophy size={14} />}
              label="Reaches highest with"
              brand={[...metrics.brandRows].filter((b) => b.count >= 2).sort((a, b) => b.avgRating - a.avgRating)[0]}
              tone="#fbbf24"
              hint="(min 2 drinks)"
            />
            <Superlative
              icon={<Droplets size={14} />}
              label="Has explored most"
              brand={[...metrics.brandRows].sort((a, b) => b.exploredPct - a.exploredPct || b.count - a.count)[0]}
              tone="#22d3ee"
              hint="(% of brand's catalog)"
            />
            <Superlative
              icon={<Star size={14} />}
              label="Reviewed most often"
              brand={[...metrics.brandRows].sort((a, b) => b.count - a.count)[0]}
              tone="#a78bfa"
              hint="(by review count)"
            />
          </div>
        </div>

        <p className="text-[10px] text-center pt-2" style={{ color: 'var(--text-muted)' }}>
          Stats update in real time as you review more drinks.
        </p>
      </main>
    </>
  );
}

// ─── building blocks ──────────────────────────────────────────────

const TONES: Record<string, { fg: string; bg: string; border: string; bar: string }> = {
  cyan:    { fg: 'var(--cyan-400)',   bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.22)',  bar: 'var(--cyan-400)' },
  violet:  { fg: 'var(--violet-400)', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.22)', bar: 'var(--violet-400)' },
  amber:   { fg: 'var(--amber-400)',  bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.22)',  bar: 'var(--amber-400)' },
  emerald: { fg: '#34d399',           bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.22)',  bar: '#34d399' },
  coral:   { fg: '#fb7185',           bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.22)', bar: '#fb7185' },
};

function KpiCard({
  icon, label, primary, secondary, tone, progress,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  tone: keyof typeof TONES;
  progress?: number;
}) {
  const t = TONES[tone];
  return (
    <div
      className="rounded-2xl p-3 relative overflow-hidden"
      style={{ background: t.bg, border: `1px solid ${t.border}` }}
    >
      <div className="flex items-center gap-1.5" style={{ color: t.fg }}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-extrabold mt-1.5 leading-none" style={{ color: 'var(--text-primary)' }}>
        {primary}
      </p>
      <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {secondary}
      </p>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(2, progress * 100))}%`,
              background: t.bar,
            }}
          />
        </div>
      )}
    </div>
  );
}

function BrandStatRow({ row, username }: { row: BrandRow; username: string }) {
  const pctLabel = (row.exploredPct * 100).toFixed(row.exploredPct < 0.1 ? 1 : 0);
  const tier =
    row.avgRating >= 4.5 ? '#f59e0b' :
    row.avgRating >= 4   ? '#10b981' :
    row.avgRating >= 3   ? '#22d3ee' :
    row.avgRating >= 2   ? '#a3e635' :
    row.avgRating >= 1   ? '#f97316' :
                           '#fb7185';
  return (
    <Link
      // Tap a brand row → land on the brand hub. The brand hub then lets
      // users see the catalog, top picks, and (if signed in) their own
      // explored % for that brand.
      href={`/brand/${encodeURIComponent(row.brand)}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {row.brand}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {row.count}/{row.total}
            </span>
            <span
              className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md"
              style={{ background: `${tier}1a`, color: tier, border: `1px solid ${tier}33` }}
            >
              {row.avgRating.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.max(2, row.exploredPct * 100))}%`,
                background: `linear-gradient(to right, ${tier}, ${tier}88)`,
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums w-9 text-right" style={{ color: 'var(--text-muted)' }}>
            {pctLabel}%
          </span>
        </div>
      </div>
    </Link>
  );
}

const SORT_LABELS: Record<SortMode, string> = {
  explored: '% explored',
  count: 'Most rated',
  avg: 'Highest avg',
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

function Superlative({
  icon, label, brand, tone, hint,
}: {
  icon: React.ReactNode;
  label: string;
  brand: BrandRow | undefined;
  tone: string;
  hint: string;
}) {
  if (!brand) {
    return (
      <div className="rounded-xl p-3" style={{ background: 'rgba(15,20,36,0.4)', border: `1px solid ${tone}22` }}>
        <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: tone }}>
          {icon} {label}
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Not enough data yet {hint}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-3 flex items-center justify-between gap-2" style={{ background: `${tone}10`, border: `1px solid ${tone}33` }}>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: tone }}>
          {icon} {label}
        </p>
        <p className="text-sm font-extrabold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>
          {brand.brand}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          avg {brand.avgRating.toFixed(2)} · {brand.count}/{brand.total} · {(brand.exploredPct * 100).toFixed(0)}% explored
        </p>
      </div>
    </div>
  );
}
