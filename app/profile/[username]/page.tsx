// app/profile/[username]/page.tsx

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Review, SharedTierList, User } from '@/types';
import { Navigation } from '@/components/Navigation';
import { ReviewCard } from '@/components/ReviewCard';
import { Avatar } from '@/components/Avatar';
import {
  getUserByUsername, getUserReviews, supabase,
  followUser, unfollowUser, isFollowing as checkIsFollowing,
  getFollowerCount, getFollowingCount, getSharedTierLists, getUserSubscribedSharedTierLists,
} from '@/lib/supabase';
import { ArrowLeft, Calendar, Droplets, UserPlus, UserMinus, List, Settings, ListPlus } from 'lucide-react';

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export default function ProfilePage({ params: paramsPromise }: ProfilePageProps) {
  const params = use(paramsPromise);
  const [user, setUser] = useState<User | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeLists, setActiveLists] = useState<SharedTierList[]>([]);
  const [subscribedLists, setSubscribedLists] = useState<SharedTierList[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lists' | 'reviews'>('lists');

  useEffect(() => { checkUser(); }, []);
  useEffect(() => { loadProfile(); }, [params.username, currentUserId]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) setCurrentUserId(data.session.user.id);
  }

  async function loadProfile() {
    setLoading(true);
    const { data: userData, error: userError } = await getUserByUsername(params.username);
    if (!userError && userData) {
      setUser(userData);
      const { data: reviewsData } = await getUserReviews(userData.id);
      const [{ data: activeListData }, { data: subscribedListData }] = await Promise.all([
        getSharedTierLists(userData.id),
        getUserSubscribedSharedTierLists(userData.id),
      ]);
      setReviews(reviewsData || []);
      setActiveLists(activeListData || []);
      setSubscribedLists(subscribedListData || []);
      const { count: fc } = await getFollowerCount(userData.id);
      const { count: fgc } = await getFollowingCount(userData.id);
      setFollowerCount(fc);
      setFollowingCount(fgc);
      if (currentUserId) {
        const { isFollowing: following } = await checkIsFollowing(currentUserId, userData.id);
        setIsFollowing(following);
      }
    }
    setLoading(false);
  }

  async function handleFollowToggle() {
    if (!currentUserId || !user) return;
    if (isFollowing) {
      await unfollowUser(currentUserId, user.id);
      setIsFollowing(false);
      setFollowerCount(Math.max(0, followerCount - 1));
    } else {
      await followUser(currentUserId, user.id);
      setIsFollowing(true);
      setFollowerCount(followerCount + 1);
    }
  }

  if (loading) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mx-auto animate-float"><Droplets size={18} className="text-white" /></div></main></>);
  }

  if (!user) {
    return (<><Navigation /><main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center"><p style={{ color: 'var(--text-secondary)' }}>User not found</p></main></>);
  }

  const isOwnProfile = currentUserId === user.id;
  const allListsCount = activeLists.length + subscribedLists.length;

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-20 pb-32 space-y-5">
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm transition-colors hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back
        </Link>

        {/* Profile Header */}
        <div className="glass-card animate-fade-in-up">
          <div className="flex items-start gap-3 mb-4">
            <Avatar username={user.username} avatarUrl={user.avatar_url} size={64} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>@{user.username}</h1>
                  {user.bio && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{user.bio}</p>}
                  <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <Calendar size={10} /> Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                </div>
                {isOwnProfile ? (
                  <Link href="/settings" className="btn-secondary flex-shrink-0" style={{ padding: '6px 12px', fontSize: '11px' }}>
                    <Settings size={12} /> Edit
                  </Link>
                ) : currentUserId ? (
                  <button onClick={handleFollowToggle} className={isFollowing ? 'btn-secondary' : 'btn-primary'} style={{ padding: '6px 14px', fontSize: '11px' }}>
                    {isFollowing ? <><UserMinus size={11} /> Unfollow</> : <><UserPlus size={11} /> Follow</>}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Stats — Followers/Following are clickable */}
          <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="text-center">
              <p className="text-base font-bold gradient-text">{allListsCount}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Lists</p>
            </div>
            <Link href={`/profile/${user.username}/followers`} className="text-center hover:opacity-80 transition-opacity">
              <p className="text-base font-bold" style={{ color: 'var(--violet-400)' }}>{followerCount}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Followers</p>
            </Link>
            <Link href={`/profile/${user.username}/following`} className="text-center hover:opacity-80 transition-opacity">
              <p className="text-base font-bold" style={{ color: 'var(--cyan-400)' }}>{followingCount}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Following</p>
            </Link>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setView('lists')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: view === 'lists' ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
              color: view === 'lists' ? '#fff' : 'var(--text-tertiary)',
              boxShadow: view === 'lists' ? '0 0 12px rgba(6,182,212,0.25)' : 'none',
            }}
          >
            <ListPlus size={13} /> Lists
          </button>
          <button
            onClick={() => setView('reviews')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: view === 'reviews' ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
              color: view === 'reviews' ? '#fff' : 'var(--text-tertiary)',
              boxShadow: view === 'reviews' ? '0 0 12px rgba(6,182,212,0.25)' : 'none',
            }}
          >
            <List size={13} /> Reviews
          </button>
        </div>

        {view === 'lists' && (
          <div className="animate-fade-in-up">
            <h2 className="font-bold text-sm mb-3 px-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>
              Active Tier Lists
            </h2>
            {activeLists.length === 0 && subscribedLists.length === 0 ? (
              <div className="glass-card text-center py-10">
                <ListPlus size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No tier list activity yet</p>
                {isOwnProfile && (
                  <Link href="/shared/create" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>
                    <ListPlus size={13} /> Start a List
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {activeLists.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>Contributes To</p>
                    {activeLists.map((list) => <ListRow key={list.id} list={list} badge="Active" />)}
                  </div>
                )}
                {subscribedLists.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>Subscribed</p>
                    {subscribedLists.map((list) => <ListRow key={list.id} list={list} badge="Subscribed" />)}
                  </div>
                )}
                {isOwnProfile && (
                  <Link href="/shared/create" className="btn-secondary w-full justify-center" style={{ padding: '10px', fontSize: '12px' }}>
                    <ListPlus size={13} /> Create shared tier list
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'reviews' && (
          <div>
            <h2 className="font-bold text-sm mb-3 px-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}>Reviews</h2>
            {reviews.length === 0 ? (
              <div className="glass-card text-center py-10">
                <Droplets size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No reviews yet</p>
                {isOwnProfile && (<Link href="/create" className="btn-primary mt-4 inline-flex" style={{ padding: '8px 16px', fontSize: '12px' }}>Write Your First Review</Link>)}
              </div>
            ) : (
              <div className="space-y-4 stagger-children">
                {reviews.map((review) => (<ReviewCard key={review.id} review={review} currentUserId={currentUserId || undefined} />))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function ListRow({ list, badge }: { list: SharedTierList; badge: string }) {
  return (
    <Link href={`/shared/${list.id}`} className="glass-card block transition-colors hover:bg-white/5" style={{ padding: '14px' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{list.name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            @{list.owner?.username} + @{list.partner?.username}
          </p>
        </div>
        <span className="badge-cyan flex-shrink-0" style={{ fontSize: '10px', padding: '3px 8px' }}>{badge}</span>
      </div>
    </Link>
  );
}
