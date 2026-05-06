// app/manifest.ts
// Next.js generates /manifest.webmanifest from this. Tells browsers /
// Android how to install the app to the home screen.

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Seltzer Social',
    short_name: 'Seltzer',
    description: 'Rate seltzers. Build collaborative tier lists. Find your taste-twins.',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#0a0e1a',
    theme_color: '#0a0e1a',
    orientation: 'portrait',
    scope: '/',
    categories: ['social', 'lifestyle', 'food'],
    icons: [
      // Next.js auto-generates these from app/icon.tsx + app/apple-icon.tsx.
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'any' },
      // Larger maskable variant — Android adaptive icons crop to a circle, so
      // using the same 180px asset still looks fine here.
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
