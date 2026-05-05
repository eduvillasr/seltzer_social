// app/auth/signup/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Droplets, ArrowRight, Mail, CheckCircle2, Check, X } from 'lucide-react';
import { supabase, validateUsername, isUsernameAvailable } from '@/lib/supabase';

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // After signup completes, we may end up in one of two states:
  //   • "session"   — Supabase has email confirmation off OR the user signed in directly
  //                   (e.g. via Google OAuth) → push them to onboarding.
  //   • "pending"   — Supabase email confirmation is on. signUp returned a user but no
  //                   session. We show a "check your email" screen instead.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  // Username live-check
  type UsernameState =
    | { state: 'idle' }
    | { state: 'invalid'; reason: string }
    | { state: 'checking' }
    | { state: 'available' }
    | { state: 'taken' };
  const [unameState, setUnameState] = useState<UsernameState>({ state: 'idle' });

  useEffect(() => {
    const u = username.trim();
    if (!u) { setUnameState({ state: 'idle' }); return; }
    const v = validateUsername(u);
    if (!v.ok) { setUnameState({ state: 'invalid', reason: v.reason }); return; }

    setUnameState({ state: 'checking' });
    const handle = setTimeout(async () => {
      const free = await isUsernameAvailable(u);
      // Make sure the user hasn't typed something else in the meantime
      setUsername((current) => {
        if (current.trim() === u) {
          setUnameState(free ? { state: 'available' } : { state: 'taken' });
        }
        return current;
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [username]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');

    const cleanUsername = username.trim();
    const validation = validateUsername(cleanUsername);
    if (!validation.ok) { setError(validation.reason); setLoading(false); return; }

    const free = await isUsernameAvailable(cleanUsername);
    if (!free) { setError('Username already taken'); setLoading(false); return; }

    // Stash the chosen username so we can claim it after the user confirms their email.
    // We can't insert into `public.users` yet — without a session, RLS blocks it.
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('seltzer:pending-username', cleanUsername);
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Send the user back into the app once they click the email link.
        // /auth/callback will create their profile row and route to onboarding.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { username: cleanUsername },
      },
    });

    if (signupError) { setError(signupError.message); setLoading(false); return; }

    // If we got a session back, email confirmation is off — claim the username now.
    if (data.session && data.user) {
      const { error: profileError } = await supabase
        .from('users').insert([{ id: data.user.id, username: cleanUsername }]);
      if (profileError && !profileError.message?.toLowerCase().includes('duplicate')) {
        setError(profileError.message); setLoading(false); return;
      }
      router.push('/onboarding');
      return;
    }

    // No session ⇒ Supabase is waiting on email confirmation. Show the check-mail screen.
    setConfirmEmail(email);
    setLoading(false);
  }

  async function handleGoogleSignup() {
    setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) { setError(authError.message); setLoading(false); }
  }

  async function resendConfirmation() {
    if (!confirmEmail) return;
    await supabase.auth.resend({ type: 'signup', email: confirmEmail });
  }

  // ── Email confirmation pending screen ──────────────────────────────
  if (confirmEmail) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center px-4">
        <div className="w-full max-w-md relative z-10 animate-fade-in-up">
          <Link href="/" className="inline-flex mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-glow">
              <Droplets size={22} className="text-white" />
            </div>
          </Link>

          <div className="glass-card text-center" style={{ padding: '32px' }}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(167,139,250,0.18))' }}
            >
              <Mail size={28} className="text-cyan-400" />
            </div>

            <h1 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Check your <span className="gradient-text">email</span>
            </h1>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              We just sent a confirmation link to{' '}
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{confirmEmail}</span>.
              Open it on this device to finish setting up{' '}
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>@{username}</span>.
            </p>

            <div className="rounded-xl p-3 mt-6 text-left" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={12} className="text-cyan-400" /> While you wait
              </p>
              <ul className="space-y-1.5 text-xs leading-snug" style={{ color: 'var(--text-tertiary)' }}>
                <li>· Check your spam folder if it doesn't show up in a minute.</li>
                <li>· The link expires after 24 hours.</li>
                <li>· You can close this tab — clicking the link will bring you back.</li>
              </ul>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={resendConfirmation}
                className="btn-secondary flex-1 justify-center"
                style={{ padding: '11px', fontSize: '13px' }}
              >
                Resend email
              </button>
              <button
                onClick={() => { setConfirmEmail(null); setEmail(''); setPassword(''); }}
                className="btn-secondary flex-1 justify-center"
                style={{ padding: '11px', fontSize: '13px' }}
              >
                Use another email
              </button>
            </div>
          </div>

          <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Already confirmed?{' '}
            <Link href="/auth/login" className="text-cyan-400 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-4">
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-glow">
              <Droplets size={22} className="text-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Join <span className="gradient-text">Seltzer Social</span>
          </h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Rate seltzers. Build lists. Find your people.</p>
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3–20 chars, letters/numbers/_"
                  className="input-field"
                  style={{ paddingRight: 110 }}
                  autoComplete="off"
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
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" className="input-field" required />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading || unameState.state !== 'available'}
              className="btn-primary w-full justify-center"
              style={{ padding: '14px', fontSize: '15px', opacity: unameState.state !== 'available' && !loading ? 0.55 : 1 }}
            >
              {loading ? 'Creating account...' : 'Create Account'} {!loading && <ArrowRight size={16} />}
            </button>
          </form>
          <div className="divider my-6">or</div>
          <button onClick={handleGoogleSignup} disabled={loading} className="btn-secondary w-full justify-center" style={{ padding: '12px' }}>
            Continue with Google
          </button>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Already have an account?{' '}
          <Link href="/auth/login" className="text-cyan-400 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
