// components/ReviewCard.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Star, StarHalf, Trash2, Droplets, ChevronRight, Minus, Plus } from 'lucide-react';
import { Review } from '@/types';
import { Avatar } from './Avatar';
import { FounderBadge, FOUNDERS, BetaTesterBadge, BETA_TESTERS } from './FounderBadge';
import { StarRating } from './StarRating';
import { reviewHeadline, reviewDrinkLabel, hasCustomTitle } from '@/lib/reviewDisplay';
import { MentionText } from './MentionText';
import { showToast } from './Toast';
import { createLike, deleteLike, getUserLike, getLikes, createTriedIt, getUserTriedIt, getTriedItStats, deleteReview, getCommentCount } from '@/lib/supabase';

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

  const [commentCount, setCommentCount] = useState(0);

  // Read-more / show-less toggle for long review bodies
  const [expanded, setExpanded] = useState(false);

  const isOwnReview = currentUserId === review.user?.id;

  useEffect(() => {
    loadLikeCount();
    if (currentUserId) {
      checkLike();
      if (!isOwnReview) loadTriedIt();
    }
    loadTriedItCount();
    loadCommentCount();
  }, [currentUserId, review.id]);

  async function loadCommentCount() {
    const { count } = await getCommentCount(review.id);
    setCommentCount(count);
  }

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
              {review.user?.username && BETA_TESTERS.has(review.user.username) && !FOUNDERS.has(review.user.username) && <BetaTesterBadge />}
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
            review.brand && (
              <Link
                href={`/brand/${encodeURIComponent(review.brand)}`}
                className="text-xs mb-2 inline-block hover:text-cyan-400 transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {review.brand}
              </Link>
            )
          )}
          <div className="flex items-center gap-1.5 mb-2"><StarRating value={review.rating} size={14} /></div>
          {review.content ? (
            <ReviewBody
              content={review.content}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
            />
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

        <Link href={`/review/${review.id}`} className="action-btn">
          <MessageCircle size={15} />
          <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
        </Link>

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
          <TriedItStars value={pendingRating} onChange={setPendingRating} />
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Tap or drag · ± for 0.1 steps
            </span>
            <button
              onClick={handleTriedItSubmit}
              disabled={submittingTried}
              className="btn-primary"
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

/**
 * Compact 0.1-precision rating used by the "Tried It" inline panel.
 *
 * - Tap a star to set the whole-number rating
 * - Drag horizontally across the row to fine-tune to 0.1
 * - Use ± buttons for exact 0.1 nudges
 *
 * This is a slimmer variant of <RatingInput /> — no label, no hint text,
 * tighter star size — because it lives inside an already-compact action
 * panel on each review card.
 */
function TriedItStars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const STAR_SIZE = 22;

  function clampStep(n: number): number {
    const c = Math.max(0, Math.min(5, n));
    return Math.round(c * 10) / 10;
  }
  function set(n: number) { onChange(clampStep(n)); }
  function bump(d: number) { set((Number.isFinite(value) ? value : 0) + d); }

  function ratingFromX(clientX: number): number {
    const el = containerRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampStep(ratio * 5);
  }

  // Show half-step star fills (0.5 increments) — looks tidier than trying to
  // depict 0.1 increments visually. The numeric readout shows the real value.
  const stepped = Math.floor(value * 2) / 2;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        ref={containerRef}
        className="flex gap-1 select-none"
        style={{ touchAction: 'none', cursor: 'pointer' }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          set(ratingFromX(e.clientX));
        }}
        onPointerMove={(e) => { if (dragging.current) set(ratingFromX(e.clientX)); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onPointerLeave={() => { dragging.current = false; }}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const full = i < Math.floor(stepped);
          const half = !full && i === Math.floor(stepped) && stepped % 1 === 0.5;
          return (
            <span
              key={i}
              style={{ position: 'relative', display: 'inline-flex', width: STAR_SIZE, height: STAR_SIZE }}
            >
              <Star size={STAR_SIZE} className="absolute inset-0" style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
              {full && <Star size={STAR_SIZE} className="absolute inset-0 fill-amber-400 text-amber-400" />}
              {half && <StarHalf size={STAR_SIZE} className="absolute inset-0 fill-amber-400 text-amber-400" />}
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => bump(-0.1)}
          className="rounded-full flex items-center justify-center transition-colors hover:bg-white/5 active:scale-95"
          style={{ width: 26, height: 26, border: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}
          aria-label="Decrease rating"
        >
          <Minus size={12} />
        </button>
        <span className="text-sm font-bold tabular-nums" style={{ minWidth: 34, textAlign: 'center', color: 'var(--text-primary)' }}>
          {value.toFixed(1)}
        </span>
        <button
          type="button"
          onClick={() => bump(0.1)}
          className="rounded-full flex items-center justify-center transition-colors hover:bg-white/5 active:scale-95"
          style={{ width: 26, height: 26, border: '1px solid var(--border-medium)', color: 'var(--text-secondary)' }}
          aria-label="Increase rating"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * Review body with a "Read more" toggle. Detects whether the text actually
 * needs truncating by measuring scrollHeight vs clientHeight in the clamped
 * state — that way short reviews never get a useless "Read more" button.
 */
function ReviewBody({ content, expanded, onToggle }: { content: string; expanded: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // We measure the clamped element. If its real height is taller than
      // the rendered (clamped) height, it's truncated → show toggle.
      // Re-running when expanded changes lets us re-detect on viewport resize.
      const wasExpanded = expanded;
      // Force temporarily-clamped state for measurement
      if (wasExpanded) {
        setOverflowing(true);
        return;
      }
      setOverflowing(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, expanded]);

  return (
    <>
      <p
        ref={ref}
        className={`text-sm leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-5'}`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <MentionText text={content} />
      </p>
      {overflowing && (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs font-semibold mt-1.5 hover:underline transition-opacity"
          style={{ color: 'var(--cyan-400)' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
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
