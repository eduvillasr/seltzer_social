// app/create/page.tsx

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Droplets, Search, Check, Plus, Upload, X, ListPlus, ArrowRight, CheckCircle2, ScanLine,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { CanImage } from '@/components/CanImage';
import { RatingInput } from '@/components/RatingInput';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { showToast } from '@/components/Toast';
import {
  createReview, supabase, searchSeltzers, uploadReviewImage,
  getSharedTierLists, createSharedTierListSuggestion, findOrCreateSeltzer,
  addSharedTierListItem, getRecentImagesForSeltzer, findSimilarSeltzers,
  findSeltzerByBarcode, attachBarcodeToSeltzer,
} from '@/lib/supabase';
import { scanBarcodeNative, looksLikeBarcode } from '@/lib/barcode';
import { AuthUser, SharedTierList, Seltzer } from '@/types';

const DEFAULT_BRANDS = [
  'AHA', 'Bubly', 'Canada Dry', "Hal's New York", 'Kirkland Signature',
  'LaCroix', 'Liquid Death', 'Nixie', 'Perrier', 'Polar', 'Rambler',
  'San Pellegrino', 'Sanzo', 'Schweppes', 'Spindrift', 'Topo Chico',
  'Truly', 'Waterloo', 'White Claw',
];

export default function CreateReview() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  // ── canonical drink picker state ──
  const [allSeltzers, setAllSeltzers] = useState<Seltzer[]>([]);
  const [drinkQuery, setDrinkQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<Seltzer[]>([]);
  const [searching, setSearching]     = useState(false);
  const [pickedSeltzer, setPickedSeltzer] = useState<Seltzer | null>(null);
  const [pickerOpen, setPickerOpen]   = useState(false);

  // adding-new-drink mini-form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBrand, setNewBrand]       = useState('');
  const [newName, setNewName]         = useState('');
  // near-duplicate suggestions while adding a new drink ("Did you mean…?")
  const [similarDrinks, setSimilarDrinks] = useState<Seltzer[]>([]);
  // barcode scanning: web fallback modal visibility + a scanned UPC waiting to
  // be attached to a newly created drink.
  const [showScanner, setShowScanner] = useState(false);
  const [scannedUpc, setScannedUpc] = useState<string | null>(null);

  // brands collected from existing seltzers + defaults
  const [availableBrands, setAvailableBrands] = useState<string[]>(DEFAULT_BRANDS);
  const [brandQuery, setBrandQuery]   = useState('');
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const brandWrapRef = useRef<HTMLDivElement>(null);

  // ── review fields ──
  const [title, setTitle]       = useState('');
  const [rating, setRating]     = useState(3.0);
  const [content, setContent]   = useState('');
  const [reviewImage, setReviewImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  // when the user clicks a previous reviewer's photo, we stash the URL here
  // so submission uses it directly without re-uploading.
  const [copiedImageUrl, setCopiedImageUrl] = useState<string | null>(null);
  const [prevImages, setPrevImages] = useState<Array<{ id: string; image_url: string; user?: { username: string } | null }>>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // post-submit prompt
  const [createdReview, setCreatedReview] = useState<{
    id: string; title: string; seltzer_name: string; brand: string; rating: number;
    image_url: string; seltzer_id: string | null;
  } | null>(null);
  const [myTierLists, setMyTierLists] = useState<SharedTierList[]>([]);
  const [suggestingListId, setSuggestingListId] = useState<string | null>(null);

  useEffect(() => { checkAuth(); loadSeltzers(); }, []);

  useEffect(() => {
    if (reviewImage) {
      const url = URL.createObjectURL(reviewImage);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    // fall back to copied image (from a previous reviewer) → canonical seltzer image → empty
    if (copiedImageUrl) { setImagePreviewUrl(copiedImageUrl); return; }
    setImagePreviewUrl(pickedSeltzer?.image_url || '');
  }, [reviewImage, pickedSeltzer, copiedImageUrl]);

  // When the user picks a different drink, clear any image they copied from a
  // previous review of the OLD drink, and load this drink's prior images.
  useEffect(() => {
    setCopiedImageUrl(null);
    setPrevImages([]);
    if (!pickedSeltzer?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await getRecentImagesForSeltzer(pickedSeltzer.id);
      if (cancelled) return;
      // skip the canonical image_url itself — it's already shown via the preview
      setPrevImages((data || []).filter(d => d.image_url !== pickedSeltzer.image_url));
    })();
    return () => { cancelled = true; };
  }, [pickedSeltzer]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brandWrapRef.current && !brandWrapRef.current.contains(e.target as Node)) {
        setBrandMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadSeltzers() {
    const { data } = await searchSeltzers('');
    if (!data) return;
    setAllSeltzers(data as Seltzer[]);
    const brandsFromDb = (data as Seltzer[]).map((s) => s.brand).filter(Boolean);
    const merged = Array.from(new Set([...DEFAULT_BRANDS, ...brandsFromDb])).sort((a, b) => a.localeCompare(b));
    setAvailableBrands(merged);
  }

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/auth/login'); return; }
    setUser({ id: data.session.user.id, email: data.session.user.email || '' });
  }

  // ─── drink picker ────────────────────────────────────────────
  // Debounced server-side search: query the whole catalog (not just the
  // ~20 preloaded rows) so existing drinks always surface and reviewers
  // stop creating duplicates.
  useEffect(() => {
    const q = drinkQuery.trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await searchSeltzers(q);
      if (cancelled) return;
      setSearchResults((data || []) as Seltzer[]);
      setSearching(false);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [drinkQuery]);

  const filteredDrinks = useMemo(() => {
    const q = drinkQuery.trim();
    if (!q) return allSeltzers.slice(0, 12);
    return searchResults.slice(0, 12);
  }, [allSeltzers, searchResults, drinkQuery]);

  // ─── near-duplicate guard (new-drink form) ───────────────────
  // While the reviewer fills in a brand-new drink, look for existing
  // canonical drinks that look like the same thing and offer them up.
  useEffect(() => {
    if (!showNewForm) { setSimilarDrinks([]); return; }
    const brand = (newBrand || brandQuery).trim();
    const name  = newName.trim();
    if (!name) { setSimilarDrinks([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await findSimilarSeltzers(brand, name);
      if (cancelled) return;
      setSimilarDrinks((data || []) as Seltzer[]);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [showNewForm, newBrand, brandQuery, newName]);

  function selectSeltzer(s: Seltzer) {
    setPickedSeltzer(s);
    setDrinkQuery('');
    setPickerOpen(false);
    setShowNewForm(false);
    // if the user hasn't uploaded their own image, autopopulate the preview
    // from the canonical seltzer's image_url
    if (!reviewImage && s.image_url) setImagePreviewUrl(s.image_url);
  }

  // ─── barcode scan ────────────────────────────────────────────
  // Native path scans full-screen; web path opens the in-page camera modal.
  async function handleScanClick() {
    const res = await scanBarcodeNative();
    if (res.ok) { resolveBarcode(res.value); return; }
    if (res.reason === 'unsupported') { setShowScanner(true); return; } // web fallback
    if (res.reason === 'denied') { showToast('Camera access denied', 'error', 'Allow camera to scan barcodes.'); return; }
    if (res.reason === 'error') { showToast('Could not scan', 'error'); return; }
    // 'cancelled' → do nothing
  }

  // Look the scanned code up against the catalog. Found → select it. Not found
  // → open the new-drink form and remember the code so it's saved on publish.
  async function resolveBarcode(code: string) {
    setShowScanner(false);
    const upc = code.trim();
    if (!looksLikeBarcode(upc)) { showToast("That didn't look like a barcode", 'error'); return; }
    const { data } = await findSeltzerByBarcode(upc);
    if (data) {
      selectSeltzer(data as Seltzer);
      showToast('Found it', 'success', `${(data as Seltzer).brand} · ${(data as Seltzer).name}`);
    } else {
      setScannedUpc(upc);
      startAddNew();
      showToast('New drink', 'info', 'No match for that barcode — add it and we’ll remember it.');
    }
  }

  function startAddNew() {
    setShowNewForm(true);
    setPickerOpen(false);
    // pre-fill from typed query if it looks like "Brand · Name" or just plain name
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

  // ─── brand input (for new-drink form) ────────────────────────
  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return availableBrands.slice(0, 10);
    return availableBrands.filter((b) => b.toLowerCase().includes(q)).slice(0, 10);
  }, [availableBrands, brandQuery]);

  // ─── image ───────────────────────────────────────────────────
  function handleImageChange(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024)     { setError('Choose an image under 5MB.'); return; }
    setError('');
    setReviewImage(file);
  }

  // ─── submit ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setError('Must be logged in'); return; }

    // Resolve the canonical drink first
    let seltzer = pickedSeltzer;

    if (!seltzer) {
      // user chose "add new" but never confirmed it — try to use the form
      if (showNewForm) {
        const brand = (newBrand || brandQuery).trim();
        const name  = newName.trim();
        if (!brand || !name) { setError('Brand and drink name are required.'); return; }
        setLoading(true);
        const { data: created, error: createErr } = await findOrCreateSeltzer(brand, name, user.id);
        if (createErr || !created) {
          setError(createErr?.message || 'Could not save the new drink.');
          setLoading(false);
          return;
        }
        seltzer = created as Seltzer;
        // If this drink was reached by scanning a barcode, remember it on the
        // canonical row so future scans resolve instantly.
        if (scannedUpc) { await attachBarcodeToSeltzer(created.id, scannedUpc); setScannedUpc(null); }
        setAllSeltzers((prev) => prev.some((p) => p.id === created.id) ? prev : [created as Seltzer, ...prev]);
        setPickedSeltzer(created as Seltzer);
        setShowNewForm(false);
      } else {
        setError('Pick a drink (or add a new one) before publishing.');
        return;
      }
    }

    // Determine the image URL: prefer a user-uploaded file, otherwise fall back
    // to the canonical seltzer's image_url.
    setLoading(true);
    setError('');
    let imageUrl: string;
    if (reviewImage) {
      const { url, error: uploadError } = await uploadReviewImage(user.id, reviewImage);
      if (uploadError || !url) {
        setError(uploadError?.message || 'Could not upload the can image.');
        setLoading(false);
        return;
      }
      imageUrl = url;
    } else if (copiedImageUrl) {
      imageUrl = copiedImageUrl;
    } else if (seltzer.image_url) {
      imageUrl = seltzer.image_url;
    } else {
      setError('Please upload a can image — this drink doesn’t have one yet.');
      setLoading(false);
      return;
    }

    const { data, error: dbError } = await createReview({
      user_id:      user.id,
      title:        title.trim() || null,
      seltzer_id:   seltzer.id,
      seltzer_name: seltzer.name,
      brand:        seltzer.brand,
      rating,
      content:      content || undefined,
      image_url:    imageUrl,
    });

    if (dbError) {
      const msg = dbError.message?.includes('seltzer_id')
        ? 'Run supabase_canonical_drinks.sql in Supabase first — the schema is missing the seltzer_id column.'
        : dbError.message;
      setError(msg);
      showToast('Could not publish review', 'error', msg);
      setLoading(false);
      return;
    }
    if (!data?.id) {
      const msg = 'Review saved but came back empty — please refresh and check your profile.';
      setError(msg);
      showToast('Something went wrong', 'error', msg);
      setLoading(false);
      return;
    }
    showToast('Review published 🥂', 'success', `${seltzer.brand} · ${seltzer.name}`);
    // Publishing is the most common way to unlock achievements — nudge the
    // global watcher to re-check so any new dog tag celebrates right away.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('achievements:check'));

    const { data: lists } = await getSharedTierLists(user.id);
    setLoading(false);
    if (lists && lists.length > 0) {
      setMyTierLists(lists);
      setCreatedReview({
        id: data.id,
        title: title.trim() || seltzer.name,
        seltzer_name: seltzer.name,
        brand: seltzer.brand,
        rating,
        image_url: imageUrl,
        seltzer_id: seltzer.id,
      });
    } else {
      router.push(`/review/${data.id}`);
    }
  }

  async function handleSuggestToList(listId: string) {
    if (!createdReview || !user) return;
    setSuggestingListId(listId);
    function ratingToTier(r: number) {
      if (r >= 4.5) return 'S'; if (r >= 4) return 'A'; if (r >= 3) return 'B';
      if (r >= 2) return 'C'; if (r >= 1) return 'D'; return 'F';
    }

    // The lists offered here come from `getSharedTierLists(user.id)` —
    // every entry is a list the user is a member of. Members can write
    // directly; suggestions are only for non-member subscribers, so just
    // add the drink straight in.
    const target = myTierLists.find((l) => l.id === listId);
    const isMember = !!target && (target.owner_id === user.id || target.partner_id === user.id);

    if (isMember) {
      const { error } = await addSharedTierListItem({
        list_id:      listId,
        added_by:     user.id,
        seltzer_id:   createdReview.seltzer_id,
        seltzer_name: createdReview.seltzer_name,
        brand:        createdReview.brand || undefined,
        rating:       createdReview.rating,
        tier:         ratingToTier(createdReview.rating),
        review_id:    createdReview.id,
      });
      setSuggestingListId(null);
      if (error) {
        showToast('Could not add to list', 'error', error.message);
        return;
      }
      showToast(`Added to ${target?.name ?? 'list'} 🥂`, 'success');
    } else {
      // Non-member fallback — preserves the suggestion path for subscriber-style flow
      await createSharedTierListSuggestion({
        list_id: listId,
        created_by: user.id,
        seltzer_id:   createdReview.seltzer_id,
        seltzer_name: createdReview.seltzer_name,
        brand:        createdReview.brand || undefined,
        proposed_rating: createdReview.rating,
        proposed_tier:   ratingToTier(createdReview.rating),
        review_id: createdReview.id,
      });
      setSuggestingListId(null);
      showToast('Suggestion sent', 'success', 'The list owners will see it in their inbox.');
    }

    router.push(`/review/${createdReview.id}`);
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-float">
          <Droplets size={18} className="text-white" />
        </div>
      </div>
    );
  }

  // post-submit prompt
  if (createdReview) {
    return (
      <>
        <Navigation />
        <main className="max-w-md mx-auto px-4 pt-20 pb-32">
          <div className="animate-fade-in-up space-y-5">
            <div className="glass-card text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(52,211,153,0.15)' }}>
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>Review published!</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{createdReview.title}</span>
                {createdReview.title !== createdReview.seltzer_name && (
                  <span style={{ color: 'var(--text-muted)' }}> · {createdReview.brand} · {createdReview.seltzer_name}</span>
                )}
              </p>
            </div>

            <div className="glass-card">
              <div className="flex items-center gap-2 mb-4">
                <ListPlus size={17} className="text-cyan-400" />
                <h3 className="font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  Suggest to a shared list?
                </h3>
              </div>
              <div className="space-y-2">
                {myTierLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleSuggestToList(list.id)}
                    disabled={!!suggestingListId}
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-all hover:bg-white/5"
                    style={{ border: '1px solid var(--border-subtle)', background: 'rgba(15,20,36,0.4)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{list.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        @{list.owner?.username} + @{list.partner?.username}
                      </p>
                    </div>
                    {suggestingListId === list.id
                      ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Adding...</span>
                      : <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    }
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => router.push(`/review/${createdReview.id}`)}
              className="btn-secondary w-full justify-center"
              style={{ padding: '12px' }}
            >
              Skip, go to my review
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {showScanner && (
        <BarcodeScanner onDetected={resolveBarcode} onClose={() => setShowScanner(false)} />
      )}
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-20 pb-32">
        <Link
          href="/feed"
          className="inline-flex items-center gap-2 text-sm mb-5 transition-colors hover:opacity-80"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
            Write a <span className="gradient-text">Review</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Pick the drink, give it a personal title if you want, and rate it.
          </p>
        </div>

        <div className="glass-card animate-fade-in-up">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── DRINK PICKER ─────────────────────────────── */}
            <div className="relative">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Drink <span className="text-rose-400">*</span>
              </label>

              {pickedSeltzer ? (
                /* selected pill */
                <div
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}
                >
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.12)' }}>
                    <Droplets size={16} className="text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{pickedSeltzer.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pickedSeltzer.brand}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPickedSeltzer(null); setPickerOpen(true); }}
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : showNewForm ? (
                /* mini "add new" form */
                <div className="space-y-2.5 rounded-xl p-3" style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Adding a new drink to the canonical list — everyone can find it after.</p>

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
                        style={{
                          maxHeight: '220px', padding: '4px',
                          background: 'rgba(10,14,26,0.98)',
                          border: '1px solid var(--border-medium)',
                          boxShadow: '0 18px 42px rgba(0,0,0,0.45)',
                        }}
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
                    onChange={(e) => {
                      // Auto-strip forbidden punctuation as the user types
                      // (-, +, &, en-dash, em-dash) → spaces. Keeps every
                      // canonical drink to a single spelling.
                      const cleaned = e.target.value
                        .replace(/[-+–—]/g, ' ')
                        .replace(/&/g, 'and')
                        .replace(/\s+/g, ' ');
                      setNewName(cleaned);
                    }}
                    placeholder="Drink name (e.g. Mango Lime Sparkling Water)"
                    className="input-field"
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Use plain spaces — dashes, plus signs, and "&" are auto-converted to keep the catalog tidy.
                  </p>

                  {similarDrinks.length > 0 && (
                    <div
                      className="rounded-xl p-2.5"
                      style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.35)' }}
                    >
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#fbbf24' }}>
                        Did you mean one of these? Pick it instead of adding a duplicate.
                      </p>
                      <div className="space-y-1">
                        {similarDrinks.slice(0, 4).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => selectSeltzer(s)}
                            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors text-left"
                          >
                            <CanImage src={s.image_url} alt="" className="w-7 h-9 rounded-md flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{s.brand}</p>
                            </div>
                            <Check size={13} className="text-cyan-400 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => { setShowNewForm(false); setNewBrand(''); setNewName(''); setPickerOpen(true); }}
                    className="text-xs hover:text-cyan-400 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ← Back to search
                  </button>
                </div>
              ) : (
                /* search input + dropdown */
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={drinkQuery}
                    onChange={(e) => { setDrinkQuery(e.target.value); setPickerOpen(true); }}
                    onFocus={() => setPickerOpen(true)}
                    placeholder="Search drinks…"
                    className="input-field pl-10 pr-11"
                    autoFocus
                  />
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={handleScanClick}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                    style={{ color: 'var(--cyan-400)', background: 'rgba(34,211,238,0.08)' }}
                    title="Scan barcode"
                    aria-label="Scan barcode"
                  >
                    <ScanLine size={16} />
                  </button>

                  {pickerOpen && (
                    <div
                      className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-y-auto"
                      style={{
                        maxHeight: '320px', padding: '4px',
                        background: 'rgba(10,14,26,0.98)',
                        border: '1px solid var(--border-medium)',
                        boxShadow: '0 18px 42px rgba(0,0,0,0.45)',
                      }}
                    >
                      {filteredDrinks.length === 0 && !drinkQuery.trim() ? (
                        <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          No drinks yet — add one!
                        </p>
                      ) : searching && filteredDrinks.length === 0 ? (
                        <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          Searching…
                        </p>
                      ) : filteredDrinks.length === 0 ? (
                        <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          No matches for "{drinkQuery}"
                        </p>
                      ) : (
                        filteredDrinks.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(ev) => ev.preventDefault()}
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
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={startAddNew}
                        className="w-full text-left rounded-lg px-3 py-2 mt-1 font-semibold text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                        style={{ color: 'var(--cyan-400)', borderTop: '1px solid var(--border-subtle)' }}
                      >
                        <Plus size={14} /> Add new drink{drinkQuery.trim() && `: "${drinkQuery.trim()}"`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── REVIEW TITLE (optional) ──────────────────── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Review Title <span style={{ color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· optional</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={pickedSeltzer ? `e.g. "Ultimate summer drink"` : 'Pick a drink first'}
                className="input-field"
                maxLength={80}
              />
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Free-form. Leave blank to use the drink name.
              </p>
            </div>

            {/* ── IMAGE ────────────────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Can Image <span className="text-rose-400">*</span>
              </label>
              <label
                className="block cursor-pointer rounded-xl p-4 transition-colors hover:bg-white/5"
                style={{ border: '1px dashed var(--border-strong)', background: 'rgba(15,20,36,0.5)' }}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handleImageChange(e.target.files?.[0])}
                />
                {imagePreviewUrl ? (
                  <div className="flex items-center gap-3">
                    <CanImage
                      src={imagePreviewUrl}
                      alt="Preview"
                      className="w-16 h-20 rounded-lg flex-shrink-0"
                      style={{ border: '1px solid var(--border-subtle)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{reviewImage?.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tap to replace</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setReviewImage(null); }}
                      className="btn-ghost"
                      style={{ padding: '8px' }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)' }}>
                      <Upload size={18} className="text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Upload can photo</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plain front-facing image, label readable.</p>
                    </div>
                  </div>
                )}
              </label>

              {/* Past reviewers' photos for this drink — click to copy */}
              {prevImages.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    Or use a photo from a past review:
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {prevImages.map((p) => {
                      const selected = copiedImageUrl === p.image_url && !reviewImage;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setReviewImage(null);
                            setCopiedImageUrl(p.image_url);
                          }}
                          title={p.user?.username ? `From @${p.user.username}` : 'From a past review'}
                          className="flex-shrink-0 rounded-lg overflow-hidden transition-all"
                          style={{
                            border: selected ? '2px solid #06b6d4' : '1px solid var(--border-subtle)',
                            boxShadow: selected ? '0 0 0 2px rgba(6,182,212,0.25)' : undefined,
                          }}
                        >
                          <CanImage
                            src={p.image_url}
                            alt="Past review"
                            className="w-14 h-16"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── RATING ───────────────────────────────────── */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid var(--border-subtle)' }}>
              <RatingInput value={rating} onChange={setRating} />
            </div>

            {/* ── REVIEW BODY ──────────────────────────────── */}
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Your Review
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What did you think? How's the fizz? The flavor?"
                rows={4}
                className="input-field resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
              style={{ padding: '14px', fontSize: '14px' }}
            >
              {loading ? 'Publishing...' : <><Check size={14} /> Publish Review</>}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
