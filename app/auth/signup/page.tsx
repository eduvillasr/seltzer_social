// app/auth/signup/page.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Droplets, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    const { data: existingUser } = await supabase.from('users').select('id').eq('username', username).single();
    if (existingUser) { setError('Username already taken'); setLoading(false); return; }
    const { data, error: signupError } = await supabase.auth.signUp({ email, password });
    if (signupError) { setError(signupError.message); setLoading(false); return; }
    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert([{ id: data.user.id, username }]);
      if (profileError) { setError(profileError.message); setLoading(false); return; }
    }
    router.push('/feed');
  }

  async function handleGoogleSignup() {
    setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) { setError(authError.message); setLoading(false); }
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
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>Join <span className="gradient-text">Seltzer Social</span></h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>Start reviewing your favorite sparkling waters</p>
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a unique username" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" className="input-field" required />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center" style={{ padding: '14px', fontSize: '15px' }}>
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