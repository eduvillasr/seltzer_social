// app/search/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { Avatar } from '@/components/Avatar';
import { CanLoader } from '@/components/CanLoader';
import { showToast } from '@/components/Toast';
import { Search, UserPlus, UserMinus, Users, X, List, Flame } from 'lucide-react';
import {
  searchUsers, searchSharedTierLists,
  supabase, followUser, unfollowUser,
  isFollowing as checkIsFollowing, getFollowerCount,
} from '@/lib/supabase';
import { User, SharedTierList } from '@/types';

type Tab = 'people' | 'lists';

export default function SearchPage() {
  const [tab, setTab] = useState<Tab>('people');
  const [query, setQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // People
  const [people, setPeople] = useState<(User & { isFollowing?: boolean; followers?: number })[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSearched, setPeopleSearched] = useState(false);

  // Lists
  const [lists, setLists] = useState<SharedTierList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsSearched, setListsSearched] = useState(false);

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tab === 'people') loadPeople(query);
      else loadLists(query);
    }, 180);
    return () => clearTimeout(timer);
  }, [query, tab, currentUserId]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) setCurrentUserId(data.session.user.id);
  }

  async function loadPeople(q: string) {
    setPeopleLoading(true);
    setPeopleSearched(q.trim().length > 0);
    const { data } = await searchUsers(q);
    if (data) {
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
      setPeople(enriched);
    } else {
      setPeople([]);
    }
    setPeopleLoading(false);
  }

  async function loadLists(q: string) {
    setListsLoading(true);
    setListsSearched(q.trim().length > 0);
    const { data } = await searchSharedTierLists(q);
    setLists(data || []);
    setListsLoading(false);
  }

  async function handleFollowToggle(userId: string, currentlyFollowing: boolean) {
    if (!currentUserId) return;
    const target = people.find((u) => u.id === userId);
    if (currentlyFollowing) await unfollowUser(currentUserId, userId);
    else await followUser(currentUserId, userId);
    setPeople((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, isFollowing: !currentlyFollowing, followers: (u.followers || 0) + (currentlyFollowing ? -1 : 1) }
          : u
      )
    );
    showToast(
      currentlyFollowing ? 'Unfollowed' : 'Following',
      currentlyFollowing ? 'info' : 'success',
      target ? `@${target.username}` : undefined,
    );
  }

  function clearSearch() {
    setQuery('');
    setPeople([]);
    setLists([]);
    setPeopleSearched(false);
    setListsSearched(false);
  }

  const isLoading = tab === 'people' ? peopleLoading : listsLoading;
  const searched  = tab === 'people' ? peopleSearched : listsSearched;

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-20 pb-32">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Discover
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Search updates as you type.
            </p>
          </div>
          <Link
            href="/discover"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--cyan-400)' }}
          >
            <Flame size={11} /> Trending
          </Link>
        </div>

        {/* Search bar */}
        <form onSubmit={(e) => e.preventDefault()} className="mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'people' ? 'Search by username…' : 'Search tier lists…'}
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

        {/* Tab switcher */}
        <div
          className="flex gap-1 p-1 rounded-2xl mb-5"
          style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {(['people', 'lists'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: tab === t ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
                color: tab === t ? '#fff' : 'var(--text-tertiary)',
                boxShadow: tab === t ? '0 0 12px rgba(6,182,212,0.25)' : 'none',
              }}
            >
              {t === 'people' ? <><Users size={13} /> People</> : <><List size={13} /> Tier Lists</>}
            </button>
          ))}
        </div>

        {/* Results */}
        {isLoading ? (
          <CanLoader label="Searching…" />
        ) : tab === 'people' ? (
          /* ── People results ── */
          people.length > 0 ? (
            <div className="space-y-3 stagger-children">
              {people.map((user) => {
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
              <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Find people</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Start typing a username to search.</p>
            </div>
          )
        ) : (
          /* ── Tier list results ── */
          lists.length > 0 ? (
            <div className="space-y-3 stagger-children">
              {lists.map((list) => (
                <Link key={list.id} href={`/shared/${list.id}`} className="glass-card block hover:bg-white/5 transition-colors" style={{ padding: '14px' }}>
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-400)' }}
                    >
                      <List size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {list.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        @{list.owner?.username}
                        <span style={{ color: 'var(--border-strong)' }}> × </span>
                        @{list.partner?.username}
                      </p>
                    </div>
                    <p className="text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {getTimeAgo(list.updated_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : searched ? (
            <div className="glass-card text-center py-10">
              <List size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No lists found</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try a different name</p>
            </div>
          ) : (
            <div className="glass-card text-center py-10">
              <List size={28} className="mx-auto mb-3 text-cyan-400" />
              <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Browse tier lists</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Type a name to search, or see all public lists below.</p>
            </div>
          )
        )}
      </main>
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
