// supabase/functions/delete-account/index.ts
//
// In-app account deletion (Apple App Store guideline 5.1.1(v)). The client
// calls this with the user's access token in the Authorization header. We
// verify the token, then with the service-role key:
//   1. remove the user's files from the avatars + review-images buckets
//   2. delete the auth.users row, which CASCADEs to public.users and every
//      user-owned table (reviews, comments, follows, tier-list rows, device
//      tokens, notifications, reports, blocks, …).
//
// Required function secrets (supabase secrets set ...):
//   SUPABASE_URL                — project URL
//   SUPABASE_SERVICE_ROLE_KEY   — service role key (admin delete + storage)
//
// Deploy:  supabase functions deploy delete-account
// Invoke:  supabase.functions.invoke('delete-account')  (auth header auto-sent)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Remove every object under `${userId}/` in a public bucket. Best-effort:
// storage failures must not block the account deletion itself.
async function purgeBucket(admin: any, bucket: string, userId: string) {
  try {
    const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f: { name: string }) => `${userId}/${f.name}`);
      await admin.storage.from(bucket).remove(paths);
    }
  } catch (_) {
    // ignore — orphaned files are harmless and can be GC'd later
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'missing token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // Identify the caller from their JWT (cannot be spoofed — verified here).
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 1. Storage cleanup (best-effort).
    await purgeBucket(admin, 'avatars', userId);
    await purgeBucket(admin, 'review-images', userId);

    // 2. Delete the auth user → cascades through every owned table.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
