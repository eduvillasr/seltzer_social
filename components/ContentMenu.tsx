// components/ContentMenu.tsx
//
// Overflow "⋯" menu carrying the UGC safety actions Apple requires (1.2):
// Report content and Block the author. Used on review cards, comments, and
// profiles. Reporting is an idempotent upsert; blocking calls onBlocked so
// the host can hide the content immediately.

'use client';

import { useState } from 'react';
import { MoreHorizontal, Flag, Ban, X } from 'lucide-react';
import { showToast } from './Toast';
import { reportContent, blockUser, type ReportTargetType } from '@/lib/supabase';

interface Props {
  currentUserId?: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  /** Allow blocking from this menu (hide for self-targets). Default true. */
  allowBlock?: boolean;
  /** Called after a successful block so the host can hide the content. */
  onBlocked?: () => void;
  size?: number;
}

const REASONS = ['Spam', 'Harassment or hate', 'Inappropriate content', 'Impersonation', 'Other'];

export function ContentMenu({
  currentUserId, targetType, targetId, targetUserId, targetUsername,
  allowBlock = true, onBlocked, size = 15,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Don't offer moderation actions on your own content or when logged out.
  const isSelf = !!currentUserId && currentUserId === targetUserId;
  if (!currentUserId || isSelf) return null;

  async function submitReport() {
    if (!currentUserId || busy) return;
    setBusy(true);
    const { error } = await reportContent({
      reporterId: currentUserId, targetType, targetId,
      targetUserId: targetUserId ?? null, reason: reason || 'Reported',
    });
    setBusy(false);
    setReporting(false);
    setOpen(false);
    setReason('');
    showToast(error ? 'Could not submit report' : 'Report submitted', error ? 'error' : 'success',
      error ? error.message : 'Our team will review it.');
  }

  async function doBlock() {
    if (!currentUserId || !targetUserId || busy) return;
    setBusy(true);
    const { error } = await blockUser(currentUserId, targetUserId);
    setBusy(false);
    setOpen(false);
    if (error) { showToast('Could not block', 'error', error.message); return; }
    showToast(`Blocked${targetUsername ? ` @${targetUsername}` : ''}`, 'info', 'You won\'t see their content.');
    onBlocked?.();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="action-btn"
        style={{ padding: '4px 6px', color: 'var(--text-muted)' }}
        title="More"
        aria-label="More options"
      >
        <MoreHorizontal size={size} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(5,8,16,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!busy) { setOpen(false); setReporting(false); } }}
        >
          <div className="w-full max-w-sm rounded-3xl p-4" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-secondary, #0f1424)', border: '1px solid var(--border-subtle)' }}
          >
            {!reporting ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Options</p>
                  <button onClick={() => setOpen(false)} className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                    <X size={15} />
                  </button>
                </div>
                <button
                  onClick={() => setReporting(true)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] text-left"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Flag size={16} /> <span className="text-sm font-medium">Report this {targetType === 'user' ? 'profile' : targetType}</span>
                </button>
                {allowBlock && targetUserId && (
                  <button
                    onClick={doBlock}
                    disabled={busy}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.04] text-left"
                    style={{ color: '#fb7185' }}
                  >
                    <Ban size={16} /> <span className="text-sm font-medium">Block{targetUsername ? ` @${targetUsername}` : ' user'}</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Why are you reporting this?</p>
                <div className="space-y-1.5 mb-3">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm transition-colors"
                      style={{
                        background: reason === r ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                        color: reason === r ? 'var(--cyan-400)' : 'var(--text-secondary)',
                        border: `1px solid ${reason === r ? 'rgba(34,211,238,0.3)' : 'transparent'}`,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setReporting(false)} disabled={busy} className="btn-secondary flex-1" style={{ padding: '9px' }}>Back</button>
                  <button onClick={submitReport} disabled={busy || !reason} className="btn-primary flex-1" style={{ padding: '9px' }}>
                    {busy ? 'Submitting…' : 'Submit report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
