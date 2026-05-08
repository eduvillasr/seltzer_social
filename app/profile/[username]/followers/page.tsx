// app/profile/[username]/followers/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { BackHeader } from '@/components/BackHeader';
import { Avatar } from '@/components/Avatar';
import { ArrowLeft, Users, UserPlus, UserMinus } from 'lucide-react';
import { getUserByUsername, getFollowers, supabase, isFollowing as checkIsFollowing, followUser, unfollowUser } from '@/lib/supabase';
import { User } from '@/types';
import { CanLoader } from '@/components/CanLoader';

interface PageProps {
  params: { username: string };
}

export default function FollowersPage({ params }: PageProps) {
  const [followers, setFollowers] = useState<(User & { isFollowing?: boolean })[]>([]);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [params.username]);

  async function load() {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const cuid = session.session?.user?.id || null;
    setCurrentUserId(cuid);

    const { data: pUser } = await getUserByUsername(params.username);
    if (pUser) {
      setProfileUser(pUser);
      const { data: followersData } = await getFollowers(pUser.id);
      const enriched = await Promise.all(
        (followersData || []).map(async (u: User) => {
          if (cuid && u.id !== cuid) {
            const { isFollowing: f } = await checkIsFollowing(cuid, u.id);
            return { ...u, isFollowing: f };
          }
          return { ...u, isFollowing: false };
        })
      );
      setFollowers(enriched);
    }
    setLoading(false);
  }

  async function handleFollowToggle(userId: string, currentlyFollowing: boolean) {
    if (!currentUserId) return;
    if (currentlyFollowing) {
      await unfollowUser(currentUserId, userId);
    } else {
      await followUser(currentUserId, userId);
    }
    setFollowers(prev => prev.map(u => u.id === userId ? { ...u, isFollowing: !currentlyFollowing } : u));
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-20 pb-32">
        <BackHeader href={`/profile/${params.username}`} label="Back to profile" />

        <h1 className="text-2xl font-extrabold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Followers
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          People following @{params.username}
        </p>

        {loading ? (
          <CanLoader />
        ) : followers.length === 0 ? (
          <div className="glass-card text-center py-10">
            <Users size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No followers yet</p>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {followers.map(user => (
              <div key={user.id} className="glass-card flex items-center gap-3" style={{ padding: '14px' }}>
                <Link href={`/profile/${user.username}`}>
                  <Avatar username={user.username} avatarUrl={user.avatar_url} size={44} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${user.username}`}>
                    <p className="font-bold text-sm hover:text-cyan-400 transition-colors cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                      @{user.username}
                    </p>
                  </Link>
                  {user.bio && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user.bio}</p>}
                </div>
                {currentUserId && user.id !== currentUserId && (
                  <button
                    onClick={() => handleFollowToggle(user.id, !!user.isFollowing)}
                    className={user.isFollowing ? 'btn-secondary' : 'btn-primary'}
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                  >
                    {user.isFollowing ? <><UserMinus size={11} /> Unfollow</> : <><UserPlus size={11} /> Follow</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
