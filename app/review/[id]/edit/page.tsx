// app/review/[id]/edit/page.tsx

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Upload, X, Trash2, Droplets, Search, Plus, Pencil } from 'lucide-react';
import { CanImage } from '@/components/CanImage';
import { BackHeader } from '@/components/BackHeader';
import { RatingInput } from '@/components/RatingInput';
import { CanLoader } from '@/components/CanLoader';
import { showToast } from '@/components/Toast';
import {
  getReview, supabase, updateReview, uploadReviewImage, deleteReview,
  searchSeltzers, findOrCreateSeltzer,
} from '@/lib/supabase';
import { Review, Seltzer } from '@/types';

const DEFAULT_BRANDS = [
  'AHA', 'Bubly', 'Canada Dry', "Hal's New York", 'Kirkland Signature',
  'LaCroix', 'Liquid Death', 'Nixie', 'Perrier', 'Polar', 'Rambler',
  'San Pellegrino', 'Sanzo', 'Schweppes', 'Spindrift', 'Topo Chico',
  'Truly', 'Waterloo', 'White Claw',
];

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

  // ── Drink swap (canonical seltzer) ──
  const [allSeltzers, setAllSeltzers] = useState<Seltzer[]>([]);
  const [drinkPickerOpen, setDrinkPickerOpen] = useState(false);
  const [drinkQuery, setDrinkQuery]   = useState('');
  const [pickedSeltzer, setPickedSeltzer] = useState<Seltzer | null>(null);
  const [pickedSnapshot, setPickedSnapshot] = useState<{ id: string | null; name: string; brand: string | null } | null>(null);

  // mini "add new drink" form state (lives inside the picker)
  const [showNewDrinkForm, setShowNewDrinkForm] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newName, setNewName]   = useState('');
  const [brandQuery, setBrandQuery] = useState('');
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const brandWrapRef = useRef<HTMLDivElement>(null);

  // image staging
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { boot(); /* eslint-disable-line */ }, [params.id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brandWrapRef.current && !brandWrapRef.current.contains(e.target as Node)) {
        setBrandMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function boot() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) { router.push('/auth/login'); return; }
    setUserId(session.session.user.id);

    const { data: r, error: rErr } = await getReview(params.id);
    if (rErr || !r) { setLoading(false); return; }
    if (r.user_id !== session.session.user.id) { setForbidden(true); setLoading(false); return; }

    const review = r as Review;
    setReview(review);
    setTitle(review.title ?? '');
    setContent(review.content ?? '');
    setRating(review.rating);

    // The currently-attached canonical drink (used when the user opens the swap UI).
    setPickedSnapshot({
      id: review.seltzer_id,
      name: review.seltzer_name,
      brand: review.brand,
    });

    // Lazy-load the catalog so the picker opens snappy.
    const { data: seltzerList } = await searchSeltzers('');
    if (seltzerList) setAllSeltzers(seltzerList as Seltzer[]);

    setLoading(false);
  }

  // ─── drink picker derived ─────────────────────────────────────
  const filteredDrinks = useMemo(() => {
    const q = drinkQuery.trim().toLowerCase();
    if (!q) return allSeltzers.slice(0, 12);
    return allSeltzers.filter((s) =>
      s.name.toLowerCase().includes(q) || s.brand.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [allSeltzers, drinkQuery]);

  const availableBrands = useMemo(() => {
    const fromCatalog = allSeltzers.map((s) => s.brand).filter(Boolean) as string[];
    return Array.from(new Set([...DEFAULT_BRANDS, ...fromCatalog])).sort((a, b) => a.localeCompare(b));
  }, [allSeltzers]);

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return availableBrands.slice(0, 10);
    return availableBrands.filter((b) => b.toLowerCase().includes(q)).slice(0, 10);
  }, [availableBrands, brandQuery]);

  // ─── handlers ─────────────────────────────────────────────────
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

  function selectSeltzer(s: Seltzer) {
    setPickedSeltzer(s);
    setPickedSnapshot({ id: s.id, name: s.name, brand: s.brand });
    setDrinkQuery('');
    setDrinkPickerOpen(false);
    setShowNewDrinkForm(false);
  }
  function startAddNewDrink() {
    setShowNewDrinkForm(true);
    const q = drinkQuery.trim();
    if (q) {
      const sep = q.includes('·') ? '·' : (q.includes(' - ') ? ' - ' : null);
      if (sep) {
        const [b, n] = q.split(sep);
        setNewBrand(b.trim());
        setNewName((n || '').trim());
      } else {
        setNewName(q);
      }
    }
  }
  function cancelDrinkSwap() {
    setDrinkPickerOpen(false);
    setShowNewDrinkForm(false);
    setDrinkQuery('');
    setNewBrand('');
    setNewName('');
    setBrandQuery('');
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

    // If the user opened the swap UI but didn't pick an existing seltzer,
    // see if they're mid-way through the "add new drink" form and resolve it now.
    let resolvedSeltzer = pickedSeltzer;
    if (!resolvedSeltzer && showNewDrinkForm) {
      const brand = (newBrand || brandQuery).trim();
      const name = newName.trim();
      if (!brand || !name) {
        setSaving(false);
        setError('Brand and drink name are required to add a new drink.');
        return;
      }
      const { data: created, error: createErr } = await findOrCreateSeltzer(brand, name, userId);
      if (createErr || !created) {
        setSaving(false);
        setError(createErr?.message || 'Could not save the new drink.');
        return;
      }
      resolvedSeltzer = created as Seltzer;
    }

    // Build the seltzer-related update payload only when the drink actually changed.
    const seltzerUpdates: Partial<Parameters<typeof updateReview>[1]> = {};
    if (resolvedSeltzer && resolvedSeltzer.id !== review.seltzer_id) {
      seltzerUpdates.seltzer_id = resolvedSeltzer.id;
      seltzerUpdates.seltzer_name = resolvedSeltzer.name;
      seltzerUpdates.brand = resolvedSeltzer.brand;
    }

    const { error: updateErr } = await updateReview(review.id, {
      title,
      content: content.trim() || null,
      rating,
      image_url: imageUrl,
      ...seltzerUpdates,
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
    return (<><main className="max-w-md mx-auto px-4 pt-20 pb-32"><CanLoader /></main></>);
  }
  if (forbidden) {
    return (
      <>
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
    return (<><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>Review not found</p></main></>);
  }

  const currentImage = pendingPreview || review.image_url || '';
  const drinkSnapshot = pickedSnapshot || { id: review.seltzer_id, name: review.seltzer_name, brand: review.brand };
  const drinkChanged = drinkSnapshot.id !== review.seltzer_id || drinkSnapshot.name !== review.seltzer_name || drinkSnapshot.brand !== review.brand;

  return (
    <>
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <BackHeader href={`/review/${review.id}`} label="Back to review" />

        <div>
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
            Edit <span className="gradient-text">Review</span>
          </h1>
        </div>

        <div className="glass-card animate-fade-in-up space-y-5">

          {/* ── Drink (with swap-open) ───────────────── */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Drink
            </label>

            {!drinkPickerOpen ? (
              /* Compact display + Change button */
              <div
                className="flex items-center gap-3 rounded-xl p-3"
                style={{
                  background: drinkChanged ? 'rgba(34,211,238,0.08)' : 'rgba(15,20,36,0.5)',
                  border: `1px solid ${drinkChanged ? 'rgba(34,211,238,0.3)' : 'var(--border-subtle)'}`,
                }}
              >
                <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.12)' }}>
                  <Droplets size={16} className="text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{drinkSnapshot.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {drinkSnapshot.brand ?? 'No brand'}
                    {drinkChanged && <span style={{ color: 'var(--cyan-400)' }}> · changed</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrinkPickerOpen(true)}
                  className="btn-secondary flex-shrink-0"
                  style={{ padding: '7px 12px', fontSize: '12px' }}
                >
                  <Pencil size={12} /> Change
                </button>
              </div>
            ) : showNewDrinkForm ? (
              /* Mini "add new drink" form */
              <div className="space-y-2.5 rounded-xl p-3" style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Adding a new drink to the canonical list — saved when you Save the review.</p>

                {/* Brand input with autocomplete */}
                <div ref={brandWrapRef} className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={newBrand || brandQuery}
                    onFocus={() => setBrandMenuOpen(true)}
                    onChange={(e) => { setNewBrand(''); setBrandQuery(e.target.value); setBrandMenuOpen(true); }}
                    placeholder="Brand"
                    className="input-field pl-9"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                  {brandMenuOpen && (filteredBrands.length > 0 || brandQuery.trim()) && (
                    <div
                      className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-y-auto"
                      style={{ maxHeight: '220px', padding: '4px', background: 'rgba(10,14,26,0.98)', border: '1px solid var(--border-medium)', boxShadow: '0 18px 42px rgba(0,0,0,0.45)' }}
                    >
                      {filteredBrands.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => { setNewBrand(b); setBrandQuery(''); setBrandMenuOpen(false); }}
                          className="w-full text-left rounded-lg px-3 py-1.5 text-sm hover:bg-white/5"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {b}
                        </button>
                      ))}
                      {brandQuery.trim() && !availableBrands.some((b) => b.toLowerCase() === brandQuery.trim().toLowerCase()) && (
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => { setNewBrand(brandQuery.trim()); setBrandQuery(''); setBrandMenuOpen(false); }}
                          className="w-full text-left rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-white/5"
                          style={{ color: 'var(--cyan-400)' }}
                        >
                          <Plus size={12} className="inline-block mr-1" /> Use "{brandQuery.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Drink name"
                  className="input-field"
                  style={{ height: '38px', fontSize: '13px' }}
                />

                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewDrinkForm(false); setNewBrand(''); setNewName(''); }}
                    className="text-xs hover:text-cyan-400 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ← Back to search
                  </button>
                  <button
                    type="button"
                    onClick={cancelDrinkSwap}
                    className="text-xs hover:text-cyan-400 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Cancel swap
                  </button>
                </div>
              </div>
            ) : (
              /* Searchable picker */
              <div className="space-y-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={drinkQuery}
                    onChange={(e) => setDrinkQuery(e.target.value)}
                    placeholder="Search drinks…"
                    className="input-field pl-10"
                    autoFocus
                  />
                </div>
                <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,14,26,0.6)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '4px' }}>
                    {filteredDrinks.length === 0 ? (
                      <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        No matches. Add the drink below.
                      </p>
                    ) : (
                      filteredDrinks.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => selectSeltzer(s)}
                          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.1)' }}>
                            <Droplets size={12} className="text-cyan-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{s.brand}</p>
                          </div>
                        </button>
                      ))
                    )}

                    <button
                      type="button"
                      onClick={startAddNewDrink}
                      className="w-full text-left rounded-lg px-3 py-2 mt-1 font-semibold text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                      style={{ color: 'var(--cyan-400)', borderTop: '1px solid var(--border-subtle)' }}
                    >
                      <Plus size={14} /> Add new drink{drinkQuery.trim() && `: "${drinkQuery.trim()}"`}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelDrinkSwap}
                  className="text-xs hover:text-cyan-400 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel — keep current drink
                </button>
              </div>
            )}
          </div>

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
                  <CanImage
                    src={currentImage}
                    alt="Current"
                    className="w-16 h-20 rounded-lg flex-shrink-0"
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
