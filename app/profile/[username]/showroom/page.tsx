// app/profile/[username]/showroom/page.tsx
//
// Public trophy showroom for any user — a physical, draggable display case.
// The owner arranges their earned trophies on the shelves (drag + Save);
// visitors see the saved arrangement. Trophies compute from the same stats as
// achievements, so any visitor can render anyone's showroom. The arrangement
// persists to users.showroom_layout (see supabase_showroom_layout.sql).

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Share2, Hand } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { BackHeader } from '@/components/BackHeader';
import { CanLoader } from '@/components/CanLoader';
import { ShowroomCase } from '@/components/ShowroomCase';
import { TrophyMedallion } from '@/components/Trophy';
import { showToast } from '@/components/Toast';
import { getUserByUsername, supabase, getAchievementStats, setShowroomLayout } from '@/lib/supabase';
import { evaluateAchievements, type AchievementStats, type Achievement } from '@/lib/achievements';
import { evaluateTrophies, TROPHIES, RARITY_META } from '@/lib/trophies';
import { FOUNDERS, BETA_TESTERS } from '@/components/FounderBadge';
import { haptic } from '@/lib/haptics';
import { User } from '@/types';

export default function ShowroomPage({ params }: { params: { username: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [achUnlocked, setAchUnlocked] = useState<Achievement[]>([]);
  const [layout, setLayout] = useState<Record<string, any>>({});
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
    setLayout(((target as any).showroom_layout as Record<string, string>) || {});
    const s = await getAchievementStats(
      target.id, FOUNDERS.has(target.username), BETA_TESTERS.has(target.username)
    );
    setStats(s);
    const ev = evaluateAchievements(s);
    setAchUnlocked(ev.unlocked);
    setUnlockedIds(new Set(ev.unlocked.map((a) => a.id)));
    setLoading(false);
  }

  // Normalize the saved layout. New shape: { podiums, wall }. Legacy shape was a
  // flat { slotId: trophyId } map — treat that as podiums.
  const initialPodiums: Record<string, string> = (layout?.podiums ?? (layout?.wall ? {} : layout)) || {};
  const initialWall: Record<string, string> = layout?.wall ?? {};

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

  const earnedCount = result.earned.length;
  const total = TROPHIES.length;
  const isOwn = !!currentUserId && currentUserId === user.id;

  async function handleSave(next: { podiums: Record<string, string>; wall: Record<string, string> }) {
    if (!user) return;
    const { error } = await setShowroomLayout(user.id, next);
    if (error) {
      showToast('Could not save showroom', 'error', error.message);
      return;
    }
    setLayout(next);
    showToast('Showroom saved 🏆', 'success');
  }

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
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-4">
        <BackHeader href={`/profile/${params.username}`} label="Back to profile" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} style={{ color: 'var(--violet-400)' }} />
              <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--violet-400)' }}>
                Trophy Showroom
              </p>
            </div>
            <h1 className="text-xl font-extrabold mt-0.5 truncate" style={{ fontFamily: 'var(--font-display)' }}>
              @{user.username}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-xs font-extrabold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(167,139,250,0.14)', color: 'var(--violet-400)' }}
            >
              {earnedCount}/{total}
            </span>
            <button
              onClick={() => { haptic('light'); handleShare(); }}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
              aria-label="Share showroom"
            >
              <Share2 size={14} />
            </button>
          </div>
        </div>

        {isOwn && (earnedCount > 0 || achUnlocked.length > 0) && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Hand size={12} style={{ color: 'var(--cyan-400)' }} />
            Drag trophies onto podiums and achievements onto the wall, then Save.
          </p>
        )}

        {/* The museum room */}
        <ShowroomCase
          earnedTrophies={result.earned}
          earnedAchievements={achUnlocked}
          initialPodiums={initialPodiums}
          initialWall={initialWall}
          preferredWall={(user as any).showcase_achievements ?? []}
          isOwner={isOwn}
          onSave={handleSave}
        />

        {/* Still to earn — compact, not a grid (keeps the case the star) */}
        {result.locked.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
              Still to earn
            </p>
            <div className="space-y-2">
              {result.locked.map((t) => {
                const r = RARITY_META[t.rarity];
                const prog = t.progress?.(stats!, unlockedIds);
                const pct = prog && prog[1] > 0 ? Math.min(100, (prog[0] / prog[1]) * 100) : 0;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-2xl p-2.5"
                    style={{ background: 'rgba(15,20,36,0.45)', border: '1px solid var(--border-subtle)' }}
                  >
                    <TrophyMedallion trophy={t} earned={false} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--text-secondary)' }}>{t.name}</p>
                        <span className="text-[9px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: r.color }}>{r.label}</span>
                      </div>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                      {prog && (
                        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${r.gradient.join(', ')})` }} />
                        </div>
                      )}
                    </div>
                    {prog && (
                      <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {prog[0].toLocaleString()}/{prog[1].toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
