// app/curator/reports/page.tsx
//
// Curator moderation queue for user reports (Apple 1.2). Lists open reports of
// reviews, comments, and profiles; lets a curator dismiss a report, mark it
// resolved, or hard-delete the offending review/comment. Curator-only — gated
// by users.can_curate (RLS on the reports table enforces the real permission).

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { BackHeader } from '@/components/BackHeader';
import { CanLoader } from '@/components/CanLoader';
import { ShieldAlert, AlertTriangle, Check, X, Trash2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import {
  supabase,
  getMyCuratorStatus,
  getOpenReports,
  resolveReport,
  moderatorDeleteReview,
  moderatorDeleteComment,
} from '@/lib/supabase';

interface ReportRow {
  id: string;
  target_type: 'review' | 'comment' | 'user';
  target_id: string;
  reason: string | null;
  created_at: string;
  reporter: { id: string; username: string } | null;
  target_user: { id: string; username: string } | null;
}

export default function CuratorReportsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { boot(); /* eslint-disable-line */ }, []);

  async function boot() {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id || null;
    setUserId(uid);
    if (!uid) { setAuthorized(false); setLoading(false); return; }
    const ok = await getMyCuratorStatus(uid);
    setAuthorized(ok);
    if (!ok) { setLoading(false); return; }
    await load();
  }

  async function load() {
    setLoading(true);
    const { data } = await getOpenReports(200);
    setRows((data as any[]) || []);
    setLoading(false);
  }

  async function resolve(reportId: string, status: 'resolved' | 'dismissed') {
    if (!userId) return;
    setBusyId(reportId);
    const { error } = await resolveReport(reportId, userId, status);
    setBusyId(null);
    if (error) { showToast('Failed', 'error', error.message); return; }
    showToast(status === 'dismissed' ? 'Report dismissed' : 'Marked resolved', 'success');
    setRows((prev) => prev.filter((r) => r.id !== reportId));
  }

  async function removeContent(row: ReportRow) {
    if (!userId || row.target_type === 'user') return;
    setBusyId(row.id);
    const { error } =
      row.target_type === 'review'
        ? await moderatorDeleteReview(row.target_id)
        : await moderatorDeleteComment(row.target_id);
    if (error) { setBusyId(null); showToast('Delete failed', 'error', error.message); return; }
    // Mark the report resolved now that the content is gone.
    await resolveReport(row.id, userId, 'resolved');
    setBusyId(null);
    showToast('Content removed', 'success');
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  function targetLink(row: ReportRow): string | null {
    if (row.target_type === 'review') return `/review/${row.target_id}`;
    if (row.target_type === 'user' && row.target_user?.username) return `/profile/${row.target_user.username}`;
    return null;
  }

  if (loading || authorized === null) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-12 pb-32"><CanLoader /></main></>);
  }

  if (!authorized) {
    return (
      <>
        <Navigation />
        <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-4">
          <BackHeader href="/feed" />
          <div className="glass-card text-center py-10">
            <AlertTriangle size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Curator-only page</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Reserved for founders and beta testers.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-4">
        <BackHeader href="/feed" />

        <div
          className="rounded-3xl p-5"
          style={{
            background: 'linear-gradient(135deg, rgba(251,113,133,0.10), rgba(167,139,250,0.10))',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} style={{ color: '#fb7185' }} />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#fb7185' }}>Moderation</p>
          </div>
          <h1 className="text-xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-display)' }}>
            {rows.length} open {rows.length === 1 ? 'report' : 'reports'}
          </h1>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Review each report, then dismiss it, mark it resolved, or remove the content.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="glass-card text-center py-10">
            <Check size={26} className="mx-auto mb-3" style={{ color: '#10b981' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No open reports. All clear.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const link = targetLink(row);
              return (
                <div
                  key={row.id}
                  className="rounded-2xl p-3.5"
                  style={{ background: 'rgba(15,20,36,0.55)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}
                    >
                      {row.target_type}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(row.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {row.reason || 'Reported'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Reported by @{row.reporter?.username || 'unknown'}
                    {row.target_user?.username && <> · author @{row.target_user.username}</>}
                  </p>

                  {link && (
                    <Link href={link} className="text-xs font-semibold hover:underline inline-block mt-1.5" style={{ color: 'var(--cyan-400)' }}>
                      View {row.target_type === 'user' ? 'profile' : row.target_type} →
                    </Link>
                  )}

                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => resolve(row.id, 'dismissed')}
                      disabled={busyId === row.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
                    >
                      <X size={11} /> Dismiss
                    </button>
                    <button
                      onClick={() => resolve(row.id, 'resolved')}
                      disabled={busyId === row.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                    >
                      <Check size={11} /> Resolve
                    </button>
                    {row.target_type !== 'user' && (
                      <button
                        onClick={() => removeContent(row)}
                        disabled={busyId === row.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                        style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}
                      >
                        <Trash2 size={11} /> Delete {row.target_type}
                      </button>
                    )}
                    {busyId === row.id && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>working…</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
