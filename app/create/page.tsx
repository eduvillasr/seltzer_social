// app/create/page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Droplets, Search, Check, Plus, Upload, X } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { RatingInput } from '@/components/RatingInput';
import { createReview, supabase, searchSeltzers, uploadReviewImage } from '@/lib/supabase';
import { AuthUser } from '@/types';

interface Seltzer {
  id: string;
  name: string;
  brand: string;
  image_url: string | null;
}

const DEFAULT_BRANDS = [
  'AHA',
  'Bubly',
  'Canada Dry',
  'Hal\'s New York',
  'Kirkland Signature',
  'LaCroix',
  'Liquid Death',
  'Nixie',
  'Perrier',
  'Polar',
  'Rambler',
  'San Pellegrino',
  'Sanzo',
  'Schweppes',
  'Spindrift',
  'Topo Chico',
  'Truly',
  'Waterloo',
  'White Claw',
];

export default function CreateReview() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  const [availableBrands, setAvailableBrands] = useState<string[]>(DEFAULT_BRANDS);
  const [brandQuery, setBrandQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const [drinkName, setDrinkName] = useState('');
  const [reviewImage, setReviewImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  // Review state
  const [rating, setRating] = useState(3.0);
  const [content, setContent] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { checkAuth(); loadSeltzers(); }, []);

  useEffect(() => {
    if (!reviewImage) {
      setImagePreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(reviewImage);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [reviewImage]);

  async function loadSeltzers() {
    const { data } = await searchSeltzers('');
    if (!data) return;
    const brandsFromDatabase = data
      .map((s: Seltzer) => s.brand)
      .filter(Boolean);
    const uniqueBrands = Array.from(new Set([...DEFAULT_BRANDS, ...brandsFromDatabase]))
      .sort((a, b) => a.localeCompare(b));
    setAvailableBrands(uniqueBrands);
  }

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/auth/login'); return; }
    setUser({ id: data.session.user.id, email: data.session.user.email || '' });
  }

  function selectBrand(brand: string) {
    setSelectedBrand(brand);
    setBrandQuery(brand);
    setIsBrandMenuOpen(false);
  }

  function addCustomBrand() {
    const customBrand = brandQuery.trim();
    if (!customBrand) return;
    setAvailableBrands((brands) => (
      brands.some((brand) => brand.toLowerCase() === customBrand.toLowerCase())
        ? brands
        : [...brands, customBrand].sort((a, b) => a.localeCompare(b))
    ));
    selectBrand(customBrand);
  }

  function handleImageChange(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Upload an image file of the can.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image under 5MB. The app will shrink it into a small feed thumbnail.');
      return;
    }
    setError('');
    setReviewImage(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setError('Must be logged in'); return; }

    const name = drinkName.trim();
    const brand = selectedBrand || brandQuery.trim();

    if (!brand) { setError('Choose a brand or add it if it is missing.'); return; }
    if (!name) { setError('Specific drink name is required.'); return; }
    if (!reviewImage) { setError('Please upload a plain can image before publishing.'); return; }

    setLoading(true);
    setError('');

    const { url: imageUrl, error: uploadError } = await uploadReviewImage(user.id, reviewImage);
    if (uploadError || !imageUrl) {
      setError(uploadError?.message || 'Could not upload the can image.');
      setLoading(false);
      return;
    }

    const { data, error: dbError } = await createReview({
      user_id: user.id,
      seltzer_name: name,
      brand,
      rating,
      content: content || undefined,
      image_url: imageUrl,
    });

    if (dbError) { setError(dbError.message); setLoading(false); return; }
    router.push(`/review/${data.id}`);
  }

  const filteredBrands = useMemo(() => {
    const query = brandQuery.trim().toLowerCase();
    if (!query) return [];
    return availableBrands
      .filter((brand) => brand.toLowerCase().startsWith(query))
      .slice(0, 10);
  }, [availableBrands, brandQuery]);

  const canAddBrand = brandQuery.trim().length > 0 &&
    !availableBrands.some((brand) => brand.toLowerCase() === brandQuery.trim().toLowerCase());

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center animate-float">
          <Droplets size={18} className="text-white" />
        </div>
      </div>
    );
  }

  return (
    <>
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
            Choose the brand, name the drink, and upload a clean can photo.
          </p>
        </div>

        <div className="glass-card animate-fade-in-up">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Brand <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Search
                    size={16}
                    style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    value={brandQuery}
                    onFocus={() => setIsBrandMenuOpen(true)}
                    onChange={(e) => {
                      setBrandQuery(e.target.value);
                      setSelectedBrand('');
                      setIsBrandMenuOpen(true);
                    }}
                    placeholder="Search or add a brand..."
                    className="input-field"
                    style={{ paddingLeft: '42px' }}
                    autoFocus
                  />
                </div>

                {isBrandMenuOpen && brandQuery.trim().length > 0 && (
                  <div
                    className="animate-slide-down"
                    style={{
                      position: 'absolute',
                      zIndex: 20,
                      left: 0,
                      right: 0,
                      top: 'calc(100% + 8px)',
                      maxHeight: '260px',
                      overflowY: 'auto',
                      padding: '6px',
                      borderRadius: '14px',
                      background: 'rgba(10,14,26,0.98)',
                      border: '1px solid var(--border-medium)',
                      boxShadow: '0 18px 42px rgba(0,0,0,0.45)',
                    }}
                  >
                    {filteredBrands.map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectBrand(brand)}
                        className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span className="truncate">{brand}</span>
                        {brand === selectedBrand && <Check size={14} className="text-cyan-400" />}
                      </button>
                    ))}

                    {filteredBrands.length === 0 && canAddBrand && (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={addCustomBrand}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/5"
                        style={{ color: 'var(--cyan-400)' }}
                      >
                        <Plus size={14} /> Add "{brandQuery.trim()}"
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Specific Drink <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={drinkName}
                  onChange={(e) => setDrinkName(e.target.value)}
                  onFocus={() => setIsBrandMenuOpen(false)}
                  placeholder="Flavor - Variety, e.g. Yuzu - Sparkling Water"
                  className="input-field"
                />
                <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  Keep the brand separate. Use a consistent drink format like "Flavor - Variety".
                </p>
              </div>

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
                      <img
                        src={imagePreviewUrl}
                        alt="Uploaded can preview"
                        className="w-16 h-20 rounded-lg object-cover"
                        style={{ border: '1px solid var(--border-subtle)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{reviewImage?.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Tap to replace this image</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setReviewImage(null);
                        }}
                        className="btn-ghost"
                        style={{ padding: '8px' }}
                        aria-label="Remove uploaded image"
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
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plain front-facing image, text and artwork visible.</p>
                      </div>
                    </div>
                  )}
                </label>
                <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.16)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--amber-400)' }}>Upload guidelines</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Use a plain image of the seltzer can. The brand text, flavor text, and can artwork should be readable. Avoid fruit-only photos, lifestyle shots, busy shelves, heavy crop, blur, or hidden labels.
                  </p>
                </div>
              </div>
            </div>

              {/* Rating */}
              <div
                className="rounded-xl p-3"
                style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid var(--border-subtle)' }}
              >
                <RatingInput value={rating} onChange={setRating} />
              </div>

              {/* Review text */}
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
