// components/ReviewCard.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Star, Trash2, Droplets, ChevronRight } from 'lucide-react';
import { Review } from '@/types';
import { Avatar } from './Avatar';
import { FounderBadge, FOUNDERS } from './FounderBadge';
import { reviewHeadline, reviewDrinkLabel, hasCustomTitle } from '@/lib/reviewDisplay';
import { showToast } from './Toast';
import { createLike, deleteLike, getUserLike, getLikes, createTriedIt, getUserTriedIt, getTriedItStats, deleteReview } from '@/lib/supabase';

interface ReviewCardProps {
  review: Review;
  currentUserId?: string;
  onDelete?: (reviewId: string) => void;
}

export function ReviewCard({ review, currentUserId, onDelete }: ReviewCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Tried It state
  const [hasTried, setHasTried] = useState(false);
  const [myTriedRating, setMyTriedRating] = useState(3);
  const [triedCount, setTriedCount] = useState(0);
  const [showTriedPanel, setShowTriedPanel] = useState(false);
  const [pendingRating, setPendingRating] = useState(3);
  const [submittingTried, setSubmittingTried] = useState(false);

  const isOwnReview = currentUserId === review.user?.id;

  useEffect(() => {
    loadLikeCount();
    if (currentUserId) {
      checkLike();
      if (!isOwnReview) loadTriedIt();
    }
    loadTriedItCount();
  }, [currentUserId, review.id]);

  async function loadLikeCount() {
    const { data } = await getLikes(review.id);
    setLikeCount(data?.length || 0);
  }

  async function checkLike() {
    if (!currentUserId) return;
    const { data } = await getUserLike(currentUserId, review.id);
    setIsLiked(!!data);
  }

  async function loadTriedIt() {
    if (!currentUserId) return;
    const { data } = await getUserTriedIt(currentUserId, review.id);
    if (data) { setHasTried(true); setMyTriedRating(data.rating); setPendingRating(data.rating); }
  }

  async function loadTriedItCount() {
    const { count } = await getTriedItStats(review.id);
    setTriedCount(count);
  }

  async function handleLike() {
    if (!currentUserId || loading) return;
    setLoading(true);
    if (isLiked) {
      await deleteLike(currentUserId, review.id);
      setIsLiked(false);
      setLikeCount(Math.max(0, likeCount - 1));
    } else {
      await createLike(currentUserId, review.id);
      setIsLiked(true);
      setLikeCount(likeCount + 1);
    }
    setLoading(false);
  }

  async function handleTriedItSubmit() {
    if (!currentUserId || submittingTried) return;
    setSubmittingTried(true);
    await createTriedIt(currentUserId, review.id, pendingRating);
    const wasUpdate = hasTried;
    setHasTried(true);
    setMyTriedRating(pendingRating);
    setShowTriedPanel(false);
    setSubmittingTried(false);
    loadTriedItCount();
    showToast(wasUpdate ? 'Rating updated' : 'Marked as tried', 'success', `Your score: ${pendingRating.toFixed(1)}`);
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return; }
    await deleteReview(review.id);
    setDeleted(true);
    showToast('Review deleted', 'info');
    onDelete?.(review.id);
  }

  if (deleted) return null;

  const timeAgo = getTimeAgo(review.created_at);
  const stars = Array(5).fill(0).map((_, i) => (
    <Star key={i} size={14} className={i < Math.floor(review.rating) ? 'star-filled' : 'star-empty'} />
  ));

  return (
    <div className="glass-card group">
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/profile/${review.user?.username}`}>
          <div className="hover:scale-105 transition-transform">
            <Avatar username={review.user?.username} avatarUrl={review.user?.avatar_url} size={40} />
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${review.user?.username}`}>
            <p className="font-semibold text-sm hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              {review.user?.username}
              {review.user?.username && FOUNDERS.has(review.user.username) && <FounderBadge />}
            </p>
          </Link>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo}</p>
        </div>
        <div className="badge-amber"><Star size={10} className="star-filled" />{review.rating.toFixed(1)}</div>
        {currentUserId === review.user?.id && (
          <button
            onClick={handleDelete}
            className="action-btn"
            style={{ color: confirmDelete ? 'var(--coral-400)' : undefined, padding: '4px 8px' }}
            title={confirmDelete ? 'Click again to confirm' : 'Delete post'}
          >
            <Trash2 size={13} />
            {confirmDelete && <span style={{ fontSize: '11px' }}>Confirm?</span>}
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <Link href={`/review/${review.id}`} className="block mb-1">
            <h3 className="font-bold text-lg hover:text-cyan-400 transition-colors cursor-pointer truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              {reviewHeadline(review)}
            </h3>
          </Link>
          {hasCustomTitle(review) ? (
            <p className="text-xs mb-2 truncate" style={{ color: 'var(--text-tertiary)' }}>{reviewDrinkLabel(review)}</p>
          ) : (
            review.brand && <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{review.brand}</p>
          )}
          <div className="flex items-center gap-1.5 mb-2"><div className="flex gap-0.5">{stars}</div></div>
          {review.content ? (
            <p className="text-sm leading-relaxed line-clamp-5" style={{ color: 'var(--text-secondary)' }}>{review.content}</p>
          ) : (
            <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>No written review.</p>
          )}
        </div>
        {review.image_url && (
          <Link href={`/review/${review.id}`} className="flex-shrink-0">
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
              <img src={review.image_url} alt={review.seltzer_name} className="w-20 h-24 object-cover hover:scale-105 transition-transform duration-300" loading="lazy" />
            </div>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={handleLike} disabled={loading || !currentUserId} className={`action-btn ${isLiked ? 'active-like' : ''}`}>
          <Heart size={15} className={isLiked ? 'fill-current' : ''} />{likeCount > 0 && <span>{likeCount}</span>}
        </button>

        <Link href={`/review/${review.id}`} className="action-btn"><MessageCircle size={15} /><span>Comment</span></Link>

        {/* Tried It — hidden for own reviews */}
        {!isOwnReview && currentUserId && (
          <button
            onClick={() => hasTried ? setShowTriedPanel(!showTriedPanel) : setShowTriedPanel(!showTriedPanel)}
            className="action-btn ml-auto"
            style={{
              color: hasTried ? 'var(--cyan-400)' : undefined,
              background: hasTried ? 'rgba(6,182,212,0.08)' : undefined,
            }}
          >
            <Droplets size={15} className={hasTried ? 'fill-current' : ''} />
            <span>{hasTried ? `Tried · ${myTriedRating.toFixed(1)}` : 'Tried It?'}</span>
          </button>
        )}

        {/* Tried count for own reviews */}
        {isOwnReview && triedCount > 0 && (
          <span className="badge-cyan ml-auto" style={{ fontSize: '11px' }}>
            <Droplets size={11} /> {triedCount} tried
          </span>
        )}
      </div>

      {/* Inline Tried It panel */}
      {showTriedPanel && !isOwnReview && currentUserId && (
        <div className="mt-3 rounded-xl p-3 animate-slide-down" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--cyan-400)' }}>
            {hasTried ? 'Update your rating' : "Rate it — you've tried this?"}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[1,2,3,4,5].map((s) => (
                <button key={s} onClick={() => setPendingRating(s)} className="transition-transform hover:scale-110">
                  <Star size={20} className={s <= pendingRating ? 'star-filled' : 'star-empty'} />
                </button>
              ))}
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{pendingRating}.0</span>
            <button
              onClick={handleTriedItSubmit}
              disabled={submittingTried}
              className="btn-primary ml-auto"
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              {submittingTried ? '...' : hasTried ? 'Update' : 'Submit'}
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
