// app/review/[id]/edit/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Upload, X, Trash2, Droplets } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { RatingInput } from '@/components/RatingInput';
import { CanLoader } from '@/components/CanLoader';
import { showToast } from '@/components/Toast';
import {
  getReview, supabase, updateReview, uploadReviewImage, deleteReview,
} from '@/lib/supabase';
import { Review } from '@/types';

export default function EditReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(3);

  // image staging
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { boot(); /* eslint-disable-line */ }, [params.id]);

  async function boot() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) { router.push('/auth/login'); return; }
    setUserId(session.session.user.id);

    const { data: r, error: rErr } = await getReview(params.id);
    if (rErr || !r) { setLoading(false); return; }

    if (r.user_id !== session.session.user.id) { setForbidden(true); setLoading(false); return; }

    setReview(r as Review);
    setTitle((r as Review).title ?? '');
    setContent((r as Review).content ?? '');
    setRating((r as Review).rating);
    setLoading(false);
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Pick an image file', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image too large', 'error', 'Pick something under 5MB'); return; }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  function discardPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview('');
  }

  async function save() {
    if (!review || !userId) return;
    setSaving(true);
    setError('');

    let imageUrl = review.image_url ?? undefined;
    if (pendingFile) {
      const { url, error: upErr } = await uploadReviewImage(userId, pendingFile);
      if (upErr || !url) {
        setSaving(false);
        setError(upErr?.message || 'Could not upload the new image.');
        showToast('Image upload failed', 'error');
        return;
      }
      imageUrl = url;
    }

    const { error: updateErr } = await updateReview(review.id, {
      title: title,                 // updateReview normalizes blank → null
      content: content.trim() || null,
      rating,
      image_url: imageUrl,
    });

    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      showToast('Could not save', 'error', updateErr.message);
      return;
    }

    showToast('Review updated 🥂', 'success');
    discardPending();
    router.push(`/review/${review.id}`);
  }

  async function handleDelete() {
    if (!review) return;
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; }
    setDeleting(true);
    const { error: delErr } = await deleteReview(review.id);
    setDeleting(false);
    if (delErr) { showToast('Could not delete', 'error', delErr.message); return; }
    showToast('Review deleted', 'info');
    router.push('/feed');
  }

  if (loading) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32"><CanLoader /></main></>);
  }

  if (forbidden) {
    return (
      <>
        <Navigation />
        <main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center">
          <p className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Not your review</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>You can only edit reviews you wrote.</p>
          <Link href="/feed" className="btn-primary inline-flex mt-5" style={{ padding: '8px 16px', fontSize: '12px' }}>
            <ArrowLeft size={12} /> Back to feed
          </Link>
        </main>
      </>
    );
  }

  if (!review) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>Review not found</p></main></>);
  }

  const currentImage = pendingPreview || review.image_url || '';
  const drinkLabel = `${review.brand ? review.brand + ' · ' : ''}${review.seltzer_name}`;

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <Link href={`/review/${review.id}`} className="inline-flex items-center gap-2 text-sm hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back to review
        </Link>

        <div>
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
            Edit <span className="gradient-text">Review</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{drinkLabel}</p>
        </div>

        <div className="glass-card animate-fade-in-up space-y-5">
          {/* ── Image (current + replace) ── */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Can Image
            </label>
            <label
              className="block cursor-pointer rounded-xl p-3 transition-colors hover:bg-white/5"
              style={{ border: '1px dashed var(--border-strong)', background: 'rgba(15,20,36,0.5)' }}
            >
              <input type="file" accept="image/*" className="sr-only" onChange={pickImage} />
              {currentImage ? (
                <div className="flex items-center gap-3">
                  <img
                    src={currentImage}
                    alt="Current"
                    className="w-16 h-20 rounded-lg object-cover"
                    style={{ border: pendingPreview ? '2px solid var(--cyan-400)' : '1px solid var(--border-subtle)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {pendingPreview ? 'New image queued' : 'Current image'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {pendingPreview ? 'Will replace the existing one when you save.' : 'Tap to replace.'}
                    </p>
                  </div>
                  {pendingPreview && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); discardPending(); }}
                      className="btn-ghost"
                      style={{ padding: '6px 8px' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)' }}>
                    <Upload size={18} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add a can photo</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Replaces the current image.</p>
                  </div>
                </div>
              )}
            </label>
          </div>

          {/* ── Title ── */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Title <span style={{ color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· optional</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Ultimate summer drink"'
              className="input-field"
              maxLength={80}
            />
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
              Leave blank to fall back to the drink name.
            </p>
          </div>

          {/* ── Rating ── */}
          <div className="rounded-xl p-3" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid var(--border-subtle)' }}>
            <RatingInput value={rating} onChange={setRating} />
          </div>

          {/* ── Content ── */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Your Review
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did you think?"
              rows={5}
              className="input-field resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="btn-secondary"
              style={{ padding: '12px 14px', fontSize: '13px', color: confirmDelete ? '#fb7185' : undefined }}
              title={confirmDelete ? 'Click again to confirm' : 'Delete review'}
            >
              <Trash2 size={13} />
              {confirmDelete ? <span style={{ fontSize: '11px' }}>Confirm?</span> : null}
            </button>
            <button
              onClick={save}
              disabled={saving || deleting}
              className="btn-primary flex-1 justify-center"
              style={{ padding: '12px', fontSize: '14px' }}
            >
              <Check size={14} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
