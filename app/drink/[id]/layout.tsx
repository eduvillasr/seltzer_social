// app/drink/[id]/layout.tsx
// Server-side metadata for canonical drink URLs. Shared drink links unfurl
// with brand, name, community avg rating, and the canonical can image.

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

  // Fetch the drink itself + its community stats from the materialized view.
  const [{ data: drink }, { data: stats }] = await Promise.all([
    supabase.from('seltzers').select('brand, name, image_url').eq('id', params.id).maybeSingle(),
    supabase.from('drink_stats').select('avg_rating, review_count').eq('seltzer_id', params.id).maybeSingle(),
  ]);

  if (!drink) {
    return { title: 'Seltzer Social', description: 'Rate seltzers. Find your people.' };
  }

  const title = `${drink.name} · ${drink.brand}`;
  const description = stats && stats.review_count > 0
    ? `${drink.brand} ${drink.name} — ${stats.avg_rating.toFixed(1)}/5 across ${stats.review_count} reviews on Seltzer Social.`
    : `${drink.brand} ${drink.name} — be the first to review on Seltzer Social.`;

  return {
    title: `${title} · Seltzer Social`,
    description,
    openGraph: {
      title,
      description,
      images: drink.image_url ? [{ url: drink.image_url, width: 600, height: 800 }] : undefined,
      type: 'website',
    },
    twitter: {
      card: drink.image_url ? 'summary_large_image' : 'summary',
      title,
      description,
      images: drink.image_url ? [drink.image_url] : undefined,
    },
  };
}

export default function DrinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
