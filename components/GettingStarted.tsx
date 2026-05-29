// components/GettingStarted.tsx
//
// Dismissable "Getting Started" checklist that sits on the feed for new
// users. Five concrete actions; each row is a Link to the right place,
// and the check fills in automatically once the underlying state turns
// true. When all five are done, or when the user clicks Dismiss, the
// card hides forever (users.onboarding_dismissed = true).
//
// This is the post-/onboarding companion piece: even users who skipped
// the welcome flow get a clear "do these to be set up" path.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check, Circle, Sparkles, X, ImagePlus, UserPlus,
  PenSquare, ListPlus, Droplets, ChevronRight,
} from 'lucide-react';
import { getOnboardingChecklist, dismissOnboardingChecklist } from '@/lib/supabase';

interface Props {
  userId: string;
}

interface ChecklistState {
  username: string;
  hasAvatar: boolean;
  follows3Plus: boolean;
  hasReview: boolean;
  hasTierList: boolean;
  hasTriedIt: boolean;
  completed: number;
  total: number;
  dismissed: boolean;
}

export function GettingStarted({ userId }: Props) {
  const [state, setState] = useState<ChecklistState | null>(null);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getOnboardingChecklist(userId);
      if (!cancelled) setState(s);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function handleDismiss() {
    setHiding(true);
    await dismissOnboardingChecklist(userId);
  }

  // Render nothing until we have data, after dismiss, or once all 5 done.
  // The "all done" auto-hide is gentler than asking the user to click X.
  if (!state || state.dismissed || hiding) return null;
  if (state.completed === state.total) return null;

  const pct = state.total > 0 ? (state.completed / state.total) * 100 : 0;

  const rows: Array<{
    done: boolean;
    icon: React.ReactNode;
    title: string;
    desc: string;
    href: string;
  }> = [
    {
      done: state.hasAvatar,
      icon: <ImagePlus size={14} />,
      title: 'Add a profile photo',
      desc: 'Help people recognize you on the feed.',
      href: '/settings',
    },
    {
      done: state.follows3Plus,
      icon: <UserPlus size={14} />,
      title: 'Follow 3 people',
      desc: 'Your feed lights up once you do.',
      href: '/discover',
    },
    {
      done: state.hasReview,
      icon: <PenSquare size={14} />,
      title: 'Write your first review',
      desc: 'Pick any seltzer you\'ve actually tried.',
      href: '/create',
    },
    {
      done: state.hasTriedIt,
      icon: <Droplets size={14} />,
      title: 'Rate one from someone\'s review',
      desc: 'Tap "Tried it?" on any review in your feed.',
      href: '/feed',
    },
    {
      done: state.hasTierList,
      icon: <ListPlus size={14} />,
      title: 'Join or start a tier list',
      desc: 'Rank drinks together with a friend.',
      href: '/shared/create',
    },
  ];

  return (
    <div
      className="rounded-3xl overflow-hidden animate-fade-in-up"
      style={{
        background: 'linear-gradient(160deg, rgba(34,211,238,0.10) 0%, rgba(167,139,250,0.06) 60%)',
        border: '1px solid rgba(34,211,238,0.22)',
        padding: '16px',
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(34,211,238,0.16)' }}
        >
          <Sparkles size={16} style={{ color: 'var(--cyan-400)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {state.username ? `Get set up, @${state.username}` : 'Get set up'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {state.completed} of {state.total} done · finish to make Seltzer Social feel yours
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-white/5 flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Dismiss checklist"
          title="Hide this card"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, var(--cyan-400), var(--violet-400))',
            boxShadow: '0 0 8px rgba(34,211,238,0.4)',
          }}
        />
      </div>

      {/* Step rows — only the ones still outstanding. Completed steps drop
          off the list entirely (rather than lingering with a strikethrough)
          so finishing one, e.g. adding a profile photo, makes its tip vanish. */}
      <ul className="space-y-1">
        {rows.filter((row) => !row.done).map((row) => (
          <li key={row.title}>
            <Link
              href={row.href}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
              style={{ opacity: row.done ? 0.65 : 1 }}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  background: row.done ? 'var(--cyan-400)' : 'rgba(148,163,184,0.10)',
                  color: row.done ? '#0a0e1a' : 'var(--text-muted)',
                  border: `1px solid ${row.done ? 'var(--cyan-400)' : 'rgba(148,163,184,0.20)'}`,
                }}
              >
                {row.done ? <Check size={12} strokeWidth={3} /> : row.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-semibold ${row.done ? 'line-through' : ''}`}
                  style={{ color: row.done ? 'var(--text-muted)' : 'var(--text-primary)' }}
                >
                  {row.title}
                </p>
                {!row.done && (
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{row.desc}</p>
                )}
              </div>
              {!row.done && <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
