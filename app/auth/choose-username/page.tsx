// app/auth/choose-username/page.tsx
// Dedicated step for users who have an authenticated session but no profile row.
// Reached when:
//   • Username they reserved at signup got taken before they confirmed their email
//   • They signed in with Google OAuth (no username was reserved)
//   • Anything else that would have previously triggered an auto-generated handle

'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Droplets, ArrowRight, Check, X, AlertCircle } from 'lucide-react';
import {
  supabase, claimUsername, validateUsername, isUsernameAvailable, ensureUserProfile,
} from '@/lib/supabase';
import { showToast } from '@/components/Toast';

export default function ChooseUsernameWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen hero-gradient" />}>
      <ChooseUsername />
    </Suspense>
  );
}

function ChooseUsername() {
  const router = useRouter();
  const params = useSearchParams();
  const takenHint = params.get('taken');

  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  type UsernameState =
    | { state: 'idle' }
    | { state: 'invalid'; reason: string }
    | { state: 'checking' }
    | { state: 'available' }
    | { state: 'taken' };
  const [unameState, setUnameState] = useState<UsernameState>({ state: 'idle' });

  useEffect(() => { boot(); /* eslint-disable-line */ }, []);

  async function boot() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) { router.replace('/auth/login'); return; }
    setUserId(session.session.user.id);

    // Already has a profile? Bounce them to the feed.
    const { data: existing } = await ensureUserProfile(session.session.user as any);
    if (existing) { router.replace('/feed'); return; }
  }

  // Pre-fill with the username they reserved if there's one stashed (and the
  // reason they're here is that it got taken). Helps them tweak rather than
  // start from scratch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stashed = window.localStorage.getItem('seltzer:pending-username');
    if (stashed && !username) setUsername(stashed);
  }, []); // eslint-disable-line

  // Live-validation + availability check, debounced.
  useEffect(() => {
    const u = username.trim();
    if (!u) { setUnameState({ state: 'idle' }); return; }
    const v = validateUsername(u);
    if (!v.ok) { setUnameState({ state: 'invalid', reason: v.reason }); return; }
    setUnameState({ state: 'checking' });
    const handle = setTimeout(async () => {
      const free = await isUsernameAvailable(u);
      setUsername((current) => {
        if (current.trim() === u) {
          setUnameState(free ? { state: 'available' } : { state: 'taken' });
        }
        return current;
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [username]);

  const suggestions = useMemo(() => {
    if (!takenHint) return [];
    const base = takenHint.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'seltzer';
    const rand = () => Math.floor(Math.random() * 90 + 10);
    return [
      `${base}${rand()}`,
      `${base}_${rand()}`,
      `the_${base}`,
    ].filter((s) => validateUsername(s).ok).slice(0, 3);
  }, [takenHint]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError('');
    setSubmitting(true);
    const { data, error: claimErr } = await claimUsername(userId, username);
    setSubmitting(false);
    if (claimErr || !data) {
      setError(claimErr?.message || 'Could not claim that username.');
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('seltzer:pending-username');
    }
    showToast('Welcome 🥂', 'success', `You're @${data.username}`);
    router.replace('/onboarding');
  }

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-4">
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <Link href="/" className="inline-flex mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-glow">
            <Droplets size={22} className="text-white" />
          </div>
        </Link>

        <div className="glass-card" style={{ padding: '32px' }}>
          <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Pick your <span className="gradient-text">username</span>
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            This is how friends will find you on Seltzer Social.
          </p>

          {takenHint && (
            <div
              className="rounded-xl p-3 mb-5 flex items-start gap-2.5"
              style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.22)' }}
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#fb7185' }} />
              <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold" style={{ color: '#fb7185' }}>@{takenHint}</span> got claimed before you confirmed.
                Pick a fresh handle below.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Username</label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                >@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_handle"
                  className="input-field"
                  style={{ paddingLeft: 32, paddingRight: 110 }}
                  autoComplete="off"
                  autoFocus
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold pointer-events-none">
                  {unameState.state === 'checking' && (
                    <span style={{ color: 'var(--text-muted)' }}>checking…</span>
                  )}
                  {unameState.state === 'available' && (
                    <span className="flex items-center gap-1" style={{ color: '#34d399' }}>
                      <Check size={12} /> available
                    </span>
                  )}
                  {unameState.state === 'taken' && (
                    <span className="flex items-center gap-1" style={{ color: '#fb7185' }}>
                      <X size={12} /> taken
                    </span>
                  )}
                  {unameState.state === 'invalid' && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--amber-400)' }}>
                      <X size={12} /> invalid
                    </span>
                  )}
                </span>
              </div>
              {unameState.state === 'invalid' && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--amber-400)' }}>{unameState.reason}</p>
              )}
              {unameState.state === 'idle' && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  3–20 chars · letters, numbers, underscores · must start with a letter
                </p>
              )}
            </div>

            {/* Quick suggestions when there was a collision */}
            {suggestions.length > 0 && username.trim() === takenHint && (
              <div>
                <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Try one of these:</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setUsername(s)}
                      className="text-xs px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors"
                      style={{ background: 'rgba(34,211,238,0.06)', color: 'var(--cyan-400)', border: '1px solid rgba(34,211,238,0.2)' }}
                    >
                      @{s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}

            <button
              type="submit"
              disabled={submitting || unameState.state !== 'available'}
              className="btn-primary w-full justify-center"
              style={{ padding: '14px', fontSize: '15px', opacity: unameState.state !== 'available' && !submitting ? 0.55 : 1 }}
            >
              {submitting ? 'Claiming…' : <>Continue <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
