// app/settings/blocked/page.tsx
//
// Manage blocked accounts. Lists everyone the signed-in user has blocked
// (via the report/block menu on profiles, reviews, and comments) and lets
// them unblock — completing the moderation loop App Store review expects.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopHeader } from '@/components/TopHeader';
import { Avatar } from '@/components/Avatar';
import { CanLoader } from '@/components/CanLoader';
import { showToast } from '@/components/Toast';
import { haptic } from '@/lib/haptics';
import { supabase, getBlockedUsers, unblockUser } from '@/lib/supabase';
import { ShieldOff } from 'lucide-react';

type BlockedUser = { id: string; username: string; avatar_url: string | null; bio: string | null };

export default function BlockedAccountsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { boot(); /* eslint-disable-line */ }, []);

  async function boot() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/auth/login'); return; }
    const id = data.session.user.id;
    setUserId(id);
    setBlocked(await getBlockedUsers(id));
    setLoading(false);
  }

  async function handleUnblock(target: BlockedUser) {
    if (busy) return;
    haptic('light');
    setBusy(target.id);
    const { error } = await unblockUser(userId, target.id);
    setBusy(null);
    if (error) {
      showToast('Could not unblock', 'error', error.message);
      return;
    }
    setBlocked((prev) => prev.filter((b) => b.id !== target.id));
    showToast(`Unblocked @${target.username}`, 'success', 'Their content can appear again.');
  }

  return (
    <>
      <TopHeader title="Blocked accounts" back="/settings" />
      <main className="max-w-md mx-auto px-4 with-top-header pb-32">
        <div className="h-4" />

        {loading ? (
          <CanLoader />
        ) : blocked.length === 0 ? (
          <div className="glass-card text-center py-12">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(34,211,238,0.08)' }}
            >
              <ShieldOff size={22} style={{ color: 'var(--cyan-400)' }} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              No blocked accounts
            </p>
            <p className="text-xs mt-1.5 px-6" style={{ color: 'var(--text-muted)' }}>
              When you block someone, they show up here so you can unblock them anytime.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs px-1 mb-3" style={{ color: 'var(--text-muted)' }}>
              Blocked accounts can't appear in your feeds or comment threads. Unblock to undo.
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {blocked.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <Link href={`/profile/${b.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar username={b.username} avatarUrl={b.avatar_url} size={40} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        @{b.username}
                      </p>
                      {b.bio && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{b.bio}</p>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => handleUnblock(b)}
                    disabled={busy === b.id}
                    className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
                    style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--cyan-400)', border: '1px solid rgba(34,211,238,0.25)' }}
                  >
                    {busy === b.id ? 'Unblocking…' : 'Unblock'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
