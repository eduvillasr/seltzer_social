// app/search/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { Avatar } from '@/components/Avatar';
import { Search, UserPlus, UserMinus, Users, X } from 'lucide-react';
import { searchUsers, supabase, followUser, unfollowUser, isFollowing as checkIsFollowing, getFollowerCount } from '@/lib/supabase';
import { User } from '@/types';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(User & { isFollowing?: boolean; followers?: number })[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers(query);
    }, 180);
    return () => clearTimeout(timer);
  }, [query, currentUserId]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) setCurrentUserId(data.session.user.id);
  }

  async function loadUsers(searchQuery: string) {
    setLoading(true);
    setSearched(searchQuery.trim().length > 0);

    const { data, error } = await searchUsers(searchQuery);
    if (!error && data) {
      const enriched = await Promise.all(
        data.map(async (user) => {
          let following = false;
          if (currentUserId && user.id !== currentUserId) {
            const { isFollowing: f } = await checkIsFollowing(currentUserId, user.id);
            following = f;
          }
          const { count } = await getFollowerCount(user.id);
          return { ...user, isFollowing: following, followers: count };
        })
      );
      setResults(enriched);
    } else {
      setResults([]);
    }
    setLoading(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await loadUsers(query);
  }

  async function handleFollowToggle(userId: string, currentlyFollowing: boolean) {
    if (!currentUserId) return;
    if (currentlyFollowing) {
      await unfollowUser(currentUserId, userId);
    } else {
      await followUser(currentUserId, userId);
    }
    setResults(prev =>
      prev.map(u =>
        u.id === userId
          ? { ...u, isFollowing: !currentlyFollowing, followers: (u.followers || 0) + (currentlyFollowing ? -1 : 1) }
          : u
      )
    );
  }

  function clearSearch() {
    setQuery('');
    setResults([]);
    setSearched(false);
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-20 pb-32">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            Find <span className="gradient-text">People</span>
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Search updates as you type.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username..."
              className="input-field pl-11 pr-11"
              style={{ borderRadius: '999px', height: '44px' }}
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </form>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Searching...</p>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-3 stagger-children">
            {results.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <div key={user.id} className="glass-card flex items-center gap-3" style={{ padding: '14px' }}>
                  <Link href={`/profile/${user.username}`}>
                    <div className="cursor-pointer hover:scale-105 transition-transform">
                      <Avatar username={user.username} avatarUrl={user.avatar_url} size={44} />
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${user.username}`}>
                      <p className="font-bold text-sm hover:text-cyan-400 transition-colors cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                        @{user.username}{isSelf ? ' (you)' : ''}
                      </p>
                    </Link>
                    <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Users size={11} /> {user.followers} {user.followers === 1 ? 'follower' : 'followers'}
                    </p>
                  </div>
                  {isSelf ? (
                    <Link href={`/profile/${user.username}`} className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }}>
                      View
                    </Link>
                  ) : currentUserId && (
                    <button
                      onClick={() => handleFollowToggle(user.id, !!user.isFollowing)}
                      className={user.isFollowing ? 'btn-secondary' : 'btn-primary'}
                      style={{ padding: '7px 14px', fontSize: '12px' }}
                    >
                      {user.isFollowing ? <><UserMinus size={12} /> Unfollow</> : <><UserPlus size={12} /> Follow</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : searched ? (
          <div className="glass-card text-center py-10">
            <Search size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No users found</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try a different username</p>
          </div>
        ) : (
          <div className="glass-card text-center py-10">
            <UserPlus size={28} className="mx-auto mb-3 text-cyan-400" />
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>People will show up here</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Start typing a username to narrow the list.</p>
          </div>
        )}
      </main>
    </>
  );
}
