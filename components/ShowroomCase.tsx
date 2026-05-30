// components/ShowroomCase.tsx
//
// A warm wooden trophy CASE that doubles as a "seltzer personality" showcase.
// Reading top to bottom: a challenge-coin grid + ribbons + shield (your
// achievements, shaped by rarity), a shelf of trophies (hero center), and a
// bottom shelf with your all-time favorite drink + a taste-profile readout.
// Owners drag trophies onto the shelf and coins around the grid, then Save.
// Pointer-based drag so it works on touch (the native app) too.
//
// Saved layout: { podiums: {slot: trophyId}, coins: {slot: achId} }.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Star, Compass, MessageSquare } from 'lucide-react';
import { Trophy } from '@/lib/trophies';
import { Achievement, TIER_META } from '@/lib/achievements';
import { TrophyArt } from './TrophyArt';
import { AchievementMedal } from './AchievementMedal';
import { haptic } from '@/lib/haptics';

const PODIUM_SLOTS = ['0', '1', '2'];
const COIN_SLOTS = ['0', '1', '2', '3', '4', '5', '6', '7', '8'];
const SEED_ORDER = ['1', '0', '2']; // best trophy → hero (center)

type TopDrink = { name: string; brand?: string; rating: number } | null;
type Taste = { avg: number; brands: number; reviews: number } | null;

function coinTier(tier: string) { return tier !== 'legendary' && tier !== 'platinum' && tier !== 'gold'; }
function ribbonTier(tier: string) { return tier === 'gold'; }
function shieldTier(tier: string) { return tier === 'legendary' || tier === 'platinum'; }

type DragKind = 'trophy' | 'coin';
type Zone = 'podium' | 'coin' | 'tray';
type DragState = { kind: DragKind; id: string; from: { zone: Zone; slotId?: string }; x: number; y: number } | null;

export function ShowroomCase({
  earnedTrophies,
  earnedAchievements,
  initialPodiums,
  initialCoins,
  topDrink,
  taste,
  isOwner,
  onSave,
}: {
  earnedTrophies: Trophy[];
  earnedAchievements: Achievement[];
  initialPodiums: Record<string, string>;
  initialCoins: Record<string, string>;
  topDrink: TopDrink;
  taste: Taste;
  isOwner: boolean;
  onSave: (layout: { podiums: Record<string, string>; coins: Record<string, string> }) => Promise<void>;
}) {
  const trophyById = useMemo(() => Object.fromEntries(earnedTrophies.map((t) => [t.id, t])), [earnedTrophies]);
  const achById = useMemo(() => Object.fromEntries(earnedAchievements.map((a) => [a.id, a])), [earnedAchievements]);

  const coinAch = useMemo(() => earnedAchievements.filter((a) => coinTier(a.tier)), [earnedAchievements]);
  const ribbonAch = useMemo(() => earnedAchievements.filter((a) => ribbonTier(a.tier)), [earnedAchievements]);
  const shieldAch = useMemo(() => earnedAchievements.filter((a) => shieldTier(a.tier)), [earnedAchievements]);

  const basePodiums = useMemo(() => {
    const v: Record<string, string> = {}; const used = new Set<string>();
    for (const s of PODIUM_SLOTS) { const id = initialPodiums?.[s]; if (id && trophyById[id] && !used.has(id)) { v[s] = id; used.add(id); } }
    if (Object.keys(v).length === 0 && earnedTrophies.length > 0) earnedTrophies.forEach((t, i) => { if (i < SEED_ORDER.length) v[SEED_ORDER[i]] = t.id; });
    return v;
  }, [initialPodiums, trophyById, earnedTrophies]);

  const baseCoins = useMemo(() => {
    const v: Record<string, string> = {}; const used = new Set<string>();
    for (const s of COIN_SLOTS) { const id = initialCoins?.[s]; if (id && achById[id] && coinTier(achById[id].tier) && !used.has(id)) { v[s] = id; used.add(id); } }
    if (Object.keys(v).length === 0 && coinAch.length > 0) coinAch.forEach((a, i) => { if (i < COIN_SLOTS.length) v[COIN_SLOTS[i]] = a.id; });
    return v;
  }, [initialCoins, achById, coinAch]);

  const [podiums, setPodiums] = useState(basePodiums);
  const [coins, setCoins] = useState(baseCoins);
  const [savedPodiums, setSavedPodiums] = useState(basePodiums);
  const [savedCoins, setSavedCoins] = useState(baseCoins);
  const [drag, setDrag] = useState<DragState>(null);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<DragState>(null);
  const podiumRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const coinRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trophyTrayRef = useRef<HTMLDivElement | null>(null);
  const coinTrayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setPodiums(basePodiums); setSavedPodiums(basePodiums); }, [basePodiums]);
  useEffect(() => { setCoins(baseCoins); setSavedCoins(baseCoins); }, [baseCoins]);

  const placedTrophyIds = new Set(Object.values(podiums));
  const placedCoinIds = new Set(Object.values(coins));
  const trophyTray = earnedTrophies.filter((t) => !placedTrophyIds.has(t.id));
  const coinTray = coinAch.filter((a) => !placedCoinIds.has(a.id));
  const dirty = JSON.stringify(podiums) !== JSON.stringify(savedPodiums) || JSON.stringify(coins) !== JSON.stringify(savedCoins);

  function placeInto(setMap: React.Dispatch<React.SetStateAction<Record<string, string>>>, id: string, fromSlot: string | undefined, target: string) {
    setMap((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === id) delete next[k];
      const occ = next[target];
      if (occ && fromSlot) next[fromSlot] = occ;
      next[target] = id;
      return next;
    });
  }
  function removeFrom(setMap: React.Dispatch<React.SetStateAction<Record<string, string>>>, id: string) {
    setMap((prev) => { const next = { ...prev }; for (const k of Object.keys(next)) if (next[k] === id) delete next[k]; return next; });
  }

  function startDrag(kind: DragKind, id: string, from: { zone: Zone; slotId?: string }, e: React.PointerEvent) {
    if (!isOwner) return;
    e.preventDefault(); haptic('light');
    const d: DragState = { kind, id, from, x: e.clientX, y: e.clientY };
    dragRef.current = d; setDrag(d);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) { if (!dragRef.current) return; const d = { ...dragRef.current, x: e.clientX, y: e.clientY }; dragRef.current = d; setDrag(d); }
    function inside(el: HTMLElement | null, x: number, y: number) { if (!el) return false; const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
    function onUp(e: PointerEvent) {
      const d = dragRef.current; if (!d) return; const { x, y } = e;
      if (d.kind === 'trophy') {
        for (const s of PODIUM_SLOTS) if (inside(podiumRefs.current[s], x, y)) { placeInto(setPodiums, d.id, d.from.zone === 'podium' ? d.from.slotId : undefined, s); haptic('medium'); dragRef.current = null; setDrag(null); return; }
        if (inside(trophyTrayRef.current, x, y)) { removeFrom(setPodiums, d.id); haptic('light'); }
      } else {
        for (const s of COIN_SLOTS) if (inside(coinRefs.current[s], x, y)) { placeInto(setCoins, d.id, d.from.zone === 'coin' ? d.from.slotId : undefined, s); haptic('medium'); dragRef.current = null; setDrag(null); return; }
        if (inside(coinTrayRef.current, x, y)) { removeFrom(setCoins, d.id); haptic('light'); }
      }
      dragRef.current = null; setDrag(null);
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
  }, []); // eslint-disable-line

  async function save() {
    setSaving(true); await onSave({ podiums, coins }); setSaving(false);
    setSavedPodiums(podiums); setSavedCoins(coins); haptic('success');
  }

  const draggingId = drag?.id ?? null;
  const nothing = earnedTrophies.length === 0 && earnedAchievements.length === 0;

  return (
    <div>
      {/* Wooden cabinet */}
      <div className="relative" style={{ padding: 10, borderRadius: 22, background: 'linear-gradient(160deg, #8a542a, #4a2c14)', boxShadow: '0 18px 44px rgba(0,0,0,0.55)' }}>
        {/* corner bolts */}
        {[['6px', '6px', true, true], ['6px', undefined, true, false], [undefined, '6px', false, true], [undefined, undefined, false, false]].map((c, i) => (
          <span key={i} className="absolute" style={{ width: 9, height: 9, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fbe6b0, #9c7a30)', boxShadow: '0 0 4px rgba(0,0,0,0.5)', left: c[3] ? 5 : undefined, right: c[3] ? undefined : 5, top: c[2] ? 5 : undefined, bottom: c[2] ? undefined : 5, zIndex: 5 }} />
        ))}

        <div className="relative overflow-hidden" style={{ borderRadius: 12, background: 'linear-gradient(180deg, #5e3719 0%, #4a2c14 100%)', padding: '10px 12px 14px' }}>
          {/* back-panel grain + pattern + vignette */}
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.2, backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 13px)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.5, backgroundImage: 'radial-gradient(rgba(255,210,150,0.05) 1px, transparent 1.5px)', backgroundSize: '16px 16px' }} />
          <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: '34%', background: 'radial-gradient(ellipse at 50% 0%, rgba(255,210,140,0.16), transparent 70%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 50px 16px rgba(0,0,0,0.5)', borderRadius: 12 }} />

          <div className="relative">
            {/* brass header */}
            <div className="mx-auto mb-3" style={{ width: 'fit-content', padding: '4px 16px', borderRadius: 5, background: 'linear-gradient(180deg, #f1d68f, #9c7a30)', boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
              <p className="text-[11px] font-extrabold tracking-[0.24em] text-center" style={{ color: '#2a1c06', fontFamily: 'var(--font-display)' }}>HALL OF FAME</p>
            </div>

            {nothing && (
              <p className="text-center text-xs py-10" style={{ color: 'rgba(255,235,200,0.7)' }}>
                {isOwner ? 'Earn trophies and achievements and your case fills up.' : 'Nothing on display yet.'}
              </p>
            )}

            {/* ── Honors row: challenge-coin grid + ribbons/shield ── */}
            {!nothing && (
              <div className="flex gap-2.5 mb-1">
                {/* coin grid */}
                <FramedPanel label="Challenge Coins" className="flex-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {COIN_SLOTS.map((s) => {
                      const a = coins[s] ? achById[coins[s]] : null;
                      return (
                        <div key={s} ref={(el) => { coinRefs.current[s] = el; }} className="flex items-center justify-center rounded-full" style={{ aspectRatio: '1', background: a ? 'rgba(120,80,30,0.25)' : 'rgba(90,60,25,0.25)', border: a ? 'none' : '1.5px dashed rgba(120,85,40,0.45)' }}>
                          {a && (
                            <div onPointerDown={(e) => startDrag('coin', a.id, { zone: 'coin', slotId: s }, e)} style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === a.id ? 0.2 : 1 }} title={a.name}>
                              <AchievementMedal achievement={a} height={42} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </FramedPanel>

                {/* ribbons + shield */}
                <div className="flex flex-col gap-2" style={{ width: '38%' }}>
                  <FramedPanel label="Ribbons">
                    <div className="flex items-end justify-center gap-1 flex-wrap" style={{ minHeight: 56 }}>
                      {ribbonAch.slice(0, 3).map((a) => (
                        <div key={a.id} title={a.name}><AchievementMedal achievement={a} height={56} /></div>
                      ))}
                      {ribbonAch.length === 0 && <span className="text-[8px]" style={{ color: 'rgba(255,235,200,0.5)' }}>None yet</span>}
                    </div>
                  </FramedPanel>
                  <FramedPanel label="Honors">
                    <div className="flex items-end justify-center gap-1.5" style={{ minHeight: 50 }}>
                      {shieldAch.slice(0, 2).map((a) => (
                        <div key={a.id} title={a.name}><AchievementMedal achievement={a} height={52} /></div>
                      ))}
                      {shieldAch.length === 0 && <span className="text-[8px]" style={{ color: 'rgba(255,235,200,0.5)' }}>None yet</span>}
                    </div>
                  </FramedPanel>
                </div>
              </div>
            )}

            {!nothing && <ShelfBoard />}

            {/* ── Trophy shelf ── */}
            {!nothing && (
              <div className="flex items-end justify-around px-1" style={{ minHeight: 176 }}>
                {/* order: left(0), center hero(1), right(2) */}
                {(['0', '1', '2'] as const).map((slot) => {
                  const hero = slot === '1';
                  const trophy = podiums[slot] ? trophyById[podiums[slot]] : null;
                  const h = hero ? 150 : 92;
                  return (
                    <div key={slot} ref={(el) => { podiumRefs.current[slot] = el; }} className="relative flex flex-col items-center justify-end" style={{ width: hero ? 124 : 84, zIndex: hero ? 1 : 2 }}>
                      {trophy && hero && (
                        <div className="spotlight-beam absolute pointer-events-none" style={{ bottom: h * 0.5, left: '50%', transform: 'translateX(-50%)', width: 96, height: 150, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, rgba(255,236,190,0.3), rgba(255,236,190,0.03) 62%, transparent)', filter: 'blur(5px)' }} />
                      )}
                      {trophy ? (
                        <div onPointerDown={(e) => startDrag('trophy', trophy.id, { zone: 'podium', slotId: slot }, e)} style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === trophy.id ? 0.2 : 1, transition: 'opacity 0.15s' }}>
                          <TrophyArt trophy={trophy} earned height={h} />
                        </div>
                      ) : (
                        <div className="rounded-full mb-2" style={{ width: hero ? 30 : 22, height: hero ? 30 : 22, border: '1.5px dashed rgba(255,225,180,0.35)', opacity: 0.6 }} />
                      )}
                      {trophy && <div className="pointer-events-none" style={{ width: h * 0.42, height: 6, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', filter: 'blur(2px)', marginTop: -2 }} />}
                    </div>
                  );
                })}
              </div>
            )}

            {!nothing && <ShelfBoard />}

            {/* ── Awards shelf: top drink + taste profile ── */}
            {!nothing && (
              <div className="flex gap-2.5">
                <TopDrinkPlaque drink={topDrink} />
                <TasteCard taste={taste} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Owner trays + controls */}
      {isOwner && (
        <>
          <p className="text-[11px] mt-3 mb-1 px-1" style={{ color: 'var(--text-muted)' }}>Drag trophies onto the shelf and coins around the grid, then Save.</p>
          <div ref={coinTrayRef} className="rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Coins · drag into the grid</p>
            <div className="flex flex-wrap gap-2 min-h-[44px] items-end">
              {coinTray.map((a) => (
                <div key={a.id} onPointerDown={(e) => startDrag('coin', a.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === a.id ? 0.2 : 1 }}>
                  <AchievementMedal achievement={a} height={42} />
                </div>
              ))}
              {coinAch.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No coin-tier achievements yet.</p>}
              {coinAch.length > 0 && coinTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All coins on display ✨</p>}
            </div>
          </div>
          <div ref={trophyTrayRef} className="mt-2 rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Trophies · drag onto the shelf</p>
            <div className="flex flex-wrap gap-4 min-h-[64px] items-end">
              {trophyTray.map((t) => (
                <div key={t.id} onPointerDown={(e) => startDrag('trophy', t.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === t.id ? 0.2 : 1 }}>
                  <TrophyArt trophy={t} earned height={74} />
                </div>
              ))}
              {earnedTrophies.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No trophies earned yet.</p>}
              {earnedTrophies.length > 0 && trophyTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All on display 🏆</p>}
            </div>
          </div>
          {dirty && (
            <div className="mt-3 rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)' }}>
              <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>Case rearranged · not saved</p>
              <button onClick={() => { setPodiums(savedPodiums); setCoins(savedCoins); }} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Reset</button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>{saving ? 'Saving…' : 'Save case'}</button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.12)' }}>
          {drag.kind === 'trophy' && trophyById[drag.id] && <TrophyArt trophy={trophyById[drag.id]} earned height={118} />}
          {drag.kind === 'coin' && achById[drag.id] && <AchievementMedal achievement={achById[drag.id]} height={56} />}
        </div>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function FramedPanel({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className} style={{ padding: 4, borderRadius: 6, background: 'linear-gradient(160deg, #e8c074, #7e5420)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
      <div className="relative" style={{ borderRadius: 3, background: 'linear-gradient(180deg, #f4e7c8, #d8c39a)', boxShadow: 'inset 0 0 10px rgba(120,80,30,0.35)', padding: '14px 6px 6px' }}>
        <span className="absolute left-1/2 -translate-x-1/2" style={{ top: 2, fontSize: 7, fontWeight: 800, letterSpacing: '0.12em', color: '#6e4a1e', textTransform: 'uppercase' }}>{label}</span>
        {children}
      </div>
    </div>
  );
}

function ShelfBoard() {
  return (
    <div className="relative my-2" style={{ height: 13, borderRadius: 3, background: 'linear-gradient(180deg, #9a652f, #5e3719)', boxShadow: '0 6px 11px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,220,170,0.32)' }}>
      <div className="absolute" style={{ left: '12%', top: 13, width: 10, height: 11, background: 'linear-gradient(180deg, #6e4220, #4a2c14)', clipPath: 'polygon(0 0, 100% 0, 60% 100%, 0 100%)' }} />
      <div className="absolute" style={{ right: '12%', top: 13, width: 10, height: 11, background: 'linear-gradient(180deg, #6e4220, #4a2c14)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 40% 100%)' }} />
    </div>
  );
}

// A small flat-gold can for the Top Drink plaque art.
function MiniCan() {
  return (
    <svg width="30" height="46" viewBox="0 0 30 46" style={{ display: 'block' }}>
      <ellipse cx="15" cy="6" rx="9" ry="2.4" fill="#a8771c" stroke="#6e4e12" strokeWidth="2" />
      <rect x="6" y="6" width="18" height="36" rx="4" fill="#d4a02e" stroke="#6e4e12" strokeWidth="2.5" />
      <rect x="6" y="18" width="18" height="11" fill="#a8771c" stroke="#6e4e12" strokeWidth="2" />
      <circle cx="15" cy="23.5" r="3.4" fill="#22d3ee" stroke="#6e4e12" strokeWidth="1.4" />
    </svg>
  );
}

function TopDrinkPlaque({ drink }: { drink: TopDrink }) {
  return (
    <div className="flex-1" style={{ padding: 4, borderRadius: 6, background: 'linear-gradient(160deg, #e8c074, #7e5420)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
      <div className="relative flex items-center gap-2" style={{ borderRadius: 3, background: 'linear-gradient(180deg, #f4e7c8, #d8c39a)', boxShadow: 'inset 0 0 10px rgba(120,80,30,0.35)', padding: '16px 8px 8px', minHeight: 64 }}>
        <span className="absolute left-1/2 -translate-x-1/2" style={{ top: 2, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', color: '#6e4a1e' }}>★ MOST LOVED</span>
        <MiniCan />
        <div className="min-w-0 flex-1">
          {drink ? (
            <>
              <p className="text-[11px] font-extrabold leading-tight truncate" style={{ color: '#3a2810' }}>{drink.name}</p>
              {drink.brand && <p className="text-[9px] truncate" style={{ color: '#7a5a28' }}>{drink.brand}</p>}
              <div className="flex items-center gap-0.5 mt-0.5">
                <Star size={10} fill="#d4a02e" color="#6e4e12" strokeWidth={1.5} />
                <span className="text-[10px] font-bold" style={{ color: '#6e4a1e' }}>{drink.rating.toFixed(1)}</span>
              </div>
            </>
          ) : (
            <p className="text-[10px]" style={{ color: '#7a5a28' }}>Rate a drink to crown a favorite.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TasteCard({ taste }: { taste: Taste }) {
  const avg = taste?.avg ?? 0;
  return (
    <div style={{ width: '40%', padding: 4, borderRadius: 6, background: 'linear-gradient(160deg, #e8c074, #7e5420)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
      <div className="relative" style={{ borderRadius: 3, background: 'linear-gradient(180deg, #f4e7c8, #d8c39a)', boxShadow: 'inset 0 0 10px rgba(120,80,30,0.35)', padding: '16px 8px 8px', minHeight: 64 }}>
        <span className="absolute left-1/2 -translate-x-1/2" style={{ top: 2, fontSize: 7, fontWeight: 800, letterSpacing: '0.12em', color: '#6e4a1e' }}>TASTE PROFILE</span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={10} fill={i <= Math.round(avg) ? '#d4a02e' : 'none'} color="#6e4e12" strokeWidth={1.4} />
          ))}
          <span className="text-[9px] font-bold ml-1" style={{ color: '#6e4a1e' }}>{avg.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-1 mt-1.5" style={{ color: '#6e4a1e' }}>
          <Compass size={10} /><span className="text-[9px] font-semibold">{taste?.brands ?? 0} brands</span>
        </div>
        <div className="flex items-center gap-1 mt-1" style={{ color: '#6e4a1e' }}>
          <MessageSquare size={10} /><span className="text-[9px] font-semibold">{taste?.reviews ?? 0} reviews</span>
        </div>
      </div>
    </div>
  );
}
