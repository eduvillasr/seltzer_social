// app/profile/[username]/showroom/page.tsx
//
// Public trophy showroom for any user. Trophies are computed from the same
// stats as achievements (see lib/trophies), so anyone can view anyone's
// showroom — no ownership required. Earned trophies shine; locked ones show as
// silhouettes with progress to entice. The rarest earned trophy is featured as
// a centerpiece.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Share2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { BackHeader } from '@/components/BackHeader';
import { CanLoader } from '@/components/CanLoader';
import { TrophyCard, TrophyMedallion } from '@/components/Trophy';
import { showToast } from '@/components/Toast';
import { getUserByUsername, supabase, getAchievementStats } from '@/lib/supabase';
import { evaluateAchievements, type AchievementStats } from '@/lib/achievements';
import {
  TROPHIES, evaluateTrophies, RARITY_META, RARITY_ORDER, type Trophy, type TrophyRarity,
} from '@/lib/trophies';
import { FOUNDERS, BETA_TESTERS } from '@/components/FounderBadge';
import { haptic } from '@/lib/haptics';
import { User } from '@/types';

export default function ShowroomPage({ params }: { params: { username: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => { boot(); /* eslint-disable-line */ }, [params.username]);

  async function boot() {
    setLoading(true);
    const [{ data: session }, { data: target }] = await Promise.all([
      supabase.auth.getSession(),
      getUserByUsername(params.username),
    ]);
    if (session?.session?.user) setCurrentUserId(session.session.user.id);
    if (!target) { setNotFound(true); setLoading(false); return; }

    setUser(target as User);
    const s = await getAchievementStats(
      target.id, FOUNDERS.has(target.username), BETA_TESTERS.has(target.username)
    );
    setStats(s);
    setUnlockedIds(new Set(evaluateAchievements(s).unlocked.map((a) => a.id)));
    setLoading(false);
  }

  const result = useMemo(() => {
    if (!stats) return null;
    return evaluateTrophies(stats, unlockedIds);
  }, [stats, unlockedIds]);

  if (loading || !result) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-12 pb-32"><CanLoader /></main></>);
  }
  if (notFound || !user) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  const earnedSet = new Set(result.earned.map((t) => t.id));
  const earnedCount = result.earned.length;
  const total = TROPHIES.length;
  const isOwn = !!currentUserId && currentUserId === user.id;

  // Rarest earned trophy = centerpiece.
  const centerpiece: Trophy | null =
    RARITY_ORDER.map((rar) => result.earned.find((t) => t.rarity === rar)).find(Boolean) ?? null;

  async function handleShare() {
    const url = `${window.location.origin}/profile/${params.username}/showroom`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title: `@${user!.username}'s trophy showroom`, url }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(url); showToast('Showroom link copied 🔗', 'success'); }
    catch { showToast('Could not copy', 'error', url); }
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <BackHeader href={`/profile/${params.username}`} label="Back to profile" />

        {/* Hero / centerpiece */}
        <div
          className="relative rounded-3xl overflow-hidden p-6 text-center animate-fade-in-up"
          style={{
            background: 'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(167,139,250,0.16), transparent 60%), linear-gradient(160deg, rgba(34,211,238,0.06), rgba(15,20,36,0.5))',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles size={12} style={{ color: 'var(--violet-400)' }} />
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--violet-400)' }}>
              Trophy Showroom
            </p>
          </div>

          {centerpiece ? (
            <div className="flex flex-col items-center">
              <div className="badge-reveal">
                <TrophyMedallion trophy={centerpiece} earned size={104} />
              </div>
              <p className="text-lg font-extrabold mt-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {centerpiece.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: RARITY_META[centerpiece.rarity].color }}>
                {RARITY_META[centerpiece.rarity].label} · @{user.username}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-2">
              <TrophyMedallion trophy={TROPHIES[0]} earned={false} size={88} />
              <p className="text-sm font-bold mt-3" style={{ color: 'var(--text-secondary)' }}>
                {isOwn ? 'Your shelf is waiting' : `@${user.username}'s shelf is empty`}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {isOwn ? 'Trophies are rare — keep reviewing to earn your first.' : 'No trophies earned yet.'}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 mt-4">
            <span
              className="text-sm font-extrabold px-3 py-1 rounded-full"
              style={{ background: 'rgba(167,139,250,0.14)', color: 'var(--violet-400)' }}
            >
              {earnedCount} / {total} trophies
            </span>
            <button
              onClick={() => { haptic('light'); handleShare(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
              aria-label="Share showroom"
              title="Share this showroom"
            >
              <Share2 size={14} />
            </button>
          </div>
        </div>

        {/* Rarity legend */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {RARITY_ORDER.map((rar) => (
            <span key={rar} className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: RARITY_META[rar].color }}>
              <span className="w-2 h-2 rounded-full" style={{ background: RARITY_META[rar].color, boxShadow: `0 0 6px ${RARITY_META[rar].color}` }} />
              {RARITY_META[rar].label}
            </span>
          ))}
        </div>

        {/* Trophies grouped by rarity (rarest first) */}
        {RARITY_ORDER.map((rar: TrophyRarity) => {
          const inRarity = TROPHIES.filter((t) => t.rarity === rar);
          if (inRarity.length === 0) return null;
          const meta = RARITY_META[rar];
          const earnedInRarity = inRarity.filter((t) => earnedSet.has(t.id)).length;
          return (
            <section key={rar} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: meta.color }}>
                  {meta.label}
                </h2>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {earnedInRarity} / {inRarity.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inRarity.map((t) => {
                  const earned = earnedSet.has(t.id);
                  const progress = !earned ? t.progress?.(stats!, unlockedIds) : undefined;
                  return <TrophyCard key={t.id} trophy={t} earned={earned} progress={progress} />;
                })}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
