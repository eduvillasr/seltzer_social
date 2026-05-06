// app/apple-icon.tsx
// iOS home-screen icon. iOS requires a 180×180 PNG at /apple-icon.
// Next.js generates it from this JSX at build time.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
          // iOS auto-rounds the corners, but giving a tiny radius helps non-iOS contexts.
          borderRadius: 32,
        }}
      >
        <svg width="106" height="128" viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19 4 C 9 16, 4 25, 4 31 C 4 39, 11 44, 19 44 C 27 44, 34 39, 34 31 C 34 25, 29 16, 19 4 Z"
            fill="white"
            opacity="0.97"
          />
          {/* Subtle highlight bubble inside the droplet */}
          <ellipse cx="14" cy="22" rx="3" ry="5" fill="white" opacity="0.4" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
