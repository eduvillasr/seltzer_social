// components/InstallPrompt.tsx
// Friendly bottom-sheet prompt that nudges mobile visitors to add the app
// to their home screen. Two flavors: native A2HS prompt for Chrome/Android
// (one tap install), iOS instructions card for Safari (3-step manual flow).
//
// Mounted globally in the root layout. Self-dismisses, remembers refusal
// in localStorage so it doesn't nag.

'use client';

import { useEffect, useState } from 'react';
import { Share, Plus, X, Download } from 'lucide-react';

const DISMISS_KEY = 'seltzer:install-dismissed-at';
const DISMISS_TTL_MS = 14 * 86_400_000; // re-prompt after 14 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}
function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  // Some non-Safari iOS browsers can install too, but the share-sheet
  // instructions only apply to Safari.
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS && isSafari;
}
function dismissedRecently(): boolean {
  if (typeof window === 'undefined') return true;
  const at = window.localStorage.getItem(DISMISS_KEY);
  if (!at) return false;
  return Date.now() - Number(at) < DISMISS_TTL_MS;
}

export function InstallPrompt() {
  const [show, setShow] = useState<'native' | 'ios' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    // Chrome / Android: capture the deferred prompt event so we can fire it
    // when the user taps our cyan "Install" CTA.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow('native');
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari never fires beforeinstallprompt — we have to detect manually
    // and show a how-to card.
    if (isIOSSafari()) {
      // Wait a few seconds so we don't slam the user the moment they land.
      const t = window.setTimeout(() => setShow('ios'), 4000);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setShow(null);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    else dismiss(); // either way, don't nag again immediately
  }

  if (!show) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[80] pointer-events-none px-3"
      style={{
        // Sits right above the floating bottom nav.
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        width: 'calc(100% - 24px)',
        maxWidth: '460px',
      }}
    >
      <div
        className="pointer-events-auto rounded-2xl p-3 flex items-center gap-3 install-pop"
        style={{
          background: 'rgba(10,14,26,0.96)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(34,211,238,0.28)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))', boxShadow: '0 0 16px rgba(34,211,238,0.35)' }}
        >
          <Download size={18} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
            Add to home screen
          </p>
          {show === 'native' ? (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              One tap, no app store needed.
            </p>
          ) : (
            <p className="text-xs mt-0.5 inline-flex items-center gap-1 flex-wrap" style={{ color: 'var(--text-secondary)' }}>
              Tap <Share size={11} className="inline mx-0.5" /> then <Plus size={11} className="inline mx-0.5" /> "Add to Home Screen"
            </p>
          )}
        </div>

        {show === 'native' && (
          <button onClick={install} className="btn-primary flex-shrink-0" style={{ padding: '7px 14px', fontSize: '12px' }}>
            Install
          </button>
        )}

        <button
          onClick={dismiss}
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>

      <style>{`
        .install-pop {
          animation: installPop 320ms cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        @keyframes installPop {
          0%   { opacity: 0; transform: translateY(20px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
