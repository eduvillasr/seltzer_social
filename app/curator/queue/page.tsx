// app/curator/queue/page.tsx
//
// Curator queue: shows every canonical seltzer flagged as needs_review
// (i.e. its image is poor quality — too small, multipack, off-angle).
// Founders + beta testers get to walk through, see candidate user-uploaded
// review photos for each drink, and one-tap promote the best one as the
// new canonical image — or upload their own.
//
// Visibility: only users with users.can_curate = true can see anything
// here. RLS on /supabase enforces the actual permission.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { BackHeader } from '@/components/BackHeader';
import { CanLoader } from '@/components/CanLoader';
import { ImagePlus, Check, Filter, AlertTriangle } from 'lucide-react';
import { showToast } from '@/components/Toast';
import {
  supabase,
  getMyCuratorStatus,
  getSeltzersNeedingReview,
  replaceCanonicalSeltzerImage,
  uploadCanonicalSeltzerImage,
} from '@/lib/supabase';

interface QueueRow {
  id: string;
  brand: string;
  name: string;
  image_url: string | null;
  image_quality_flag: string | null;
  reviewSamples: Array<{ id: string; image_url: string }>;
}

export default function CuratorQueuePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null); // null = checking
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueRow[]>([]);
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
    await loadQueue();
  }

  async function loadQueue() {
    setLoading(true);
    const { data } = await getSeltzersNeedingReview(200);
    // For each seltzer, fetch up to 4 review-image samples so the curator
    // can pick the best one without leaving this page.
    const ids = data.map((d: any) => d.id);
    let samplesByDrink: Record<string, Array<{ id: string; image_url: string }>> = {};
    if (ids.length) {
      const { data: revs } = await supabase
        .from('reviews')
        .select('id, seltzer_id, image_url')
        .in('seltzer_id', ids)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false });
      for (const r of (revs || []) as any[]) {
        if (!r.image_url) continue;
        const list = samplesByDrink[r.seltzer_id] || (samplesByDrink[r.seltzer_id] = []);
        if (list.length < 4) list.push({ id: r.id, image_url: r.image_url });
      }
    }
    setRows((data as any[]).map((d) => ({ ...d, reviewSamples: samplesByDrink[d.id] || [] })));
    setLoading(false);
  }

  async function promote(rowId: string, url: string) {
    if (!userId) return;
    setBusyId(rowId);
    const { error } = await replaceCanonicalSeltzerImage(rowId, userId, url, 'curator queue promote');
    setBusyId(null);
    if (error) { showToast('Update failed', 'error', error.message); return; }
    showToast('Updated', 'success');
    // Optimistic: remove the row from the queue
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  async function handleUpload(rowId: string, file?: File) {
    if (!file || !userId) return;
    setBusyId(rowId);
    const { url, error: upErr } = await uploadCanonicalSeltzerImage(userId, file);
    if (upErr || !url) { setBusyId(null); showToast('Upload failed', 'error', upErr?.message); return; }
    const { error } = await replaceCanonicalSeltzerImage(rowId, userId, url, 'curator queue upload');
    setBusyId(null);
    if (error) { showToast('Update failed', 'error', error.message); return; }
    showToast('Updated', 'success');
    setRows((prev) => prev.filter((r) => r.id !== rowId));
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
              Reserved for founders and beta testers. Ping a founder if you'd like access.
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
            background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.10))',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-cyan-400" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>Curator Queue</p>
          </div>
          <h1 className="text-xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-display)' }}>
            {rows.length} {rows.length === 1 ? 'drink' : 'drinks'} need a better photo
          </h1>
          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            Either pick a user-uploaded review photo below or upload your own. Replacement is logged.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="glass-card text-center py-10">
            <Check size={26} className="mx-auto mb-3" style={{ color: '#10b981' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Queue is clear. Nice.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl p-3"
                style={{ background: 'rgba(15,20,36,0.55)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-start gap-3">
                  {row.image_url ? (
                    <img src={row.image_url} alt="" className="w-16 h-20 rounded-lg object-cover flex-shrink-0" style={{ border: '1px solid var(--border-subtle)' }} />
                  ) : (
                    <div className="w-16 h-20 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={`/drink/${row.id}`} className="font-semibold text-sm hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {row.brand} · {row.name}
                    </Link>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Current image flagged as low quality
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <label
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold cursor-pointer hover:opacity-90"
                        style={{ background: 'var(--cyan-400)', color: '#0a0e1a' }}
                      >
                        <ImagePlus size={11} /> Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={busyId === row.id}
                          onChange={(e) => handleUpload(row.id, e.target.files?.[0])}
                        />
                      </label>
                      {busyId === row.id && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>working…</span>}
                    </div>
                  </div>
                </div>
                {row.reviewSamples.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>Or promote a user-uploaded photo:</p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {row.reviewSamples.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => promote(row.id, s.image_url)}
                          disabled={busyId === row.id}
                          className="flex-shrink-0 rounded-lg overflow-hidden hover:scale-105 transition-transform disabled:opacity-50"
                          style={{ border: '1px solid var(--border-subtle)' }}
                          title="Promote to canonical"
                        >
                          <img src={s.image_url} alt="" className="w-14 h-16 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
