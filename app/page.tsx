// app/page.tsx
//
// Logged-out welcome screen. This is the first thing a signed-out user sees —
// inside the native app it's effectively the launch screen, so it's built to
// feel like one: a single full-height screen (no marketing scroll, no web nav
// bar, no footer), a centered app identity, an auto-rotating showcase of the
// product's three signature surfaces, and big bottom-anchored CTAs that respect
// the device safe-area insets. Logged-in users are redirected straight to /feed.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Droplets, Star, Heart, ArrowRight, GitCompare, ListOrdered, Trophy, Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const TIER_PREVIEW = [
  { tier: 'S', color: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.3)', label: 'rgba(251,191,36,1)', items: ['Pamplemousse · LaCroix', 'Yuzu · Sanzo'] },
  { tier: 'A', color: 'rgba(34,211,238,0.1)',  border: 'rgba(34,211,238,0.2)',  label: 'rgba(34,211,238,1)',  items: ['Grapefruit · Spindrift', 'Lime · Topo Chico'] },
  { tier: 'B', color: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', label: 'rgba(167,139,250,1)', items: ['Blackberry · Bubly'] },
];

const SCENES = [
  { key: 'tiers',   label: 'Build tier lists with friends' },
  { key: 'reviews', label: 'Rate every seltzer you try' },
  { key: 'compare', label: 'See whose taste matches yours' },
];

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [scene, setScene] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Swipe the showcase left/right like a native carousel. A small threshold
  // keeps a vertical scroll or an accidental tap from flipping the scene.
  function goTo(delta: number) {
    setScene((s) => (s + delta + SCENES.length) % SCENES.length);
  }
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    goTo(dx < 0 ? 1 : -1);
  }

  useEffect(() => { checkAuth(); }, []);

  // Auto-advance the showcase. Only runs once we've decided the user is logged
  // out (so the interval never spins behind the loading splash).
  useEffect(() => {
    if (checking) return;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 3800);
    return () => clearInterval(id);
  }, [checking]);

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
    <div
      className="relative flex flex-col overflow-hidden hero-gradient"
      style={{
        minHeight: '100dvh',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      }}
    >
      {/* Ambient glow blobs */}
      <div className="absolute -top-10 left-[-10%] w-80 h-80 rounded-full bg-cyan-500/10 blur-[110px] pointer-events-none" />
      <div className="absolute top-1/3 right-[-15%] w-72 h-72 rounded-full bg-violet-500/10 blur-[110px] pointer-events-none" />

      {/* Identity */}
      <div className="flex flex-col items-center px-6 animate-fade-in-up">
        <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-float animate-glow mb-3">
          <Droplets size={30} className="text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Seltzer Social
        </span>
      </div>

      {/* Hero headline + rotating showcase — flex-1 keeps it centered between
          the identity and the bottom CTAs on any screen height. */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <h1
          className="text-3xl sm:text-4xl font-extrabold text-center leading-[1.1] mb-2 animate-fade-in-up break-anywhere"
          style={{ fontFamily: 'var(--font-display)', animationDelay: '0.05s', color: 'var(--text-primary)' }}
        >
          Rate seltzers.<br />
          <span className="gradient-text">Find your people.</span>
        </h1>
        <p
          className="text-sm text-center mb-6 animate-fade-in-up"
          style={{ animationDelay: '0.12s', color: 'var(--text-secondary)', maxWidth: '300px' }}
        >
          Your seltzer opinions say a lot about you. Find out who agrees.
        </p>

        {/* Showcase card — fixed min-height so the layout doesn't jump as scenes
            of different heights rotate through. key={scene} replays the entrance
            animation on each change for a soft cross-fade feel. */}
        <div
          className="w-full select-none"
          style={{ maxWidth: '360px', touchAction: 'pan-y' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex items-center justify-center" style={{ minHeight: '260px' }}>
            <div key={scene} className="w-full animate-fade-in-up">
              {scene === 0 && <TierScene />}
              {scene === 1 && <ReviewScene />}
              {scene === 2 && <CompareScene />}
            </div>
          </div>

          {/* Scene label + dots */}
          <p className="text-center text-xs font-semibold mt-4 mb-3 transition-colors" style={{ color: 'var(--text-secondary)' }}>
            {SCENES[scene].label}
          </p>
          <div className="flex items-center justify-center gap-2">
            {SCENES.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setScene(i)}
                aria-label={s.label}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === scene ? 20 : 7,
                  height: 7,
                  background: i === scene ? 'var(--cyan-400)' : 'rgba(148,163,184,0.3)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-anchored CTAs */}
      <div className="px-6 pt-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="w-full mx-auto" style={{ maxWidth: '360px' }}>
          <Link
            href="/auth/signup"
            className="btn-primary w-full justify-center"
            style={{ fontSize: '16px', padding: '15px 28px', borderRadius: '16px' }}
          >
            Get Started <ArrowRight size={18} />
          </Link>
          <Link
            href="/auth/login"
            className="block text-center text-sm font-medium mt-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            I already have an account
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Showcase scenes ──────────────────────────────────────────────────────────

function TierScene() {
  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Office Tier List</p>
          <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>@alex_dev + @priya_design</p>
        </div>
        <span className="badge-cyan flex-shrink-0" style={{ fontSize: '10px', padding: '3px 8px' }}>Live</span>
      </div>
      <div className="space-y-2">
        {TIER_PREVIEW.map(({ tier, color, border, label, items }) => (
          <div key={tier} className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
            <div className="w-8 flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: color, color: label }}>{tier}</div>
            <div className="flex-1 px-2 py-1.5 flex flex-wrap gap-1.5" style={{ background: 'rgba(15,20,36,0.5)' }}>
              {items.map((item) => (
                <span key={item} className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewScene() {
  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full avatar-gradient flex items-center justify-center text-sm font-bold flex-shrink-0">M</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>mwilson_sales</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>45m ago</p>
        </div>
        <div className="badge-amber flex-shrink-0"><Star size={10} className="star-filled" />4.8</div>
      </div>
      <h3 className="font-bold text-base mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>Blood Orange</h3>
      <p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>Sanzo</p>
      <div className="flex gap-0.5 mb-2">
        {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} className="star-filled" />)}
      </div>
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        Genuinely surprised me — tastes like someone squeezed a real orange into sparkling water. Changed my whole view on Sanzo.
      </p>
      <div className="flex items-center gap-3 pt-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <span className="action-btn active-like" style={{ padding: '4px 10px' }}><Heart size={13} className="fill-current" />14</span>
        <span className="badge-cyan ml-auto" style={{ fontSize: '11px' }}><Droplets size={11} />6 tried this</span>
      </div>
    </div>
  );
}

function CompareScene() {
  const tags = [
    { name: 'Connoisseur', Icon: Trophy, color: '#f4c430' },
    { name: 'Founder', Icon: Sparkles, color: '#a78bfa' },
    { name: 'Curator', Icon: ListOrdered, color: '#c0c4cc' },
  ];
  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      <div
        className="rounded-xl p-3.5 mb-3"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(167,139,250,0.10))', border: '1px solid rgba(34,211,238,0.22)' }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <GitCompare size={12} className="text-cyan-400" />
          <p className="text-xs font-semibold" style={{ color: 'var(--cyan-400)' }}>You vs @alex_dev</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-extrabold" style={{ background: 'linear-gradient(135deg, var(--cyan-400), var(--violet-400))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            82% match
          </p>
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>14 drinks in common</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tags.map(({ name, Icon, color }) => (
          <div key={name} className="rounded-xl p-2 flex flex-col items-center text-center" style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center justify-center mb-1.5"
              style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${color}33, ${color}10)`, border: `1.5px solid ${color}`, boxShadow: `0 0 16px ${color}44` }}
            >
              <Icon size={18} style={{ color }} strokeWidth={2.2} />
            </div>
            <p className="text-[10px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
