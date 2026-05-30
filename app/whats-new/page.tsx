// app/whats-new/page.tsx
// Changelog / release notes timeline. Reads from lib/changelog.ts.

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Wrench, Zap, Rocket } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { RELEASES, CURRENT_VERSION, SEEN_KEY, type ChangeKind } from '@/lib/changelog';

const KIND_META: Record<ChangeKind, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  new:      { color: 'var(--cyan-400)',   bg: 'rgba(34,211,238,0.10)',  icon: <Sparkles size={11} />, label: 'New'      },
  improved: { color: 'var(--violet-400)', bg: 'rgba(167,139,250,0.10)', icon: <Zap size={11} />,      label: 'Improved' },
  fixed:    { color: 'var(--amber-400)',  bg: 'rgba(251,191,36,0.10)',  icon: <Wrench size={11} />,   label: 'Fixed'    },
};

export default function WhatsNewPage() {
  useEffect(() => {
    // Mark this version as seen so the indicator dot disappears.
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
    }
  }, []);

  return (
    <>
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <BackHeader href="/feed" />

        {/* Hero */}
        <div
          className="rounded-3xl p-5 animate-fade-in-up"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.08))',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.15)' }}>
              <Rocket size={17} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
                What's New
              </p>
              <h1 className="text-xl font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                v{CURRENT_VERSION}
              </h1>
            </div>
          </div>
          <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
            The release log for Seltzer Social. Newest at the top.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative space-y-6">
          {/* Vertical rail */}
          <div
            className="absolute top-1 bottom-1 w-px"
            style={{ left: 7, background: 'var(--border-subtle)' }}
            aria-hidden
          />

          {RELEASES.map((release, idx) => {
            const isLatest = idx === 0;
            return (
              <section key={release.version} className="relative pl-7 stagger-children">
                {/* Dot on rail */}
                <span
                  className="absolute"
                  style={{
                    left: 1,
                    top: 6,
                    width: 13,
                    height: 13,
                    borderRadius: '50%',
                    background: isLatest ? 'var(--cyan-400)' : 'var(--bg-card)',
                    border: isLatest ? '2px solid var(--cyan-400)' : '2px solid var(--border-medium)',
                    boxShadow: isLatest ? '0 0 12px rgba(34,211,238,0.6)' : 'none',
                  }}
                />

                {/* Header line */}
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <span
                    className="text-[10px] font-extrabold uppercase tracking-[0.18em]"
                    style={{ color: isLatest ? 'var(--cyan-400)' : 'var(--text-muted)' }}
                  >
                    v{release.version}
                  </span>
                  {isLatest && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--cyan-400)' }}
                    >
                      LATEST
                    </span>
                  )}
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                    {new Date(release.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                {/* Headline */}
                <h2 className="text-lg font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  {release.headline}
                </h2>

                {/* Changes */}
                <div className="space-y-2.5">
                  {release.changes.map((c, i) => {
                    const meta = KIND_META[c.kind];
                    return (
                      <div
                        key={i}
                        className="rounded-2xl p-3"
                        style={{ background: 'rgba(15,20,36,0.45)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0 mt-0.5"
                            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
                          >
                            {meta.icon}{meta.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                              {c.title}
                            </p>
                            {c.detail && (
                              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {c.detail}
                              </p>
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
        </div>
      </main>
    </>
  );
}

