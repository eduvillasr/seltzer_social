// components/PWARegistrar.tsx
// Registers the service worker once on app boot. Mounted in the root layout.
// No UI — purely a side-effect.

'use client';

import { useEffect } from 'react';

export function PWARegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Don't register in dev — Next.js HMR + service workers fight each other.
    if (process.env.NODE_ENV !== 'production') return;

    // Register on idle so we don't block first paint.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Silent — SW failure shouldn't break the app.
      });
    };

    if (typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(register);
    } else {
      setTimeout(register, 1500);
    }
  }, []);

  return null;
}
