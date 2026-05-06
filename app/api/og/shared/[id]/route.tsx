// app/api/og/shared/[id]/route.tsx
// Open Graph image for tier list invite links.

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [{ data: list }, { data: items }] = await Promise.all([
    supabase
      .from('shared_tier_lists')
      .select('*, owner:users!shared_tier_lists_owner_id_fkey(username), partner:users!shared_tier_lists_partner_id_fkey(username)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('shared_tier_list_items')
      .select('tier, seltzer_name')
      .eq('list_id', params.id)
      .limit(50),
  ]);

  if (!list) {
    return new ImageResponse(
      (<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a', color: '#94a3b8', fontSize: 32 }}>List not found</div>),
      { width: 1200, height: 630 },
    );
  }

  // Tier histogram
  const tierCounts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const i of items || []) {
    if (i.tier in tierCounts) tierCounts[i.tier]++;
  }
  const total = (items || []).length;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#0a0e1a', color: '#f1f5f9', padding: 70, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: -120, right: -80,
          width: 480, height: 480, borderRadius: 9999,
          background: 'radial-gradient(closest-side, rgba(34,211,238,0.20), transparent)',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, left: -80,
          width: 480, height: 480, borderRadius: 9999,
          background: 'radial-gradient(closest-side, rgba(167,139,250,0.18), transparent)',
        }} />

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(34,211,238,0.45)',
          }}>
            <div style={{ width: 14, height: 18, borderRadius: 7, background: '#fff' }} />
          </div>
          <span style={{ fontSize: 22, fontWeight: 700 }}>Seltzer Social</span>
          <span style={{ fontSize: 18, color: '#22d3ee', marginLeft: 'auto', fontWeight: 700, letterSpacing: 1.5 }}>
            TIER LIST INVITE
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, display: 'flex' }}>
          {list.name}
        </div>
        <div style={{ fontSize: 26, color: '#94a3b8', marginTop: 14 }}>
          @{(list.owner as any)?.username} <span style={{ color: '#475569' }}>×</span> @{(list.partner as any)?.username}
        </div>

        {/* Tier histogram */}
        <div style={{ display: 'flex', gap: 14, marginTop: 36, alignItems: 'flex-end' }}>
          {(['S', 'A', 'B', 'C', 'D', 'F'] as const).map((t) => {
            const c = tierCounts[t];
            const max = Math.max(1, ...Object.values(tierCounts));
            const height = (c / max) * 140;
            return (
              <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: c > 0 ? TIER_COLORS[t] : '#475569' }}>{c}</span>
                <div style={{
                  width: 88, height: Math.max(8, height),
                  background: c > 0 ? TIER_COLORS[t] : 'rgba(148,163,184,0.1)',
                  borderRadius: 12,
                  boxShadow: c > 0 ? `0 0 32px ${TIER_COLORS[t]}55` : 'none',
                }} />
                <span style={{
                  fontSize: 28, fontWeight: 900,
                  color: TIER_COLORS[t],
                }}>{t}</span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, color: '#cbd5e1', display: 'flex' }}>
            {total} {total === 1 ? 'drink' : 'drinks'} ranked together
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 26px', borderRadius: 9999,
            background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
            color: '#fff', fontSize: 22, fontWeight: 700,
            boxShadow: '0 0 32px rgba(34,211,238,0.4)',
          }}>
            Subscribe →
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
