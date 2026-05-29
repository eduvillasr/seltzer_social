// supabase/functions/push-fanout/index.ts
//
// Sends a native push for every new `notifications` row. Wire it up as a
// Supabase Database Webhook: Database -> Webhooks -> "Insert" on
// public.notifications -> HTTP POST to this function's URL.
//
// It looks up the recipient's device tokens and delivers via FCM HTTP v1
// (FCM relays to APNs for iOS). Stale tokens (404/UNREGISTERED) are pruned.
//
// Required function secrets (supabase secrets set ...):
//   SUPABASE_URL                  — your project URL
//   SUPABASE_SERVICE_ROLE_KEY     — service role key (reads all device tokens)
//   FIREBASE_PROJECT_ID           — Firebase project id
//   FIREBASE_CLIENT_EMAIL         — service-account client_email
//   FIREBASE_PRIVATE_KEY          — service-account private_key (with \n escapes)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: NotificationRecord | null;
}

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// ── Google service-account OAuth (RS256 JWT -> access token) ──────────────
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')!;
  const privateKey = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth token failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload;
    const record = payload.record;
    if (payload.type !== 'INSERT' || !record) {
      return new Response('ignored', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tokens } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', record.user_id);

    if (!tokens || tokens.length === 0) {
      return new Response('no devices', { status: 200 });
    }

    const accessToken = await getAccessToken();
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID')!;
    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const staleTokens: string[] = [];

    await Promise.all(
      tokens.map(async ({ token }: { token: string }) => {
        const message = {
          message: {
            token,
            notification: { title: record.title, body: record.body ?? '' },
            data: {
              link: record.link ?? '/',
              type: record.type,
              notificationId: record.id,
            },
            apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            android: { notification: { sound: 'default' }, priority: 'HIGH' },
          },
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });
        if (res.status === 404 || res.status === 410) {
          staleTokens.push(token);
        } else if (!res.ok) {
          const text = await res.text();
          // UNREGISTERED / INVALID_ARGUMENT also mean the token is dead.
          if (text.includes('UNREGISTERED') || text.includes('NOT_FOUND')) staleTokens.push(token);
          console.error(`FCM send failed (${res.status}): ${text}`);
        }
      }),
    );

    if (staleTokens.length > 0) {
      await supabase.from('device_tokens').delete().in('token', staleTokens);
    }

    return new Response(JSON.stringify({ sent: tokens.length, pruned: staleTokens.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('push-fanout error:', err);
    return new Response(`error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
});
