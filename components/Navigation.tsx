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

  const profileActive = !!pathname?.startsWith('/profile');
  const discoverActive = isActive('/discover') || isActive('/search');

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        // Solid, edge-to-edge bar (Instagram/Letterboxd style). No heavy
        // backdrop-blur, so the WebView never re-rasterizes it on scroll — that
        // was the source of the jitter. paddingBottom clears the home indicator.
        background: 'rgba(10, 14, 26, 0.97)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div className="flex items-stretch" style={{ height: 54 }}>
        <NavTab href="/feed" label="Feed" active={isActive('/feed')} onTap={() => haptic('selection')}>
          <Home size={23} strokeWidth={isActive('/feed') ? 2.5 : 2} />
        </NavTab>

        <NavTab href="/discover" label="Discover" active={discoverActive} onTap={() => haptic('selection')}>
          <Flame size={23} strokeWidth={discoverActive ? 2.5 : 2} />
        </NavTab>

        {/* Create — emphasized but inline (no floating bubble) */}
        <Link
          href="/create"
          title="Write a review"
          aria-label="Write a review"
          onClick={() => haptic('medium')}
          className="flex-1 flex items-center justify-center active:scale-95 transition-transform"
        >
          <div
            className="flex items-center justify-center"
            style={{ width: 40, height: 30, borderRadius: 10, background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))', boxShadow: '0 2px 8px rgba(6,182,212,0.4)' }}
          >
            <Plus size={20} className="text-white" strokeWidth={2.6} />
          </div>
        </Link>

        <NavTab href="/inbox" label="Inbox" active={isActive('/inbox')} onTap={() => haptic('selection')}>
          <span className="relative">
            <Bell size={23} strokeWidth={isActive('/inbox') ? 2.5 : 2} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                style={{ background: 'var(--amber-400)', color: '#0a0e1a' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
        </NavTab>

        <NavTab href={`/profile/${username}`} label="Profile" active={profileActive} onTap={() => haptic('selection')}>
          <User size={23} strokeWidth={profileActive ? 2.5 : 2} />
        </NavTab>
      </div>
    </nav>
  );
}

// A single full-width nav tab — even flex column, active = cyan.
function NavTab({
  href, label, active, onTap, children,
}: {
  href: string;
  label: string;
  active: boolean;
  onTap: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onTap}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
      style={{ color: active ? 'var(--cyan-400)' : 'var(--text-tertiary)' }}
    >
      {children}
      <span style={{ fontSize: '10px', fontWeight: active ? 700 : 600 }}>{label}</span>
    </Link>
  );
}
