// components/PushRegistrar.tsx
// Registers the device for native push once a user is signed in, and routes
// notification taps to the notification's deep link. No UI — pure side-effect,
// and a complete no-op on the web. Mounted in the root layout.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { registerPushNotifications } from '@/lib/push';

export function PushRegistrar() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (uid && !cancelled) registerPushNotifications(uid);
    })();

    // Re-register when someone logs in (e.g. on a fresh device).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) registerPushNotifications(session.user.id);
    });

    // Deep-link notification taps. The Edge Function ships `link` in the
    // message data payload (e.g. "/review/<id>").
    let removeTapListener: (() => void) | undefined;
    (async () => {
      try {
        // @ts-ignore optional native-only dependency
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor?.isNativePlatform?.()) return;
        // @ts-ignore optional native-only dependency
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        const handle = await FirebaseMessaging.addListener('notificationActionPerformed', (event: any) => {
          const link = event?.notification?.data?.link;
          if (typeof link === 'string' && link.startsWith('/')) router.push(link);
        });
        removeTapListener = () => handle.remove();
      } catch {
        // web build
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      removeTapListener?.();
    };
  }, [router]);

  return null;
}
