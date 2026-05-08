// app/drink/[id]/page.tsx
// Canonical drink page — every review of a single seltzer + community stats.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Droplets, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { BackHeader } from '@/components/BackHeader';
import { ReviewCard } from '@/components/ReviewCard';
import { CanLoader } from '@/components/CanLoader';
import { StarRating } from '@/components/StarRating';
import { Review, Seltzer } from '@/types';
import { supabase } from '@/lib/supabase';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};
function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2)   return 'C'; if (v >= 1) return 'D'; return 'F';
}

export default function DrinkPage({ params }: { params: { id: string } }) {
  const [drink, setDrink] = useState<Seltzer | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { boot(); /* eslint-disable-line */ }, [params.id]);

  async function boot() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user) setCurrentUserId(session.session.user.id);

    const [{ data: d }, { data: r }] = await Promise.all([
      supabase.from('seltzers').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('reviews').select('*, user:users(*), seltzer:seltzers(*)')
        .eq('seltzer_id', params.id)
        .order('created_at', { ascending: false }),
    ]);

    setDrink((d as Seltzer) ?? null);
    setReviews((r as Review[]) ?? []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const avg = sum / reviews.length;
    return { count: reviews.length, avg, tier: ratingToTier(avg) };
  }, [reviews]);

  if (loading) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-12 pb-32"><CanLoader /></main></>);
  }

  if (!drink) {
    return (
      <>
        <Navigation />
        <main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center">
          <p style={{ color: 'var(--text-secondary)' }}>Drink not found.</p>
        </main>
      </>
    );
  }

  const tierColor = stats ? TIER_COLORS[stats.tier] : 'var(--cyan-400)';

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <BackHeader href="/trending" />

        {/* Hero card */}
        <div
          className="rounded-3xl overflow-hidden animate-fade-in-up"
          style={{
            background: `linear-gradient(160deg, ${tierColor}10, rgba(15,20,36,0.6))`,
            border: `1px solid ${tierColor}33`,
            padding: '20px',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: tierColor }}>
            {drink.brand}
          </p>
          <h1 className="text-2xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {drink.name}
          </h1>

          {stats ? (
            <div className="mt-4 grid grid-cols-3 gap-2 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="text-center">
                <p className="text-2xl font-extrabold" style={{ color: tierColor }}>{stats.tier}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>community tier</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{stats.avg.toFixed(1)}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>avg rating</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-extrabold" style={{ color: 'var(--violet-400)' }}>{stats.count}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>reviews</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 pt-4 text-center text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
              No reviews yet — be the first.
            </div>
          )}
        </div>

        {/* Reviews list */}
        {reviews.length > 0 ? (
          <div className="space-y-4 stagger-children">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] px-1" style={{ color: 'var(--text-muted)' }}>
              <Users size={10} className="inline mr-1 mb-0.5" /> Community Reviews
            </p>
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} currentUserId={currentUserId || undefined} />
            ))}
          </div>
        ) : (
          <div className="glass-card text-center py-10">
            <Droplets size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No reviews of this drink yet</p>
            <Link href="/create" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>
              Be the first
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
