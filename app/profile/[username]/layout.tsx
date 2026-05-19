// app/profile/[username]/layout.tsx
// Server-side metadata for user profile URLs.

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

interface Props {
  params: { username: string };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: user } = await supabase
    .from('users')
    .select('id, username, bio, avatar_url')
    .ilike('username', params.username)
    .maybeSingle();

  if (!user) {
    return { title: `@${params.username} · Seltzer Social` };
  }

  // (No count fetch — keeps generateMetadata fast. Description below uses
  // a static phrasing instead of "reviewed N drinks".)

  const title = `@${user.username}`;
  const description = user.bio
    ? user.bio
    : `${user.username}'s seltzer reviews on Seltzer Social.`;

  return {
    title: `${title} · Seltzer Social`,
    description,
    openGraph: {
      title,
      description,
      images: user.avatar_url ? [{ url: user.avatar_url, width: 200, height: 200 }] : undefined,
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: user.avatar_url ? [user.avatar_url] : undefined,
    },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
