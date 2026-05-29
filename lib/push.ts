// lib/push.ts
// Native push registration (Capacitor). On a native build we ask for
// permission, grab the FCM token, and store it in `device_tokens` so the
// push-fanout Edge Function can reach this device. On the web this is a
// no-op — the dynamic imports below are guarded so the web bundle never
// depends on the native-only Capacitor plugins.

import { supabase } from './supabase';

// The plugin packages are optional (only installed for native builds), so we
// load them dynamically and swallow resolution failures.
async function loadNative(): Promise<{ Capacitor: any; FirebaseMessaging: any } | null> {
  try {
    // @ts-ignore optional native-only dependency
    const core = await import('@capacitor/core');
    const Capacitor = core.Capacitor;
    // Bail before importing the messaging plugin so plain web browsers never
    // fetch the (firebase-heavy) chunk — only the native WebView gets here.
    if (!Capacitor?.isNativePlatform?.()) return null;
    // @ts-ignore optional native-only dependency
    const messaging = await import('@capacitor-firebase/messaging');
    return { Capacitor, FirebaseMessaging: messaging.FirebaseMessaging };
  } catch {
    return null; // plugins not installed
  }
}

export async function registerPushNotifications(userId: string): Promise<void> {
  const native = await loadNative();
  if (!native) return;
  const { Capacitor, FirebaseMessaging } = native;
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

  const perm = await FirebaseMessaging.requestPermissions();
  if (perm.receive !== 'granted') return;

  const save = async (token?: string) => {
    if (!token) return;
    await supabase
      .from('device_tokens')
      .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  };

  try {
    const { token } = await FirebaseMessaging.getToken();
    await save(token);
  } catch {
    // getToken can fail before APNs registration completes; the
    // tokenReceived listener below will catch the token when it arrives.
  }

  // FCM tokens rotate — keep the stored copy fresh.
  FirebaseMessaging.addListener('tokenReceived', (e: { token?: string }) => { save(e.token); });
}

// Call on sign-out so a shared device stops receiving the previous user's
// notifications.
export async function unregisterPushNotifications(): Promise<void> {
  const native = await loadNative();
  if (!native) return;
  try {
    const { token } = await native.FirebaseMessaging.getToken();
    if (token) await supabase.from('device_tokens').delete().eq('token', token);
  } catch {
    // noop
  }
}
