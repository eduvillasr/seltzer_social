// app/settings/page.tsx

'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { TopHeader } from '@/components/TopHeader';
import { Avatar } from '@/components/Avatar';
import { showToast } from '@/components/Toast';
import { ensureUserProfile, supabase, uploadAvatar, updateUserProfile } from '@/lib/supabase';
import { ArrowLeft, LogOut, Bell, Shield, HelpCircle, Info, ChevronRight, Droplets, Camera, Check, X, Upload, Sparkles, ImagePlus } from 'lucide-react';
import { CURRENT_VERSION, hasUnseenRelease } from '@/lib/changelog';

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // staged avatar preview before commit
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string>('');
  const [hasUnseen, setHasUnseen] = useState(false);
  const [canCurate, setCanCurate] = useState(false);

  useEffect(() => { setHasUnseen(hasUnseenRelease()); }, []);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/auth/login'); return; }
    setUserId(data.session.user.id);
    setEmail(data.session.user.email || '');
    const { data: userData } = await ensureUserProfile(data.session.user);
    if (!userData) { router.replace('/auth/choose-username'); return; }
    setUsername(userData.username);
    setBio(userData.bio || '');
    setAvatarUrl(userData.avatar_url);
    setCanCurate(!!(userData as any).can_curate);
    setLoading(false);
  }

  // ─── avatar staging + commit ─────────────────────────────────
  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Pick an image file', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image too large', 'error', 'Pick something under 5MB');
      return;
    }
    setPendingFile(file);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(URL.createObjectURL(file));
  }

  function discardPending() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview('');
  }

  async function commitAvatar() {
    if (!pendingFile || !userId) return;
    setUploading(true);
    const { url, error } = await uploadAvatar(userId, pendingFile);
    setUploading(false);
    if (url) {
      setAvatarUrl(url);
      discardPending();
      showToast('Avatar updated', 'success');
    } else if (error) {
      const msg = error.message?.toLowerCase().includes('bucket not found')
        ? 'No public image storage bucket exists. Create an "avatars" bucket in Supabase Storage.'
        : error.message;
      showToast('Upload failed', 'error', msg);
    }
  }

  async function saveBio() {
    if (!userId) return;
    setSaving(true);
    await updateUserProfile(userId, { bio });
    setSaving(false);
    showToast('Profile saved', 'success');
  }

  async function handleLogout() {
    // Stop this device from receiving the previous user's push notifications.
    const { unregisterPushNotifications } = await import('@/lib/push');
    await unregisterPushNotifications().catch(() => {});
    await supabase.auth.signOut();
    // Don't leak the previous user's profile/feed data into the next session.
    const cache = await import('@/lib/cache');
    cache.clearCache();
    router.push('/');
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="max-w-md mx-auto px-4 pt-20 pb-32 text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mx-auto animate-float">
            <Droplets size={18} className="text-white" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <TopHeader title="Settings" back="/feed" />
      <main className="max-w-md mx-auto px-4 with-top-header pb-32">
        <div className="h-4" />{/* breathing room below the fixed header */}

        {/* Profile Card with editable avatar */}
        <div className="glass-card mb-5 animate-fade-in-up">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className="relative cursor-pointer group"
                style={{ width: 72, height: 72 }}
              >
                {pendingPreview ? (
                  <img
                    src={pendingPreview}
                    alt="New avatar"
                    className="w-[72px] h-[72px] rounded-full object-cover"
                    style={{ border: '2px solid var(--cyan-400)', boxShadow: '0 0 16px rgba(34,211,238,0.4)' }}
                  />
                ) : (
                  <Avatar username={username} avatarUrl={avatarUrl} size={72} />
                )}
                {/* hover overlay */}
                <div
                  className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(10,14,26,0.55)', backdropFilter: 'blur(2px)' }}
                >
                  <Upload size={18} className="text-white" />
                </div>
                {/* uploading spinner */}
                {uploading && (
                  <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(10,14,26,0.65)' }}>
                    <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  </div>
                )}
              </div>

              {/* camera badge — only when no preview */}
              {!pendingPreview && (
                <button
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{
                    background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))',
                    border: '2px solid var(--bg-primary)',
                    boxShadow: '0 0 12px rgba(6,182,212,0.4)',
                  }}
                  title="Change avatar"
                >
                  <Camera size={12} className="text-white" />
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={pickAvatar}
                className="hidden"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>@{username}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{email}</p>

              {/* staged actions */}
              {pendingPreview && (
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    onClick={commitAvatar}
                    disabled={uploading}
                    className="btn-primary"
                    style={{ padding: '5px 10px', fontSize: '11px' }}
                  >
                    <Check size={11} /> {uploading ? 'Saving…' : 'Save photo'}
                  </button>
                  <button
                    onClick={discardPending}
                    disabled={uploading}
                    className="btn-secondary"
                    style={{ padding: '5px 8px', fontSize: '11px' }}
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bio editor */}
          <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about your seltzer taste..."
              rows={2}
              className="input-field resize-none"
              maxLength={150}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{bio.length} / 150</p>
              <button onClick={saveBio} disabled={saving} className="btn-primary" style={{ padding: '6px 14px', fontSize: '11px' }}>
                {saving ? 'Saving...' : <><Check size={11} /> Save</>}
              </button>
            </div>
          </div>

        </div>

        {/* Account */}
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--text-muted)' }}>Account</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15, 20, 36, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <SettingItem icon={<Bell size={18} />} label="Notifications" disabled />
            <SettingItem icon={<Shield size={18} />} label="Privacy" disabled />
          </div>
        </div>

        {/* Curator (founders + beta testers only) */}
        {canCurate && (
          <div className="mb-5">
            <p className="text-xs uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--text-muted)' }}>Curator</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15, 20, 36, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <SettingItem
                icon={<ImagePlus size={18} />}
                label="Improve drink images"
                href="/curator/queue"
              />
            </div>
            <p className="text-[11px] mt-2 px-1" style={{ color: 'var(--text-muted)' }}>
              You can replace canonical drink photos. Every change is logged.
            </p>
          </div>
        )}

        {/* Support */}
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--text-muted)' }}>Support</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15, 20, 36, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <SettingItem
              icon={<Sparkles size={18} />}
              label="What's New"
              href="/whats-new"
              badge={hasUnseen ? `v${CURRENT_VERSION}` : undefined}
            />
            <SettingItem icon={<HelpCircle size={18} />} label="Help & FAQ" disabled />
            <SettingItem icon={<Info size={18} />} label="About" disabled />
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-all"
          style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.15)', color: '#fb7185' }}
        >
          <LogOut size={16} /> Sign Out
        </button>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>Seltzer Social v1.0</p>
      </main>
    </>
  );
}

function SettingItem({ icon, label, href, disabled, badge }: { icon: React.ReactNode; label: string; href?: string; disabled?: boolean; badge?: string }) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3.5 transition-colors" style={{
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6, 182, 212, 0.08)', color: 'var(--cyan-400)' }}>
        {icon}
      </div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge && (
        <span
          className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--cyan-400)', border: '1px solid rgba(34,211,238,0.25)' }}
        >
          {badge}
        </span>
      )}
      {disabled ? (
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Soon</span>
      ) : (
        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
      )}
    </div>
  );
  if (href && !disabled) return <Link href={href}>{content}</Link>;
  return content;
}
