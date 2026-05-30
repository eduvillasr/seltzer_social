// components/Navigation.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, Home, Flame, Bell, User } from 'lucide-react';
import { ensureUserProfile, getUnreadNotificationCount, supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import { AuthUser } from '@/types';

// Routes where Navigation shouldn't push to choose-username (would loop, or
// the page is part of the auth flow itself)
const AUTH_ROUTES = ['/', '/auth/login', '/auth/signup', '/auth/callback', '/auth/choose-username'];

export function Navigation() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    checkUser();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email || '' });
          loadProfile(session.user.id);
          loadUnread(session.user.id);
        } else {
          setUser(null);
          setUsername('');
          setUnreadCount(0);
        }
      }
    );
    return () => { authListener?.subscription.unsubscribe(); };
  }, []);

  // Refresh unread count when navigating away from inbox
  useEffect(() => {
    if (user?.id && pathname !== '/inbox') {
      loadUnread(user.id);
    } else if (pathname === '/inbox') {
      setUnreadCount(0);
    }
  }, [pathname]);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setUser({ id: data.session.user.id, email: data.session.user.email || '' });
      loadProfile(data.session.user.id);
      loadUnread(data.session.user.id);
    }
  }

  async function loadProfile(uid: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData.session?.user;
    const { data } = authUser
      ? await ensureUserProfile(authUser)
      : await supabase.from('users').select('username, avatar_url').eq('id', uid).maybeSingle();

    if (!data) {
      // Authenticated but no profile row yet → make them pick a username,
      // unless we're already inside the auth flow.
      if (pathname && !AUTH_ROUTES.includes(pathname)) {
        router.replace('/auth/choose-username');
      }
      return;
    }
    setUsername(data.username);
  }

  async function loadUnread(uid: string) {
    const { count } = await getUnreadNotificationCount(uid);
    setUnreadCount(count);
  }

  if (!user) return null;

  const isActive = (path: string) => {
    if (path === '/feed') return pathname === '/feed';
    return pathname?.startsWith(path);
  };

  return (
    <>
      <nav
        className="fixed left-1/2 z-50"
        style={{
          width: 'calc(100% - 24px)',
          maxWidth: '460px',
          // Float above the home indicator on iPhones; falls back to 16px on devices without inset
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          // Promote to its own GPU layer. Without this, the heavy backdrop-blur
          // below gets re-rasterized on every scroll frame in mobile WebViews,
          // which is what makes the bar look like it lags / jitters. translateZ
          // pins it to the compositor so it stays rock-steady during scroll.
          transform: 'translateX(-50%) translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
      >
        <div
          className="relative rounded-full overflow-hidden"
          style={{
            background: 'rgba(15, 20, 36, 0.65)',
            backdropFilter: 'blur(32px) saturate(200%)',
            WebkitBackdropFilter: 'blur(32px) saturate(200%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04) inset, 0 1px 0 rgba(255, 255, 255, 0.08) inset',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, transparent 50%, rgba(255, 255, 255, 0.02) 100%)' }}
          />

          <div className="relative flex items-center justify-around px-2 py-2">
            <Link
              href="/feed"
              onClick={() => haptic('selection')}
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all active:scale-95"
              style={{
                background: isActive('/feed') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive('/feed') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <Home size={20} strokeWidth={isActive('/feed') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Feed</span>
            </Link>

            <Link
              href="/discover"
              onClick={() => haptic('selection')}
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all active:scale-95"
              style={{
                // Treat /search as part of the Discover tab so both routes feel "active" — keeps old bookmarks ergonomic
                background: isActive('/discover') || isActive('/search') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive('/discover') || isActive('/search') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <Flame size={20} strokeWidth={isActive('/discover') || isActive('/search') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Discover</span>
            </Link>

            <Link
              href="/create"
              title="Write a review"
              aria-label="Write a review"
              onClick={() => haptic('medium')}
              className="flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))',
                boxShadow: '0 4px 16px rgba(6, 182, 212, 0.4), 0 0 24px rgba(6, 182, 212, 0.2)',
              }}
            >
              <Plus size={22} className="text-white" strokeWidth={2.5} />
            </Link>

            <Link
              href="/inbox"
              onClick={() => haptic('selection')}
              className="relative flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all active:scale-95"
              style={{
                background: isActive('/inbox') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive('/inbox') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <div className="relative">
                <Bell size={20} strokeWidth={isActive('/inbox') ? 2.5 : 2} />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                    style={{ background: 'var(--amber-400)', color: '#0a0e1a' }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Inbox</span>
            </Link>

            <Link
              href={`/profile/${username}`}
              onClick={() => haptic('selection')}
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all active:scale-95"
              style={{
                background: pathname?.startsWith('/profile') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: pathname?.startsWith('/profile') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <User size={20} strokeWidth={pathname?.startsWith('/profile') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Profile</span>
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
