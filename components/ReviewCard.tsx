// components/ReviewCard.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Repeat2, Star } from 'lucide-react';
import { Review } from '@/types';
import { Avatar } from './Avatar';
import { createLike, deleteLike, getUserLike, createRepost, deleteRepost, getUserRepost, getLikes } from '@/lib/supabase';

interface ReviewCardProps {
  review: Review;
  currentUserId?: string;
}

export function ReviewCard({ review, currentUserId }: ReviewCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUserId && review.id) checkLikeAndRepost();
    loadLikeCount();
  }, [currentUserId, review.id]);

  async function loadLikeCount() {
    const { data } = await getLikes(review.id);
    setLikeCount(data?.length || 0);
  }

  async function checkLikeAndRepost() {
    if (!currentUserId) return;
    const { data: likeData } = await getUserLike(currentUserId, review.id);
    setIsLiked(!!likeData);
    const { data: repostData } = await getUserRepost(currentUserId, review.id);
    setIsReposted(!!repostData);
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

  async function handleRepost() {
    if (!currentUserId || loading) return;
    setLoading(true);
    if (isReposted) {
      await deleteRepost(currentUserId, review.id);
      setIsReposted(false);
    } else {
      await createRepost(currentUserId, review.id);
      setIsReposted(true);
    }
    setLoading(false);
  }

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
            <p className="font-semibold text-sm hover:text-cyan-400 transition-colors cursor-pointer" style={{ color: 'var(--text-primary)' }}>{review.user?.username}</p>
          </Link>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo}</p>
        </div>
        <div className="badge-amber"><Star size={10} className="star-filled" />{review.rating.toFixed(1)}</div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <Link href={`/review/${review.id}`} className="block mb-1">
            <h3 className="font-bold text-lg hover:text-cyan-400 transition-colors cursor-pointer truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              {review.seltzer_name}
            </h3>
          </Link>
          {review.brand && <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{review.brand}</p>}

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
              <img
                src={review.image_url}
                alt={review.seltzer_name}
                className="w-20 h-24 object-cover hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={handleLike} disabled={loading || !currentUserId} className={`action-btn ${isLiked ? 'active-like' : ''}`}>
          <Heart size={15} className={isLiked ? 'fill-current' : ''} />{likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <Link href={`/review/${review.id}`} className="action-btn"><MessageCircle size={15} /><span>Comment</span></Link>
        <button onClick={handleRepost} disabled={loading || !currentUserId} className={`action-btn ${isReposted ? 'active-repost' : ''}`}>
          <Repeat2 size={15} /><span>Repost</span>
        </button>
      </div>
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
