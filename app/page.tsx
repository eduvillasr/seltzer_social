// app/page.tsx — Dark theme landing page

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Droplets, Star, Heart, MessageCircle, Users, ArrowRight, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      router.push('/feed');
    } else {
      setChecking(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center animate-float animate-glow">
          <Droplets size={22} className="text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-glow">
              <Droplets size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Seltzer Social
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn-secondary">Sign In</Link>
            <Link href="/auth/signup" className="btn-primary">Get Started <ArrowRight size={14} /></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-24 px-4 hero-gradient">
        {/* Decorative orbs */}
        <div className="absolute top-32 left-[5%] w-96 h-96 rounded-full bg-cyan-500/5 blur-[120px]" />
        <div className="absolute top-48 right-[10%] w-72 h-72 rounded-full bg-violet-500/5 blur-[100px]" />
        <div className="absolute bottom-0 left-[40%] w-80 h-80 rounded-full bg-rose-500/3 blur-[100px]" />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="badge-cyan mb-6 animate-fade-in-up">
            <Sparkles size={12} />
            The social network for sparkling water
          </div>

          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-extrabold mb-6 leading-tight animate-fade-in-up"
            style={{ fontFamily: 'var(--font-display)', animationDelay: '0.1s', color: 'var(--text-primary)' }}
          >
            Discover your next{' '}
            <span className="gradient-text">favorite seltzer</span>
          </h1>

          <p className="text-lg sm:text-xl mb-10 max-w-xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.2s', color: 'var(--text-secondary)' }}>
            Rate, review, and share your sparkling water experiences. See what your friends are drinking. Find hidden gems.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Link href="/auth/signup" className="btn-primary" style={{ fontSize: '16px', padding: '14px 32px' }}>
              Start Reviewing <ArrowRight size={18} />
            </Link>
            <Link href="/auth/login" className="btn-secondary" style={{ fontSize: '16px', padding: '14px 32px' }}>
              I have an account
            </Link>
          </div>
        </div>

        {/* Preview Card */}
        <div className="max-w-md mx-auto mt-16 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full avatar-gradient text-sm">E</div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>eduvillasr</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Just now</p>
              </div>
              <div className="badge-amber ml-auto">
                <Star size={10} className="star-filled" /> 4.2
              </div>
            </div>
            <h3 className="font-bold text-lg mb-1" style={{ fontFamily: 'var(--font-display)' }}>Pamplemousse</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>LaCroix</p>
            <div className="flex items-center gap-1 mb-3">
              {[1,2,3,4].map(i => <Star key={i} size={14} className="star-filled" />)}
              <Star size={14} className="star-empty" />
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              The grapefruit flavor is subtle but refreshing. Perfect for a hot Texas afternoon. Zero calories, max vibes.
            </p>
            <div className="flex items-center gap-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="action-btn active-like" style={{ padding: '4px 8px' }}>
                <Heart size={14} className="fill-current" /> 12
              </span>
              <span className="action-btn" style={{ padding: '4px 8px' }}>
                <MessageCircle size={14} /> 3
              </span>
              <span className="badge-cyan ml-auto" style={{ fontSize: '11px' }}>
                <Users size={11} /> 8 tried this
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Glow line */}
      <div className="glow-line" />

      {/* Features */}
      <section className="py-24 px-4 section-alt">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              Everything you <span className="gradient-text">need</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>Built for people who take their bubbles seriously.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {[
              { icon: <Star size={20} />, title: 'Rate & Review', desc: 'Score seltzers 0–5 with precision. Share detailed tasting notes.', gradient: 'from-amber-400 to-orange-500' },
              { icon: <Heart size={20} />, title: 'Like & Comment', desc: 'Engage with the community. Like reviews, leave comments.', gradient: 'from-rose-400 to-rose-600' },
              { icon: <Users size={20} />, title: '"Tried It" Ratings', desc: 'Rate seltzers from other reviews. See community scores.', gradient: 'from-cyan-400 to-cyan-600' },
              { icon: <TrendingUp size={20} />, title: 'Discover Trends', desc: 'Find the most reviewed and highest rated seltzers.', gradient: 'from-violet-400 to-violet-600' },
              { icon: <Droplets size={20} />, title: 'Brand Explorer', desc: 'Browse by brand. LaCroix, Spindrift, Topo Chico and more.', gradient: 'from-emerald-400 to-emerald-600' },
              { icon: <Zap size={20} />, title: 'Social Profiles', desc: 'Build your seltzer identity. Show off your reviews and taste.', gradient: 'from-cyan-400 to-blue-600' },
            ].map((f, i) => (
              <div key={i} className="glass-card group cursor-default">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-white mb-4 group-hover:scale-110 group-hover:shadow-lg transition-all`}>
                  {f.icon}
                </div>
                <h3 className="font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 hero-gradient">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Ready to start <span className="gradient-text">reviewing</span>?
          </h2>
          <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>Join the community. Share your taste. Discover something new.</p>
          <Link href="/auth/signup" className="btn-primary" style={{ fontSize: '16px', padding: '14px 32px' }}>
            Create Your Account <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Droplets size={14} className="text-cyan-500" />
            <span>Seltzer Social</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Made with bubbles</p>
        </div>
      </footer>
    </div>
  );
}