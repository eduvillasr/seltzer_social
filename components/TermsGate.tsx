// components/TermsGate.tsx
//
// Apple 1.2 EULA gate: once a user is signed in, they must agree to the Terms
// (which carry the zero-tolerance objectionable-content policy) before they can
// use the app. Blocks the whole UI with a modal until accepted. A no-op for
// logged-out visitors. Mounted in the root layout.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { supabase, hasAcceptedTerms, acceptTerms } from '@/lib/supabase';

export function TermsGate() {
  const [uid, setUid] = useState<string | null>(null);
  const [needsAccept, setNeedsAccept] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check(userId: string | undefined) {
      if (!userId) { setUid(null); setNeedsAccept(false); return; }
      const accepted = await hasAcceptedTerms(userId);
      if (cancelled) return;
      setUid(userId);
      setNeedsAccept(!accepted);
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      check(data.session?.user?.id);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      check(session?.user?.id);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  async function handleAccept() {
    if (!uid || busy) return;
    setBusy(true);
    const { error } = await acceptTerms(uid);
    setBusy(false);
    if (!error) setNeedsAccept(false);
  }

  if (!needsAccept) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(5,8,16,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-sm rounded-3xl p-6"
        style={{ background: 'var(--bg-secondary, #0f1424)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center mb-4">
          <ShieldCheck size={22} className="text-white" />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Before you dive in
        </h2>
        <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
          Seltzer Social has zero tolerance for objectionable content or abusive behavior. Please review and agree to our{' '}
          <Link href="/terms" className="font-semibold hover:underline" style={{ color: 'var(--cyan-400)' }}>Terms &amp; Community Guidelines</Link>
          {' '}and{' '}
          <Link href="/privacy" className="font-semibold hover:underline" style={{ color: 'var(--cyan-400)' }}>Privacy Policy</Link>
          {' '}to continue.
        </p>
        <button
          onClick={handleAccept}
          disabled={busy}
          className="btn-primary w-full justify-center"
          style={{ padding: '11px', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Saving…' : 'I agree'}
        </button>
      </div>
    </div>
  );
}
