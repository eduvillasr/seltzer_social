// app/brand/[name]/layout.tsx
// Server-side metadata for brand hub URLs. When someone shares /brand/AHA,
// the link unfurls with the brand name + how many drinks the catalog has.

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

interface Props {
  params: { name: string };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const decoded = (() => {
    try { return decodeURIComponent(params.name); } catch { return params.name; }
  })();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { count } = await supabase
    .from('seltzers')
    .select('id', { count: 'exact', head: true })
    .ilike('brand', decoded);

  if (!count) {
    return { title: `${decoded} · Seltzer Social`, description: 'Brand hub on Seltzer Social.' };
  }

  const title = `${decoded} · Brand hub`;
  const description = `${count} ${decoded} drink${count === 1 ? '' : 's'} on Seltzer Social. See community ratings, top picks, and explore the full catalog.`;

  return {
    title: `${title} · Seltzer Social`,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
