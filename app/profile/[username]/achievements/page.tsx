// app/profile/[username]/achievements/page.tsx
// Full achievement gallery for a user. Owner gets a "pin to profile"
// picker (up to 3) — the dog-tags shown on their profile header.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Lock, Pin, Check } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { CanLoader } from '@/components/CanLoader';
import { AchievementBadge } from '@/components/AchievementBadge';
import { showToast } from '@/components/Toast';
import {
  getUserByUsername, supabase, getAchievementStats, setShowcaseAchievements,
} from '@/lib/supabase';
import { ACHIEVEMENTS, evaluateAchievements, TIER_META, type AchievementStats, type AchievementTier } from '@/lib/achievements';
import { FOUNDERS, BETA_TESTERS } from '@/components/FounderBadge';
import { User } from '@/types';

export default function AchievementsPage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showcase, setShowcase] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { boot(); /* eslint-disable-line */ }, [params.username]);

  async function boot() {
    setLoading(true);
    const [{ data: session }, { data: target }] = await Promise.all([
      supabase.auth.getSession(),
      getUserByUsername(params.username),
    ]);
    if (session?.session?.user) setCurrentUserId(session.session.user.id);
    if (!target) { setLoading(false); return; }

    setUser(target as User);
    setShowcase((target as User).showcase_achievements ?? []);

    const isFounder = FOUNDERS.has(target.username);
    const isBetaTester = BETA_TESTERS.has(target.username);
    const s = await getAchievementStats(target.id, isFounder, isBetaTester);
    setStats(s);
    setLoading(false);
  }

  const grouped = useMemo(() => {
    if (!stats) return null;
    const { unlocked, locked } = evaluateAchievements(stats);
    return { unlocked, locked };
  }, [stats]);

  const isOwn = currentUserId && user && currentUserId === user.id;

  function togglePin(id: string) {
    if (!isOwn) return;
    setShowcase((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        showToast('You can pin 3 max', 'info', 'Unpin one to swap.');
        return prev;
      }
      return [...prev, id];
    });
  }

  async function handleSave() {
    if (!isOwn || !user) return;
    setSaving(true);
    const { error } = await setShowcaseAchievements(user.id, showcase);
    setSaving(false);
    if (error) { showToast('Could not save', 'error', error.message); return; }
    showToast('Showcase updated 🥂', 'success', `${showcase.length}/3 pinned`);
  }

  if (loading || !stats) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-12 pb-32"><CanLoader /></main></>);
  }
  if (!user) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  // Dirty check — only show Save when picks changed from server state
  const original = (user.showcase_achievements ?? []).join(',');
  const current = showcase.join(',');
  const dirty = original !== current;

  const total = ACHIEVEMENTS.length;
  const unlockedCount = grouped!.unlocked.length;
  const completionPct = Math.round((unlockedCount / total) * 100);

  // Group by tier for visual organization
  const tiers: AchievementTier[] = ['legendary', 'platinum', 'gold', 'silver', 'bronze'];

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <Link href={`/profile/${params.username}`} className="inline-flex items-center gap-2 text-sm hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back to profile
        </Link>

        {/* Hero */}
        <div
          className="rounded-3xl overflow-hidden p-5 animate-fade-in-up"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.10))',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
            Achievements
          </p>
          <h1 className="text-2xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-display)' }}>
            @{user.username}
          </h1>

          <div className="mt-4 flex items-center gap-3">
            <div className="text-center">
              <p className="text-3xl font-extrabold" style={{
                background: 'linear-gradient(135deg, var(--cyan-400), var(--violet-400))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {unlockedCount}<span style={{ fontSize: 16, color: 'var(--text-muted)' }}>/{total}</span>
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                unlocked
              </p>
            </div>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.1)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${completionPct}%`,
                  background: 'linear-gradient(90deg, var(--cyan-400), var(--violet-400))',
                  boxShadow: '0 0 12px rgba(34,211,238,0.5)',
                }}
              />
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--cyan-400)' }}>{completionPct}%</span>
          </div>

          {isOwn && (
            <p className="text-xs mt-4" style={{ color: 'var(--text-secondary)' }}>
              <Pin size={11} className="inline mr-1 mb-0.5" />
              Tap up to <span className="font-bold" style={{ color: 'var(--text-primary)' }}>3</span> badges to pin them to your profile.
            </p>
          )}
        </div>

        {/* Save bar (sticky-feel) — only when there are unsaved changes */}
        {isOwn && dirty && (
          <div
            className="rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)' }}
          >
            <Pin size={14} className="text-cyan-400 flex-shrink-0" />
            <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>
              <span className="font-bold">{showcase.length}</span> of 3 pinned · changes not saved
            </p>
            <button
              onClick={() => setShowcase(user.showcase_achievements ?? [])}
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '11px' }}
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
              style={{ padding: '6px 12px', fontSize: '11px' }}
            >
              <Check size={11} /> {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        )}

        {/* Sections by tier */}
        {tiers.map((tier) => {
          const tierMeta = TIER_META[tier];
          const inTier = ACHIEVEMENTS.filter((a) => a.tier === tier);
          if (inTier.length === 0) return null;
          return (
            <section key={tier} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: tierMeta.color }}>
                  {tierMeta.label}
                </h2>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {inTier.filter((a) => grouped!.unlocked.includes(a)).length} / {inTier.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {inTier.map((a) => {
                  const unlocked = grouped!.unlocked.includes(a);
                  const pinned = showcase.includes(a.id);
                  const progress = a.progress?.(stats);
                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl p-3"
                      style={{
                        background: 'rgba(15,20,36,0.5)',
                        border: pinned ? `1px solid var(--cyan-400)` : '1px solid var(--border-subtle)',
                        opacity: unlocked ? 1 : 0.6,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <AchievementBadge
                          achievement={a}
                          unlocked={unlocked}
                          size="md"
                          selected={pinned}
                          onClick={isOwn && unlocked ? () => togglePin(a.id) : undefined}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight inline-flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                            {a.name}
                            {!unlocked && <Lock size={10} style={{ color: 'var(--text-muted)' }} />}
                            {pinned && <Pin size={10} style={{ color: 'var(--cyan-400)' }} />}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{a.description}</p>
                          {!unlocked && progress && (
                            <div className="mt-1.5">
                              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.12)' }}>
                                <div
                                  className="h-full"
                                  style={{
                                    width: `${(progress[0] / progress[1]) * 100}%`,
                                    background: tierMeta.color,
                                    transition: 'width 200ms ease',
                                  }}
                                />
                              </div>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {progress[0]} / {progress[1]}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
