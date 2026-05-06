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
        {/* Stylized carbonated droplet — bubbles punched through the white silhouette */}
        <svg width="38" height="46" viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Droplet body */}
          <path
            d="M19 4 C 9 16, 4 25, 4 31 C 4 39, 11 44, 19 44 C 27 44, 34 39, 34 31 C 34 25, 29 16, 19 4 Z"
            fill="white"
            opacity="0.97"
          />
          {/* Carbonation bubbles — darker cyan punches through the droplet,
              tiny white inner dot gives each one a glassy highlight. */}
          <circle cx="13"   cy="22"   r="2.4" fill="#0891b2" />
          <circle cx="12.3" cy="21.3" r="0.7" fill="white" opacity="0.75" />

          <circle cx="24"   cy="28"   r="1.8" fill="#0891b2" />
          <circle cx="23.5" cy="27.5" r="0.5" fill="white" opacity="0.7" />

          <circle cx="17"   cy="35"   r="1.4" fill="#0891b2" />
          <circle cx="16.6" cy="34.6" r="0.4" fill="white" opacity="0.7" />

          <circle cx="22"   cy="18"   r="0.9" fill="#0891b2" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
