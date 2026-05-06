// app/icon.tsx
// Generates favicon.ico-equivalent at build time. No image files needed —
// Next.js renders this JSX into a PNG and serves it from /icon.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 12,
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15)',
        }}
      >
        {/* Stylized droplet — proportions match the in-app logo */}
        <svg width="38" height="46" viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19 4 C 9 16, 4 25, 4 31 C 4 39, 11 44, 19 44 C 27 44, 34 39, 34 31 C 34 25, 29 16, 19 4 Z"
            fill="white"
            opacity="0.96"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
