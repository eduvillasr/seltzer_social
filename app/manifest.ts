// app/manifest.ts
// Next.js generates /manifest.webmanifest from this. Tells browsers /
// Android how to install the app to the home screen.

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Seltzer Social',
    short_name: 'Seltzer',
    description: 'Rate seltzers. Build collaborative tier lists. Find your taste-twins.',
    lang: 'en',
    dir: 'ltr',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#0a0e1a',
    theme_color: '#0a0e1a',
    orientation: 'portrait',
    scope: '/',
    categories: ['social', 'lifestyle', 'food'],
    // Hide the "open in browser" prompt once installed.
    prefer_related_applications: false,
    icons: [
      // Small favicon-class icons (Next generates these from app/icon.tsx +
      // app/apple-icon.tsx).
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      // Install-grade icons that Android / Play / the install dialog expect.
      { src: '/app-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable variant has the logo padded into the safe zone so the
      // adaptive mask never clips it.
      { src: '/app-icon?size=512&maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
