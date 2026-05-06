// app/inbox/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, Check, CheckCheck, Trash2, Vote, AtSign, Heart, MessageCircle, UserPlus, Droplets, CornerDownRight } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { CanLoader } from '@/components/CanLoader';
import { Notification } from '@/types';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  supabase,
} from '@/lib/supabase';

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  suggestion:           { icon: <Vote size={16} />,         color: 'var(--amber-400)',  label: 'Tier List Request' },
  suggestion_approved:  { icon: <Check size={16} />,        color: 'var(--cyan-400)',   label: 'Request Approved'  },
  suggestion_rejected:  { icon: <Trash2 size={16} />,       color: 'var(--coral-400)',  label: 'Request Rejected'  },
  mention:              { icon: <AtSign size={16} />,       color: 'var(--violet-400)', label: 'Mention'           },
  like:                 { icon: <Heart size={16} />,        color: '#fb7185',           label: 'New Like'          },
  comment:              { icon: <MessageCircle size={16} />,color: 'var(--cyan-400)',   label: 'New Comment'       },
  reply:                { icon: <CornerDownRight size={16} />,color: 'var(--cyan-400)', label: 'Reply to You'      },
  follow:               { icon: <UserPlus size={16} />,     color: 'var(--violet-400)', label: 'New Follower'      },
  tried_it:             { icon: <Droplets size={16} />,     color: 'var(--cyan-400)',   label: 'Someone Tried It'  },
};

export default function InboxPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) { router.push('/auth/login'); return; }
    const uid = sessionData.session.user.id;
    setUserId(uid);
    const { data } = await getNotifications(uid);
    setNotifications(data);
    setLoading(false);
  }

  async function handleClick(n: Notification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.link) router.push(n.link);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-10 pb-32">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Bell size={18} style={{ color: 'var(--cyan-400)' }} />
            <h1 className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
              Inbox
              {unreadCount > 0 && (
                <span
                  className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--amber-400)', border: '1px solid rgba(251,191,36,0.25)' }}
                >
                  {unreadCount} new
                </span>
              )}
            </h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--cyan-400)' }}
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <CanLoader />
        ) : notifications.length === 0 ? (
          <div className="glass-card text-center py-14">
            <Bell size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>All clear</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.suggestion;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className="glass-card flex items-start gap-3 cursor-pointer hover:bg-white/5 transition-colors group"
                  style={{
                    padding: '14px',
                    borderColor: n.read ? 'var(--border-subtle)' : `${meta.color}44`,
                    background: n.read ? undefined : `${meta.color}08`,
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${meta.color}18`, color: meta.color }}
                  >
                    {meta.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="text-xs uppercase tracking-wider font-semibold mb-0.5"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </p>
                      {!n.read && (
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                          style={{ background: meta.color }}
                        />
                      )}
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                    {n.body && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>}
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {getTimeAgo(n.created_at)}
                    </p>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, n.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity action-btn flex-shrink-0"
                    style={{ padding: '4px 6px', color: 'var(--text-muted)' }}
                    title="Dismiss"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
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
