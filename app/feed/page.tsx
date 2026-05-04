// app/feed/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReviewCard } from '@/components/ReviewCard';
import { Navigation } from '@/components/Navigation';
import { Review, AuthUser } from '@/types';
import { getSmartFeed, getFollowingCount, getSubscribedSharedTierActivities, getSharedSuggestionActivities, supabase } from '@/lib/supabase';
import { Plus, Droplets, Search, Sparkles, ListPlus, Vote } from 'lucide-react';

export default function FeedPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sharedActivities, setSharedActivities] = useState<any[]>([]);
  const [suggestionActivities, setSuggestionActivities] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [followingCount, setFollowingCount] = useState(0);
  const router = useRouter();

  useEffect(() => { checkUser(); }, []);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/'); return; }
    const uid = data.session.user.id;
    setCurrentUser({ id: uid, email: data.session.user.email || '' });
    loadFeed(uid);
  }

  async function loadFeed(uid: string) {
    setLoading(true);
    const { count: fc } = await getFollowingCount(uid);
    setFollowingCount(fc);
    const [{ data }, { data: activities }, { data: suggestions }] = await Promise.all([
      getSmartFeed(uid, 50),
      getSubscribedSharedTierActivities(uid, 12),
      getSharedSuggestionActivities(uid, 12),
    ]);
    setReviews(data || []);
    setSharedActivities(activities || []);
    setSuggestionActivities(suggestions || []);
    setLoading(false);
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-10 pb-32">

        {/* Subtle header — feed label */}
        <div className="flex items-center justify-between mb-5 animate-fade-in-up">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-400" />
            <h1 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {followingCount > 0 ? 'Your Feed' : 'Discover'}
            </h1>
          </div>
          {followingCount === 0 && (
            <Link
              href="/search"
              className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--cyan-400)' }}
            >
              <Search size={12} /> Find people
            </Link>
          )}
        </div>

        <Link
          href="/shared/create"
          className="mb-4 flex items-center justify-between rounded-2xl px-4 py-3 transition-colors hover:bg-white/5"
          style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.14)' }}
        >
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Start a shared tier list</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Invite a mutual follower, then people can subscribe.</p>
          </div>
          <ListPlus size={18} className="text-cyan-400" />
        </Link>

        {/* Feed */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center mx-auto mb-4 animate-float animate-glow">
              <Droplets size={20} className="text-white" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
          </div>
        ) : reviews.length === 0 && sharedActivities.length === 0 && suggestionActivities.length === 0 ? (
          <div className="glass-card text-center py-12 animate-fade-in-up">
            <Droplets size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Nothing here yet
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              Be the first to share your seltzer experience!
            </p>
            <Link href="/create" className="btn-primary inline-flex">
              <Plus size={14} /> Write a Review
            </Link>
          </div>
        ) : (
          <div className="space-y-4 stagger-children">
            {suggestionActivities.map((suggestion) => {
              const tried = suggestion.trials?.some((trial: any) => trial.user_id === currentUser?.id);
              return (
                <Link
                  key={`suggestion-${suggestion.id}`}
                  href={`/shared/${suggestion.list_id}`}
                  className="glass-card block"
                  style={{ padding: '16px', borderColor: tried ? 'var(--border-subtle)' : 'rgba(251,191,36,0.22)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--amber-400)' }}>
                      <Vote size={17} />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: tried ? 'var(--cyan-400)' : 'var(--amber-400)' }}>
                        {tried ? 'Ready to vote' : 'Try it to vote'}
                      </p>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>@{suggestion.created_by_user?.username}</span>
                        {' '}suggested adding <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{suggestion.seltzer_name}</span> to{' '}
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{suggestion.list?.name}</span>.
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
            {sharedActivities.map((activity) => (
              <Link
                key={`shared-${activity.id}`}
                href={`/shared/${activity.list_id}`}
                className="glass-card block"
                style={{ padding: '16px' }}
              >
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--cyan-400)' }}>Shared list update</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>@{activity.list?.owner?.username}</span>
                  {' '}and{' '}
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>@{activity.list?.partner?.username}</span>
                  {' '}just added <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{activity.seltzer_name}</span> to{' '}
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{activity.list?.name}</span>.
                </p>
              </Link>
            ))}
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} currentUserId={currentUser?.id} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
