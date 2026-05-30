import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function prepareSmallImage(file: File, options: { maxBytes: number; maxSize: number; quality: number }): Promise<File> {
  if (file.size <= options.maxBytes && file.type !== 'image/gif') return file;

  const image = document.createElement('img');
  const objectUrl = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = objectUrl;
  });

  const scale = Math.min(1, options.maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not resize image.');
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(objectUrl);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', options.quality));
  if (!blob) throw new Error('Could not compress image.');
  if (blob.size > options.maxBytes) throw new Error(`Image is still too large after compression. Use an image under ${Math.round(options.maxBytes / 1024)}KB.`);

  return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export async function getUser(userId: string) {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  return { data, error };
}

/**
 * Returns the user's profile row if one exists. NEVER auto-generates a username.
 * Callers that get back `{ data: null }` should route the user to /auth/choose-username
 * so they can pick their own.
 */
export async function ensureUserProfile(authUser: { id: string }) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  return { data, error };
}

// ── Username helpers ─────────────────────────────────────────────────
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'system', 'support', 'help', 'auth', 'login', 'signup',
  'logout', 'api', 'feed', 'profile', 'inbox', 'search', 'create', 'shared',
  'review', 'reviews', 'compare', 'onboarding', 'settings', 'seltzer',
]);

export function validateUsername(input: string): { ok: true } | { ok: false; reason: string } {
  const u = input.trim();
  if (u.length < 3) return { ok: false, reason: 'At least 3 characters' };
  if (u.length > 20) return { ok: false, reason: 'Up to 20 characters' };
  if (!USERNAME_RE.test(u)) return { ok: false, reason: 'Letters, numbers, underscores. Must start with a letter.' };
  if (RESERVED_USERNAMES.has(u.toLowerCase())) return { ok: false, reason: 'That one\'s reserved' };
  return { ok: true };
}

/**
 * Returns true when the username is free. Case-insensitive lookup.
 */
export async function isUsernameAvailable(username: string) {
  const u = username.trim();
  if (!u) return false;
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .ilike('username', u)
    .maybeSingle();
  if (error) return false;
  return !data;
}

/**
 * Claim a username for an authenticated user. Idempotent: if the row already
 * exists with the same username, returns it. Errors out on collisions.
 */
export async function claimUsername(userId: string, username: string, referredBy?: string | null) {
  const u = username.trim();
  const validation = validateUsername(u);
  if (!validation.ok) return { data: null, error: new Error(validation.reason) };

  // Re-check availability right before insert (handles races with someone else
  // claiming it between when the user typed it and when they hit submit).
  const free = await isUsernameAvailable(u);
  if (!free) {
    // If THIS user already owns it, that's fine.
    const { data: mine } = await supabase
      .from('users').select('id, username').eq('id', userId).maybeSingle();
    if (mine && mine.username.toLowerCase() === u.toLowerCase()) {
      return { data: mine, error: null };
    }
    return { data: null, error: new Error('Username already taken') };
  }

  const { data, error } = await supabase
    .from('users')
    .insert([{ id: userId, username: u, ...(referredBy ? { referred_by: referredBy } : {}) }])
    .select('*')
    .single();
  return { data, error };
}

export async function getUserByUsername(username: string) {
  const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
  return { data, error };
}

export async function updateUserProfile(userId: string, updates: any) {
  const { data, error } = await supabase.from('users').update(updates).eq('id', userId).select().single();
  return { data, error };
}

export async function searchUsers(query: string) {
  let request = supabase
    .from('users')
    .select('*')
    .order('username')
    .limit(20);

  if (query.trim()) {
    request = request.ilike('username', `%${query.trim()}%`);
  }

  const { data, error } = await request;
  return { data, error };
}

// AVATAR UPLOAD
export async function uploadAvatar(userId: string, file: File): Promise<{ url: string | null; error: any }> {
  let smallFile: File;
  try {
    smallFile = await prepareSmallImage(file, { maxBytes: 160 * 1024, maxSize: 256, quality: 0.78 });
  } catch (error) {
    return { url: null, error };
  }

  const fileExt = smallFile.name.split('.').pop();
  const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

  const primaryBucket = 'avatars';
  const fallbackBucket = 'review-images';

  let bucket = primaryBucket;
  let { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, smallFile, { cacheControl: '3600', upsert: true });

  if (error?.message?.toLowerCase().includes('bucket not found')) {
    bucket = fallbackBucket;
    const fallback = await supabase.storage
      .from(bucket)
      .upload(`avatars/${fileName}`, smallFile, { cacheControl: '3600', upsert: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return { url: null, error };
  if (!data) return { url: null, error: new Error('Upload did not return a storage path.') };

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  // Persist to the profile. This column is the single source of truth for the
  // avatar everywhere (nav, profile, onboarding checklist), so a failed write
  // must surface as a failure — otherwise the UI shows the photo from local
  // state while the DB stays null, and prompts like "add a profile photo" keep
  // reappearing on reload.
  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: urlData.publicUrl })
    .eq('id', userId);
  if (updateError) return { url: null, error: updateError };

  return { url: urlData.publicUrl, error: null };
}

// SELTZER DATABASE (canonical drinks)

/**
 * Returns every canonical drink for a single brand, joined with community
 * stats from the drink_stats materialized view. Used by the brand hub page.
 *
 * Brand match is case-insensitive — the URL passes a "pretty" brand name and
 * we want LaCroix == lacroix == LaCroix.
 */
// Stable shapes so TS doesn't union-narrow the return into something
// that includes an unindexable `{}` for the empty-result early returns.
type BrandStatsMap   = Record<string, { count: number; avg: number; image: string | null }>;
type BrandMyReviews  = Record<string, number>;
interface BrandHubResult {
  brand: string;
  drinks: any[];
  stats: BrandStatsMap;
  myReviews: BrandMyReviews;
  error: any;
}

export async function getBrandHubData(brand: string, currentUserId?: string | null): Promise<BrandHubResult> {
  // 1. Drinks belonging to this brand
  const { data: drinks, error: drinkErr } = await supabase
    .from('seltzers')
    .select('id, brand, name, image_url, image_quality_flag, created_at')
    .ilike('brand', brand)
    .order('name', { ascending: true });
  if (drinkErr || !drinks) {
    return { brand, drinks: [], stats: {} as BrandStatsMap, myReviews: {} as BrandMyReviews, error: drinkErr };
  }

  const drinkIds = (drinks as any[]).map((d) => d.id);
  if (drinkIds.length === 0) {
    return { brand, drinks: [], stats: {} as BrandStatsMap, myReviews: {} as BrandMyReviews, error: null };
  }

  // 2. Community stats per drink
  const { data: statsRows } = await supabase
    .from('drink_stats')
    .select('seltzer_id, review_count, avg_rating, latest_image_url')
    .in('seltzer_id', drinkIds);
  const stats: Record<string, { count: number; avg: number; image: string | null }> = {};
  type StatsRow = { seltzer_id: string; review_count: number; avg_rating: number; latest_image_url: string | null };
  for (const row of (statsRows || []) as StatsRow[]) {
    stats[row.seltzer_id] = {
      count: row.review_count ?? 0,
      avg: row.avg_rating ?? 0,
      image: row.latest_image_url ?? null,
    };
  }

  // 3. Current user's reviews of any of these drinks (so we can label "your rating")
  const myReviews: Record<string, number> = {};
  if (currentUserId) {
    const { data: mine } = await supabase
      .from('reviews')
      .select('seltzer_id, rating')
      .eq('user_id', currentUserId)
      .in('seltzer_id', drinkIds);
    for (const r of (mine || []) as Array<{ seltzer_id: string; rating: number }>) {
      // Keep the highest rating if user reviewed the same drink multiple times
      myReviews[r.seltzer_id] = Math.max(myReviews[r.seltzer_id] ?? 0, r.rating);
    }
  }

  return { brand: (drinks[0] as any).brand as string, drinks: drinks as any[], stats, myReviews, error: null };
}

/**
 * Returns every brand in the catalog plus rich aggregate stats:
 * drink count, community avg rating, and total reviews. Used by the
 * brands index page at /brand to let users discover brands.
 *
 * Computed entirely from drink_stats + seltzers so it's one cheap query
 * pair. Brands with zero drinks are excluded by construction.
 */
export async function getAllBrandsWithStats(): Promise<Array<{
  brand: string;
  drinkCount: number;
  reviewCount: number;
  avgRating: number;
}>> {
  // 1. All drinks with their brand
  const { data: drinks } = await supabase
    .from('seltzers')
    .select('id, brand');
  if (!drinks || drinks.length === 0) return [];

  // 2. Stats per drink from drink_stats view
  const { data: statsRows } = await supabase
    .from('drink_stats')
    .select('seltzer_id, avg_rating, review_count');
  const statsByDrink: Record<string, { avg: number; count: number }> = {};
  type StatsRow2 = { seltzer_id: string; avg_rating: number; review_count: number };
  for (const row of (statsRows || []) as StatsRow2[]) {
    statsByDrink[row.seltzer_id] = { avg: row.avg_rating ?? 0, count: row.review_count ?? 0 };
  }

  // 3. Aggregate per brand
  const agg: Record<string, { drinkCount: number; reviewCount: number; weightedSum: number; weightedCount: number }> = {};
  for (const d of drinks as Array<{ id: string; brand: string | null }>) {
    const brand = (d.brand ?? '').trim();
    if (!brand) continue;
    const s = statsByDrink[d.id];
    if (!agg[brand]) agg[brand] = { drinkCount: 0, reviewCount: 0, weightedSum: 0, weightedCount: 0 };
    agg[brand].drinkCount += 1;
    if (s && s.count > 0) {
      agg[brand].reviewCount += s.count;
      agg[brand].weightedSum += s.avg * s.count;
      agg[brand].weightedCount += s.count;
    }
  }

  return Object.entries(agg)
    .map(([brand, v]) => ({
      brand,
      drinkCount: v.drinkCount,
      reviewCount: v.reviewCount,
      avgRating: v.weightedCount > 0 ? v.weightedSum / v.weightedCount : 0,
    }))
    .sort((a, b) => b.drinkCount - a.drinkCount || a.brand.localeCompare(b.brand));
}

/**
 * Returns total drink count for every brand in the canonical catalog.
 * Used by the advanced stats page to compute % explored per brand.
 *
 * One query, grouped client-side — Postgres doesn't expose a clean
 * groupBy via the supabase-js client, so we fetch (brand) columns
 * and count in JS. For 1,000+ rows this is still O(n) and runs once
 * per stats page load — cheap.
 */
export async function getBrandCatalogTotals(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('seltzers')
    .select('brand');
  if (error || !data) return {};
  const totals: Record<string, number> = {};
  for (const row of data as Array<{ brand: string | null }>) {
    const b = (row.brand ?? '').trim();
    if (!b) continue;
    totals[b] = (totals[b] || 0) + 1;
  }
  return totals;
}

/**
 * Total canonical drink count across the whole catalog.
 * Used for "catalog completion" on the stats page.
 */
export async function getCatalogSize(): Promise<number> {
  const { count } = await supabase
    .from('seltzers')
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

/**
 * The global average rating across every review in the system.
 * Used to compute a user's "generosity vs. global" score on stats.
 * Materialized — could be cached at the edge, but for now we just hit
 * the materialized view drink_stats which already has avg per drink.
 */
export async function getGlobalAvgRating(): Promise<number> {
  // Pull from the drink_stats materialized view — it's already an avg
  // per drink, so we average the averages. Not perfectly identical to
  // a raw avg(rating) over all reviews (drinks with few reviews get
  // equal weight), but it's stable and cheap.
  const { data } = await supabase
    .from('drink_stats')
    .select('avg_rating, review_count');
  if (!data || data.length === 0) return 3.5;
  // Weight by review_count so it matches a true global mean
  let totalSum = 0;
  let totalCount = 0;
  for (const row of data as Array<{ avg_rating: number; review_count: number }>) {
    totalSum += (row.avg_rating || 0) * (row.review_count || 0);
    totalCount += row.review_count || 0;
  }
  return totalCount > 0 ? totalSum / totalCount : 3.5;
}

/**
 * Community average rating per seltzer (excluding one user), for the
 * "You vs community" stats card. Returns a map seltzer_id → { avg, count }
 * where count is the number of OTHER people who rated it.
 */
export async function getCommunityAveragesForSeltzers(
  seltzerIds: string[],
  excludeUserId?: string,
): Promise<Record<string, { avg: number; count: number }>> {
  const ids = Array.from(new Set(seltzerIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from('reviews')
    .select('seltzer_id, rating, user_id')
    .in('seltzer_id', ids);
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const r of (data || []) as Array<{ seltzer_id: string | null; rating: number; user_id: string }>) {
    if (!r.seltzer_id) continue;
    if (excludeUserId && r.user_id === excludeUserId) continue;
    if (!acc[r.seltzer_id]) acc[r.seltzer_id] = { sum: 0, count: 0 };
    acc[r.seltzer_id].sum += r.rating;
    acc[r.seltzer_id].count++;
  }
  const out: Record<string, { avg: number; count: number }> = {};
  for (const [id, v] of Object.entries(acc)) out[id] = { avg: v.sum / v.count, count: v.count };
  return out;
}

export async function searchSeltzers(query: string) {
  if (!query || query.length < 1) {
    const { data, error } = await supabase.from('seltzers').select('*').order('brand').limit(20);
    return { data, error };
  }
  const { data, error } = await supabase
    .from('seltzers')
    .select('*')
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
    .limit(20);
  return { data, error };
}

/**
 * Returns up to `limit` distinct image URLs from past reviews of the given
 * canonical seltzer, newest first. Used by /create to let the reviewer
 * "copy" a previous reviewer's photo instead of uploading a new one.
 */
export async function getRecentImagesForSeltzer(seltzerId: string, limit: number = 12) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, image_url, created_at, user:users!reviews_user_id_fkey(id, username)')
    .eq('seltzer_id', seltzerId)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 2); // overfetch — we'll dedupe URLs
  if (error) return { data: [] as Array<{ id: string; image_url: string; user?: { id: string; username: string } | null }>, error };
  const seen = new Set<string>();
  const out: Array<{ id: string; image_url: string; user?: { id: string; username: string } | null }> = [];
  for (const r of (data || []) as any[]) {
    if (!r.image_url || seen.has(r.image_url)) continue;
    seen.add(r.image_url);
    out.push({ id: r.id, image_url: r.image_url, user: r.user || null });
    if (out.length >= limit) break;
  }
  return { data: out, error: null };
}

/**
 * Returns canonical drinks that look like near-duplicates of (brand, name),
 * ranked by flavor-name token overlap. Used by /create to surface a
 * "Did you mean…?" suggestion before a reviewer adds a brand-new drink —
 * catching cases like adding "1877 by HEB · Original" when "1877 · Original"
 * already exists. Empty result means no close match.
 */
export async function findSimilarSeltzers(brand: string, name: string) {
  const { standardizeName, nameTokens } = await import('./normalizeName');
  const cleanName = standardizeName(brand, name);
  if (!cleanName) return { data: [] as any[], error: null };
  const want = nameTokens(cleanName);
  if (want.length === 0) return { data: [] as any[], error: null };
  // Probe the DB with the longest token to keep the candidate set small,
  // then rank client-side by token-set overlap.
  const probe = [...want].sort((a, b) => b.length - a.length)[0];
  const { data, error } = await supabase
    .from('seltzers')
    .select('id, brand, name, image_url')
    .ilike('name', `%${probe}%`)
    .limit(40);
  if (error) return { data: [] as any[], error };
  const wantSet = new Set(want);
  const scored = (data || [])
    .map((s: any) => {
      const have = new Set(nameTokens(String(s.name || '')));
      let overlap = 0;
      wantSet.forEach((t) => { if (have.has(t)) overlap += 1; });
      const denom = Math.max(wantSet.size, have.size, 1);
      return { s, score: overlap / denom };
    })
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  return { data: scored.map((x) => x.s) as any[], error: null };
}

/**
 * Find a seltzer by case-insensitive (brand, name) or create a new one.
 * Returns the canonical row so callers can use seltzer_id.
 */
export async function findOrCreateSeltzer(brand: string, name: string, createdBy?: string) {
  // Always normalize through the shared canonical-form rules so we don't
  // create "AHA Lime + Watermelon" alongside "AHA Lime Watermelon", etc.
  // standardizeName additionally strips a leading brand repeat in the name
  // and ®/™ glyphs. (See lib/normalizeName.ts for the rules.)
  const { normalizeBrand, standardizeName } = await import('./normalizeName');
  const cleanBrand = normalizeBrand(brand);
  const cleanName  = standardizeName(brand, name);
  if (!cleanBrand || !cleanName) return { data: null, error: new Error('Brand and name required') };

  // Look up existing
  const { data: found } = await supabase
    .from('seltzers')
    .select('*')
    .ilike('brand', cleanBrand)
    .ilike('name', cleanName)
    .maybeSingle();
  if (found) return { data: found, error: null };

  // Insert new — uniqueness index guards against races
  const insertRow: any = { brand: cleanBrand, name: cleanName };
  if (createdBy) insertRow.created_by = createdBy;
  const { data: inserted, error: insertError } = await supabase
    .from('seltzers')
    .insert([insertRow])
    .select('*')
    .single();

  // Race recovery: if a parallel insert won, just fetch
  if (insertError) {
    const { data: retry } = await supabase
      .from('seltzers')
      .select('*')
      .ilike('brand', cleanBrand)
      .ilike('name', cleanName)
      .maybeSingle();
    if (retry) return { data: retry, error: null };
    return { data: null, error: insertError };
  }
  return { data: inserted, error: null };
}

export async function createReview(review: {
  user_id: string;
  title?: string | null;
  seltzer_id?: string | null;
  seltzer_name: string;
  brand?: string;
  rating: number;
  content?: string;
  image_url?: string;
}) {
  const payload = {
    ...review,
    title: review.title?.trim() || null,
  };
  const { data, error } = await supabase.from('reviews').insert([payload]).select('*').single();
  if (!error && data && payload.content) {
    notifyMentions(payload.user_id, payload.content, { kind: 'review', id: data.id, link: `/review/${data.id}` });
  }
  return { data, error };
}

export async function getReview(id: string) {
  const { data, error } = await supabase.from('reviews').select('*, user:users(*), seltzer:seltzers(*)').eq('id', id).single();
  return { data, error };
}

export async function getReviews(limit: number = 20, offset: number = 0) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, user:users(*), seltzer:seltzers(*)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return { data, error };
}

// ─── ACHIEVEMENTS — stats fetch + showcase save ───────────────────
import type { AchievementStats } from './achievements';

/**
 * Pull every metric the achievement engine cares about for a user.
 * Single profile load — runs all the count queries in parallel.
 */
export async function getAchievementStats(userId: string, isFounder: boolean, isBetaTester: boolean = false): Promise<AchievementStats> {
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [reviews, follows] = await Promise.all([
    supabase.from('reviews')
      .select('id, rating, brand, created_at')
      .eq('user_id', userId),
    supabase.from('follows')
      .select('follower_id, following_id', { count: 'exact' })
      .or(`follower_id.eq.${userId},following_id.eq.${userId}`),
  ]);

  const reviewRows = (reviews.data || []) as { id: string; rating: number; brand: string | null; created_at: string }[];
  const reviewIds = reviewRows.map((r) => r.id);

  // Aggregate stats from review list
  const reviewCount = reviewRows.length;
  const uniqueBrands = new Set(reviewRows.map((r) => (r.brand ?? '').trim().toLowerCase()).filter(Boolean)).size;
  const avgRating = reviewCount === 0 ? 0 : reviewRows.reduce((s, r) => s + r.rating, 0) / reviewCount;
  const lowRatingCount = reviewRows.filter((r) => r.rating <= 2.0).length;
  const highRatingCount = reviewRows.filter((r) => r.rating >= 4.0).length;
  const hasFiveStarReview = reviewRows.some((r) => r.rating >= 5);
  const hasFreshReview = reviewRows.some((r) => r.created_at >= since7d);

  // Engagement totals on the user's reviews
  let totalLikesReceived = 0;
  let totalCommentsReceived = 0;
  let totalTriedItReceived = 0;
  if (reviewIds.length > 0) {
    const [likes, comments, triedIts] = await Promise.all([
      supabase.from('likes').select('id', { count: 'exact', head: true }).in('review_id', reviewIds),
      supabase.from('comments').select('id', { count: 'exact', head: true }).in('review_id', reviewIds),
      supabase.from('tried_it').select('id', { count: 'exact', head: true }).in('review_id', reviewIds),
    ]);
    totalLikesReceived = likes.count ?? 0;
    totalCommentsReceived = comments.count ?? 0;
    totalTriedItReceived = triedIts.count ?? 0;
  }

  // Followers / following counts
  let followers = 0, following = 0;
  for (const row of (follows.data || [])) {
    if ((row as any).following_id === userId) followers++;
    if ((row as any).follower_id === userId) following++;
  }

  // Tier lists this user owns or co-owns. We fetch the ids (not just a count)
  // so we can also tally subscribers across those lists below.
  const { data: ownedLists } = await supabase
    .from('shared_tier_lists')
    .select('id')
    .or(`owner_id.eq.${userId},partner_id.eq.${userId}`);
  const ownedListIds = (ownedLists || []).map((l: any) => l.id);
  const tierListsAsMember = ownedListIds.length;

  // ── Community engagement around shared tier lists ──
  // Tier lists have no "likes", so subscribers (people who follow your
  // rankings) are the equivalent signal; plus approved suggestions and votes
  // cast measure genuine participation in others' lists.
  let tierListSubscribers = 0;
  if (ownedListIds.length > 0) {
    const { count } = await supabase
      .from('shared_tier_list_subscriptions')
      .select('list_id', { count: 'exact', head: true })
      .in('list_id', ownedListIds);
    tierListSubscribers = count ?? 0;
  }

  const [{ count: approvedSuggestions }, { count: tierListVotesCast }, { count: referralsMade }] = await Promise.all([
    supabase.from('shared_tier_list_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId).eq('status', 'approved'),
    supabase.from('shared_tier_list_votes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    // Users who signed up via this user's referral link.
    supabase.from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', userId),
  ]);

  return {
    reviewCount,
    uniqueBrands,
    avgRating,
    lowRatingCount,
    highRatingCount,
    totalLikesReceived,
    totalCommentsReceived,
    totalTriedItReceived,
    followers,
    following,
    tierListsAsMember,
    tierListSubscribers,
    approvedSuggestions: approvedSuggestions ?? 0,
    tierListVotesCast: tierListVotesCast ?? 0,
    referralsMade: referralsMade ?? 0,
    hasFiveStarReview,
    hasFreshReview,
    isFounder,
    isBetaTester,
  };
}

/** Single batched query returning the user's onboarding-checklist state.
 *  Used by <GettingStarted /> on the feed. Returns booleans for each
 *  of the five "do this to get started" items, plus a top-level
 *  dismissed flag so the card can hide itself permanently.
 */
/**
 * Look for an already-uploaded avatar in storage when users.avatar_url is null,
 * and heal the column if one is found. Covers photos uploaded before the
 * uploadAvatar DB-write fix (or whenever that write silently failed). Returns
 * the public URL if an avatar exists, else null. Best-effort: never throws.
 */
async function findAndHealAvatar(userId: string): Promise<string | null> {
  // Avatars live at `${userId}/avatar-*` in the `avatars` bucket, or
  // `avatars/${userId}/avatar-*` in the `review-images` fallback bucket.
  const candidates: Array<{ bucket: string; prefix: string }> = [
    { bucket: 'avatars', prefix: userId },
    { bucket: 'review-images', prefix: `avatars/${userId}` },
  ];

  for (const { bucket, prefix } of candidates) {
    try {
      const { data: files, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 100 });
      if (error || !files?.length) continue;

      // Newest avatar file wins (names embed a timestamp, but sort to be safe).
      const avatarFiles = files
        .filter((f) => f.name.startsWith('avatar-'))
        .sort((a, b) => b.name.localeCompare(a.name));
      if (!avatarFiles.length) continue;

      const path = `${prefix}/${avatarFiles[0].name}`;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) continue;

      // Heal the column so every surface (nav, profile, checklist) agrees.
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId);
      return publicUrl;
    } catch {
      // Ignore and try the next bucket — detection must never break the checklist.
    }
  }
  return null;
}

export async function getOnboardingChecklist(userId: string): Promise<{
  username: string;
  hasAvatar: boolean;
  follows3Plus: boolean;
  hasReview: boolean;
  hasTierList: boolean;
  hasTriedIt: boolean;
  completed: number;
  total: number;
  dismissed: boolean;
}> {
  // Six small reads in parallel — none touch large tables.
  const [
    { data: profile },
    { count: followCount },
    { count: reviewCount },
    { count: ownLists },
    { count: subscribedLists },
    { count: triedCount },
  ] = await Promise.all([
    supabase.from('users').select('username, avatar_url, onboarding_dismissed').eq('id', userId).maybeSingle(),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('follower_id', userId),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('shared_tier_lists').select('id', { count: 'exact', head: true })
      .or(`owner_id.eq.${userId},partner_id.eq.${userId}`),
    supabase.from('shared_tier_list_subscriptions').select('list_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('tried_it').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const username     = (profile as any)?.username ?? '';
  // The avatar_url column is normally the source of truth, but an old upload
  // (or one whose DB write silently failed before the uploadAvatar fix) can
  // leave it null while the photo still sits in storage. Rather than nag a
  // user who clearly already has a photo, fall back to the storage bucket and
  // self-heal the column so it's correct everywhere from then on.
  let hasAvatar = !!(profile as any)?.avatar_url;
  if (!hasAvatar) {
    const healedUrl = await findAndHealAvatar(userId);
    if (healedUrl) hasAvatar = true;
  }
  const follows3Plus = (followCount ?? 0) >= 3;
  const hasReview    = (reviewCount ?? 0) > 0;
  const hasTierList  = ((ownLists ?? 0) + (subscribedLists ?? 0)) > 0;
  const hasTriedIt   = (triedCount ?? 0) > 0;
  const dismissed    = !!(profile as any)?.onboarding_dismissed;

  const flags = [hasAvatar, follows3Plus, hasReview, hasTierList, hasTriedIt];
  const completed = flags.filter(Boolean).length;

  return { username, hasAvatar, follows3Plus, hasReview, hasTierList, hasTriedIt, completed, total: flags.length, dismissed };
}

/** Flip users.onboarding_dismissed = true so the checklist card hides for good. */
export async function dismissOnboardingChecklist(userId: string) {
  const { error } = await supabase
    .from('users')
    .update({ onboarding_dismissed: true })
    .eq('id', userId);
  return { error };
}

/** Save the user's pinned achievement IDs. Caps at 3 entries. */
export async function setShowcaseAchievements(userId: string, ids: string[]) {
  const trimmed = ids.slice(0, 3);
  const { data, error } = await supabase
    .from('users')
    .update({ showcase_achievements: trimmed })
    .eq('id', userId)
    .select('*')
    .single();
  return { data, error };
}

/**
 * Persist a user's showroom arrangement. Shape:
 *   { podiums: { [slotId]: trophyId }, wall: { [frameId]: achievementId } }
 * Stored as jsonb on users.showroom_layout (see supabase_showroom_layout.sql).
 * Returns the update error (or null).
 */
export async function setShowroomLayout(userId: string, layout: Record<string, any>) {
  const { error } = await supabase
    .from('users')
    .update({ showroom_layout: layout })
    .eq('id', userId);
  return { error };
}

// ─── DISCOVER / TRENDING ─────────────────────────────────────────
// All client-side aggregation — small dataset for beta, no need for a view yet.

export interface TrendingDrink {
  seltzer_id: string;
  seltzer_name: string;
  brand: string | null;
  reviewCount: number;
  avgRating: number;
  latestImage: string | null;
}

/**
 * Most-reviewed canonical drinks within the time window. Uses client-side
 * aggregation — fine until we hit ~thousands of reviews; then we'd
 * materialize a view.
 */
/**
 * Suggested users for the empty-feed discovery rail.
 * Prioritizes users with the most followers, excluding the current user
 * and anyone they already follow.
 */
export async function getSuggestedUsersToFollow(currentUserId: string | null, limit: number = 6) {
  // Pull a candidate set — recent active users with at least one review
  const { data: candidates } = await supabase
    .from('users')
    .select('id, username, avatar_url, bio, created_at')
    .neq('id', currentUserId ?? '00000000-0000-0000-0000-000000000000')
    .order('created_at', { ascending: false })
    .limit(80);
  if (!candidates || candidates.length === 0) return [];

  const candidateIds = candidates.map((u: any) => u.id);

  // Get follower counts in one query
  const { data: followerRows } = await supabase
    .from('follows')
    .select('following_id')
    .in('following_id', candidateIds);
  const followerCounts: Record<string, number> = {};
  for (const row of (followerRows || []) as Array<{ following_id: string }>) {
    followerCounts[row.following_id] = (followerCounts[row.following_id] || 0) + 1;
  }

  // Filter out people the current user already follows
  let alreadyFollowing = new Set<string>();
  if (currentUserId) {
    const { data: myFollows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId);
    alreadyFollowing = new Set(((myFollows || []) as Array<{ following_id: string }>).map((r) => r.following_id));
  }

  // Score: 2 * follower count + 1 if they have a bio (avoids dead profiles)
  return (candidates as any[])
    .filter((u) => !alreadyFollowing.has(u.id))
    .map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      bio: u.bio,
      followerCount: followerCounts[u.id] || 0,
    }))
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, limit);
}

export async function getTrendingDrinks(daysWindow: number = 30, limit: number = 8) {
  const since = new Date(Date.now() - daysWindow * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('reviews')
    .select('seltzer_id, seltzer_name, brand, rating, image_url, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500); // cap the scan

  if (error) return { data: [] as TrendingDrink[], error };

  // Group by seltzer_id (or fallback "brand|name" for legacy reviews without seltzer_id)
  const groups = new Map<string, {
    seltzer_id: string; seltzer_name: string; brand: string | null;
    sum: number; count: number; latestImage: string | null;
  }>();
  for (const r of data || []) {
    const key = (r as any).seltzer_id || `legacy:${(r.brand ?? '').toLowerCase()}|${r.seltzer_name.toLowerCase()}`;
    const g = groups.get(key);
    if (g) {
      g.sum += r.rating;
      g.count++;
      if (!g.latestImage && r.image_url) g.latestImage = r.image_url;
    } else {
      groups.set(key, {
        seltzer_id: (r as any).seltzer_id || key,
        seltzer_name: r.seltzer_name,
        brand: r.brand,
        sum: r.rating,
        count: 1,
        latestImage: r.image_url,
      });
    }
  }

  const drinks: TrendingDrink[] = Array.from(groups.values())
    .filter((g) => g.count >= 1)
    .map((g) => ({
      seltzer_id: g.seltzer_id,
      seltzer_name: g.seltzer_name,
      brand: g.brand,
      reviewCount: g.count,
      avgRating: g.sum / g.count,
      latestImage: g.latestImage,
    }))
    .sort((a, b) => b.reviewCount - a.reviewCount || b.avgRating - a.avgRating)
    .slice(0, limit);

  return { data: drinks, error: null };
}

/** Highest-rated canonical drinks with at least N reviews. */
export async function getTopRatedDrinks(minReviews: number = 2, limit: number = 6) {
  const { data, error } = await supabase
    .from('reviews')
    .select('seltzer_id, seltzer_name, brand, rating, image_url')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return { data: [] as TrendingDrink[], error };

  const groups = new Map<string, {
    seltzer_id: string; seltzer_name: string; brand: string | null;
    sum: number; count: number; latestImage: string | null;
  }>();
  for (const r of data || []) {
    const key = (r as any).seltzer_id || `legacy:${(r.brand ?? '').toLowerCase()}|${r.seltzer_name.toLowerCase()}`;
    const g = groups.get(key);
    if (g) { g.sum += r.rating; g.count++; if (!g.latestImage && r.image_url) g.latestImage = r.image_url; }
    else groups.set(key, {
      seltzer_id: (r as any).seltzer_id || key,
      seltzer_name: r.seltzer_name,
      brand: r.brand,
      sum: r.rating,
      count: 1,
      latestImage: r.image_url,
    });
  }
  const drinks: TrendingDrink[] = Array.from(groups.values())
    .filter((g) => g.count >= minReviews)
    .map((g) => ({
      seltzer_id: g.seltzer_id,
      seltzer_name: g.seltzer_name,
      brand: g.brand,
      reviewCount: g.count,
      avgRating: g.sum / g.count,
      latestImage: g.latestImage,
    }))
    .sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount)
    .slice(0, limit);
  return { data: drinks, error: null };
}

/** Public tier lists ordered by recent activity. Pending/declined invites filtered out. */
export async function getTrendingTierLists(limit: number = 6) {
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .select('*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*)')
    .eq('is_public', true)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

/** Users with the most reviews in the recent window. */
export async function getActiveReviewers(daysWindow: number = 30, limit: number = 8) {
  const since = new Date(Date.now() - daysWindow * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('reviews')
    .select('user_id, user:users(*)')
    .gte('created_at', since)
    .limit(500);
  if (error) return { data: [], error };
  const counts = new Map<string, { user: any; count: number }>();
  for (const r of data || []) {
    if (!r.user) continue;
    const existing = counts.get(r.user_id);
    if (existing) existing.count++;
    else counts.set(r.user_id, { user: r.user, count: 1 });
  }
  const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, limit);
  return { data: sorted, error: null };
}

// SMART FEED — strictly follows + own posts. No global fallback.
// Discovery (finding new people / drinks) lives on /discover; the feed is
// "your network only" so it stays relevant.
export async function getSmartFeed(userId: string, limit: number = 50) {
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  const blocked = new Set(await getBlockedUserIds(userId));
  const followedIds = (follows?.map((f) => f.following_id) || []).filter((id) => !blocked.has(id));
  const allIds = [...followedIds, userId]; // include own posts

  const { data, error } = await supabase
    .from('reviews')
    .select('*, user:users(*), seltzer:seltzers(*)')
    .in('user_id', allIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data: data || [], error };
}

/**
 * "For You" feed: recommended reviews from people the user does NOT follow,
 * so the feed surfaces fresh voices. v1 ranking is popularity + recency —
 * recent reviews scored by likes/comments with a recency decay (half-life
 * ~7 days). No new tables; counts are aggregated client-side from a recent
 * candidate pool.
 */
export async function getForYouFeed(userId: string, limit: number = 30) {
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  const blockedIds = await getBlockedUserIds(userId);
  const excludeIds = new Set<string>([userId, ...((follows?.map((f) => f.following_id) as string[]) || []), ...blockedIds]);

  // Candidate pool: recent reviews, overfetched so ranking has something to chew on.
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidates, error } = await supabase
    .from('reviews')
    .select('*, user:users(*), seltzer:seltzers(*)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { data: [], error };

  let pool = ((candidates as any[]) || []).filter((r) => !excludeIds.has(r.user_id));

  // Fallback: low-activity apps (or brand-new users) may have nothing in the
  // last 45 days. Rather than show an empty For-You, widen to the most recent
  // reviews all-time so everyone always gets recommendations.
  if (pool.length === 0) {
    const { data: anytime } = await supabase
      .from('reviews')
      .select('*, user:users(*), seltzer:seltzers(*)')
      .order('created_at', { ascending: false })
      .limit(200);
    pool = ((anytime as any[]) || []).filter((r) => !excludeIds.has(r.user_id));
  }
  if (pool.length === 0) return { data: [], error: null };

  const ids = pool.map((r) => r.id);
  const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
    supabase.from('likes').select('review_id').in('review_id', ids),
    supabase.from('comments').select('review_id').in('review_id', ids),
  ]);
  const likeCounts: Record<string, number> = {};
  for (const row of ((likeRows || []) as { review_id: string }[])) {
    likeCounts[row.review_id] = (likeCounts[row.review_id] || 0) + 1;
  }
  const commentCounts: Record<string, number> = {};
  for (const row of ((commentRows || []) as { review_id: string }[])) {
    commentCounts[row.review_id] = (commentCounts[row.review_id] || 0) + 1;
  }

  const now = Date.now();
  const scored = pool.map((r) => {
    const likes = likeCounts[r.id] || 0;
    const comments = commentCounts[r.id] || 0;
    const ageDays = Math.max(0, (now - new Date(r.created_at).getTime()) / 86_400_000);
    const recency = Math.exp(-ageDays / 7); // 0..1, half-life ~7d
    const engagement = likes * 2 + comments * 3 + (r.rating >= 4 ? 1 : 0);
    return { review: r, score: engagement + recency * 4 };
  });
  scored.sort((a, b) => b.score - a.score);
  return { data: scored.slice(0, limit).map((s) => s.review), error: null };
}

/**
 * Returns up to N other drinks from the same brand, excluding the given
 * drink. Used by the "More from this brand" rail on /drink/[id].
 */
export async function getOtherDrinksFromBrand(brand: string, excludeId: string, limit: number = 6) {
  const { data } = await supabase
    .from('seltzers')
    .select('id, brand, name, image_url')
    .ilike('brand', brand)
    .neq('id', excludeId)
    .limit(limit + 4); // overfetch so we can pick those with stats
  if (!data || data.length === 0) return [];

  type DrinkRow = { id: string; brand: string | null; name: string; image_url: string | null };
  type StatsRow3 = { seltzer_id: string; avg_rating: number; review_count: number };
  const typedDrinks = (data as DrinkRow[]);
  const ids = typedDrinks.map((d) => d.id);
  const { data: statsRows } = await supabase
    .from('drink_stats')
    .select('seltzer_id, avg_rating, review_count')
    .in('seltzer_id', ids);
  const statsByDrink: Record<string, { avg: number; count: number }> = {};
  for (const row of (statsRows || []) as StatsRow3[]) {
    statsByDrink[row.seltzer_id] = { avg: row.avg_rating, count: row.review_count };
  }

  return typedDrinks.map((d) => ({
    id: d.id,
    brand: d.brand,
    name: d.name,
    image_url: d.image_url,
    avg: statsByDrink[d.id]?.avg ?? 0,
    count: statsByDrink[d.id]?.count ?? 0,
  }))
  .sort((a, b) => (b.count - a.count) || (b.avg - a.avg))
  .slice(0, limit);
}

export async function getUserReviews(userId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, user:users(*), seltzer:seltzers(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function deleteReview(id: string) {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  return { error };
}

export async function updateReview(
  reviewId: string,
  updates: {
    title?: string | null;
    content?: string | null;
    rating?: number;
    image_url?: string;
    /** Switch the canonical drink this review is about. */
    seltzer_id?: string | null;
    seltzer_name?: string;
    brand?: string | null;
  }
) {
  const payload: Record<string, any> = { ...updates };
  // Title trimmed-or-null normalization to match the create flow
  if ('title' in payload) {
    const t = payload.title;
    payload.title = typeof t === 'string' && t.trim() ? t.trim() : null;
  }
  if ('brand' in payload && typeof payload.brand === 'string') {
    payload.brand = payload.brand.trim() || null;
  }
  if ('seltzer_name' in payload && typeof payload.seltzer_name === 'string') {
    payload.seltzer_name = payload.seltzer_name.trim();
  }
  const { data, error } = await supabase
    .from('reviews')
    .update(payload)
    .eq('id', reviewId)
    .select('*, user:users(*), seltzer:seltzers(*)');
  if (error) return { data: null, error };
  if (!data || data.length === 0) {
    return {
      data: null,
      error: new Error('Update blocked. Run supabase_review_policies.sql to add the missing RLS policy.'),
    };
  }
  return { data: data[0], error: null };
}

/**
 * Curator action: replace the canonical image of a seltzer in the public
 * catalog. Restricted by RLS to users where users.can_curate = true (set
 * in supabase_standardize_data.sql for founders + beta testers).
 * Writes an audit row to image_curation_log.
 */
export async function replaceCanonicalSeltzerImage(
  seltzerId: string,
  userId: string,
  newUrl: string,
  reason?: string,
) {
  // fetch the existing url so we can audit it
  const { data: existing } = await supabase
    .from('seltzers')
    .select('id, image_url')
    .eq('id', seltzerId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('seltzers')
    .update({ image_url: newUrl, image_quality_flag: 'replaced' })
    .eq('id', seltzerId)
    .select('*')
    .single();
  if (error) return { data: null, error };

  // best-effort audit log; failure here doesn't block the update
  await supabase.from('image_curation_log').insert({
    seltzer_id: seltzerId,
    changed_by: userId,
    old_url: existing?.image_url || null,
    new_url: newUrl,
    reason: reason || null,
  });
  return { data, error: null };
}

/**
 * Resize + upload a curator-supplied image to the review-images bucket
 * under a `canonical/` prefix and return the public URL. Pair with
 * replaceCanonicalSeltzerImage to set it as the new canonical image.
 */
export async function uploadCanonicalSeltzerImage(
  userId: string,
  file: File,
): Promise<{ url: string | null; error: any }> {
  let smallFile: File;
  try {
    smallFile = await prepareSmallImage(file, { maxBytes: 220 * 1024, maxSize: 420, quality: 0.85 });
  } catch (error) {
    return { url: null, error };
  }
  const ext = smallFile.name.split('.').pop();
  const path = `canonical/${userId}-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from('review-images')
    .upload(path, smallFile, { cacheControl: '3600', upsert: false });
  if (error) return { url: null, error };
  const { data: urlData } = supabase.storage.from('review-images').getPublicUrl(data.path);
  return { url: urlData.publicUrl, error: null };
}

/**
 * Returns the list of canonical drinks for the curator queue, ordered
 * by brand/name. Used by /curator/queue.
 *
 * scope='needs_review' (default) returns only drinks flagged as low
 * quality; scope='all' returns the whole catalog so a curator can
 * improve any image, not just flagged ones.
 */
export async function getSeltzersNeedingReview(
  limit = 200,
  scope: 'needs_review' | 'all' = 'needs_review',
) {
  let query = supabase
    .from('seltzers')
    .select('id, brand, name, image_url, image_quality_flag, created_at');
  if (scope === 'needs_review') {
    query = query.eq('image_quality_flag', 'needs_review');
  }
  const { data, error } = await query
    .order('brand', { ascending: true })
    .order('name', { ascending: true })
    .limit(limit);
  return { data: (data || []) as any[], error };
}

/**
 * Boolean check: is the current user permitted to curate (i.e. can they
 * see the curator UI / call the curator endpoints)?
 */
export async function getMyCuratorStatus(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('can_curate')
    .eq('id', userId)
    .maybeSingle();
  return !!data?.can_curate;
}

export async function uploadReviewImage(userId: string, file: File): Promise<{ url: string | null; error: any }> {
  let smallFile: File;
  try {
    smallFile = await prepareSmallImage(file, { maxBytes: 220 * 1024, maxSize: 420, quality: 0.78 });
  } catch (error) {
    return { url: null, error };
  }

  const fileExt = smallFile.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;
  const { data, error } = await supabase.storage.from('review-images').upload(fileName, smallFile, { cacheControl: '3600', upsert: false });
  if (error) return { url: null, error };
  const { data: urlData } = supabase.storage.from('review-images').getPublicUrl(data.path);
  return { url: urlData.publicUrl, error: null };
}

// LIKES
export async function createLike(userId: string, reviewId: string) {
  const { data, error } = await supabase.from('likes').insert([{ user_id: userId, review_id: reviewId }]).select().single();
  if (!error) notifyOnLike(userId, reviewId);
  return { data, error };
}

async function notifyOnLike(actorId: string, reviewId: string) {
  // Look up the review owner + a friendly title for the notification body.
  const { data: review } = await supabase
    .from('reviews')
    .select('user_id, title, seltzer_name, brand')
    .eq('id', reviewId)
    .maybeSingle();
  if (!review || review.user_id === actorId) return; // don't notify yourself
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  const actorName = actor?.username ? `@${actor.username}` : 'Someone';
  const drink = review.title?.trim() || review.seltzer_name;
  supabase.from('notifications').insert([{
    user_id: review.user_id,
    type: 'like',
    title: `${actorName} liked your review`,
    body: drink + (review.brand ? ` · ${review.brand}` : ''),
    link: `/review/${reviewId}`,
  }]).then(() => {});
}
export async function deleteLike(userId: string, reviewId: string) {
  const { error } = await supabase.from('likes').delete().eq('user_id', userId).eq('review_id', reviewId);
  return { error };
}
export async function getLikes(reviewId: string) {
  const { data, error } = await supabase.from('likes').select('*').eq('review_id', reviewId);
  return { data, error };
}
export async function getUserLike(userId: string, reviewId: string) {
  const { data, error } = await supabase.from('likes').select('*').eq('user_id', userId).eq('review_id', reviewId).maybeSingle();
  return { data, error };
}

// COMMENTS
export async function createComment(
  userId: string,
  reviewId: string,
  content: string,
  parentId?: string,
) {
  const payload: any = { user_id: userId, review_id: reviewId, content };
  if (parentId) payload.parent_id = parentId;
  const { data, error } = await supabase
    .from('comments')
    .insert([payload])
    .select('*, user:users(*)')
    .single();
  if (!error) {
    if (parentId) notifyOnReply(userId, reviewId, parentId, content);
    else notifyOnComment(userId, reviewId, content);
    // Note: @mention notifications for comments are sent client-side from
    // CommentSection.tsx so it can include the actor's username without an
    // extra DB lookup. Adding it here would cause duplicate notifications.
  }
  return { data, error };
}

/**
 * Parses any @username references out of free-text and sends mention
 * notifications to the users that exist. Safe-to-call even if the text
 * has no mentions (cheap no-op).
 *
 * Rules:
 *   - Usernames are matched as /@([a-zA-Z0-9_]+)/ — same charset our
 *     signup form allows
 *   - Skips self-mentions
 *   - Skips the review/comment author if they're also the target
 *   - Dedupes — same user mentioned twice = one notification
 */
async function notifyMentions(
  actorId: string,
  text: string,
  source: { kind: 'review' | 'comment'; id: string; link: string }
) {
  if (!text) return;
  const matches = Array.from(text.matchAll(/@([a-zA-Z0-9_]+)/g));
  if (matches.length === 0) return;

  const handles = Array.from(new Set(matches.map((m) => m[1].toLowerCase())));
  if (handles.length === 0) return;

  // Look up which of those handles map to real users.
  const { data: targets } = await supabase
    .from('users')
    .select('id, username')
    .in('username', handles);
  if (!targets || targets.length === 0) return;

  // Need the actor's username for the notification body.
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  const actorName = actor?.username ? `@${actor.username}` : 'Someone';

  const rows = (targets as Array<{ id: string; username: string }>)
    .filter((t) => t.id !== actorId)
    .map((t) => ({
      user_id: t.id,
      type: 'mention' as const,
      title: `${actorName} mentioned you`,
      body: text.length > 120 ? text.slice(0, 117) + '…' : text,
      link: source.link,
    }));
  if (rows.length === 0) return;
  supabase.from('notifications').insert(rows).then(() => {});
}

async function notifyOnComment(actorId: string, reviewId: string, content: string) {
  const { data: review } = await supabase
    .from('reviews')
    .select('user_id, title, seltzer_name')
    .eq('id', reviewId)
    .maybeSingle();
  if (!review || review.user_id === actorId) return;
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  const actorName = actor?.username ? `@${actor.username}` : 'Someone';
  const drink = review.title?.trim() || review.seltzer_name;
  const snippet = content.length > 60 ? content.slice(0, 60) + '…' : content;
  supabase.from('notifications').insert([{
    user_id: review.user_id,
    type: 'comment',
    title: `${actorName} commented on ${drink}`,
    body: `"${snippet}"`,
    link: `/review/${reviewId}`,
  }]).then(() => {});
}

async function notifyOnReply(actorId: string, reviewId: string, parentId: string, content: string) {
  // Find the comment being replied to so we can notify its author.
  const { data: parent } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', parentId)
    .maybeSingle();
  if (!parent || parent.user_id === actorId) return; // don't notify yourself
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  const actorName = actor?.username ? `@${actor.username}` : 'Someone';
  const snippet = content.length > 60 ? content.slice(0, 60) + '…' : content;
  supabase.from('notifications').insert([{
    user_id: parent.user_id,
    type: 'reply',
    title: `${actorName} replied to your comment`,
    body: `"${snippet}"`,
    link: `/review/${reviewId}`,
  }]).then(() => {});
}
export async function getComments(reviewId: string, viewerId?: string) {
  const { data, error } = await supabase.from('comments').select('*, user:users(*)').eq('review_id', reviewId).order('created_at', { ascending: true });
  if (error || !viewerId || !data) return { data, error };
  // Hide comments from users the viewer has blocked.
  const blocked = new Set(await getBlockedUserIds(viewerId));
  return { data: data.filter((c: any) => !blocked.has(c.user_id)), error };
}

export async function getCommentCount(reviewId: string) {
  const { count, error } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId);
  return { count: count ?? 0, error };
}
export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  return { error };
}

// REPOSTS
export async function createRepost(userId: string, reviewId: string) {
  const { data, error } = await supabase.from('reposts').insert([{ user_id: userId, review_id: reviewId }]).select().single();
  return { data, error };
}
export async function deleteRepost(userId: string, reviewId: string) {
  const { error } = await supabase.from('reposts').delete().eq('user_id', userId).eq('review_id', reviewId);
  return { error };
}
export async function getUserRepost(userId: string, reviewId: string) {
  const { data, error } = await supabase.from('reposts').select('*').eq('user_id', userId).eq('review_id', reviewId).maybeSingle();
  return { data, error };
}

// TRIED IT
export async function createTriedIt(userId: string, reviewId: string, rating: number) {
  // Detect first-time vs. update so we only notify on first try.
  const { data: existing } = await supabase
    .from('tried_it').select('id').eq('user_id', userId).eq('review_id', reviewId).maybeSingle();
  const isFirstTime = !existing;
  const { data, error } = await supabase.from('tried_it').upsert([{ user_id: userId, review_id: reviewId, rating }], { onConflict: 'user_id, review_id' }).select().single();
  if (!error && isFirstTime) notifyOnTriedIt(userId, reviewId, rating);
  return { data, error };
}

async function notifyOnTriedIt(actorId: string, reviewId: string, rating: number) {
  const { data: review } = await supabase
    .from('reviews')
    .select('user_id, title, seltzer_name')
    .eq('id', reviewId)
    .maybeSingle();
  if (!review || review.user_id === actorId) return;
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  const actorName = actor?.username ? `@${actor.username}` : 'Someone';
  const drink = review.title?.trim() || review.seltzer_name;
  supabase.from('notifications').insert([{
    user_id: review.user_id,
    type: 'tried_it',
    title: `${actorName} tried ${drink}`,
    body: `Their rating: ${rating.toFixed(1)} ⭐`,
    link: `/review/${reviewId}`,
  }]).then(() => {});
}
export async function getUserTriedIt(userId: string, reviewId: string) {
  const { data, error } = await supabase.from('tried_it').select('*').eq('user_id', userId).eq('review_id', reviewId).maybeSingle();
  return { data, error };
}

/**
 * All "I've tried this" ratings the user has logged — joined with the
 * source review so we get the canonical drink + brand. Used by the taste
 * profile so quick ratings count alongside full reviews.
 *
 * Excludes tried-its on the user's *own* reviews (those are already
 * captured by the review itself; double-counting would inflate variance).
 */
export async function getUserTriedIts(userId: string) {
  const { data, error } = await supabase
    .from('tried_it')
    .select('rating, created_at, review:reviews(id, user_id, seltzer_id, seltzer_name, brand, image_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  // Drop tried-its on your own reviews — your own opinion is already counted.
  const filtered = (data || []).filter((row: any) => row.review && row.review.user_id !== userId);
  return { data: filtered, error: null };
}
export async function getTriedItStats(reviewId: string) {
  const { data, error } = await supabase.from('tried_it').select('rating').eq('review_id', reviewId);
  if (error || !data || data.length === 0) return { count: 0, avgRating: 0, error };
  const avgRating = data.reduce((sum: number, t: any) => sum + t.rating, 0) / data.length;
  return { count: data.length, avgRating, error: null };
}

// FOLLOWS
export async function followUser(followerId: string, followingId: string) {
  const { data, error } = await supabase.from('follows').insert([{ follower_id: followerId, following_id: followingId }]).select().single();
  if (!error) notifyOnFollow(followerId, followingId);
  return { data, error };
}

async function notifyOnFollow(actorId: string, recipientId: string) {
  if (actorId === recipientId) return;
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  if (!actor?.username) return;
  supabase.from('notifications').insert([{
    user_id: recipientId,
    type: 'follow',
    title: `@${actor.username} followed you`,
    body: null,
    link: `/profile/${actor.username}`,
  }]).then(() => {});
}
export async function unfollowUser(followerId: string, followingId: string) {
  const { error } = await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
  return { error };
}
export async function isFollowing(followerId: string, followingId: string) {
  const { data, error } = await supabase.from('follows').select('*').eq('follower_id', followerId).eq('following_id', followingId).maybeSingle();
  return { isFollowing: !!data, error };
}
export async function getFollowerCount(userId: string) {
  const { data, error } = await supabase.from('follows').select('follower_id').eq('following_id', userId);
  return { count: data?.length || 0, error };
}
export async function getFollowingCount(userId: string) {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
  return { count: data?.length || 0, error };
}

// FOLLOWER / FOLLOWING LISTS
export async function getFollowers(userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('follower:users!follows_follower_id_fkey(*)')
    .eq('following_id', userId);
  return { data: data?.map((f: any) => f.follower) || [], error };
}

export async function getFollowing(userId: string) {
  const { data, error } = await supabase
    .from('follows')
    .select('following:users!follows_following_id_fkey(*)')
    .eq('follower_id', userId);
  return { data: data?.map((f: any) => f.following) || [], error };
}

// SHARED TIER LISTS
export async function getMutualFollows(userId: string) {
  const [{ data: following }, { data: followers }] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', userId),
    supabase.from('follows').select('follower_id').eq('following_id', userId),
  ]);

  const followerIds = new Set((followers || []).map((f: any) => f.follower_id));
  const mutualIds = (following || [])
    .map((f: any) => f.following_id)
    .filter((id: string) => followerIds.has(id));

  if (mutualIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from('users').select('*').in('id', mutualIds).order('username');
  return { data: data || [], error };
}

export async function createSharedTierList(ownerId: string, partnerId: string, name: string) {
  // Self-only lists go straight to 'active'. Partner lists wait for the
  // partner to accept the invite.
  const status = ownerId === partnerId ? 'active' : 'pending_invite';

  const { data, error } = await supabase
    .from('shared_tier_lists')
    .insert([{ owner_id: ownerId, partner_id: partnerId, name, is_public: true, status }])
    .select('*')
    .single();

  if (!error && data && status === 'pending_invite') {
    notifyTierListInvite(ownerId, partnerId, data.id, name);
  }
  return { data, error };
}

/**
 * Owner action: invite an additional user as an editor on an existing
 * shared tier list (beyond owner+partner). Adds a `pending_invite` row
 * to shared_tier_list_editors and fires the existing tier_list_invite
 * notification. The user must accept before they can edit.
 *
 * If the list is currently SOLO (partner_id === owner_id), this is a
 * no-op — callers should use `inviteTierListPartner` instead, which
 * promotes the partner_id slot. Once a list has a partner, additional
 * members go through this editor table.
 */
export async function inviteTierListEditor(listId: string, ownerId: string, newEditorId: string) {
  if (ownerId === newEditorId) return { data: null, error: new Error('Cannot invite yourself.') };

  // Verify caller owns the list and grab its name for the notification
  const { data: list, error: fetchErr } = await supabase
    .from('shared_tier_lists')
    .select('id, owner_id, partner_id, name')
    .eq('id', listId)
    .single();
  if (fetchErr || !list) return { data: null, error: fetchErr || new Error('List not found.') };
  if (list.owner_id !== ownerId) return { data: null, error: new Error('Only the owner can invite editors.') };

  // Don't double-invite the existing owner/partner
  if (list.partner_id === newEditorId) {
    return { data: null, error: new Error('That user is already on this list as the partner.') };
  }

  const { data, error } = await supabase
    .from('shared_tier_list_editors')
    .upsert(
      { list_id: listId, user_id: newEditorId, invited_by: ownerId, status: 'pending_invite' },
      { onConflict: 'list_id,user_id' },
    )
    .select('*')
    .single();
  if (!error && data) {
    notifyTierListInvite(ownerId, newEditorId, list.id, list.name);
  }
  return { data, error };
}

/**
 * Editor accepts their pending invite — gains write access to the list.
 */
export async function acceptTierListEditorInvite(listId: string, editorId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_editors')
    .update({ status: 'active', responded_at: new Date().toISOString() })
    .eq('list_id', listId)
    .eq('user_id', editorId)
    .eq('status', 'pending_invite')
    .select('*')
    .single();
  return { data, error };
}

/**
 * Editor declines their pending invite. Row stays for audit.
 */
export async function declineTierListEditorInvite(listId: string, editorId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_editors')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('list_id', listId)
    .eq('user_id', editorId)
    .select('*')
    .single();
  return { data, error };
}

/**
 * Owner removes an editor (or an editor removes themselves).
 */
export async function removeTierListEditor(listId: string, editorId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_editors')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', editorId)
    .select('*');
  return { data, error };
}

/**
 * List the editors of a tier list with their user records, newest invite
 * first. Useful for showing a "members" panel.
 */
export async function getTierListEditors(listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_editors')
    .select('list_id, user_id, status, invited_by, created_at, user:users!shared_tier_list_editors_user_id_fkey(id, username, avatar_url, display_name)')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });
  return { data: (data || []) as any[], error };
}

/**
 * Owner action: invite a partner with edit access to an existing list.
 * Only works if the list is currently solo (partner_id === owner_id).
 * Marks the list pending_invite and fires a notification.
 */
export async function inviteTierListPartner(listId: string, ownerId: string, newPartnerId: string) {
  if (ownerId === newPartnerId) return { data: null, error: new Error('Cannot invite yourself.') };
  // verify the caller owns it and it's currently solo
  const { data: existing, error: fetchErr } = await supabase
    .from('shared_tier_lists')
    .select('id, owner_id, partner_id, name, status')
    .eq('id', listId)
    .single();
  if (fetchErr || !existing) return { data: null, error: fetchErr || new Error('List not found.') };
  if (existing.owner_id !== ownerId) return { data: null, error: new Error('Only the owner can invite a partner.') };
  if (existing.partner_id !== existing.owner_id) {
    return { data: null, error: new Error('List already has a partner.') };
  }
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .update({ partner_id: newPartnerId, status: 'pending_invite' })
    .eq('id', listId)
    .eq('owner_id', ownerId) // RLS belt-and-suspenders
    .select('*')
    .single();
  if (!error && data) {
    notifyTierListInvite(ownerId, newPartnerId, data.id, existing.name);
  }
  return { data, error };
}

async function notifyTierListInvite(actorId: string, recipientId: string, listId: string, listName: string) {
  if (actorId === recipientId) return;
  const { data: actor } = await supabase
    .from('users').select('username').eq('id', actorId).maybeSingle();
  const actorName = actor?.username ? `@${actor.username}` : 'Someone';
  supabase.from('notifications').insert([{
    user_id: recipientId,
    type: 'tier_list_invite',
    title: `${actorName} invited you to a tier list`,
    body: `"${listName}" — accept to start ranking together.`,
    link: `/shared/${listId}`,
  }]).then(() => {});
}

/** Accept a pending tier list invite. Only the partner can accept. */
export async function acceptTierListInvite(listId: string, userId: string) {
  // Atomic update gated by RLS — only flips when the row is still pending.
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .update({ status: 'active' })
    .eq('id', listId)
    .eq('partner_id', userId)
    .eq('status', 'pending_invite')
    .select('*, owner:users!shared_tier_lists_owner_id_fkey(username), partner:users!shared_tier_lists_partner_id_fkey(username)')
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('Invite already resolved or you are not the invitee.') };

  // Notify the inviter their list is now live.
  const partnerUsername = (data.partner as any)?.username;
  supabase.from('notifications').insert([{
    user_id: data.owner_id,
    type: 'tier_list_invite_accepted',
    title: `@${partnerUsername} accepted your tier list invite`,
    body: `"${data.name}" is now live — start adding drinks.`,
    link: `/shared/${listId}`,
  }]).then(() => {});

  return { data, error: null };
}

/** Decline a pending tier list invite. Only the partner can decline. */
export async function declineTierListInvite(listId: string, userId: string) {
  const { data: list } = await supabase
    .from('shared_tier_lists')
    .select('name, owner_id, partner:users!shared_tier_lists_partner_id_fkey(username)')
    .eq('id', listId)
    .maybeSingle();

  // Mark declined (so the inviter has visibility) — we choose not to delete
  // the row outright, in case they want to see the history. Cascading
  // deletes if you want a different policy.
  const { error } = await supabase
    .from('shared_tier_lists')
    .update({ status: 'declined' })
    .eq('id', listId)
    .eq('partner_id', userId)
    .eq('status', 'pending_invite');
  if (error) return { error };

  if (list) {
    const partnerUsername = (list.partner as any)?.username;
    supabase.from('notifications').insert([{
      user_id: list.owner_id,
      type: 'tier_list_invite_declined',
      title: `@${partnerUsername} declined your tier list invite`,
      body: `"${list.name}" wasn't started.`,
      link: null,
    }]).then(() => {});
  }
  return { error: null };
}

export async function getSharedTierLists(userId: string) {
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .select('*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*)')
    .or(`owner_id.eq.${userId},partner_id.eq.${userId}`)
    .order('updated_at', { ascending: false });
  return { data: data || [], error };
}

export async function getUserSubscribedSharedTierLists(userId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_subscriptions')
    .select('list:shared_tier_lists!shared_tier_list_subscriptions_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: data?.map((row: any) => row.list).filter(Boolean) || [], error };
}

export async function getSharedTierList(id: string) {
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .select('*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*)')
    .eq('id', id)
    .single();
  return { data, error };
}

export async function getSharedTierListSubscription(userId: string, listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('list_id', listId)
    .maybeSingle();
  return { data, error };
}

export async function subscribeToSharedTierList(userId: string, listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_subscriptions')
    .upsert([{ user_id: userId, list_id: listId }], { onConflict: 'user_id,list_id' })
    .select('*')
    .single();
  return { data, error };
}

export async function unsubscribeFromSharedTierList(userId: string, listId: string) {
  const { error } = await supabase
    .from('shared_tier_list_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('list_id', listId);
  return { error };
}

export async function getSharedTierListItems(listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), review:reviews(id, image_url, user_id, user:users(id, username)), seltzer:seltzers(id, image_url)')
    .eq('list_id', listId)
    .order('rating', { ascending: false });
  return { data: data || [], error };
}

/**
 * Helper: average a contributions map. The map is `{ user_id: rating }`.
 * Falls back to a fresh map keyed on `added_by` when empty.
 */
function avgContributions(map: Record<string, number>): { rating: number; tier: string } {
  const values = Object.values(map).filter((v) => Number.isFinite(v));
  const avg = values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
  const rating = Math.round(avg * 10) / 10;
  const tier =
    rating >= 4.5 ? 'S' :
    rating >= 4   ? 'A' :
    rating >= 3   ? 'B' :
    rating >= 2   ? 'C' :
    rating >= 1   ? 'D' : 'F';
  return { rating, tier };
}

/**
 * Add a drink to a shared tier list. If the same canonical drink is already
 * present, this *merges* the new contributor's rating into the existing
 * row (running average across all contributors) instead of inserting a
 * duplicate row.
 */
export async function addSharedTierListItem(item: {
  list_id: string;
  added_by: string;
  seltzer_id?: string | null;
  seltzer_name: string;
  brand?: string;
  rating: number;
  tier: string;
  note?: string;
  review_id?: string;
}) {
  // Look for an existing row for this canonical drink in the list.
  // We dedupe on seltzer_id when available; legacy rows without one fall
  // back to a case-insensitive (brand, name) match.
  let existing: any = null;
  if (item.seltzer_id) {
    const { data } = await supabase
      .from('shared_tier_list_items')
      .select('*')
      .eq('list_id', item.list_id)
      .eq('seltzer_id', item.seltzer_id)
      .maybeSingle();
    existing = data;
  } else {
    const { data } = await supabase
      .from('shared_tier_list_items')
      .select('*')
      .eq('list_id', item.list_id)
      .ilike('seltzer_name', item.seltzer_name)
      .ilike('brand', item.brand ?? '')
      .maybeSingle();
    existing = data;
  }

  if (existing) {
    // Merge: bump the contributor's rating into the map, recompute avg.
    const contributions: Record<string, number> = { ...(existing.rating_contributions || {}) };
    contributions[item.added_by] = item.rating;
    const { rating, tier } = avgContributions(contributions);

    const { data, error } = await supabase
      .from('shared_tier_list_items')
      .update({
        rating_contributions: contributions,
        rating,
        tier,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (!error) {
      await supabase.from('shared_tier_lists').update({ updated_at: new Date().toISOString() }).eq('id', item.list_id);
    }
    return { data, error };
  }

  // Fresh row — seed the contributions with the adder's rating.
  const insertRow: any = {
    ...item,
    rating_contributions: { [item.added_by]: item.rating },
  };
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .insert([insertRow])
    .select('*')
    .single();

  if (!error) {
    await supabase.from('shared_tier_lists').update({ updated_at: new Date().toISOString() }).eq('id', item.list_id);
  }

  return { data, error };
}

/**
 * Update a tier list item. When the rating changes, we update only the
 * *editing user's* contribution and recompute the displayed rating as the
 * new average across all contributors.
 *
 * `editorUserId` defaults to the current session user — pass it explicitly
 * for any path where the session might be missing.
 */
export async function updateSharedTierListItem(
  itemId: string,
  listId: string,
  updates: { rating?: number; tier?: string; note?: string | null },
  editorUserId?: string,
) {
  let payload: any = { ...updates };

  // If the caller is changing the rating, fetch the existing contributions,
  // splice in the editor's new value, recompute, and persist both.
  if (typeof updates.rating === 'number') {
    const editorId =
      editorUserId ||
      (await supabase.auth.getSession()).data.session?.user?.id;
    if (editorId) {
      const { data: existing } = await supabase
        .from('shared_tier_list_items')
        .select('rating_contributions')
        .eq('id', itemId)
        .maybeSingle();
      const contributions: Record<string, number> = { ...(existing?.rating_contributions || {}) };
      contributions[editorId] = updates.rating;
      const { rating: avgRating, tier: avgTier } = avgContributions(contributions);
      payload = {
        ...payload,
        rating: avgRating,
        tier: updates.tier ?? avgTier,
        rating_contributions: contributions,
      };
    }
  }

  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .update(payload)
    .eq('id', itemId)
    .select('*');
  if (error) return { data: null, error };
  if (!data || data.length === 0) {
    return {
      data: null,
      error: new Error(
        'Update blocked. Run supabase_tier_list_policies.sql to add the missing RLS policy.',
      ),
    };
  }
  await supabase.from('shared_tier_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId);
  return { data: data[0], error: null };
}

/**
 * Bulk add — runs each item through `addSharedTierListItem` so the merge /
 * dedupe logic applies. Slower than a single insert but correct.
 */
export async function bulkAddSharedTierListItems(
  items: {
    list_id: string;
    added_by: string;
    seltzer_id?: string | null;
    seltzer_name: string;
    brand?: string;
    rating: number;
    tier: string;
    note?: string;
    review_id?: string;
  }[]
) {
  if (items.length === 0) return { data: [], error: null };
  const results: any[] = [];
  for (const item of items) {
    const { data, error } = await addSharedTierListItem(item);
    if (error) return { data: results, error };
    if (data) results.push(data);
  }
  return { data: results, error: null };
}

export async function deleteSharedTierListItem(itemId: string, listId: string) {
  // We need to confirm a row was actually deleted — RLS silently no-ops if
  // the policy isn't in place, so .delete() can succeed without affecting rows.
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .delete()
    .eq('id', itemId)
    .select('id');
  if (error) return { error };
  if (!data || data.length === 0) {
    return {
      error: new Error(
        'Delete blocked. Run supabase_tier_list_policies.sql to add the missing RLS policy.',
      ),
    };
  }
  await supabase.from('shared_tier_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId);
  return { error: null };
}

/** Delete a shared tier list. Children cascade via FK on delete cascade. */
export async function deleteSharedTierList(listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .delete()
    .eq('id', listId)
    .select('id');
  if (error) return { error };
  if (!data || data.length === 0) {
    return {
      error: new Error(
        'Delete blocked. Run supabase_tier_list_policies.sql to add the missing RLS policy.',
      ),
    };
  }
  return { error: null };
}

export async function createSharedTierListSuggestion(suggestion: {
  list_id: string;
  created_by: string;
  action?: 'add' | 'move' | 'remove' | 'edit';
  seltzer_id?: string | null;
  seltzer_name: string;
  brand?: string;
  proposed_rating: number;
  proposed_tier: string;
  proposed_note?: string;
  review_id?: string;
}) {
  const { data, error } = await supabase
    .from('shared_tier_list_suggestions')
    .insert([{ ...suggestion, action: suggestion.action || 'add' }])
    .select('*')
    .single();

  if (!error && data) {
    // Notify the other list member via inbox (fire and forget)
    supabase
      .from('shared_tier_lists')
      .select('owner_id, partner_id, name, owner:users!shared_tier_lists_owner_id_fkey(username), partner:users!shared_tier_lists_partner_id_fkey(username)')
      .eq('id', suggestion.list_id)
      .single()
      .then(({ data: list }) => {
        if (!list) return;
        const recipientId = list.owner_id === suggestion.created_by ? list.partner_id : list.owner_id;
        const senderUsername = list.owner_id === suggestion.created_by
          ? (list.owner as any)?.username
          : (list.partner as any)?.username;
        const isAdd = !suggestion.action || suggestion.action === 'add';
        const link = isAdd && suggestion.review_id
          ? `/review/${suggestion.review_id}`
          : `/shared/${suggestion.list_id}`;
        supabase.from('notifications').insert([{
          user_id: recipientId,
          type: 'suggestion',
          title: `@${senderUsername || 'Someone'} suggested ${isAdd ? 'adding' : 'editing'} ${suggestion.seltzer_name}`,
          body: `In your shared list "${list.name}" · ${suggestion.proposed_tier} tier · ${Number(suggestion.proposed_rating).toFixed(1)}`,
          link,
        }]).then(() => {});
      });
  }

  return { data, error };
}

export async function getSharedTierListSuggestions(listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_suggestions')
    .select('*, created_by_user:users!shared_tier_list_suggestions_created_by_fkey(*), votes:shared_tier_list_votes(*), trials:shared_tier_suggestion_trials(*), review:reviews(id, image_url)')
    .eq('list_id', listId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

export async function markSharedSuggestionTried(suggestionId: string, userId: string, rating: number) {
  const { data, error } = await supabase
    .from('shared_tier_suggestion_trials')
    .upsert([{ suggestion_id: suggestionId, user_id: userId, rating }], { onConflict: 'suggestion_id,user_id' })
    .select('*')
    .single();
  return { data, error };
}

export async function voteOnSharedSuggestion(suggestion: any, list: any, userId: string, vote: 'approve' | 'reject') {
  const { error: voteError } = await supabase
    .from('shared_tier_list_votes')
    .upsert([{ suggestion_id: suggestion.id, user_id: userId, vote }], { onConflict: 'suggestion_id,user_id' });
  if (voteError) return { error: voteError };

  const { data: votes, error: votesError } = await supabase
    .from('shared_tier_list_votes')
    .select('*')
    .eq('suggestion_id', suggestion.id);
  if (votesError) return { error: votesError };

  const memberIds = [list.owner_id, list.partner_id].filter(Boolean);

  // The suggester shouldn't be required to vote on their own suggestion —
  // only the *other* member(s) need to decide. This also means a single
  // partner vote on a 2-person list is immediately decisive.
  const voterIds = memberIds.filter((id: string) => id !== suggestion.created_by);
  const voterVotes = (votes || []).filter((row: any) => voterIds.includes(row.user_id));
  const approvals  = voterVotes.filter((row: any) => row.vote === 'approve').length;
  const rejections = voterVotes.filter((row: any) => row.vote === 'reject').length;
  const needed = voterIds.length; // 1 for a 2-person list

  let status: 'pending' | 'approved' | 'rejected' = 'pending';
  if (approvals >= needed) status = 'approved';
  if (rejections >= needed) status = 'rejected';

  if (status === 'pending') return { error: null };

  if (status === 'approved') {
    const { error: itemError } = await addSharedTierListItem({
      list_id: suggestion.list_id,
      added_by: suggestion.created_by,
      seltzer_name: suggestion.seltzer_name,
      brand: suggestion.brand || undefined,
      rating: Number(suggestion.proposed_rating),
      tier: suggestion.proposed_tier,
      note: suggestion.proposed_note || undefined,
      review_id: suggestion.review_id || undefined,
    });
    if (itemError) return { error: itemError };
  }

  const { error } = await supabase
    .from('shared_tier_list_suggestions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', suggestion.id);

  // Notify the suggester of the result (fire and forget)
  if (!error && suggestion.created_by !== userId) {
    supabase.from('notifications').insert([{
      user_id: suggestion.created_by,
      type: status === 'approved' ? 'suggestion_approved' : 'suggestion_rejected',
      title: `Your suggestion was ${status}`,
      body: `${suggestion.seltzer_name} in "${list.name}"`,
      link: status === 'approved' ? `/shared/${suggestion.list_id}` : undefined,
    }]).then(() => {});
  }

  return { error };
}

export async function getSharedTierActivities(limit: number = 10) {
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), review:reviews(id, image_url), list:shared_tier_lists!shared_tier_list_items_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
    .eq('list.is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function getSharedSuggestionActivities(userId: string, limit: number = 10) {
  const { data: lists } = await getSharedTierLists(userId);
  const listIds = (lists || []).map((list: any) => list.id);
  if (listIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('shared_tier_list_suggestions')
    .select('*, created_by_user:users!shared_tier_list_suggestions_created_by_fkey(*), list:shared_tier_lists!shared_tier_list_suggestions_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*)), votes:shared_tier_list_votes(*), trials:shared_tier_suggestion_trials(*)')
    .in('list_id', listIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function getSubscribedSharedTierActivities(userId: string, limit: number = 10) {
  // Activities the user opted into (via subscriptions) PLUS lists they're a
  // member of (since you obviously care about your own lists).
  const [{ data: subs }, { data: ownLists }] = await Promise.all([
    supabase.from('shared_tier_list_subscriptions').select('list_id').eq('user_id', userId),
    supabase.from('shared_tier_lists').select('id').or(`owner_id.eq.${userId},partner_id.eq.${userId}`),
  ]);

  const listIds = Array.from(new Set([
    ...((subs || []).map((row: any) => row.list_id)),
    ...((ownLists || []).map((row: any) => row.id)),
  ]));

  // No fallback to global activity — feed is "your network only".
  if (listIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), review:reviews(id, image_url), list:shared_tier_lists!shared_tier_list_items_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
    .in('list_id', listIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

// NOTIFICATIONS / INBOX
export async function createNotification(notification: {
  user_id: string;
  type: 'suggestion' | 'suggestion_approved' | 'suggestion_rejected' | 'mention' | 'like' | 'comment' | 'follow' | 'tried_it' | 'reply' | 'tier_list_invite' | 'tier_list_invite_accepted' | 'tier_list_invite_declined';
  title: string;
  body?: string;
  link?: string;
}) {
  const { data, error } = await supabase
    .from('notifications')
    .insert([notification])
    .select('*')
    .single();
  return { data, error };
}

export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: data || [], error };
}

export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  return { count: count || 0, error };
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  return { error };
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  return { error };
}

export async function deleteNotification(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);
  return { error };
}

// Look up user IDs for @mentioned usernames in comment text
export async function getUserIdsByUsernames(usernames: string[]) {
  if (usernames.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from('users')
    .select('id, username')
    .in('username', usernames);
  return { data: data || [], error };
}

// Get pending suggestions linked to a review (for voting on review page)
export async function getSuggestionsByReviewId(reviewId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_suggestions')
    .select('*, created_by_user:users!shared_tier_list_suggestions_created_by_fkey(*), votes:shared_tier_list_votes(*), trials:shared_tier_suggestion_trials(*), list:shared_tier_lists!shared_tier_list_suggestions_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
    .eq('review_id', reviewId)
    .eq('status', 'pending');
  return { data: data || [], error };
}

// SEARCH — tier lists
export async function searchSharedTierLists(query: string) {
  let req = supabase
    .from('shared_tier_lists')
    .select('*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*)')
    .eq('is_public', true)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(25);

  if (query.trim()) {
    req = req.ilike('name', `%${query.trim()}%`);
  }

  const { data, error } = await req;
  return { data: data || [], error };
}

// ─── MODERATION: blocks ──────────────────────────────────────────
// Block hides the blocked user's content from the blocker's feeds and
// comment threads. RLS lets a user manage only their own block rows.

/** UUIDs the given user has blocked. Cached per call site, cheap to refetch. */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const { data } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);
  return (data || []).map((r: { blocked_id: string }) => r.blocked_id);
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) return { error: new Error('cannot block yourself') };
  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  return { error };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  return { error };
}

export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  if (!blockerId || !blockedId) return false;
  const { data } = await supabase
    .from('blocks')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();
  return !!data;
}

// ─── MODERATION: reports ─────────────────────────────────────────
export type ReportTargetType = 'review' | 'comment' | 'user';

/** File a report. Re-reporting the same target is an idempotent upsert. */
export async function reportContent(opts: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string | null;
  reason: string;
}) {
  const { error } = await supabase.from('reports').upsert(
    {
      reporter_id: opts.reporterId,
      target_type: opts.targetType,
      target_id: opts.targetId,
      target_user_id: opts.targetUserId ?? null,
      reason: opts.reason.slice(0, 500) || 'Reported',
      status: 'open',
    },
    { onConflict: 'reporter_id,target_type,target_id' },
  );
  return { error };
}

/** Curator-only: open reports, newest first. RLS enforces curator access. */
export async function getOpenReports(limit = 100) {
  const { data, error } = await supabase
    .from('reports')
    .select('*, reporter:users!reports_reporter_id_fkey(id, username), target_user:users!reports_target_user_id_fkey(id, username)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function resolveReport(reportId: string, curatorId: string, status: 'resolved' | 'dismissed') {
  const { error } = await supabase
    .from('reports')
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: curatorId })
    .eq('id', reportId);
  return { error };
}

/** Curator-only hard delete of reported content. */
export async function moderatorDeleteReview(reviewId: string) {
  return supabase.from('reviews').delete().eq('id', reviewId);
}
export async function moderatorDeleteComment(commentId: string) {
  return supabase.from('comments').delete().eq('id', commentId);
}

// ─── TERMS / EULA ────────────────────────────────────────────────
export async function acceptTerms(userId: string) {
  const { error } = await supabase
    .from('users')
    .update({ terms_accepted_at: new Date().toISOString() })
    .eq('id', userId);
  return { error };
}

export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase
    .from('users')
    .select('terms_accepted_at')
    .eq('id', userId)
    .maybeSingle();
  return !!data?.terms_accepted_at;
}

// ─── ACCOUNT DELETION ────────────────────────────────────────────
// Calls the `delete-account` Edge Function (service role) which purges
// storage and deletes auth.users (cascading every owned table).
export async function deleteMyAccount() {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) return { error };
  return { error: (data as any)?.error ? new Error((data as any).error) : null };
}

// ─── BARCODE ─────────────────────────────────────────────────────
/** Look up a canonical drink by its scanned UPC/EAN. */
export async function findSeltzerByBarcode(upc: string) {
  const clean = upc.trim();
  if (!clean) return { data: null, error: null };
  const { data, error } = await supabase
    .from('seltzers')
    .select('*')
    .eq('upc', clean)
    .maybeSingle();
  return { data, error };
}

/** Attach a barcode to a drink if it doesn't already have one. Best-effort. */
export async function attachBarcodeToSeltzer(seltzerId: string, upc: string) {
  const clean = upc.trim();
  if (!clean) return { error: null };
  const { error } = await supabase
    .from('seltzers')
    .update({ upc: clean })
    .eq('id', seltzerId)
    .is('upc', null);
  return { error };
}
