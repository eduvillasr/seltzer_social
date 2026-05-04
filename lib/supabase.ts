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

export async function ensureUserProfile(authUser: { id: string; email?: string | null; user_metadata?: any }) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existing) return { data: existing, error: null };

  const emailName = authUser.email?.split('@')[0] || 'seltzer';
  const displayName = authUser.user_metadata?.user_name || authUser.user_metadata?.name || emailName;
  const baseUsername = String(displayName)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18) || 'seltzer';
  const username = `${baseUsername}${authUser.id.slice(0, 6)}`;

  const { data, error } = await supabase
    .from('users')
    .insert([{ id: authUser.id, username }])
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

// SELTZER DATABASE
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

export async function createReview(review: {
  user_id: string;
  seltzer_name: string;
  brand?: string;
  rating: number;
  content?: string;
  image_url?: string;
}) {
  const { data, error } = await supabase.from('reviews').insert([review]).select('*').single();
  return { data, error };
}

export async function getReview(id: string) {
  const { data, error } = await supabase.from('reviews').select('*, user:users(*)').eq('id', id).single();
  return { data, error };
}

export async function getReviews(limit: number = 20, offset: number = 0) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, user:users(*)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return { data, error };
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
    .select('*, user:users(*)')
    .in('user_id', allIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data, error };
}

export async function getUserReviews(userId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, user:users(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function deleteReview(id: string) {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  return { error };
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
  return { data, error };
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
export async function createComment(userId: string, reviewId: string, content: string) {
  const { data, error } = await supabase.from('comments').insert([{ user_id: userId, review_id: reviewId, content }]).select('*, user:users(*)').single();
  return { data, error };
}
export async function getComments(reviewId: string) {
  const { data, error } = await supabase.from('comments').select('*, user:users(*)').eq('review_id', reviewId).order('created_at', { ascending: true });
  return { data, error };
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
  const { data, error } = await supabase.from('tried_it').upsert([{ user_id: userId, review_id: reviewId, rating }], { onConflict: 'user_id, review_id' }).select().single();
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
  return { data, error };
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
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*)')
    .eq('list_id', listId)
    .order('rating', { ascending: false });
  return { data: data || [], error };
}

export async function addSharedTierListItem(item: {
  list_id: string;
  added_by: string;
  seltzer_name: string;
  brand?: string;
  rating: number;
  tier: string;
  note?: string;
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

export async function createSharedTierListSuggestion(suggestion: {
  list_id: string;
  created_by: string;
  action?: 'add' | 'move' | 'remove' | 'edit';
  seltzer_name: string;
  brand?: string;
  proposed_rating: number;
  proposed_tier: string;
  proposed_note?: string;
}) {
  const { data, error } = await supabase
    .from('shared_tier_list_suggestions')
    .insert([{ ...suggestion, action: suggestion.action || 'add' }])
    .select('*')
    .single();
  return { data, error };
}

export async function getSharedTierListSuggestions(listId: string) {
  const { data, error } = await supabase
    .from('shared_tier_list_suggestions')
    .select('*, created_by_user:users!shared_tier_list_suggestions_created_by_fkey(*), votes:shared_tier_list_votes(*), trials:shared_tier_suggestion_trials(*)')
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
  const memberVotes = (votes || []).filter((row: any) => memberIds.includes(row.user_id));
  const approvals = memberVotes.filter((row: any) => row.vote === 'approve').length;
  const rejections = memberVotes.filter((row: any) => row.vote === 'reject').length;
  const majority = Math.floor(memberIds.length / 2) + 1;

  let status: 'pending' | 'approved' | 'rejected' = 'pending';
  if (approvals >= majority) status = 'approved';
  if (rejections >= majority) status = 'rejected';

  if (status === 'pending' && memberVotes.length === memberIds.length && approvals === rejections) {
    const creatorVote = memberVotes.find((row: any) => row.user_id === list.owner_id)?.vote;
    if (creatorVote === 'approve') status = 'approved';
    if (creatorVote === 'reject') status = 'rejected';
  }

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
    });
    if (itemError) return { error: itemError };
  }

  const { error } = await supabase
    .from('shared_tier_list_suggestions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', suggestion.id);
  return { error };
}

export async function getSharedTierActivities(limit: number = 10) {
  const { data, error } = await supabase
    .from('shared_tier_list_items')
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), list:shared_tier_lists!shared_tier_list_items_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
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
    .select('*, added_by_user:users!shared_tier_list_items_added_by_fkey(*), list:shared_tier_lists!shared_tier_list_items_list_id_fkey(*, owner:users!shared_tier_lists_owner_id_fkey(*), partner:users!shared_tier_lists_partner_id_fkey(*))')
    .in('list_id', subscribedIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}
