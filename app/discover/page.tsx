// app/discover/page.tsx
// Two-tab discovery: People (users) and Catalog (drinks + brands + tier
// lists). The search input filters whichever tab is active. Reached from
// the bottom-nav Discover tab. (Trending content lives at /trending.)

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search, X, Users, ArrowRight, Flame, Droplets, Tag,
  UserPlus, UserMinus, List as ListIcon,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { TopHeader } from '@/components/TopHeader';
import { Avatar } from '@/components/Avatar';
import { CanImage } from '@/components/CanImage';
import { FounderBadge, FOUNDERS, BetaTesterBadge, BETA_TESTERS } from '@/components/FounderBadge';
import { StarRating } from '@/components/StarRating';
import { FeedSkeleton } from '@/components/Skeletons';
import { showToast } from '@/components/Toast';
import {
  searchUsers, searchSharedTierLists, searchSeltzers, supabase,
  followUser, unfollowUser, isFollowing as checkIsFollowing, getFollowerCount,
} from '@/lib/supabase';
import { SharedTierList, User } from '@/types';

type Tab = 'people' | 'catalog';

export default function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('people');
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
      // Show brands that EITHER (a) match the query themselves, or (b) belong
      // to any drink that matched — so searching a flavor surfaces relevant brands too.
      // Brands that directly match the query are sorted first.
      const queryLower = q.toLowerCase();
      const allBrands = Array.from(new Set(
        ((drinkData || []) as Array<{ brand: string | null }>)
          .map((d) => d.brand?.trim())
          .filter((b): b is string => !!b)
      ));
      const matchingBrands = allBrands
        .sort((a, b) => {
          const aMatch = a.toLowerCase().includes(queryLower) ? 0 : 1;
          const bMatch = b.toLowerCase().includes(queryLower) ? 0 : 1;
          return aMatch - bMatch;
        })
        .slice(0, 6);

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

  // Per-tab "no results" — so the People tab can say "no people" even when
  // the Catalog tab has matches (and vice versa).
  const peopleNoResults  = hasSearched && !searching && people.length === 0;
  const catalogNoResults = hasSearched && !searching
    && drinks.length === 0
    && brands.length === 0
    && matchingLists.length === 0;

  const peopleCount  = people.length;
  const catalogCount = drinks.length + brands.length + matchingLists.length;

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
            placeholder={tab === 'people' ? 'Search people…' : 'Search drinks, brands, lists…'}
            className="input-field pl-11 pr-11"
            style={{ borderRadius: '999px', height: '44px' }}
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

        {/* ─── Tab toggle ─── */}
        <div
          className="flex gap-1 p-1 rounded-2xl"
          style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {([
            { id: 'people'  as Tab, label: 'People',  icon: <Users size={13} />,    count: peopleCount  },
            { id: 'catalog' as Tab, label: 'Catalog', icon: <Droplets size={13} />, count: catalogCount },
          ]).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: active ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
                  color: active ? '#fff' : 'var(--text-tertiary)',
                  boxShadow: active ? '0 0 12px rgba(6,182,212,0.25)' : 'none',
                }}
              >
                {t.icon} {t.label}
                {hasSearched && !searching && t.count > 0 && (
                  <span
                    className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{
                      background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                      color: active ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ─── Tab content ─── */}
        {searching ? (
          <FeedSkeleton count={2} />
        ) : tab === 'people' ? (
          <PeopleTab
            people={people}
            currentUserId={currentUserId}
            hasSearched={hasSearched}
            noResults={peopleNoResults}
            onToggleFollow={toggleFollow}
          />
        ) : (
          <CatalogTab
            brands={brands}
            drinks={drinks}
            matchingLists={matchingLists}
            hasSearched={hasSearched}
            noResults={catalogNoResults}
          />
        )}
      </main>
    </>
  );
}

// ─── PEOPLE TAB ────────────────────────────────────────────────────

interface PeopleTabProps {
  people: (User & { isFollowing?: boolean; followers?: number })[];
  currentUserId: string | null;
  hasSearched: boolean;
  noResults: boolean;
  onToggleFollow: (userId: string, currentlyFollowing: boolean) => void;
}

function PeopleTab({ people, currentUserId, hasSearched, noResults, onToggleFollow }: PeopleTabProps) {
  if (!hasSearched) {
    return (
      <div className="glass-card text-center py-10">
        <Users size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Find people</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Start typing a username to find reviewers to follow.
        </p>
      </div>
    );
  }
  if (noResults) {
    return (
      <div className="glass-card text-center py-10">
        <Users size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No people match</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try a different username.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 stagger-children">
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
                onClick={() => onToggleFollow(user.id, !!user.isFollowing)}
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
  );
}

// ─── CATALOG TAB ───────────────────────────────────────────────────

interface CatalogTabProps {
  brands: string[];
  drinks: any[];
  matchingLists: SharedTierList[];
  hasSearched: boolean;
  noResults: boolean;
}

function CatalogTab({ brands, drinks, matchingLists, hasSearched, noResults }: CatalogTabProps) {
  // Empty state of the Catalog tab — even with no search, surface
  // shortcut tiles into the deeper browse pages.
  if (!hasSearched) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/brand"
            className="rounded-2xl p-3 flex items-center gap-2.5 transition-colors hover:bg-white/5"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.22)' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,191,36,0.15)' }}>
              <Tag size={16} style={{ color: 'var(--amber-400)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Browse brands</p>
              <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>Every brand</p>
            </div>
          </Link>
          <Link
            href="/trending"
            className="rounded-2xl p-3 flex items-center gap-2.5 transition-colors hover:bg-white/5"
            style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.22)' }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.15)' }}>
              <Flame size={16} style={{ color: 'var(--cyan-400)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Trending</p>
              <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>Hot this week</p>
            </div>
          </Link>
        </div>
        <div className="glass-card text-center py-8">
          <Droplets size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Search the catalog</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Drinks, brands, and shared tier lists.
          </p>
        </div>
      </div>
    );
  }
  if (noResults) {
    return (
      <div className="glass-card text-center py-10">
        <Droplets size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No catalog matches</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try a different flavor, brand, or list name.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {/* Brands */}
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
                <CanImage
                  src={d.image_url}
                  alt={d.name}
                  className="w-12 h-14 rounded-lg flex-shrink-0"
                  style={{ border: '1px solid var(--border-subtle)' }}
                  fallback={
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.06)' }}>
                      <Droplets size={18} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  }
                />
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
    </div>
  );
}
