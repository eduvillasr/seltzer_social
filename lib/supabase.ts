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
export async function claimUsername(userId: string, username: string) {
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
    .insert([{ id: userId, username: u }])
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

  // Update user profile
  await supabase.from('users').update({ avatar_url: urlData.publicUrl }).eq('id', userId);

  return { url: urlData.publicUrl, error: null };
}

// SELTZER DATABASE (canonical drinks)
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
 * Find a seltzer by case-insensitive (brand, name) or create a new one.
 * Returns the canonical row so callers can use seltzer_id.
 */
export async function findOrCreateSeltzer(brand: string, name: string, createdBy?: string) {
  const cleanBrand = brand.trim();
  const cleanName  = name.trim();
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

  // Tier lists (member of)
  const { count: tierListsAsMember } = await supabase
    .from('shared_tier_lists')
    .select('id', { count: 'exact', head: true })
    .or(`owner_id.eq.${userId},partner_id.eq.${userId}`);

  return {
    reviewCount,
    uniqueBrands,
    avgRating,
    totalLikesReceived,
    totalCommentsReceived,
    totalTriedItReceived,
    followers,
    following,
    tierListsAsMember: tierListsAsMember ?? 0,
    hasFiveStarReview,
    hasFreshReview,
    isFounder,
    isBetaTester,
  };
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

/** Public tier lists ordered by recent activity. */
export async function getTrendingTierLists(limit: number = 6) {
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .select('*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*)')
    .eq('is_public', true)
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

// SMART FEED — following + own posts (fallback to all if not following anyone)
export async function getSmartFeed(userId: string, limit: number = 50) {
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  const followedIds = follows?.map(f => f.following_id) || [];
  const allIds = [...followedIds, userId]; // Include own posts

  // If not following anyone, fall back to all reviews
  if (followedIds.length === 0) {
    return await getReviews(limit);
  }

  const { data, error } = await supabase
    .from('reviews')
    .select('*, user:users(*), seltzer:seltzers(*)')
    .in('user_id', allIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
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
  }
) {
  const payload: Record<string, any> = { ...updates };
  // Title trimmed-or-null normalization to match the create flow
  if ('title' in payload) {
    const t = payload.title;
    payload.title = typeof t === 'string' && t.trim() ? t.trim() : null;
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
  }
  return { data, error };
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
export async function getComments(reviewId: string) {
  const { data, error } = await supabase.from('comments').select('*, user:users(*)').eq('review_id', reviewId).order('created_at', { ascending: true });
  return { data, error };
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
  const { data, error } = await supabase
    .from('shared_tier_lists')
    .insert([{ owner_id: ownerId, partner_id: partnerId, name, is_public: true }])
    .select('*')
    .single();
  return { data, error };
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
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), review:reviews(id, image_url, user_id, user:users(id, username))')
    .eq('list_id', listId)
    .order('rating', { ascending: false });
  return { data: data || [], error };
}

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
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .insert([item])
    .select('*')
    .single();

  if (!error) {
    await supabase.from('shared_tier_lists').update({ updated_at: new Date().toISOString() }).eq('id', item.list_id);
  }

  return { data, error };
}

export async function updateSharedTierListItem(
  itemId: string,
  listId: string,
  updates: { rating?: number; tier?: string; note?: string | null }
) {
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .update(updates)
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
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .insert(items)
    .select('*');
  if (!error && items[0]?.list_id) {
    await supabase.from('shared_tier_lists').update({ updated_at: new Date().toISOString() }).eq('id', items[0].list_id);
  }
  return { data: data || [], error };
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
  const { data: subscriptions } = await supabase
    .from('shared_tier_list_subscriptions')
    .select('list_id')
    .eq('user_id', userId);

  const subscribedIds = (subscriptions || []).map((row: any) => row.list_id);

  if (subscribedIds.length === 0) {
    return getSharedTierActivities(limit);
  }

  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), review:reviews(id, image_url), list:shared_tier_lists!shared_tier_list_items_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
    .in('list_id', subscribedIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

// NOTIFICATIONS / INBOX
export async function createNotification(notification: {
  user_id: string;
  type: 'suggestion' | 'suggestion_approved' | 'suggestion_rejected' | 'mention' | 'like' | 'comment' | 'follow' | 'tried_it' | 'reply';
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
    .order('updated_at', { ascending: false })
    .limit(25);

  if (query.trim()) {
    req = req.ilike('name', `%${query.trim()}%`);
  }

  const { data, error } = await req;
  return { data: data || [], error };
}
