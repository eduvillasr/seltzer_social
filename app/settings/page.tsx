// app/settings/page.tsx

'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { Avatar } from '@/components/Avatar';
import { ensureUserProfile, supabase, uploadAvatar, updateUserProfile } from '@/lib/supabase';
import { ArrowLeft, LogOut, Bell, Shield, HelpCircle, Info, ChevronRight, Droplets, Camera, Check } from 'lucide-react';

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
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) { router.push('/auth/login'); return; }
    setUserId(data.session.user.id);
    setEmail(data.session.user.email || '');
    const { data: userData } = await ensureUserProfile(data.session.user);
    if (userData) {
      setUsername(userData.username);
      setBio(userData.bio || '');
      setAvatarUrl(userData.avatar_url);
    }
    setLoading(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Choose an image under 5MB. The app will shrink it into a small profile icon.');
      return;
    }
    setUploading(true);
    const { url, error } = await uploadAvatar(userId, file);
    if (url) {
      setAvatarUrl(url);
      setSavedMsg('Avatar updated!');
      setTimeout(() => setSavedMsg(''), 2000);
    } else if (error) {
      const isMissingBucket = error.message?.toLowerCase().includes('bucket not found');
      alert(isMissingBucket
        ? 'Upload failed because no public image storage bucket exists. Create either an avatars bucket or a review-images bucket in Supabase Storage.'
        : 'Upload failed: ' + error.message);
    }
    setUploading(false);
  }

  async function saveBio() {
    if (!userId) return;
    setSaving(true);
    await updateUserProfile(userId, { bio });
    setSavedMsg('Profile saved!');
    setTimeout(() => setSavedMsg(''), 2000);
    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
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
      <main className="max-w-md mx-auto px-4 pt-20 pb-32">
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm mb-5 transition-colors hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="text-3xl font-extrabold mb-6" style={{ fontFamily: 'var(--font-display)' }}>
          Settings
        </h1>

        {/* Profile Card with editable avatar */}
        <div className="glass-card mb-5 animate-fade-in-up">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <Avatar username={username} avatarUrl={avatarUrl} size={72} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                style={{
                  background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))',
                  border: '2px solid var(--bg-primary)',
                  boxShadow: '0 0 12px rgba(6,182,212,0.4)',
                }}
              >
                <Camera size={12} className="text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>@{username}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{email}</p>
              {uploading && <p className="text-xs text-cyan-400 mt-1">Uploading...</p>}
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

          {savedMsg && (
            <div className="mt-3 px-3 py-2 rounded-lg text-xs text-center font-semibold" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--cyan-400)' }}>
              {savedMsg}
            </div>
          )}
        </div>

        {/* Account */}
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--text-muted)' }}>Account</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15, 20, 36, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <SettingItem icon={<Bell size={18} />} label="Notifications" disabled />
            <SettingItem icon={<Shield size={18} />} label="Privacy" disabled />
          </div>
        </div>

        {/* Support */}
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--text-muted)' }}>Support</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15, 20, 36, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
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

function SettingItem({ icon, label, href, disabled }: any) {
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
