// app/compare/[username]/page.tsx
// Side-by-side review comparison: how my taste lines up with @username's.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, GitCompare, Sparkles, AlertCircle, ThumbsUp, ThumbsDown, Droplets,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Avatar } from '@/components/Avatar';
import { CanLoader } from '@/components/CanLoader';
import {
  getUserByUsername, getUserReviews, supabase,
} from '@/lib/supabase';
import { Review, User } from '@/types';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};
function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2)   return 'C'; if (v >= 1) return 'D'; return 'F';
}

interface CompareRow {
  key: string;            // canonical key for the drink
  brand: string | null;
  seltzer_name: string;
  imageMine: string | null;
  imageThem: string | null;
  mine: number;
  theirs: number;
  delta: number;          // theirs - mine
  myReviewId: string;
  theirReviewId: string;
}

export default function ComparePage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [them, setThem] = useState<User | null>(null);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [theirReviews, setTheirReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'shared' | 'agree' | 'disagree'>('shared');

  useEffect(() => { load(); }, [params.username]);

  async function load() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) { router.push('/auth/login'); return; }

    const [myUser, theirUser] = await Promise.all([
      supabase.from('users').select('*').eq('id', session.session.user.id).single(),
      getUserByUsername(params.username),
    ]);

    if (!theirUser.data) { setLoading(false); return; }
    if (myUser.data?.id === theirUser.data.id) {
      // can't compare with self — redirect to profile
      router.push(`/profile/${params.username}`);
      return;
    }

    setMe(myUser.data as User);
    setThem(theirUser.data as User);

    const [{ data: mineR }, { data: theirsR }] = await Promise.all([
      getUserReviews(myUser.data.id),
      getUserReviews(theirUser.data.id),
    ]);
    setMyReviews((mineR as Review[]) || []);
    setTheirReviews((theirsR as Review[]) || []);
    setLoading(false);
  }

  // Match by canonical seltzer_id when present, fall back to lowercased "brand|name"
  function drinkKey(r: Review) {
    if ((r as any).seltzer_id) return (r as any).seltzer_id as string;
    return `${(r.brand ?? '').trim().toLowerCase()}|${r.seltzer_name.trim().toLowerCase()}`;
  }

  const rows = useMemo<CompareRow[]>(() => {
    if (!myReviews.length || !theirReviews.length) return [];
    const theirsByKey = new Map<string, Review>();
    for (const r of theirReviews) {
      const k = drinkKey(r);
      // keep most recent if multiple
      const existing = theirsByKey.get(k);
      if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
        theirsByKey.set(k, r);
      }
    }
    const result: CompareRow[] = [];
    const seen = new Set<string>();
    for (const r of myReviews) {
      const k = drinkKey(r);
      if (seen.has(k)) continue;
      const t = theirsByKey.get(k);
      if (!t) continue;
      seen.add(k);
      result.push({
        key: k,
        brand: r.brand,
        seltzer_name: r.seltzer_name,
        imageMine: r.image_url,
        imageThem: t.image_url,
        mine: r.rating,
        theirs: t.rating,
        delta: t.rating - r.rating,
        myReviewId: r.id,
        theirReviewId: t.id,
      });
    }
    return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [myReviews, theirReviews]);

  const stats = useMemo(() => {
    if (rows.length === 0) return { agreement: 0, avgDelta: 0, biggest: null as CompareRow | null };
    const tolerance = 0.5; // within 0.5 stars = agreement
    const agreed = rows.filter((r) => Math.abs(r.delta) <= tolerance).length;
    const agreement = Math.round((agreed / rows.length) * 100);
    const avgDelta = rows.reduce((s, r) => s + Math.abs(r.delta), 0) / rows.length;
    const biggest = rows.reduce((max, r) => Math.abs(r.delta) > Math.abs(max.delta) ? r : max, rows[0]);
    return { agreement, avgDelta, biggest };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (view === 'agree') return rows.filter((r) => Math.abs(r.delta) <= 0.5);
    if (view === 'disagree') return rows.filter((r) => Math.abs(r.delta) > 0.5);
    return rows;
  }, [rows, view]);

  if (loading) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32"><CanLoader label="Comparing tastes…" /></main></>);
  }

  if (!them) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <Link href={`/profile/${params.username}`} className="inline-flex items-center gap-2 text-sm hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back to @{them.username}
        </Link>

        {/* ─── Header ─── */}
        <div
          className="rounded-3xl p-5 animate-fade-in-up"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(167,139,250,0.10))',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-center flex-1">
              <Avatar username={me?.username} avatarUrl={me?.avatar_url} size={56} />
              <p className="text-xs mt-2 truncate font-semibold" style={{ color: 'var(--text-primary)' }}>You</p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid var(--border-subtle)' }}
              >
                <GitCompare size={16} style={{ color: 'var(--cyan-400)' }} />
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: 'var(--text-muted)' }}>vs</p>
            </div>

            <div className="text-center flex-1">
              <Avatar username={them.username} avatarUrl={them.avatar_url} size={56} />
              <p className="text-xs mt-2 truncate font-semibold" style={{ color: 'var(--text-primary)' }}>@{them.username}</p>
            </div>
          </div>

          {rows.length > 0 ? (
            <>
              {/* Big agreement number */}
              <div className="text-center mb-3">
                <p className="text-5xl font-extrabold" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, var(--cyan-400), var(--violet-400))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {stats.agreement}%
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  taste agreement
                  <span style={{ color: 'var(--text-muted)' }}> · {rows.length} {rows.length === 1 ? 'drink' : 'drinks'} in common</span>
                </p>
              </div>

              {/* Sub-stats */}
              <div className="grid grid-cols-2 gap-2">
                <Pill label="Avg disagreement" value={`±${stats.avgDelta.toFixed(2)}`} color="var(--cyan-400)" />
                <Pill label="Reviews shared" value={String(rows.length)} color="var(--violet-400)" />
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <Sparkles size={26} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No drinks in common yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Once you've both reviewed the same canonical drink, you'll see your taste compared here.
              </p>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <>
            {/* Hot take banner */}
            {stats.biggest && Math.abs(stats.biggest.delta) >= 1.5 && (
              <div
                className="rounded-2xl p-3 flex items-start gap-3"
                style={{ background: 'rgba(251,113,133,0.06)', border: '1px solid rgba(251,113,133,0.18)' }}
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#fb7185' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#fb7185' }}>Biggest disagreement</p>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    <span className="font-bold">{stats.biggest.seltzer_name}</span>
                    {stats.biggest.brand && <span style={{ color: 'var(--text-muted)' }}> · {stats.biggest.brand}</span>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    You: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{stats.biggest.mine.toFixed(1)}</span>{' '}
                    · @{them.username}: <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{stats.biggest.theirs.toFixed(1)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                { key: 'shared',   label: `All (${rows.length})`,  icon: <Sparkles size={12} /> },
                { key: 'agree',    label: 'Aligned',                icon: <ThumbsUp size={12} /> },
                { key: 'disagree', label: 'Disagree',               icon: <ThumbsDown size={12} /> },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setView(t.key)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: view === t.key ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
                    color: view === t.key ? '#fff' : 'var(--text-tertiary)',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Comparison list */}
            <div className="space-y-2">
              {filteredRows.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
                  Nothing in this bucket
                </p>
              ) : filteredRows.map((row) => <CompareRowCard key={row.key} row={row} themUsername={them.username} />)}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-xl p-2.5 text-center"
      style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
    >
      <p className="text-base font-extrabold" style={{ color }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function CompareRowCard({ row, themUsername }: { row: CompareRow; themUsername: string }) {
  const myTier   = ratingToTier(row.mine);
  const theirTier = ratingToTier(row.theirs);
  const aligned  = Math.abs(row.delta) <= 0.5;
  const accent   = aligned ? '#34d399' : '#fb7185';

  return (
    <Link
      href={`/review/${row.myReviewId}`}
      className="block rounded-2xl overflow-hidden hover:bg-white/[0.02] transition-colors"
      style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-stretch">
        {/* image */}
        <div className="w-16 flex-shrink-0">
          {row.imageMine ? (
            <img src={row.imageMine} alt={row.seltzer_name} className="w-16 h-full object-cover" />
          ) : (
            <div className="w-16 h-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.08)' }}>
              <Droplets size={16} className="text-cyan-400" />
            </div>
          )}
        </div>

        {/* info */}
        <div className="flex-1 min-w-0 p-3">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{row.seltzer_name}</p>
          {row.brand && <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{row.brand}</p>}

          <div className="flex items-center gap-2 mt-2">
            {/* my rating */}
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: TIER_COLORS[myTier] }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>You</span> {row.mine.toFixed(1)}
            </span>

            {/* delta indicator */}
            <span
              className="flex-1 h-1.5 rounded-full overflow-hidden relative mx-1"
              style={{ background: 'var(--border-subtle)' }}
            >
              <span
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  background: accent,
                  width: `${Math.min(100, (Math.abs(row.delta) / 4) * 100)}%`,
                  left: row.delta >= 0 ? '50%' : `${50 - Math.min(50, (Math.abs(row.delta) / 4) * 50)}%`,
                  transition: 'all 200ms ease',
                }}
              />
              {/* center mark */}
              <span className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px" style={{ background: 'rgba(255,255,255,0.18)' }} />
            </span>

            {/* their rating */}
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: TIER_COLORS[theirTier] }}>
              {row.theirs.toFixed(1)} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>@{themUsername}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
