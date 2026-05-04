// components/Navigation.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Home, Search, Settings, User } from 'lucide-react';
import { ensureUserProfile, supabase } from '@/lib/supabase';
import { AuthUser } from '@/types';

export function Navigation() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    checkUser();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email || '' });
          loadProfile(session.user.id);
        } else {
          setUser(null);
          setUsername('');
        }
      }
    );
    return () => { authListener?.subscription.unsubscribe(); };
  }, []);

  async function checkUser() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      setUser({ id: data.session.user.id, email: data.session.user.email || '' });
      loadProfile(data.session.user.id);
    }
  }

  async function loadProfile(uid: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData.session?.user;
    const { data } = authUser
      ? await ensureUserProfile(authUser)
      : await supabase.from('users').select('username, avatar_url').eq('id', uid).single();

    if (!data) return;
    setUsername(data.username);
  }

  if (!user) return null;

  const isActive = (path: string) => {
    if (path === '/feed') return pathname === '/feed';
    return pathname?.startsWith(path);
  };

  return (
    <>
      <nav
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
        style={{ width: 'calc(100% - 24px)', maxWidth: '460px' }}
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
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all"
              style={{
                background: isActive('/feed') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive('/feed') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <Home size={20} strokeWidth={isActive('/feed') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Feed</span>
            </Link>

            <Link
              href="/search"
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all"
              style={{
                background: isActive('/search') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive('/search') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <Search size={20} strokeWidth={isActive('/search') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Search</span>
            </Link>

            <Link
              href="/create"
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
              href={`/profile/${username}`}
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all"
              style={{
                background: pathname?.startsWith('/profile') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: pathname?.startsWith('/profile') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <User size={20} strokeWidth={pathname?.startsWith('/profile') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Profile</span>
            </Link>

            <Link
              href="/settings"
              className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-full transition-all"
              style={{
                background: isActive('/settings') ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: isActive('/settings') ? 'var(--cyan-400)' : 'var(--text-tertiary)',
              }}
            >
              <Settings size={20} strokeWidth={isActive('/settings') ? 2.5 : 2} />
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Settings</span>
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
