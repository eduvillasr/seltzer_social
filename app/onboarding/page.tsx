// app/onboarding/page.tsx
// 3-step welcome flow for new users.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Droplets, ArrowRight, Sparkles, Check, UserPlus, ListOrdered, Plus, Users,
  PenSquare, ListPlus, ChevronLeft,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { showToast } from '@/components/Toast';
import {
  ensureUserProfile, getReviews, supabase, followUser,
} from '@/lib/supabase';
import { User } from '@/types';

// People to recommend on step 2 — top reviewers (by review count) excluding the current user
async function loadSuggestedPeople(currentId: string) {
  const { data: revs } = await getReviews(50);
  const counts = new Map<string, { user: User; count: number }>();
  for (const r of revs || []) {
    if (!r.user || r.user.id === currentId) continue;
    const existing = counts.get(r.user.id);
    if (existing) existing.count++;
    else counts.set(r.user.id, { user: r.user as User, count: 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

const STEPS = ['welcome', 'follow', 'next-step'] as const;
type Step = typeof STEPS[number];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [me, setMe] = useState<User | null>(null);
  const [suggested, setSuggested] = useState<{ user: User; count: number }[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [loadingPeople, setLoadingPeople] = useState(false);

  useEffect(() => { boot(); }, []);

  async function boot() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) { router.replace('/auth/login'); return; }
    const { data: profile } = await ensureUserProfile(session.session.user);
    if (!profile) { router.replace('/auth/choose-username'); return; }
    setMe(profile as User);
    setLoadingPeople(true);
    const people = await loadSuggestedPeople(session.session.user.id);
    setSuggested(people);
    setLoadingPeople(false);
  }

  async function toggleFollow(userId: string) {
    if (!me) return;
    const wasFollowing = followed.has(userId);
    if (wasFollowing) {
      // optimistic — we don't actually unfollow during onboarding (to keep momentum)
      // but still allow toggling the chip off
      setFollowed((p) => { const n = new Set(p); n.delete(userId); return n; });
    } else {
      const { error } = await followUser(me.id, userId);
      if (error) {
        showToast('Could not follow', 'error', error.message);
        return;
      }
      setFollowed((p) => { const n = new Set(p); n.add(userId); return n; });
    }
  }

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }
  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  function finish() {
    showToast('Welcome to Seltzer Social 🥂', 'success', followed.size > 0 ? `Following ${followed.size} ${followed.size === 1 ? 'person' : 'people'}` : 'Have fun rating!');
    router.push('/feed');
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[10%] left-[-10%] w-[420px] h-[420px] rounded-full opacity-40" style={{ background: 'radial-gradient(closest-side, rgba(34,211,238,0.18), transparent)' }} />
        <div className="absolute bottom-[10%] right-[-10%] w-[380px] h-[380px] rounded-full opacity-40" style={{ background: 'radial-gradient(closest-side, rgba(167,139,250,0.16), transparent)' }} />
      </div>

      {/* Top bar */}
      <header className="relative px-5 pt-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {step !== 'welcome' && (
            <button onClick={back} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
        <button onClick={finish} className="text-xs font-semibold hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
          Skip
        </button>
      </header>

      {/* Step indicator */}
      <div className="relative px-5 pt-4">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => {
            const active = STEPS.indexOf(step) >= i;
            return (
              <span
                key={s}
                className="flex-1 h-1 rounded-full transition-all"
                style={{ background: active ? 'var(--cyan-400)' : 'rgba(148,163,184,0.18)' }}
              />
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <main className="relative flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md mx-auto">

          {step === 'welcome' && (
            <div className="text-center animate-fade-in-up">
              <div
                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mx-auto mb-6 animate-float"
                style={{ boxShadow: '0 0 40px rgba(6,182,212,0.45)' }}
              >
                <Droplets size={36} className="text-white" />
              </div>
              <h1 className="text-3xl font-extrabold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                Welcome{me?.username ? <>, <span className="gradient-text">@{me.username}</span></> : ''}
              </h1>
              <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
                Three quick things and you're in.
              </p>

              <div className="space-y-3 text-left">
                {[
                  { icon: <PenSquare size={16} />, title: 'Rate seltzers', desc: 'Drop a quick review on anything you\'ve tried.' },
                  { icon: <Users size={16} />,     title: 'Follow people', desc: 'See what taste-aligned folks are sipping.' },
                  { icon: <ListPlus size={16} />,  title: 'Build tier lists',  desc: 'Rank your favorites with a friend.' },
                ].map((b, i) => (
                  <div
                    key={b.title}
                    className="flex items-start gap-3 rounded-2xl p-3.5 animate-fade-in-up"
                    style={{
                      background: 'rgba(15,20,36,0.5)',
                      border: '1px solid var(--border-subtle)',
                      animationDelay: `${0.1 + i * 0.08}s`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--cyan-400)' }}
                    >
                      {b.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{b.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={next} className="btn-primary w-full justify-center mt-8" style={{ padding: '14px', fontSize: '14px' }}>
                Let's go <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 'follow' && (
            <div className="animate-fade-in-up">
              <div className="text-center mb-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(167,139,250,0.18))' }}
                >
                  <UserPlus size={22} className="text-cyan-400" />
                </div>
                <h2 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  Follow some people
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Your feed is empty without them. Pick a few to start.
                </p>
              </div>

              {loadingPeople ? (
                <div className="space-y-2">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="rounded-2xl h-16 skeleton-onboard" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }} />
                  ))}
                </div>
              ) : suggested.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
                  <Sparkles size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>You're early!</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    No suggestions yet. Find people from the Search tab once you're in.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {suggested.map((p) => {
                    const isFollowed = followed.has(p.user.id);
                    return (
                      <button
                        key={p.user.id}
                        onClick={() => toggleFollow(p.user.id)}
                        className="w-full rounded-2xl p-3 flex items-center gap-3 transition-all text-left"
                        style={{
                          background: isFollowed ? 'rgba(34,211,238,0.08)' : 'rgba(15,20,36,0.5)',
                          border: `1px solid ${isFollowed ? 'rgba(34,211,238,0.3)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        <Avatar username={p.user.username} avatarUrl={p.user.avatar_url} size={40} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>@{p.user.username}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {p.count} {p.count === 1 ? 'review' : 'reviews'}
                          </p>
                        </div>
                        <span
                          className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 flex-shrink-0"
                          style={
                            isFollowed
                              ? { background: 'var(--cyan-400)', color: '#0a0e1a' }
                              : { background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }
                          }
                        >
                          {isFollowed ? <><Check size={11} /> Following</> : <><Plus size={11} /> Follow</>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <button onClick={next} className="btn-primary w-full justify-center mt-6" style={{ padding: '14px', fontSize: '14px' }}>
                {followed.size > 0 ? `Continue · following ${followed.size}` : 'Continue'} <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 'next-step' && (
            <div className="text-center animate-fade-in-up">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.18), rgba(34,211,238,0.18))' }}
              >
                <Sparkles size={26} className="text-amber-400" />
              </div>
              <h2 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                Pick your first move
              </h2>
              <p className="text-sm mb-7" style={{ color: 'var(--text-secondary)' }}>
                Either is a good start. You can do the other later.
              </p>

              <div className="space-y-3 text-left">
                <Link
                  href="/create"
                  onClick={finish}
                  className="block rounded-2xl p-4 transition-all hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(15,20,36,0.6))',
                    border: '1px solid rgba(34,211,238,0.25)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' }}>
                      <PenSquare size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Write your first review</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Pick a drink, give it a title, rate it.</p>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </Link>

                <Link
                  href="/shared/create"
                  onClick={finish}
                  className="block rounded-2xl p-4 transition-all hover:scale-[1.01]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(15,20,36,0.6))',
                    border: '1px solid rgba(167,139,250,0.22)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--violet-400), #8b5cf6)' }}>
                      <ListOrdered size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Start a shared tier list</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Pick a mutual follow and rank seltzers together.</p>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </Link>
              </div>

              <button onClick={finish} className="text-xs font-semibold mt-7 hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
                Just take me to the feed →
              </button>
            </div>
          )}

        </div>
      </main>

      <style>{`
        .skeleton-onboard {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%) !important;
          background-size: 200% 100% !important;
          animation: shimmerSlide 1.6s ease-in-out infinite;
        }
        @keyframes shimmerSlide {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
