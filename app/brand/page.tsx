// app/brand/page.tsx
//
// Brands index. Lists every brand in the catalog so users can browse
// brands without already knowing the exact name. Sortable by drink count,
// avg rating, or alphabetical. Searchable from the same input.
//
// Reached from /discover ("Browse brands") and from the Discover top nav.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { TopHeader } from '@/components/TopHeader';
import { CanLoader } from '@/components/CanLoader';
import { getAllBrandsWithStats } from '@/lib/supabase';
import { FirstTimeTip } from '@/components/FirstTimeTip';
import { Search, X, Tag, ArrowUpDown, ArrowRight, Droplets } from 'lucide-react';

type SortMode = 'drinks' | 'rating' | 'name' | 'reviews';

interface BrandStat {
  brand: string;
  drinkCount: number;
  reviewCount: number;
  avgRating: number;
}

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};
function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2) return 'C'; if (v >= 1) return 'D'; return 'F';
}

export default function BrandsIndexPage() {
  const [brands, setBrands] = useState<BrandStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('drinks');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getAllBrandsWithStats();
      setBrands(data);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = q ? brands.filter((b) => b.brand.toLowerCase().includes(q)) : brands;
    rows = [...rows]; // copy so the sort doesn't mutate state
    switch (sortMode) {
      case 'drinks':  rows.sort((a, b) => b.drinkCount - a.drinkCount || a.brand.localeCompare(b.brand)); break;
      case 'reviews': rows.sort((a, b) => b.reviewCount - a.reviewCount || b.drinkCount - a.drinkCount); break;
      case 'rating':  rows.sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount); break;
      case 'name':    rows.sort((a, b) => a.brand.localeCompare(b.brand)); break;
    }
    return rows;
  }, [brands, query, sortMode]);

  return (
    <>
      <Navigation />
      <TopHeader title="Brands" back="/discover" />
      <main className="max-w-md mx-auto px-4 with-top-header pb-32 space-y-5">
        <div className="h-1" />

        {/* Header */}
        <div>
          <h1 className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
            Every brand
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : `${brands.length} brands · ${brands.reduce((s, b) => s + b.drinkCount, 0)} drinks total`}
          </p>
        </div>

        <FirstTimeTip
          tipId="brand-index-sort"
          title="Sort or filter to dig in"
          body="Default is most drinks. Switch to highest rated to find sleepers, or type a partial name to filter."
        />

        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter brands…"
            className="input-field pl-11 pr-11"
            style={{ borderRadius: '999px', height: '44px' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort control */}
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] flex items-center gap-1.5" style={{ color: 'var(--amber-400)' }}>
            <Tag size={11} /> Showing {filtered.length}
          </span>
          <SortControl mode={sortMode} onChange={setSortMode} />
        </div>

        {/* List */}
        {loading ? (
          <CanLoader />
        ) : filtered.length === 0 ? (
          <div className="glass-card text-center py-12">
            <Tag size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {query ? `No brands match "${query}"` : 'No brands yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((b) => <BrandRow key={b.brand} row={b} />)}
          </div>
        )}
      </main>
    </>
  );
}

function BrandRow({ row }: { row: BrandStat }) {
  const tier = row.reviewCount > 0 ? ratingToTier(row.avgRating) : null;
  const tierColor = tier ? TIER_COLORS[tier] : 'var(--text-muted)';
  return (
    <Link
      href={`/brand/${encodeURIComponent(row.brand)}`}
      className="glass-card flex items-center gap-3 transition-colors hover:bg-white/[0.03]"
      style={{ padding: '12px 14px' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-extrabold"
        style={{ background: `${tierColor}1a`, color: tierColor, border: `1px solid ${tierColor}33` }}
      >
        {row.brand.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{row.brand}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {row.drinkCount} {row.drinkCount === 1 ? 'drink' : 'drinks'}
          {row.reviewCount > 0 && <> · {row.reviewCount} {row.reviewCount === 1 ? 'review' : 'reviews'}</>}
        </p>
      </div>
      {row.reviewCount > 0 ? (
        <span
          className="text-sm font-extrabold tabular-nums px-2 py-1 rounded-lg"
          style={{ background: `${tierColor}1a`, color: tierColor, border: `1px solid ${tierColor}33` }}
        >
          {row.avgRating.toFixed(1)}
        </span>
      ) : (
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No reviews</span>
      )}
      <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
    </Link>
  );
}

const SORT_LABELS: Record<SortMode, string> = {
  drinks: 'Most drinks',
  reviews: 'Most reviewed',
  rating: 'Highest rated',
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
