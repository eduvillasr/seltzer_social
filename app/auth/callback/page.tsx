// app/auth/callback/page.tsx
// Lands here after the user clicks the confirmation link in their email
// (or after Google OAuth). Claims the username they picked at signup,
// then routes them into onboarding.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Droplets, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase, ensureUserProfile } from '@/lib/supabase';
import { showToast } from '@/components/Toast';

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => { run(); /* eslint-disable-line */ }, []);

  async function run() {
    // Two possible auth flows we need to handle:
    //   1. PKCE: email link / OAuth puts a `?code=...` on the URL — we have to
    //      explicitly exchange it for a session.
    //   2. Implicit: tokens arrive in the URL hash and the supabase client
    //      picks them up itself.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStatus('error');
          setErrorMsg(exchangeError.message || 'We could not verify your email. The link may have expired.');
          return;
        }
        // Strip the code from the visible URL so a refresh can't re-trigger the exchange.
        url.searchParams.delete('code');
        url.searchParams.delete('type');
        window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
      }
    }

    let session = (await supabase.auth.getSession()).data.session;

    if (!session) {
      // For implicit flow the client may still be parsing the hash — give it a beat.
      session = await new Promise((resolve) => {
        const { data } = supabase.auth.onAuthStateChange((_event, s) => {
          if (s) { data.subscription.unsubscribe(); resolve(s); }
        });
        setTimeout(() => { data.subscription.unsubscribe(); resolve(null); }, 5000);
      });
    }

    if (!session?.user) {
      setStatus('error');
      setErrorMsg('We could not verify your email. The link may have expired — try signing in or signing up again.');
      return;
    }

    const { data: existing } = await supabase
      .from('users').select('id, username').eq('id', session.user.id).maybeSingle();

    // Already has a profile (e.g. clicked the email link twice) → straight in.
    if (existing) {
      if (typeof window !== 'undefined') window.localStorage.removeItem('seltzer:pending-username');
      showToast('Welcome back 🥂', 'success');
      router.replace('/feed');
      return;
    }

    // Try to claim the username they reserved at signup.
    const stashed = typeof window !== 'undefined'
      ? window.localStorage.getItem('seltzer:pending-username')?.trim()
      : null;

    if (stashed) {
      const { error } = await supabase
        .from('users').insert([{ id: session.user.id, username: stashed }]);
      if (!error) {
        if (typeof window !== 'undefined') window.localStorage.removeItem('seltzer:pending-username');
        showToast('Email confirmed 🥂', 'success', `You're @${stashed}`);
        router.replace('/onboarding');
        return;
      }
      // Username collision (someone else claimed it during the wait) — send
      // them to the chooser so they can pick a fresh one. The reserved name
      // is passed along so we can show "@oldname got taken" copy.
      router.replace(`/auth/choose-username?taken=${encodeURIComponent(stashed)}`);
      return;
    }

    // No reserved username (e.g. Google OAuth path) → make them choose.
    router.replace('/auth/choose-username');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 hero-gradient">
      <div className="w-full max-w-sm text-center animate-fade-in-up">
        {status === 'working' ? (
          <>
            <div
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mx-auto mb-5 animate-float"
              style={{ boxShadow: '0 0 28px rgba(6,182,212,0.45)' }}
            >
              <Droplets size={26} className="text-white" />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Confirming your email…
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Hang tight — pouring you a fresh seltzer.
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(251,113,133,0.12)' }}>
              <AlertCircle size={26} style={{ color: '#fb7185' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Something went sideways
            </h1>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              {errorMsg}
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => router.push('/auth/login')} className="btn-primary" style={{ padding: '10px 18px', fontSize: '13px' }}>
                Sign in
              </button>
              <button onClick={() => router.push('/auth/signup')} className="btn-secondary" style={{ padding: '10px 18px', fontSize: '13px' }}>
                Sign up
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
