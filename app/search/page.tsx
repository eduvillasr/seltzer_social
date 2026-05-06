// app/search/page.tsx
// The standalone Search route was folded into Discover. Existing bookmarks
// and outbound links land here and immediately bounce to /discover.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/discover'); }, [router]);
  return null;
}
