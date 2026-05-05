// app/auth/login/page.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Droplets, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError(authError.message); setLoading(false); return; }
    router.push('/feed');
  }

  async function handleGoogleLogin() {
    setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) { setError(authError.message); setLoading(false); }
  }

  const bubbles = [
    { size: 18, left: '8%',  delay: '0s',   duration: '7s'  },
    { size: 10, left: '18%', delay: '2s',   duration: '9s'  },
    { size: 24, left: '30%', delay: '1s',   duration: '11s' },
    { size: 14, left: '45%', delay: '3.5s', duration: '8s'  },
    { size: 20, left: '60%', delay: '0.5s', duration: '10s' },
    { size: 12, left: '72%', delay: '2.5s', duration: '7.5s'},
    { size: 28, left: '83%', delay: '1.5s', duration: '12s' },
    { size: 10, left: '92%', delay: '4s',   duration: '9s'  },
  ];

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-4 relative overflow-hidden">
      <div className="bubble-container">
        {bubbles.map((b, i) => (
          <div key={i} className="bubble" style={{ width: b.size, height: b.size, left: b.left, bottom: '-10%', animationDelay: b.delay, animationDuration: b.duration }} />
        ))}
      </div>
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-glow">
              <Droplets size={22} className="text-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>Welcome back</h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Sign in to your account</p>
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="input-field" required />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center" style={{ padding: '14px', fontSize: '15px' }}>
              {loading ? 'Signing in...' : 'Sign In'} {!loading && <ArrowRight size={16} />}
            </button>
          </form>
          <div className="divider my-6">or</div>
          <button onClick={handleGoogleLogin} disabled={loading} className="btn-secondary w-full justify-center" style={{ padding: '12px' }}>
            Continue with Google
          </button>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-cyan-400 font-medium hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
}
