// app/review/[id]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Star, ArrowLeft, Droplets, Check, X, ExternalLink, Pencil, Users, Share2 } from 'lucide-react';
import { StarRating } from '@/components/StarRating';
import { showToast } from '@/components/Toast';
import { Review, SharedTierListSuggestion } from '@/types';
import { TopHeader } from '@/components/TopHeader';
import { CommentSection } from '@/components/CommentSection';
import { CanImage } from '@/components/CanImage';
import { RatingInput } from '@/components/RatingInput';
import { CanLoader } from '@/components/CanLoader';
import { reviewHeadline, reviewDrinkLabel, hasCustomTitle } from '@/lib/reviewDisplay';
import {
  getReview, supabase, createLike, deleteLike, getUserLike,
  createTriedIt, getTriedItStats, getUserTriedIt,
  getSuggestionsByReviewId, voteOnSharedSuggestion, markSharedSuggestionTried,
  getSharedTierList, getCommentCount,
} from '@/lib/supabase';

interface ReviewPageProps {
  params: { id: string };
}

export default function ReviewPage({ params }: ReviewPageProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [isLiked, setIsLiked] = useState(false);
  const [triedItRating, setTriedItRating] = useState<number>(3);
  const [triedItStats, setTriedItStats] = useState({ count: 0, avgRating: 0 });
  const [existingTriedIt, setExistingTriedIt] = useState<{ rating: number } | null>(null);
  const [triedItSubmitted, setTriedItSubmitted] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pending tier list suggestion linked to this review
  const [suggestions, setSuggestions] = useState<SharedTierListSuggestion[]>([]);
  const [trialRatings, setTrialRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    checkUser();
    loadReview();
  }, [params.id]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setCurrentUserId(data.session.user.id);
      const { data: profile } = await supabase
        .from('users')
        .select('username')
        .eq('id', data.session.user.id)
        .single();
      if (profile) setCurrentUsername(profile.username);
    }
  }

  async function loadReview() {
    setLoading(true);
    const { data, error } = await getReview(params.id);
    if (!error && data) {
      setReview(data);
      loadTriedItStats();
      loadSuggestions();
      loadCommentCount();
    }
    setLoading(false);
  }

  async function loadCommentCount() {
    const { count } = await getCommentCount(params.id);
    setCommentCount(count);
  }

  async function loadSuggestions() {
    const { data } = await getSuggestionsByReviewId(params.id);
    setSuggestions(data || []);
    const defaults: Record<string, number> = {};
    (data || []).forEach((s: SharedTierListSuggestion) => { defaults[s.id] = Number(s.proposed_rating); });
    setTrialRatings(defaults);
  }

  // Load like + tried-it status once we have both review and userId
  useEffect(() => {
    if (!currentUserId || !review) return;
    getUserLike(currentUserId, review.id).then(({ data }) => setIsLiked(!!data));
    const isOwn = currentUserId === review.user_id;
    if (!isOwn) {
      getUserTriedIt(currentUserId, review.id).then(({ data }) => {
        if (data) { setExistingTriedIt({ rating: data.rating }); setTriedItRating(data.rating); }
      });
    }
  }, [currentUserId, review]);

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

  async function handleTriedIt() {
    if (!currentUserId || !review) return;
    await createTriedIt(currentUserId, review.id, triedItRating);
    setExistingTriedIt({ rating: triedItRating });
    setTriedItSubmitted(true);
    loadTriedItStats();
  }

  async function handleMarkTried(suggestion: SharedTierListSuggestion) {
    if (!currentUserId) return;
    const ratingValue = trialRatings[suggestion.id] ?? Number(suggestion.proposed_rating);
    await markSharedSuggestionTried(suggestion.id, currentUserId, ratingValue);
    loadSuggestions();
  }

  async function handleVote(suggestion: SharedTierListSuggestion, nextVote: 'approve' | 'reject') {
    if (!currentUserId || !suggestion.list) return;
    await voteOnSharedSuggestion(suggestion, suggestion.list, currentUserId, nextVote);
    loadSuggestions();
  }

  async function handleShare() {
    if (!review) return;
    const url = `${window.location.origin}/review/${review.id}`;
    const headline = review.title?.trim() || review.seltzer_name;
    const text = `${headline} — rated ${review.rating.toFixed(1)}/5 by @${review.user?.username} on Seltzer Social`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title: headline, text, url }); return; } catch { /* fallthrough */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Review link copied 🔗', 'success', 'Paste it anywhere to share.');
    } catch {
      showToast('Could not copy', 'error', url);
    }
  }

  if (loading) {
    return (
      <>
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-24">
          <CanLoader label="Pouring review…" />
        </main>
      </>
    );
  }

  if (!review) {
    return (
      <>
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-24 text-center">
          <p style={{ color: 'var(--text-secondary)' }}>Review not found</p>
        </main>
      </>
    );
  }

  const isOwnReview = currentUserId === review.user_id;

  // Only show suggestions for list members (owner or partner)
  const visibleSuggestions = suggestions.filter((s) => {
    if (!currentUserId || !s.list) return false;
    return s.list.owner_id === currentUserId || s.list.partner_id === currentUserId;
  });

  return (
    <>
      <TopHeader title="Review" back="/feed" />
      <main className="max-w-2xl mx-auto px-4 with-top-header pb-24 space-y-6">
        <div className="h-1" />{/* breathing room below the fixed header */}

        {/* Review card */}
        <div className="glass-card animate-fade-in-up">
          <div className="flex items-center gap-3 mb-5">
            <Link href={`/profile/${review.user?.username}`}>
              <div className="w-12 h-12 rounded-full avatar-gradient cursor-pointer hover:opacity-90 flex items-center justify-center text-base font-bold">
                {review.user?.username?.charAt(0)?.toUpperCase()}
              </div>
            </Link>
            <div>
              <Link href={`/profile/${review.user?.username}`}>
                <p className="font-semibold hover:text-cyan-400 transition-colors cursor-pointer" style={{ color: 'var(--text-primary)' }}>{review.user?.username}</p>
              </Link>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{new Date(review.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div className="badge-amber ml-auto"><Star size={11} className="star-filled" />{review.rating.toFixed(1)}</div>
          </div>

          <div className="flex items-start justify-between gap-3 mb-1">
            <h1 className="text-3xl font-bold flex-1 min-w-0" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{reviewHeadline(review)}</h1>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
              <button
                onClick={handleShare}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
                title="Share review"
              >
                <Share2 size={14} />
              </button>
              {isOwnReview && (
                <Link
                  href={`/review/${review.id}/edit`}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                  style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
                  title="Edit review"
                >
                  <Pencil size={14} />
                </Link>
              )}
            </div>
          </div>
          {hasCustomTitle(review) ? (
            <p className="text-base mb-4" style={{ color: 'var(--text-tertiary)' }}>
              {review.brand ? (
                <>
                  <Link href={`/brand/${encodeURIComponent(review.brand)}`} className="hover:text-cyan-400 transition-colors">
                    {review.brand}
                  </Link>
                  <span> · {review.seltzer_name}</span>
                </>
              ) : (
                reviewDrinkLabel(review)
              )}
            </p>
          ) : (
            review.brand && (
              <p className="text-base mb-4">
                <Link
                  href={`/brand/${encodeURIComponent(review.brand)}`}
                  className="hover:text-cyan-400 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {review.brand}
                </Link>
              </p>
            )
          )}

          <div className="flex items-center gap-3 mb-5">
            <StarRating value={review.rating} size={22} />
          </div>

          {review.content && (
            <p className="leading-relaxed whitespace-pre-wrap mb-6" style={{ color: 'var(--text-secondary)' }}>{review.content}</p>
          )}

          {review.image_url && (
            <CanImage src={review.image_url} alt={review.seltzer_name} className="w-full h-80 rounded-xl mb-5" loading="eager" />
          )}

          <div className="flex items-center gap-1 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={handleLike}
              disabled={!currentUserId}
              className={`action-btn ${isLiked ? 'active-like' : ''}`}
            >
              <Heart size={17} className={isLiked ? 'fill-current' : ''} /> Like
            </button>
            <span className="action-btn" style={{ cursor: 'default' }}>
              <MessageCircle size={17} /> {commentCount > 0 ? commentCount : 'Comments'}
            </span>
            {triedItStats.count > 0 && (
              <span className="badge-cyan ml-auto" style={{ fontSize: '11px' }}>
                <Droplets size={11} /> {triedItStats.count} tried · avg {triedItStats.avgRating.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* ── Community Score callout — shown when 1+ person has tried it ── */}
        {triedItStats.count > 0 && (
          <div
            className="rounded-2xl p-4 animate-fade-in-up"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(167,139,250,0.06))',
              border: '1px solid rgba(34,211,238,0.18)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(34,211,238,0.15)' }}
              >
                <span className="text-base font-extrabold leading-none" style={{ color: 'var(--cyan-400)' }}>
                  {triedItStats.avgRating.toFixed(1)}
                </span>
                <span className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>avg</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
                  Community Score
                </p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  <Users size={11} className="inline mr-1 mb-0.5" />
                  {triedItStats.count} {triedItStats.count === 1 ? 'person' : 'people'} {triedItStats.count === 1 ? 'has' : 'have'} tried this
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Reviewer's score: ⭐ {review.rating.toFixed(1)}
                  {Math.abs(triedItStats.avgRating - review.rating) >= 0.5 && (
                    <span style={{ color: triedItStats.avgRating > review.rating ? '#34d399' : '#fb7185' }}>
                      {' '}· community {triedItStats.avgRating > review.rating ? '+' : ''}{(triedItStats.avgRating - review.rating).toFixed(1)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pending tier list vote cards — only visible to list members */}
        {visibleSuggestions.map((suggestion) => {
          const tried = suggestion.trials?.some((t) => t.user_id === currentUserId);
          const userVote = suggestion.votes?.find((v) => v.user_id === currentUserId)?.vote;
          const isOwnSuggestion = suggestion.created_by === currentUserId;

          return (
            <div
              key={suggestion.id}
              className="glass-card animate-fade-in-up space-y-3"
              style={{ borderColor: 'rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.04)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--amber-400)' }}>
                    Tier List Request
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>@{suggestion.created_by_user?.username}</span>
                    {' '}wants to add this to{' '}
                    <Link href={`/shared/${suggestion.list_id}`} className="font-bold hover:text-cyan-400 transition-colors" style={{ color: 'var(--text-primary)' }}>
                      {suggestion.list?.name}
                    </Link>
                    {' '}as{' '}
                    <span className="font-bold" style={{ color: 'var(--cyan-400)' }}>
                      {suggestion.proposed_tier} tier · {Number(suggestion.proposed_rating).toFixed(1)}
                    </span>
                  </p>
                  {suggestion.proposed_note && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{suggestion.proposed_note}</p>
                  )}
                </div>
                <Link href={`/shared/${suggestion.list_id}`} className="text-xs flex items-center gap-0.5 flex-shrink-0 hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
                  <ExternalLink size={11} /> List
                </Link>
              </div>

              {!isOwnSuggestion && currentUserId && (
                !tried ? (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.14)' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--amber-400)' }}>Rate it before voting</p>
                    <div className="flex items-end gap-2">
                      <RatingInput
                        value={trialRatings[suggestion.id] ?? Number(suggestion.proposed_rating)}
                        onChange={(v) => setTrialRatings((prev) => ({ ...prev, [suggestion.id]: v }))}
                        label="Your score"
                        size="sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleMarkTried(suggestion)}
                        className="btn-primary"
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                      >
                        Tried It
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleVote(suggestion, 'approve')}
                      className={userVote === 'approve' ? 'btn-primary flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                      style={{ padding: '9px', fontSize: '12px' }}
                    >
                      <Check size={13} /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote(suggestion, 'reject')}
                      className={userVote === 'reject' ? 'btn-primary flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                      style={{ padding: '9px', fontSize: '12px' }}
                    >
                      <X size={13} /> Reject
                    </button>
                  </div>
                )
              )}

              {isOwnSuggestion && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Waiting for your partner to vote.
                  {userVote && <span style={{ color: 'var(--cyan-400)' }}> You voted: {userVote}.</span>}
                </p>
              )}
            </div>
          );
        })}

        {/* Tried It — hidden for own reviews */}
        {!isOwnReview && currentUserId && (
          <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-4">
              <Droplets size={18} className="text-cyan-400" />
              <h2 className="font-bold text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {existingTriedIt ? "You've tried this" : 'Have you tried this?'}
              </h2>
              {existingTriedIt && (
                <span className="badge-cyan ml-auto" style={{ fontSize: '11px' }}>Your rating: {existingTriedIt.rating.toFixed(1)}</span>
              )}
            </div>

            {triedItStats.count > 0 && (
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {triedItStats.count} {triedItStats.count === 1 ? 'person' : 'people'} tried this · community avg {triedItStats.avgRating.toFixed(1)}
              </p>
            )}

            {triedItSubmitted ? (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                Rating submitted! Your score: {triedItRating.toFixed(1)}
              </div>
            ) : (
              <div className="rounded-xl p-5" style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}>
                <RatingInput value={triedItRating} onChange={setTriedItRating} label={existingTriedIt ? 'Update your rating' : 'Your rating'} />
                <button onClick={handleTriedIt} className="btn-primary mt-4" style={{ padding: '10px 24px' }}>
                  {existingTriedIt ? 'Update Rating' : 'Submit Rating'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Comments */}
        <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <CommentSection
            reviewId={review.id}
            reviewSlug={review.seltzer_name}
            currentUserId={currentUserId || undefined}
            currentUsername={currentUsername || undefined}
            reviewOwnerId={review.user_id}
            onCountChange={setCommentCount}
          />
        </div>
      </main>
    </>
  );
}
