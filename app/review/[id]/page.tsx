// app/review/[id]/page.tsx

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Repeat2, Star, ArrowLeft, Users } from 'lucide-react';
import { Review } from '@/types';
import { Navigation } from '@/components/Navigation';
import { CommentSection } from '@/components/CommentSection';
import { RatingInput } from '@/components/RatingInput';
import {
  getReview, supabase, createLike, deleteLike, getUserLike,
  createRepost, deleteRepost, getUserRepost, createTriedIt, getTriedItStats,
} from '@/lib/supabase';

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default function ReviewPage({ params: paramsPromise }: ReviewPageProps) {
  const params = use(paramsPromise);
  const [review, setReview] = useState<Review | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [triedItRating, setTriedItRating] = useState<number>(3);
  const [triedItSubmitted, setTriedItSubmitted] = useState(false);
  const [triedItStats, setTriedItStats] = useState({ count: 0, avgRating: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
    loadReview();
  }, [params.id]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setCurrentUserId(data.session.user.id);
    }
  }

  async function loadReview() {
    setLoading(true);
    const { data, error } = await getReview(params.id);
    if (!error) {
      setReview(data);
      loadTriedItStats();
    }
    setLoading(false);
  }

  async function loadTriedItStats() {
    const { count, avgRating } = await getTriedItStats(params.id);
    setTriedItStats({ count, avgRating });
  }

  async function handleLike() {
    if (!currentUserId || !review) return;
    if (isLiked) {
      await deleteLike(currentUserId, review.id);
      setIsLiked(false);
    } else {
      await createLike(currentUserId, review.id);
      setIsLiked(true);
    }
  }

  async function handleRepost() {
    if (!currentUserId || !review) return;
    if (isReposted) {
      await deleteRepost(currentUserId, review.id);
      setIsReposted(false);
    } else {
      await createRepost(currentUserId, review.id);
      setIsReposted(true);
    }
  }

  async function handleTriedIt() {
    if (!currentUserId || !review) return;
    await createTriedIt(currentUserId, review.id, triedItRating);
    setTriedItSubmitted(true);
    loadTriedItStats();
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-24 text-center">
          <p className="text-slate-400">Loading review...</p>
        </main>
      </>
    );
  }

  if (!review) {
    return (
      <>
        <Navigation />
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-24 text-center">
          <p className="text-slate-500">Review not found</p>
        </main>
      </>
    );
  }

  const initial = review.user?.username?.charAt(0)?.toUpperCase() || '?';
  const stars = Array(5).fill(0).map((_, i) => (
    <Star key={i} size={22} className={i < Math.floor(review.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
  ));

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-24 space-y-6">
        {/* Back */}
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={16} /> Back to feed
        </Link>

        {/* Review */}
        <div className="card animate-fade-in-up" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="flex items-center gap-3 mb-5">
            <Link href={`/profile/${review.user?.username}`}>
              <div className="w-12 h-12 rounded-full avatar-gradient cursor-pointer hover:opacity-90">{initial}</div>
            </Link>
            <div>
              <Link href={`/profile/${review.user?.username}`}>
                <p className="font-semibold text-slate-800 hover:text-cyan-600 transition-colors cursor-pointer">{review.user?.username}</p>
              </Link>
              <p className="text-sm text-slate-400">{new Date(review.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>{review.seltzer_name}</h1>
          {review.brand && <p className="text-lg text-slate-500 mb-4">{review.brand}</p>}

          <div className="flex items-center gap-3 mb-5">
            <div className="flex gap-1">{stars}</div>
            <span className="text-2xl font-bold text-slate-800">{review.rating.toFixed(1)}</span>
          </div>

          {review.content && (
            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap mb-6">{review.content}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 pt-4 border-t border-slate-100">
            <button onClick={handleLike} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${isLiked ? 'text-rose-500 bg-rose-50' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}>
              <Heart size={17} className={isLiked ? 'fill-rose-500' : ''} /> Like
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-all">
              <MessageCircle size={17} /> Comment
            </button>
            <button onClick={handleRepost} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${isReposted ? 'text-emerald-500 bg-emerald-50' : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'}`}>
              <Repeat2 size={17} /> Repost
            </button>
          </div>
        </div>

        {/* Tried It */}
        <div className="card animate-fade-in-up" style={{ borderRadius: 'var(--radius-xl)', animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-cyan-600" />
            <h2 className="font-bold text-lg text-slate-800" style={{ fontFamily: 'var(--font-display)' }}>
              Have you tried this?
            </h2>
          </div>

          <div className="badge-aqua inline-flex mb-5">
            {triedItStats.count} people tried this &middot; avg {triedItStats.avgRating.toFixed(1)}
          </div>

          {currentUserId ? (
            triedItSubmitted ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm">
                Thanks for rating! Your score: {triedItRating.toFixed(1)}
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl p-5">
                <RatingInput value={triedItRating} onChange={setTriedItRating} label="Your rating" />
                <button onClick={handleTriedIt} className="btn-primary mt-4" style={{ padding: '10px 24px' }}>
                  Submit Rating
                </button>
              </div>
            )
          ) : (
            <p className="text-sm text-slate-500">
              <Link href="/auth/login" className="text-cyan-600 font-medium hover:underline">Sign in</Link> to rate
            </p>
          )}
        </div>

        {/* Comments */}
        <div className="card animate-fade-in-up" style={{ borderRadius: 'var(--radius-xl)', animationDelay: '0.2s' }}>
          <CommentSection reviewId={review.id} currentUserId={currentUserId || undefined} />
        </div>
      </main>
    </>
  );
}