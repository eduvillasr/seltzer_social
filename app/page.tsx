// app/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Droplets, Star, Heart, ArrowRight, Sparkles, ListOrdered, Users, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const TIER_PREVIEW = [
  { tier: 'S', color: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.3)', label: 'rgba(251,191,36,1)', items: ['Pamplemousse · LaCroix', 'Yuzu · Sanzo'] },
  { tier: 'A', color: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.2)',  label: 'rgba(34,211,238,1)',  items: ['Grapefruit · Spindrift', 'Lime · Topo Chico'] },
  { tier: 'B', color: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', label: 'rgba(167,139,250,1)', items: ['Blackberry · Bubly'] },
  { tier: 'C', color: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.12)', label: 'rgba(148,163,184,0.7)', items: ['Watermelon · AHA'] },
];

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) router.push('/feed');
    else setChecking(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-float animate-glow">
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
            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Seltzer Social</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn-secondary">Sign In</Link>
            <Link href="/auth/signup" className="btn-primary">Get Started <ArrowRight size={14} /></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-20 px-4 hero-gradient overflow-hidden">
        <div className="absolute top-32 left-[5%] w-96 h-96 rounded-full bg-cyan-500/5 blur-[120px]" />
        <div className="absolute top-48 right-[10%] w-72 h-72 rounded-full bg-violet-500/5 blur-[100px]" />

        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left — copy */}
            <div>
              <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
                <div className="h-px w-10 bg-gradient-to-r from-transparent to-cyan-500/50" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--cyan-400)' }}>
                  <Sparkles size={10} className="inline mr-1.5 mb-0.5" />For sparkling water people
                </span>
              </div>

              <h1
                className="text-5xl sm:text-6xl font-extrabold mb-6 leading-[1.08] animate-fade-in-up"
                style={{ fontFamily: 'var(--font-display)', animationDelay: '0.05s', color: 'var(--text-primary)' }}
              >
                Rate seltzers.{' '}
                <span className="gradient-text">Find your people.</span>
              </h1>

              <p
                className="text-lg mb-8 leading-relaxed animate-fade-in-up"
                style={{ animationDelay: '0.15s', color: 'var(--text-secondary)', maxWidth: '480px' }}
              >
                Build collaborative tier lists, write reviews, and discover who around you shares your taste. Turns out seltzer opinions say a lot about a person.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-3 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
                <Link href="/auth/signup" className="btn-primary" style={{ fontSize: '15px', padding: '13px 28px' }}>
                  Get Started <ArrowRight size={16} />
                </Link>
                <Link href="/auth/login" className="btn-secondary" style={{ fontSize: '15px', padding: '13px 28px' }}>
                  I have an account
                </Link>
              </div>

              {/* Social proof pills */}
              <div className="flex flex-wrap gap-2 mt-8 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
                {[
                  { icon: <Check size={11} />, text: 'Collaborative ranking' },
                  { icon: <Check size={11} />, text: 'Try & vote on picks' },
                  { icon: <Check size={11} />, text: 'Individual reviews' },
                ].map((p) => (
                  <span key={p.text} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-400)' }}>
                    {p.icon} {p.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — tier list preview */}
            <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="glass-card" style={{ padding: '20px' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Office Seltzer Tier List</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>@alex_dev + @priya_design</p>
                  </div>
                  <span className="badge-cyan" style={{ fontSize: '10px', padding: '3px 8px' }}>Live</span>
                </div>

                <div className="space-y-2 mb-4">
                  {TIER_PREVIEW.map(({ tier, color, border, label, items }) => (
                    <div key={tier} className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                      <div className="w-9 flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: color, color: label }}>
                        {tier}
                      </div>
                      <div className="flex-1 px-2 py-1.5 flex flex-wrap gap-1.5" style={{ background: 'rgba(15,20,36,0.5)' }}>
                        {items.map((item) => (
                          <span key={item} className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pending suggestion */}
                <div className="rounded-xl p-3 mt-3" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--amber-400)' }}>Pending suggestion from @alex_dev</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Blood Orange · Sanzo</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Proposed: S tier · 4.8</p>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>✓ Approve</span>
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(148,163,184,0.08)', color: 'var(--text-muted)' }}>✕</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="glow-line" />

      {/* How it works */}
      <section className="py-20 px-4 section-alt">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              How the <span className="gradient-text">list works</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>Collaborative, opinionated, and weirdly fun.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                icon: <Users size={22} />,
                title: 'Start a list with someone',
                desc: 'Pick anyone you follow. Together you own the list — everyone else can subscribe and follow along.',
                gradient: 'from-cyan-400 to-cyan-600',
              },
              {
                step: '02',
                icon: <Droplets size={22} />,
                title: 'Suggest seltzers',
                desc: 'Propose a drink for any tier. Your partner has to actually try it first, then votes approve or reject.',
                gradient: 'from-violet-400 to-violet-600',
              },
              {
                step: '03',
                icon: <ListOrdered size={22} />,
                title: 'Watch the rankings evolve',
                desc: 'Subscribers follow along, leave their own reviews, and rate drinks they\'ve tried. The list grows over time.',
                gradient: 'from-amber-400 to-orange-500',
              },
            ].map((s) => (
              <div key={s.step} className="glass-card relative overflow-hidden group">
                <div className="absolute top-3 right-4 text-4xl font-black opacity-[0.04]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{s.step}</div>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                  {s.icon}
                </div>
                <h3 className="font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Review card preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Rate it yourself,{' '}
                <span className="gradient-text">then compare</span>
              </h2>
              <p className="mb-6 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Beyond the tier list — write full reviews for any seltzer, see what the people you follow are drinking, and quietly discover you have the same taste as someone you never expected.
              </p>
              <div className="space-y-3">
                {[
                  'Like and comment on reviews',
                  '"Tried It" rates without a full review',
                  'Emoji reactions on comments',
                  'Follow colleagues to see their feed',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(6,182,212,0.15)' }}>
                      <Check size={11} className="text-cyan-400" />
                    </div>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini review card */}
            <div className="glass-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full avatar-gradient flex items-center justify-center text-sm font-bold">M</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>mwilson_sales</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>45m ago</p>
                </div>
                <div className="badge-amber"><Star size={10} className="star-filled" />4.8</div>
              </div>
              <h3 className="font-bold text-lg mb-1" style={{ fontFamily: 'var(--font-display)' }}>Blood Orange</h3>
              <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Sanzo</p>
              <div className="flex gap-0.5 mb-3">
                {[1,2,3,4,5].map(i => <Star key={i} size={14} className="star-filled" />)}
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                This one genuinely surprised me. The blood orange isn't artificial at all — tastes like someone squeezed an actual orange into sparkling water. Changed my whole view on Sanzo.
              </p>
              <div className="flex items-center gap-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span className="action-btn active-like" style={{ padding: '4px 10px' }}>
                  <Heart size={13} className="fill-current" />14
                </span>
                <span className="badge-cyan ml-auto" style={{ fontSize: '11px' }}>
                  <Droplets size={11} />6 tried this
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 hero-gradient">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mx-auto mb-6 animate-float animate-glow">
            <Droplets size={26} className="text-white" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Your taste says more{' '}
            <span className="gradient-text">than you think.</span>
          </h2>
          <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
            Rate seltzers. Build lists. Find the people who get it.
          </p>
          <Link href="/auth/signup" className="btn-primary" style={{ fontSize: '16px', padding: '14px 32px' }}>
            Join Seltzer Social <ArrowRight size={18} />
          </Link>
        </div>
      </section>

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
