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
  getCommunityAveragesForSeltzers,
} from '@/lib/supabase';
import { User } from '@/types';
import {
  BarChart3, Flame, TrendingUp, TrendingDown,
  Compass, Layers, ArrowUpDown, Trophy,
} from 'lucide-react';

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
  seltzer_id: string | null;
}

export default function StatsPage({ params }: { params: { username: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TasteDatum[]>([]);
  const [brandCatalog, setBrandCatalog] = useState<Record<string, number>>({});
  const [catalogSize, setCatalogSize] = useState(0);
  const [globalAvg, setGlobalAvg] = useState(3.5);
  const [sortMode, setSortMode] = useState<SortMode>('explored');
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [communityAvgs, setCommunityAvgs] = useState<Record<string, { avg: number; count: number }>>({});

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
      seltzer_id: r.seltzer_id ?? null,
    }));
    const triedRows: TasteDatum[] = (triedIts || []).map((t: any) => ({
      rating: t.rating,
      brand: t.review?.brand ?? null,
      seltzer_name: t.review?.seltzer_name ?? '',
      created_at: t.created_at,
      seltzer_id: t.review?.seltzer_id ?? null,
    }));

    setData([...reviewRows, ...triedRows]);
    setBrandCatalog(catalog);
    setCatalogSize(size);
    setGlobalAvg(gAvg);
    setLoading(false);

    // Fetch community averages (excluding this user) for the drinks they've
    // reviewed — powers the "You vs community" comparison. Non-blocking.
    const seltzerIds = [...reviewRows, ...triedRows].map((r) => r.seltzer_id).filter(Boolean) as string[];
    if (seltzerIds.length > 0) {
      const comm = await getCommunityAveragesForSeltzers(seltzerIds, (u as User).id);
      setCommunityAvgs(comm);
    }
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

    // Flavor fingerprint — which families this palate gravitates toward.
    const flavorCounts: Record<string, number> = {};
    for (const d of data) {
      const fam = flavorFamilyOf(d.seltzer_name);
      if (fam) flavorCounts[fam] = (flavorCounts[fam] || 0) + 1;
    }
    const flavorFamilies = Object.entries(flavorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([family, count]) => ({ family, count }));

    // Flavor radar — normalized 0..1 across ALL families (so the shape is
    // comparable). Keeps a stable family order so the polygon doesn't jump.
    const flavorRadarMax = Math.max(1, ...FLAVOR_FAMILIES.map((f) => flavorCounts[f.family] || 0));
    const flavorRadar = FLAVOR_FAMILIES.map((f) => ({
      family: f.family,
      color: f.color,
      count: flavorCounts[f.family] || 0,
      value: (flavorCounts[f.family] || 0) / flavorRadarMax,
    }));

    // ─── Rating trend over time (monthly average) ───
    const monthBuckets: Record<string, { sum: number; count: number; ts: number }> = {};
    for (const d of data) {
      const dt = new Date(d.created_at);
      if (isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!monthBuckets[key]) {
        monthBuckets[key] = { sum: 0, count: 0, ts: new Date(dt.getFullYear(), dt.getMonth(), 1).getTime() };
      }
      monthBuckets[key].sum += d.rating;
      monthBuckets[key].count++;
    }
    const monthlyTrend = Object.entries(monthBuckets)
      .map(([key, v]) => ({ key, ts: v.ts, avg: v.sum / v.count, count: v.count }))
      .sort((a, b) => a.ts - b.ts)
      .slice(-12); // last 12 months max

    // ─── Activity heatmap (reviews per ISO week, last ~26 weeks) ───
    const weekMs = 7 * day;
    // Anchor "this week" to the most recent Sunday for stable columns.
    const today = new Date(now);
    const dow = today.getDay();
    const thisWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow).getTime();
    const WEEKS = 26;
    const weekCounts: number[] = new Array(WEEKS).fill(0);
    for (const d of data) {
      const t = new Date(d.created_at).getTime();
      if (isNaN(t)) continue;
      const weeksAgo = Math.floor((thisWeekStart - t) / weekMs);
      if (weeksAgo >= 0 && weeksAgo < WEEKS) {
        weekCounts[WEEKS - 1 - weeksAgo]++; // oldest → newest left→right
      }
    }
    const weeklyActivity = weekCounts.map((count, i) => ({
      count,
      weeksAgo: WEEKS - 1 - i,
      ts: thisWeekStart - (WEEKS - 1 - i) * weekMs,
    }));
    const weekMax = Math.max(...weekCounts);
    const activeWeeks = weekCounts.filter((c) => c > 0).length;

    // ─── You vs community (per-drink delta) ───
    // Dedupe by seltzer_id — use the user's own avg per drink vs community avg.
    const byDrink: Record<string, { name: string; brand: string | null; ratings: number[] }> = {};
    for (const d of data) {
      if (!d.seltzer_id) continue;
      if (!byDrink[d.seltzer_id]) byDrink[d.seltzer_id] = { name: d.seltzer_name, brand: d.brand, ratings: [] };
      byDrink[d.seltzer_id].ratings.push(d.rating);
    }
    const vsCommunityAll = Object.entries(byDrink)
      .map(([id, v]) => {
        const comm = communityAvgs[id];
        if (!comm || comm.count === 0) return null;
        const mine = v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length;
        return {
          id, name: v.name, brand: v.brand,
          mine, community: comm.avg, communityCount: comm.count,
          delta: mine - comm.avg,
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; brand: string | null; mine: number; community: number; communityCount: number; delta: number }>;
    const avgDelta = vsCommunityAll.length > 0
      ? vsCommunityAll.reduce((s, v) => s + v.delta, 0) / vsCommunityAll.length
      : 0;
    // Most divergent drinks (largest |delta|), top 6
    const vsCommunity = [...vsCommunityAll]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);

    // ─── Top-3 brand podium (most-reviewed brands) ───
    const podium = [...brandRows].sort((a, b) => b.count - a.count || b.avgRating - a.avgRating).slice(0, 3);

    return {
      flavorFamilies,
      flavorRadar,
      monthlyTrend,
      weeklyActivity,
      weekMax,
      activeWeeks,
      vsCommunity,
      vsCommunityCount: vsCommunityAll.length,
      avgDelta,
      podium,
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
  }, [data, brandCatalog, catalogSize, globalAvg, communityAvgs]);

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

        {/* ─── Rating trend over time ─── */}
        {metrics.monthlyTrend.length >= 2 && (
          <div className="rounded-3xl p-4" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
                Rating trend
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                monthly avg · last {metrics.monthlyTrend.length} mo
              </span>
            </div>
            <RatingTrend points={metrics.monthlyTrend} />
          </div>
        )}

        {/* ─── Flavor radar ─── */}
        {metrics.flavorFamilies.length > 0 && (
          <div className="rounded-3xl p-4" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#34d399' }}>
              Flavor radar
            </span>
            <p className="text-[10px] mt-0.5 mb-1" style={{ color: 'var(--text-muted)' }}>
              Where your palate leans
            </p>
            <FlavorRadar axes={metrics.flavorRadar} />
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-1">
              {metrics.flavorFamilies.map((f) => (
                <span key={f.family} className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: FLAVOR_COLOR[f.family] }} />
                  {f.family} <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>· {f.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Activity heatmap ─── */}
        <div className="rounded-3xl p-4" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--violet-400)' }}>
              Activity
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {metrics.activeWeeks} active week{metrics.activeWeeks === 1 ? '' : 's'} · last 26
            </span>
          </div>
          <ActivityHeatmap weeks={metrics.weeklyActivity} max={metrics.weekMax} />
        </div>

        {/* ─── Per-brand explorer (collapsible) ─── */}
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
            {(showAllBrands ? sortedBrands : sortedBrands.slice(0, 5)).map((b) => (
              <BrandStatRow key={b.brand} row={b} username={user.username} />
            ))}
          </div>

          {sortedBrands.length > 5 && (
            <button
              onClick={() => setShowAllBrands((v) => !v)}
              className="w-full text-center text-[11px] font-bold py-3 transition-colors hover:bg-white/[0.03]"
              style={{ color: 'var(--cyan-400)', borderTop: '1px solid var(--border-subtle)' }}
            >
              {showAllBrands ? 'Show less' : `Show all ${sortedBrands.length} brands ↓`}
            </button>
          )}
        </div>

        {/* ─── Top-3 brand podium ─── */}
        {metrics.podium.length > 0 && (
          <div
            className="rounded-3xl p-4"
            style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(167,139,250,0.08))', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] flex items-center gap-1.5" style={{ color: 'var(--amber-400)' }}>
              <Trophy size={13} /> Most-reviewed brands
            </span>
            <BrandPodium podium={metrics.podium} username={user.username} />
          </div>
        )}

        {/* ─── You vs community ─── */}
        {metrics.vsCommunity.length > 0 && (
          <div className="rounded-3xl p-4" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#34d399' }}>
                You vs community
              </span>
              <span
                className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                style={{
                  background: metrics.avgDelta >= 0 ? 'rgba(52,211,153,0.12)' : 'rgba(251,113,133,0.12)',
                  color: metrics.avgDelta >= 0 ? '#34d399' : '#fb7185',
                }}
              >
                {metrics.avgDelta >= 0 ? '+' : ''}{metrics.avgDelta.toFixed(2)} avg
              </span>
            </div>
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Where your take differs most from everyone else ({metrics.vsCommunityCount} compared)
            </p>
            <div className="space-y-2.5">
              {metrics.vsCommunity.map((v) => (
                <VsCommunityRow key={v.id} row={v} />
              ))}
            </div>
          </div>
        )}

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

// ─── Top-3 brand podium ──────────────────────────────────────────
function BrandPodium({ podium, username }: { podium: BrandRow[]; username: string }) {
  // Order visually as 2nd · 1st · 3rd, with descending heights.
  const first = podium[0];
  const second = podium[1];
  const third = podium[2];
  const slots: { row: BrandRow | undefined; place: 1 | 2 | 3 }[] = [
    { row: second, place: 2 },
    { row: first, place: 1 },
    { row: third, place: 3 },
  ];
  const PLACE: Record<number, { color: string; height: number; medal: string }> = {
    1: { color: '#fbbf24', height: 96, medal: '🥇' },
    2: { color: '#cbd5e1', height: 72, medal: '🥈' },
    3: { color: '#d8964f', height: 56, medal: '🥉' },
  };
  return (
    <div className="flex items-end justify-center gap-2 mt-4">
      {slots.map(({ row, place }) => {
        const p = PLACE[place];
        if (!row) {
          return (
            <div key={place} className="flex-1 flex flex-col items-center opacity-30">
              <div className="text-lg mb-1">{p.medal}</div>
              <div
                className="w-full rounded-t-xl"
                style={{ height: p.height * 0.55, background: 'rgba(148,163,184,0.1)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
          );
        }
        return (
          <Link
            key={place}
            href={`/brand/${encodeURIComponent(row.brand)}`}
            className="flex-1 flex flex-col items-center min-w-0 group"
          >
            <div className="text-xl mb-0.5 transition-transform group-hover:scale-110">{p.medal}</div>
            <p className="text-[11px] font-extrabold text-center truncate w-full px-0.5" style={{ color: 'var(--text-primary)' }}>
              {row.brand}
            </p>
            <p className="text-[9px] mb-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {row.count} rated · {row.avgRating.toFixed(1)}★
            </p>
            <div
              className="w-full rounded-t-xl flex items-start justify-center pt-1.5 transition-all group-hover:brightness-110"
              style={{
                height: p.height,
                background: `linear-gradient(to bottom, ${p.color}, ${p.color}55)`,
                boxShadow: place === 1 ? `0 0 20px ${p.color}55` : 'none',
                border: `1px solid ${p.color}`,
              }}
            >
              <span className="text-base font-black" style={{ color: 'rgba(10,14,26,0.7)' }}>{place}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Rating trend line chart ─────────────────────────────────────
function RatingTrend({ points }: { points: { key: string; ts: number; avg: number; count: number }[] }) {
  const W = 320, H = 96, padX = 8, padY = 12;
  const n = points.length;
  const xAt = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (W - padX * 2));
  // y-domain fixed to the rating scale 1..5 for honest comparison.
  const yAt = (v: number) => padY + (1 - (v - 1) / 4) * (H - padY * 2);
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.avg).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(n - 1).toFixed(1)} ${H - padY} L ${xAt(0).toFixed(1)} ${H - padY} Z`;
  const monthLabel = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short' });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 96 }} preserveAspectRatio="none">
        {[2, 3, 4, 5].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={yAt(g)} y2={yAt(g)} stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
        ))}
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke="var(--cyan-400)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.key} cx={xAt(i)} cy={yAt(p.avg)} r={2.5} fill="var(--cyan-400)" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {points.map((p, i) => (
          (n <= 6 || i === 0 || i === n - 1 || i === Math.floor(n / 2)) ? (
            <span key={p.key} className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{monthLabel(p.ts)}</span>
          ) : <span key={p.key} className="text-[9px]">&nbsp;</span>
        ))}
      </div>
    </div>
  );
}

// ─── Flavor radar chart ──────────────────────────────────────────
function FlavorRadar({ axes }: { axes: { family: string; color: string; count: number; value: number }[] }) {
  const size = 220, cx = size / 2, cy = size / 2, R = 78;
  const n = axes.length;
  const angleAt = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: cx + Math.cos(angleAt(i)) * r,
    y: cy + Math.sin(angleAt(i)) * r,
  });
  const ringLevels = [0.25, 0.5, 0.75, 1];
  const shapePath = axes
    .map((a, i) => {
      const { x, y } = pt(i, Math.max(0.04, a.value) * R);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ') + ' Z';
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px] mx-auto" style={{ height: 220 }}>
      {/* concentric rings */}
      {ringLevels.map((lvl) => (
        <polygon
          key={lvl}
          points={axes.map((_, i) => { const { x, y } = pt(i, lvl * R); return `${x},${y}`; }).join(' ')}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={1}
        />
      ))}
      {/* spokes */}
      {axes.map((_, i) => { const { x, y } = pt(i, R); return (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
      ); })}
      {/* data shape */}
      <path d={shapePath} fill="rgba(52,211,153,0.22)" stroke="#34d399" strokeWidth={2} strokeLinejoin="round" />
      {/* vertices */}
      {axes.map((a, i) => { const { x, y } = pt(i, Math.max(0.04, a.value) * R); return (
        <circle key={a.family} cx={x} cy={y} r={a.count > 0 ? 3 : 0} fill={a.color} />
      ); })}
      {/* labels */}
      {axes.map((a, i) => {
        const { x, y } = pt(i, R + 14);
        const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
        const short = a.family.split(' ')[0];
        return (
          <text
            key={a.family}
            x={x} y={y}
            textAnchor={anchor as any}
            dominantBaseline="middle"
            fontSize={9}
            fontWeight={700}
            fill={a.count > 0 ? a.color : 'rgba(148,163,184,0.4)'}
          >
            {short}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Activity heatmap (GitHub-style weekly) ──────────────────────
function ActivityHeatmap({ weeks, max }: { weeks: { count: number; weeksAgo: number; ts: number }[]; max: number }) {
  const shade = (count: number) => {
    if (count <= 0) return 'rgba(148,163,184,0.07)';
    const t = max > 0 ? count / max : 0;
    const alpha = 0.25 + t * 0.7;
    return `rgba(167,139,250,${alpha.toFixed(2)})`;
  };
  const monthLabel = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short' });
  return (
    <div>
      <div className="flex gap-[3px] items-end">
        {weeks.map((w, i) => (
          <div
            key={i}
            title={`${w.count} review${w.count === 1 ? '' : 's'} · week of ${new Date(w.ts).toLocaleDateString()}`}
            className="flex-1 rounded-sm"
            style={{
              height: 26,
              background: shade(w.count),
              border: w.count > 0 ? '1px solid rgba(167,139,250,0.3)' : '1px solid transparent',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        {weeks.map((w, i) => (
          (i === 0 || i === weeks.length - 1 || i === Math.floor(weeks.length / 2)) ? (
            <span key={i} className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{monthLabel(w.ts)}</span>
          ) : null
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-2">
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span key={t} className="w-2.5 h-2.5 rounded-sm" style={{ background: t === 0 ? 'rgba(148,163,184,0.07)' : `rgba(167,139,250,${(0.25 + t * 0.7).toFixed(2)})` }} />
        ))}
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  );
}

// ─── You vs community row ────────────────────────────────────────
function VsCommunityRow({
  row,
}: {
  row: { id: string; name: string; brand: string | null; mine: number; community: number; communityCount: number; delta: number };
}) {
  const higher = row.delta >= 0;
  const tone = higher ? '#34d399' : '#fb7185';
  // Position both markers on a shared 1..5 track.
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 1) / 4) * 100))}%`;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
          {row.name}
          {row.brand && <span className="font-normal" style={{ color: 'var(--text-muted)' }}> · {row.brand}</span>}
        </p>
        <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: `${tone}1a`, color: tone }}>
          {higher ? '+' : ''}{row.delta.toFixed(1)}
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: 'rgba(148,163,184,0.1)' }}>
        {/* community marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
          style={{ left: pos(row.community), background: 'var(--text-muted)' }}
          title={`Community ${row.community.toFixed(2)} (${row.communityCount})`}
        />
        {/* your marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
          style={{ left: pos(row.mine), background: tone, borderColor: 'var(--bg-primary, #0a0e1a)' }}
          title={`You ${row.mine.toFixed(2)}`}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] tabular-nums" style={{ color: tone }}>you {row.mine.toFixed(1)}</span>
        <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>community {row.community.toFixed(1)} · {row.communityCount}</span>
      </div>
    </div>
  );
}
