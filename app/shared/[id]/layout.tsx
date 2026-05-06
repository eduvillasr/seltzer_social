// app/shared/[id]/layout.tsx
// Server-side metadata for tier list invite URLs.

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: list } = await supabase
    .from('shared_tier_lists')
    .select('name, owner:users!shared_tier_lists_owner_id_fkey(username), partner:users!shared_tier_lists_partner_id_fkey(username)')
    .eq('id', params.id)
    .maybeSingle();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const ogImage = `${baseUrl}/api/og/shared/${params.id}`;

  if (!list) {
    return {
      title: 'Seltzer Social',
      description: 'Rate seltzers. Find your people.',
    };
  }

  const owner = (list.owner as any)?.username;
  const partner = (list.partner as any)?.username;
  const description = `A collaborative seltzer tier list by @${owner} and @${partner}. Subscribe to follow along on Seltzer Social.`;

  return {
    title: `${list.name} · Seltzer Social`,
    description,
    openGraph: {
      title: `${list.name} — tier list invite`,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: list.name,
      description,
      images: [ogImage],
    },
  };
}

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
