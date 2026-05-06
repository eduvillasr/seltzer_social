// app/review/[id]/layout.tsx
// Server-side metadata for review URLs — gives every shared link a rich preview card.

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
  const { data } = await supabase
    .from('reviews')
    .select('title, seltzer_name, brand, rating, content, user:users(username)')
    .eq('id', params.id)
    .maybeSingle();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const ogImage = `${baseUrl}/api/og/review/${params.id}`;

  if (!data) {
    return {
      title: 'Seltzer Social',
      description: 'Rate seltzers. Find your people.',
    };
  }

  const headline = data.title?.trim() || data.seltzer_name;
  const drink = `${data.brand ? data.brand + ' · ' : ''}${data.seltzer_name}`;
  const username = (data.user as any)?.username || 'someone';
  const description = data.content
    ? (data.content.length > 200 ? data.content.slice(0, 200) + '…' : data.content)
    : `${headline} — rated ${data.rating.toFixed(1)}/5 by @${username}`;

  return {
    title: `${headline} · Seltzer Social`,
    description,
    openGraph: {
      title: `${headline} (${drink})`,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: headline,
      description,
      images: [ogImage],
    },
  };
}

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
