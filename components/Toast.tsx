// components/Toast.tsx
// Global toast notifications — call `showToast(message, type)` from anywhere.
// Mount <ToastHost /> once in the root layout.

'use client';

import { useEffect, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';
type ToastEvent = { id: number; message: string; type: ToastType; description?: string };

let _id = 0;
const listeners = new Set<(t: ToastEvent) => void>();

export function showToast(message: string, type: ToastType = 'success', description?: string) {
  const t = { id: ++_id, message, type, description };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    function onShow(t: ToastEvent) {
      setToasts((prev) => [...prev, t]);
      const timeout = t.type === 'error' ? 5000 : 2800;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, timeout);
    }
    listeners.add(onShow);
    return () => { listeners.delete(onShow); };
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none px-3"
      style={{ width: 'calc(100% - 24px)', maxWidth: '400px' }}
    >
      {toasts.map((t) => {
        const palette =
          t.type === 'success' ? { fg: '#34d399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.28)' } :
          t.type === 'error'   ? { fg: '#fb7185', bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.30)' } :
                                 { fg: '#22d3ee', bg: 'rgba(34,211,238,0.10)', border: 'rgba(34,211,238,0.28)' };
        const Icon = t.type === 'success' ? Check : t.type === 'error' ? AlertCircle : Info;

        return (
          <div
            key={t.id}
            className="pointer-events-auto rounded-2xl flex items-start gap-3 px-3.5 py-3 toast-pop"
            style={{
              background: 'rgba(10,14,26,0.94)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: `1px solid ${palette.border}`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            <div
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
              style={{ background: palette.bg, color: palette.fg }}
            >
              <Icon size={14} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                {t.message}
              </p>
              {t.description && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <style>{`
        .toast-pop {
          animation: toastPop 320ms cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        @keyframes toastPop {
          0%   { opacity: 0; transform: translateY(-16px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0)     scale(1);    }
        }
      `}</style>
    </div>
  );
}
