// app/app-icon/route.tsx
// Configurable PNG app icon. Renders the Seltzer droplet at any size so the
// web manifest can advertise the 192px + 512px icons stores/Android expect.
//
//   /app-icon?size=192            → 192×192 "any" icon
//   /app-icon?size=512            → 512×512 "any" icon
//   /app-icon?size=512&maskable=1 → 512×512 maskable icon (logo shrunk into
//                                    the ~80% safe zone so Android's adaptive
//                                    mask never clips it)

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Droplet artwork is shared with /icon and /apple-icon so the brand reads
// identically at every size.
function Droplet({ size }: { size: number }) {
  // Native artwork aspect ratio is 38×46.
  return (
    <svg width={size * 0.826} height={size} viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19 4 C 9 16, 4 25, 4 31 C 4 39, 11 44, 19 44 C 27 44, 34 39, 34 31 C 34 25, 29 16, 19 4 Z"
        fill="white"
        opacity="0.97"
      />
      <circle cx="13" cy="22" r="2.4" fill="#0891b2" />
      <circle cx="12.3" cy="21.3" r="0.7" fill="white" opacity="0.75" />
      <circle cx="24" cy="28" r="1.8" fill="#0891b2" />
      <circle cx="23.5" cy="27.5" r="0.5" fill="white" opacity="0.7" />
      <circle cx="17" cy="35" r="1.4" fill="#0891b2" />
      <circle cx="16.6" cy="34.6" r="0.4" fill="white" opacity="0.7" />
      <circle cx="22" cy="18" r="0.9" fill="#0891b2" />
    </svg>
  );
}

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const size = Math.min(1024, Math.max(48, parseInt(searchParams.get('size') || '512', 10)));
  const maskable = searchParams.get('maskable') === '1';

  // Maskable icons get a smaller logo so the OS mask (circle/squircle) can't
  // crop it; "any" icons fill more of the tile.
  const logoHeight = maskable ? size * 0.5 : size * 0.66;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Full-bleed background — required for maskable (no transparency).
          background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
        }}
      >
        <Droplet size={logoHeight} />
      </div>
    ),
    { width: size, height: size },
  );
}
