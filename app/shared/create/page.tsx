'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ListPlus, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { Avatar } from '@/components/Avatar';
import { createSharedTierList, getMutualFollows, supabase } from '@/lib/supabase';
import { User } from '@/types';
import { CanLoader } from '@/components/CanLoader';

export default function CreateSharedListPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [mutuals, setMutuals] = useState<User[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/auth/login'); return; }
    setUserId(data.session.user.id);
    const { data: mutualData } = await getMutualFollows(data.session.user.id);
    setMutuals(mutualData || []);
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name your shared list.'); return; }
    if (!partnerId) { setError('Choose a mutual follower.'); return; }

    setSaving(true);
    setError('');
    const { data, error: dbError } = await createSharedTierList(userId, partnerId, name.trim());
    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }
    router.push(`/shared/${data.id}`);
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-10 pb-32">
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm mb-5 hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="text-2xl font-extrabold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Shared <span className="gradient-text">Tier List</span>
        </h1>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          Pick someone who follows you and you follow back.
        </p>

        {loading ? (
          <CanLoader />
        ) : (
          <form onSubmit={submit} className="glass-card space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>List Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Weekend cans, Office fridge, Summer lineup..." />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Invite Mutual</label>
              {mutuals.length === 0 ? (
                <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(15,20,36,0.6)', color: 'var(--text-secondary)' }}>
                  No mutual followers yet. Follow someone who follows you back, then create a shared list.
                </div>
              ) : (
                <div className="space-y-2">
                  {mutuals.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setPartnerId(user.id)}
                      className="w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-white/5"
                      style={{
                        border: partnerId === user.id ? '1px solid var(--cyan-400)' : '1px solid var(--border-subtle)',
                        background: partnerId === user.id ? 'rgba(6,182,212,0.08)' : 'rgba(15,20,36,0.5)',
                      }}
                    >
                      <Avatar username={user.username} avatarUrl={user.avatar_url} size={38} />
                      <span className="font-semibold text-sm">@{user.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs">{error}</div>}

            <button type="submit" disabled={saving || mutuals.length === 0} className="btn-primary w-full justify-center" style={{ padding: '13px' }}>
              <ListPlus size={15} /> {saving ? 'Creating...' : 'Create Public List'}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
