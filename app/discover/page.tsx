// app/discover/page.tsx
// Search for people + tier lists. Reached from the bottom-nav Discover tab.
// (Trending content lives at /trending — surfaced from the Feed page header.)

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search, X, Users, ArrowRight, Flame, Droplets, Tag,
  UserPlus, UserMinus, List as ListIcon,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { TopHeader } from '@/components/TopHeader';
import { Avatar } from '@/components/Avatar';
import { FounderBadge, FOUNDERS, BetaTesterBadge, BETA_TESTERS } from '@/components/FounderBadge';
import { StarRating } from '@/components/StarRating';
import { FeedSkeleton } from '@/components/Skeletons';
import { showToast } from '@/components/Toast';
import {
  searchUsers, searchSharedTierLists, searchSeltzers, supabase,
  followUser, unfollowUser, isFollowing as checkIsFollowing, getFollowerCount,
} from '@/lib/supabase';
import { SharedTierList, User } from '@/types';

export default function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [people, setPeople] = useState<(User & { isFollowing?: boolean; followers?: number })[]>([]);
  const [matchingLists, setMatchingLists] = useState<SharedTierList[]>([]);
  const [drinks, setDrinks] = useState<any[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => { checkUser(); }, []);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) setCurrentUserId(data.session.user.id);
  }

  // Debounced search — fires 200ms after the user stops typing.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setPeople([]);
      setMatchingLists([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    setHasSearched(true);
    const handle = setTimeout(async () => {
      const [{ data: peopleData }, { data: listsData }, { data: drinkData }] = await Promise.all([
        searchUsers(q),
        searchSharedTierLists(q),
        searchSeltzers(q),
      ]);

      // Enrich people with follow state + follower counts in parallel.
      const enriched = await Promise.all(
        (peopleData || []).map(async (u: any) => {
          let isFollowingThem = false;
          if (currentUserId && u.id !== currentUserId) {
            const { isFollowing: f } = await checkIsFollowing(currentUserId, u.id);
            isFollowingThem = f;
          }
          const { count } = await getFollowerCount(u.id);
          return { ...u, isFollowing: isFollowingThem, followers: count };
        }),
      );

      // Extract unique brands from the drink search results.
      const matchingBrands = Array.from(new Set(
        ((drinkData || []) as Array<{ brand: string | null }>)
          .map((d) => d.brand?.trim())
          .filter((b): b is string => !!b && b.toLowerCase().includes(q.toLowerCase()))
      )).slice(0, 6);

      // Confirm the query hasn't changed in the meantime before updating state.
      if (q === query.trim()) {
        setPeople(enriched);
        setMatchingLists((listsData || []) as SharedTierList[]);
        setDrinks((drinkData || []).slice(0, 8));
        setBrands(matchingBrands);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, currentUserId]);

  async function toggleFollow(userId: string, currentlyFollowing: boolean) {
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

  const noResults = hasSearched && !searching
    && people.length === 0
    && matchingLists.length === 0
    && drinks.length === 0
    && brands.length === 0;

  return (
    <>
      <Navigation />
      <TopHeader
        title="Discover"
        right={
          <Link
            href="/trending"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--cyan-400)' }}
          >
            <Flame size={11} /> Trending
          </Link>
        }
      />
      <main className="max-w-md mx-auto px-4 with-top-header pb-32 space-y-5">
        <div className="h-1" />

        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drinks, brands, people, lists…"
            className="input-field pl-11 pr-11"
            style={{ borderRadius: '999px', height: '44px' }}
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        {!hasSearched ? (
          <div className="glass-card text-center py-10">
            <Search size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Search anything</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Drinks, brands, people, tier lists — one box.
            </p>
            <Link
              href="/trending"
              className="inline-flex items-center gap-1.5 mt-5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-white/5"
              style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--cyan-400)' }}
            >
              <Flame size={11} /> See what's trending →
            </Link>
          </div>
        ) : searching ? (
          <FeedSkeleton count={2} />
        ) : noResults ? (
          <div className="glass-card text-center py-10">
            <Search size={28} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No matches</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try a different name or username.</p>
          </div>
        ) : (
          <>
            {/* Brands — chip row */}
            {brands.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: 'var(--amber-400)' }}>
                    <Tag size={12} /> Brands
                  </h2>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {brands.length} match{brands.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <Link
                      key={b}
                      href={`/brand/${encodeURIComponent(b)}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-white/5"
                      style={{
                        background: 'rgba(251,191,36,0.08)',
                        border: '1px solid rgba(251,191,36,0.22)',
                        color: 'var(--amber-400)',
                      }}
                    >
                      {b} →
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Drinks */}
            {drinks.length > 0 && (
              <section className="space-y-3 stagger-children">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: 'var(--cyan-400)' }}>
                    <Droplets size={12} /> Drinks
                  </h2>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {drinks.length} match{drinks.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="space-y-2">
                  {drinks.map((d) => (
                    <Link
                      key={d.id}
                      href={`/drink/${d.id}`}
                      className="glass-card flex items-center gap-3 transition-colors hover:bg-white/5"
                      style={{ padding: '10px 12px' }}
                    >
                      {d.image_url ? (
                        <img src={d.image_url} alt={d.name} loading="lazy" className="w-12 h-14 rounded-lg object-cover flex-shrink-0" style={{ border: '1px solid var(--border-subtle)' }} />
                      ) : (
                        <div className="w-12 h-14 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid var(--border-subtle)' }}>
                          <Droplets size={18} style={{ color: 'var(--text-muted)' }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
                        {d.brand && <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{d.brand}</p>}
                      </div>
                      <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* People */}
            {people.length > 0 && (
              <section className="space-y-3 stagger-children">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: 'var(--violet-400)' }}>
                    <Users size={12} /> People
                  </h2>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {people.length} match{people.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="space-y-2">
                  {people.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <div key={user.id} className="glass-card flex items-center gap-3" style={{ padding: '12px' }}>
                        <Link href={`/profile/${user.username}`} className="flex-shrink-0">
                          <div className="cursor-pointer hover:scale-105 transition-transform">
                            <Avatar username={user.username} avatarUrl={user.avatar_url} size={40} />
                          </div>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link href={`/profile/${user.username}`}>
                            <p className="font-bold text-sm hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                              @{user.username}{isSelf ? ' (you)' : ''}
                              {FOUNDERS.has(user.username) && <FounderBadge />}
                              {BETA_TESTERS.has(user.username) && !FOUNDERS.has(user.username) && <BetaTesterBadge />}
                            </p>
                          </Link>
                          <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                            <Users size={10} /> {user.followers} {user.followers === 1 ? 'follower' : 'followers'}
                          </p>
                        </div>
                        {isSelf ? (
                          <Link href={`/profile/${user.username}`} className="btn-secondary flex-shrink-0" style={{ padding: '6px 12px', fontSize: '11px' }}>
                            View
                          </Link>
                        ) : currentUserId && (
                          <button
                            onClick={() => toggleFollow(user.id, !!user.isFollowing)}
                            className={user.isFollowing ? 'btn-secondary flex-shrink-0' : 'btn-primary flex-shrink-0'}
                            style={{ padding: '6px 12px', fontSize: '11px' }}
                          >
                            {user.isFollowing ? <><UserMinus size={11} /> Unfollow</> : <><UserPlus size={11} /> Follow</>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Tier lists */}
            {matchingLists.length > 0 && (
              <section className="space-y-3 stagger-children">
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: 'var(--cyan-400)' }}>
                    <ListIcon size={12} /> Tier Lists
                  </h2>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {matchingLists.length} match{matchingLists.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="space-y-2">
                  {matchingLists.map((list) => (
                    <Link
                      key={list.id}
                      href={`/shared/${list.id}`}
                      className="glass-card block hover:bg-white/5 transition-colors"
                      style={{ padding: '12px' }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-400)' }}
                        >
                          <ListIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{list.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            @{list.owner?.username}
                            <span style={{ color: 'var(--border-strong)' }}> × </span>
                            @{list.partner?.username}
                          </p>
                        </div>
                        <ArrowRight size={14} className="flex-shrink-0 mt-2" style={{ color: 'var(--text-muted)' }} />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
