// app/api/og/review/[id]/route.tsx
// Dynamic Open Graph image for shared review URLs.
// Renders a 1200×630 PNG when iMessage / Twitter / Discord / Slack
// expand a review link.

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};
function ratingToTier(v: number) {
  if (v >= 4.5) return 'S'; if (v >= 4) return 'A'; if (v >= 3) return 'B';
  if (v >= 2)   return 'C'; if (v >= 1) return 'D'; return 'F';
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  // Edge runtime — make our own Supabase client (the shared lib uses browser Supabase).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: review } = await supabase
    .from('reviews')
    .select('title, seltzer_name, brand, rating, content, image_url, user:users(username)')
    .eq('id', params.id)
    .maybeSingle();

  if (!review) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: '#0a0e1a', color: '#94a3b8', fontSize: 32,
          }}
        >
          Review not found
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const tier = ratingToTier(review.rating);
  const tierColor = TIER_COLORS[tier];
  const headline = review.title?.trim() || review.seltzer_name;
  const subline = review.title?.trim()
    ? `${review.brand ? review.brand + ' · ' : ''}${review.seltzer_name}`
    : review.brand ?? '';
  const username = (review.user as any)?.username || 'someone';
  const snippet = review.content
    ? (review.content.length > 160 ? review.content.slice(0, 160) + '…' : review.content)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex',
          background: '#0a0e1a', color: '#f1f5f9', position: 'relative',
        }}
      >
        {/* Glow blobs */}
        <div style={{
          position: 'absolute', top: -120, right: -80,
          width: 480, height: 480, borderRadius: 9999,
          background: `radial-gradient(closest-side, ${tierColor}33, transparent)`,
        }} />
        <div style={{
          position: 'absolute', bottom: -120, left: -80,
          width: 420, height: 420, borderRadius: 9999,
          background: 'radial-gradient(closest-side, rgba(167,139,250,0.20), transparent)',
        }} />

        {/* Left — image with tier badge */}
        <div style={{
          width: 460, padding: 60, display: 'flex',
          alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          {review.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.image_url}
              alt=""
              style={{
                width: 320, height: 400, objectFit: 'cover', borderRadius: 28,
                border: `2px solid ${tierColor}55`,
                boxShadow: `0 30px 80px ${tierColor}33`,
              }}
            />
          ) : (
            <div style={{
              width: 320, height: 400, borderRadius: 28,
              background: `linear-gradient(135deg, ${tierColor}33, rgba(15,20,36,0.5))`,
              border: `2px solid ${tierColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 96, fontWeight: 900, color: tierColor,
            }}>
              {tier}
            </div>
          )}
          {/* Floating tier badge */}
          <div style={{
            position: 'absolute', top: 36, right: 36,
            width: 88, height: 88, borderRadius: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tierColor, color: '#0a0e1a',
            fontSize: 44, fontWeight: 900,
            boxShadow: `0 0 50px ${tierColor}88`,
          }}>
            {tier}
          </div>
        </div>

        {/* Right — text */}
        <div style={{
          flex: 1, padding: '70px 70px 70px 0', display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
        }}>
          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 34 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(34,211,238,0.45)',
            }}>
              <div style={{ width: 14, height: 18, borderRadius: 7, background: '#fff' }} />
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>
              Seltzer Social
            </span>
          </div>

          {/* Headline */}
          <div style={{
            fontSize: 56, fontWeight: 800, lineHeight: 1.05,
            display: 'flex', flexWrap: 'wrap',
          }}>
            {headline}
          </div>
          {subline && (
            <div style={{ fontSize: 26, color: '#94a3b8', marginTop: 14 }}>
              {subline}
            </div>
          )}

          {/* Stars + rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((i) => {
                const filled = review.rating >= i;
                const half = !filled && review.rating >= i - 0.5;
                return (
                  <div key={i} style={{
                    fontSize: 36, color: filled || half ? '#fbbf24' : 'rgba(148,163,184,0.25)',
                    opacity: half ? 0.6 : 1,
                  }}>
                    ★
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: tierColor }}>
              {review.rating.toFixed(1)}
            </div>
          </div>

          {/* Quote */}
          {snippet && (
            <div style={{
              fontSize: 22, color: '#cbd5e1', marginTop: 26, lineHeight: 1.45,
              display: 'flex', fontStyle: 'italic',
            }}>
              "{snippet}"
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 'auto', paddingTop: 36, fontSize: 22, color: '#64748b', display: 'flex' }}>
            review by{' '}
            <span style={{ color: '#22d3ee', fontWeight: 700, marginLeft: 8 }}>@{username}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
