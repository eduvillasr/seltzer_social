// components/ShowroomCase.tsx
//
// A grand hall of fame. A warm, dramatic gallery room: navy→purple walls with
// gold trim, a central arched alcove flanked by columns, a perspective
// checkerboard marble floor, spotlit pedestals in a triangular formation (a
// 40%-larger hero plinth at the apex), velvet ropes, plants, and dust motes
// drifting in the light. Trophies are big sculptures; achievements hang as
// framed plaques. Owners drag their best pieces in and Save; visitors see the
// scene. Pointer-based drag so it works on touch (the native app) too.
//
// Saved layout: { podiums: {slotId: trophyId}, wall: {frameId: achId} }.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, RARITY_META } from '@/lib/trophies';
import { Achievement } from '@/lib/achievements';
import { TrophyArt } from './TrophyArt';
import { AchievementBadge } from './AchievementBadge';
import { haptic } from '@/lib/haptics';

const PODIUM_SLOTS = ['0', '1', '2'];
const FRAME_SLOTS = ['0', '1'];
// Seed best→hero: first earned trophy lands on the center (hero) plinth.
const SEED_ORDER = ['1', '0', '2'];

// Triangular formation: hero apex at back-center, two supporters front + wide.
const PEDESTALS: { slot: string; pos: React.CSSProperties; colW: number; colH: number; trophyH: number; hero?: boolean }[] = [
  { slot: '1', pos: { left: '50%', bottom: 104, transform: 'translateX(-50%)' }, colW: 100, colH: 66, trophyH: 156, hero: true },
  { slot: '0', pos: { left: '13%', bottom: 14, transform: 'translateX(-50%)' }, colW: 66, colH: 52, trophyH: 108 },
  { slot: '2', pos: { left: '87%', bottom: 14, transform: 'translateX(-50%)' }, colW: 66, colH: 52, trophyH: 108 },
];
const FRAMES: { slot: string; pos: React.CSSProperties; size: number; hero?: boolean }[] = [
  { slot: '0', pos: { left: '20%', top: '30%', transform: 'translate(-50%,-50%)' }, size: 58, hero: true },
  { slot: '1', pos: { left: '80%', top: '30%', transform: 'translate(-50%,-50%)' }, size: 44 },
];

function hexA(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

type ItemKind = 'trophy' | 'achievement';
type Zone = 'podium' | 'wall' | 'tray';
type DragState = { kind: ItemKind; id: string; from: { zone: Zone; slotId?: string }; x: number; y: number } | null;

function Column({ side }: { side: 'left' | 'right' }) {
  return (
    <div className="absolute pointer-events-none" style={{ [side]: '3%', top: '8%', bottom: '30%', width: 24 } as React.CSSProperties}>
      {/* capital */}
      <div style={{ position: 'absolute', top: -4, left: -6, right: -6, height: 12, borderRadius: 3, background: 'linear-gradient(180deg, #d8c48a, #9c8347)', boxShadow: '0 2px 4px rgba(0,0,0,0.4)' }} />
      {/* shaft with fluting */}
      <div style={{ position: 'absolute', top: 8, bottom: 10, left: 0, right: 0, borderRadius: 2, background: 'repeating-linear-gradient(90deg, #b9a079 0 4px, #8f794f 4px 8px)', boxShadow: 'inset 0 0 8px rgba(0,0,0,0.3)' }} />
      {/* base */}
      <div style={{ position: 'absolute', bottom: -4, left: -7, right: -7, height: 12, borderRadius: 3, background: 'linear-gradient(180deg, #c7ac72, #7e6a3e)', boxShadow: '0 3px 6px rgba(0,0,0,0.5)' }} />
      {/* sconce glow */}
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#ffd98a', boxShadow: '0 0 14px 5px rgba(255,205,120,0.6)' }} />
    </div>
  );
}

export function ShowroomCase({
  earnedTrophies,
  earnedAchievements,
  initialPodiums,
  initialWall,
  preferredWall,
  isOwner,
  onSave,
}: {
  earnedTrophies: Trophy[];
  earnedAchievements: Achievement[];
  initialPodiums: Record<string, string>;
  initialWall: Record<string, string>;
  preferredWall: string[];
  isOwner: boolean;
  onSave: (layout: { podiums: Record<string, string>; wall: Record<string, string> }) => Promise<void>;
}) {
  const trophyById = useMemo(() => {
    const m: Record<string, Trophy> = {};
    for (const t of earnedTrophies) m[t.id] = t;
    return m;
  }, [earnedTrophies]);
  const achById = useMemo(() => {
    const m: Record<string, Achievement> = {};
    for (const a of earnedAchievements) m[a.id] = a;
    return m;
  }, [earnedAchievements]);

  const basePodiums = useMemo(() => {
    const valid: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of PODIUM_SLOTS) {
      const id = initialPodiums?.[slot];
      if (id && trophyById[id] && !used.has(id)) { valid[slot] = id; used.add(id); }
    }
    if (Object.keys(valid).length === 0 && earnedTrophies.length > 0) {
      earnedTrophies.forEach((t, i) => { if (i < SEED_ORDER.length) valid[SEED_ORDER[i]] = t.id; });
    }
    return valid;
  }, [initialPodiums, trophyById, earnedTrophies]);

  const baseWall = useMemo(() => {
    const valid: Record<string, string> = {};
    const used = new Set<string>();
    for (const f of FRAME_SLOTS) {
      const id = initialWall?.[f];
      if (id && achById[id] && !used.has(id)) { valid[f] = id; used.add(id); }
    }
    if (Object.keys(valid).length === 0) {
      const seed = (preferredWall || []).filter((id) => achById[id]);
      const list = seed.length ? seed : earnedAchievements.map((a) => a.id);
      list.slice(0, FRAME_SLOTS.length).forEach((id, i) => { valid[FRAME_SLOTS[i]] = id; });
    }
    return valid;
  }, [initialWall, achById, preferredWall, earnedAchievements]);

  const [podiums, setPodiums] = useState(basePodiums);
  const [wall, setWall] = useState(baseWall);
  const [savedPodiums, setSavedPodiums] = useState(basePodiums);
  const [savedWall, setSavedWall] = useState(baseWall);
  const [drag, setDrag] = useState<DragState>(null);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<DragState>(null);
  const podiumRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const frameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trophyTrayRef = useRef<HTMLDivElement | null>(null);
  const achTrayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setPodiums(basePodiums); setSavedPodiums(basePodiums); }, [basePodiums]);
  useEffect(() => { setWall(baseWall); setSavedWall(baseWall); }, [baseWall]);

  const placedTrophyIds = new Set(Object.values(podiums));
  const placedAchIds = new Set(Object.values(wall));
  const trophyTray = earnedTrophies.filter((t) => !placedTrophyIds.has(t.id));
  const achTray = earnedAchievements.filter((a) => !placedAchIds.has(a.id));
  const dirty = JSON.stringify(podiums) !== JSON.stringify(savedPodiums) || JSON.stringify(wall) !== JSON.stringify(savedWall);

  function placeInto(setMap: React.Dispatch<React.SetStateAction<Record<string, string>>>, id: string, fromSlot: string | undefined, targetSlot: string) {
    setMap((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === id) delete next[k];
      const occ = next[targetSlot];
      if (occ && fromSlot) next[fromSlot] = occ;
      next[targetSlot] = id;
      return next;
    });
  }
  function removeFrom(setMap: React.Dispatch<React.SetStateAction<Record<string, string>>>, id: string) {
    setMap((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === id) delete next[k];
      return next;
    });
  }

  function startDrag(kind: ItemKind, id: string, from: { zone: Zone; slotId?: string }, e: React.PointerEvent) {
    if (!isOwner) return;
    e.preventDefault();
    haptic('light');
    const d: DragState = { kind, id, from, x: e.clientX, y: e.clientY };
    dragRef.current = d;
    setDrag(d);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      const d = { ...dragRef.current, x: e.clientX, y: e.clientY };
      dragRef.current = d;
      setDrag(d);
    }
    function inside(el: HTMLElement | null, x: number, y: number) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const { x, y } = e;
      if (d.kind === 'trophy') {
        for (const slot of PODIUM_SLOTS) {
          if (inside(podiumRefs.current[slot], x, y)) {
            placeInto(setPodiums, d.id, d.from.zone === 'podium' ? d.from.slotId : undefined, slot);
            haptic('medium'); dragRef.current = null; setDrag(null); return;
          }
        }
        if (inside(trophyTrayRef.current, x, y)) { removeFrom(setPodiums, d.id); haptic('light'); }
      } else {
        for (const f of FRAME_SLOTS) {
          if (inside(frameRefs.current[f], x, y)) {
            placeInto(setWall, d.id, d.from.zone === 'wall' ? d.from.slotId : undefined, f);
            haptic('medium'); dragRef.current = null; setDrag(null); return;
          }
        }
        if (inside(achTrayRef.current, x, y)) { removeFrom(setWall, d.id); haptic('light'); }
      }
      dragRef.current = null;
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []); // eslint-disable-line

  async function save() {
    setSaving(true);
    await onSave({ podiums, wall });
    setSaving(false);
    setSavedPodiums(podiums);
    setSavedWall(wall);
    haptic('success');
  }

  const draggingId = drag?.id ?? null;

  return (
    <div>
      {/* Bold gold frame around the whole hall */}
      <div style={{ padding: 4, borderRadius: 26, background: 'linear-gradient(145deg, #f0d28a, #9c7a30 55%, #c9a24a)' }}>
        <div className="relative w-full overflow-hidden" style={{ height: 'min(74vh, 600px)', borderRadius: 22 }}>
          {/* ── Wall (navy → purple, warm ceiling glow) ── */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 46% at 50% 0%, rgba(255,196,110,0.18), transparent 62%), linear-gradient(180deg, #3a2b52 0%, #2b2142 42%, #221b38 72%, #181428 100%)' }} />
          {/* cornice + mid molding */}
          <div className="absolute left-0 right-0" style={{ top: 0, height: 7, background: 'linear-gradient(180deg, #d8c48a, #8f7536)' }} />
          <div className="absolute left-0 right-0" style={{ top: '20%', height: 2, background: 'linear-gradient(90deg, transparent, rgba(216,196,138,0.5), transparent)' }} />

          {/* columns */}
          <Column side="left" />
          <Column side="right" />

          {/* central arched alcove behind hero */}
          <div className="absolute pointer-events-none" style={{ left: '50%', transform: 'translateX(-50%)', top: '13%', width: '50%', height: '64%', borderRadius: '50% 50% 8px 8px / 42% 42% 4px 4px', background: 'linear-gradient(180deg, rgba(86,64,118,0.85), rgba(44,34,66,0.92))', border: '3px solid #c9a24a', boxShadow: '0 0 34px rgba(201,162,74,0.28), inset 0 10px 36px rgba(0,0,0,0.45)' }} />

          {/* signage */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 9, padding: '4px 16px', borderRadius: 5, background: 'linear-gradient(180deg, #f1d68f, #9c7a30)', boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
            <p className="text-[11px] font-extrabold tracking-[0.24em]" style={{ color: '#2a1c06', fontFamily: 'var(--font-display)' }}>HALL OF FAME</p>
          </div>

          {/* framed achievements (plaques) */}
          {FRAMES.map(({ slot, pos, size, hero }) => {
            const ach = wall[slot] ? achById[wall[slot]] : null;
            const pad = hero ? 5 : 3;
            return (
              <div key={slot} className="absolute" style={pos}>
                <div
                  ref={(el) => { frameRefs.current[slot] = el; }}
                  style={{ padding: pad, borderRadius: 4, background: ach ? 'linear-gradient(160deg, #f0d28a, #8a6a2c)' : 'rgba(233,200,122,0.22)', boxShadow: ach ? `0 5px 12px rgba(0,0,0,0.5)${hero ? ', 0 0 16px rgba(233,200,122,0.4)' : ''}` : 'none' }}
                >
                  <div className="flex items-center justify-center" style={{ width: size, height: size, borderRadius: 2, background: 'linear-gradient(160deg, #1a1530, #0c0a18)', boxShadow: 'inset 0 0 12px rgba(0,0,0,0.6)', outline: hero ? '1.5px solid rgba(255,235,180,0.5)' : 'none', outlineOffset: hero ? -3 : 0 }}>
                    {ach ? (
                      <div onPointerDown={(e) => startDrag('achievement', ach.id, { zone: 'wall', slotId: slot }, e)} style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === ach.id ? 0.2 : 1 }}>
                        <AchievementBadge achievement={ach} unlocked size={hero ? 'md' : 'sm'} />
                      </div>
                    ) : (
                      <div className="rounded-full" style={{ width: hero ? 30 : 24, height: hero ? 30 : 24, border: '1.5px dashed rgba(255,255,255,0.16)', opacity: 0.5 }} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Perspective checkerboard marble floor ── */}
          <div
            className="absolute"
            style={{
              left: '-30%', right: '-30%', bottom: 0, height: '54%',
              transformOrigin: 'bottom center', transform: 'perspective(360px) rotateX(60deg)',
              backgroundColor: '#cbb896',
              backgroundImage: 'linear-gradient(45deg, #a98f63 25%, transparent 25% 75%, #a98f63 75%), linear-gradient(45deg, #a98f63 25%, transparent 25% 75%, #a98f63 75%)',
              backgroundSize: '52px 52px', backgroundPosition: '0 0, 26px 26px',
            }}
          />
          {/* floor far-fade into the wall + warm sheen */}
          <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '50%', background: 'linear-gradient(180deg, #181428 0%, rgba(24,20,40,0.35) 20%, transparent 44%)' }} />
          <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '30%', background: 'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(255,225,170,0.10), transparent 70%)' }} />

          {/* velvet rope barrier (foreground) */}
          <div className="absolute pointer-events-none" style={{ left: 0, right: 0, bottom: 4, height: 34 }}>
            {['30%', '70%'].map((l) => (
              <div key={l} className="absolute" style={{ left: l, bottom: 0, transform: 'translateX(-50%)' }}>
                <div style={{ width: 6, height: 30, borderRadius: 3, background: 'linear-gradient(180deg, #e9c87a, #8a6a2c)' }} />
                <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)', width: 9, height: 9, borderRadius: '50%', background: '#f1d68f', boxShadow: '0 0 6px rgba(241,214,143,0.8)' }} />
              </div>
            ))}
            <svg className="absolute" style={{ left: '30%', width: '40%', bottom: 18, height: 18, overflow: 'visible' }} viewBox="0 0 100 20" preserveAspectRatio="none">
              <path d="M2 2 Q50 26 98 2" fill="none" stroke="#7c1d3a" strokeWidth="4" strokeLinecap="round" />
              <path d="M2 2 Q50 26 98 2" fill="none" stroke="#a83253" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>

          {/* plants */}
          <div className="absolute pointer-events-none" style={{ left: 2, bottom: 2, fontSize: 56, filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.5))' }}>🪴</div>
          <div className="absolute pointer-events-none" style={{ right: 2, bottom: 2, fontSize: 50, filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.5))' }}>🪴</div>

          {nothing(earnedTrophies, earnedAchievements) && (
            <div className="absolute inset-0 flex items-end justify-center pb-10 px-6 text-center pointer-events-none z-10">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {isOwner ? 'Earn trophies and achievements and your hall fills up.' : 'Nothing on display yet.'}
              </p>
            </div>
          )}

          {/* ── Pedestals (triangular; hero rendered first so the front pair overlap it) ── */}
          {PEDESTALS.map(({ slot, pos, colW, colH, trophyH, hero }) => {
            const trophy = podiums[slot] ? trophyById[podiums[slot]] : null;
            const color = trophy ? RARITY_META[trophy.rarity].color : '#ffffff';
            const capW = colW + 12;
            return (
              <div key={slot} ref={(el) => { podiumRefs.current[slot] = el; }} className="absolute flex flex-col items-center" style={{ ...pos, width: colW + 28, zIndex: hero ? 1 : 2 }}>
                {/* spotlight beam */}
                {trophy && (
                  <div className="spotlight-beam absolute pointer-events-none" style={{ bottom: colH - 6, left: '50%', transform: 'translateX(-50%)', width: hero ? colW + 30 : colW + 8, height: hero ? 180 : 130, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', background: `linear-gradient(180deg, rgba(255,236,190,${hero ? 0.36 : 0.26}), rgba(255,236,190,0.04) 62%, transparent)`, filter: 'blur(5px)' }} />
                )}
                {/* dust motes in the hero beam */}
                {hero && trophy && Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className="dust-mote" style={{ left: `${28 + i * 7}%`, bottom: colH + 12 + ((i * 17) % 90), width: 3 + (i % 2), height: 3 + (i % 2), animationDuration: `${4 + i * 0.6}s`, animationDelay: `${i * 0.5}s` }} />
                ))}
                {/* trophy */}
                <div className="relative z-[1] flex items-end" style={{ height: trophyH + 4 }}>
                  {trophy ? (
                    <div onPointerDown={(e) => startDrag('trophy', trophy.id, { zone: 'podium', slotId: slot }, e)} style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === trophy.id ? 0.2 : 1, transition: 'opacity 0.15s' }}>
                      <TrophyArt trophy={trophy} earned height={trophyH} />
                    </div>
                  ) : (
                    <div className="rounded-full mb-1" style={{ width: hero ? 30 : 22, height: hero ? 30 : 22, border: '1.5px dashed rgba(200,180,140,0.5)', opacity: 0.6 }} />
                  )}
                </div>
                {/* long cartoony cast shadow + glow pool on the cap */}
                {trophy && (
                  <>
                    <div className="pointer-events-none" style={{ position: 'absolute', bottom: colH - 4, left: '62%', width: colW * 0.95, height: 12, borderRadius: '50%', background: 'rgba(0,0,0,0.38)', filter: 'blur(4px)', transform: 'translateX(-50%) scaleX(1.5)' }} />
                    <div className="pointer-events-none" style={{ width: colW * 0.86, height: 9, borderRadius: '50%', background: `radial-gradient(ellipse at center, ${hexA(color, 0.65)}, transparent 70%)`, marginBottom: -2, position: 'relative', zIndex: 1 }} />
                  </>
                )}
                {/* marble column */}
                <div className="relative z-[1]" style={{ width: colW, height: colH, borderRadius: '6px 6px 4px 4px', background: 'linear-gradient(180deg, #f2eee4 0%, #d6c9ad 32%, #a08c63 100%)', boxShadow: `inset 0 2px 0 rgba(255,255,255,0.8), 0 12px 22px rgba(0,0,0,0.55)${hero ? ', 0 0 20px rgba(233,200,122,0.3)' : ''}` }}>
                  <div className="absolute" style={{ top: -5, left: '50%', transform: 'translateX(-50%)', width: capW, height: 12, borderRadius: '50%', background: 'linear-gradient(180deg, #f8f4ea, #d8cbae)', boxShadow: '0 2px 5px rgba(0,0,0,0.35)', border: hero ? '1.5px solid rgba(233,200,122,0.85)' : 'none' }} />
                  {hero && <div className="absolute" style={{ bottom: -8, left: '50%', transform: 'translateX(-50%)', width: capW + 8, height: 10, borderRadius: 3, background: 'linear-gradient(180deg, #e6dcc4, #a08c63)', boxShadow: '0 7px 14px rgba(0,0,0,0.5)' }} />}
                </div>
                {hero && <div className="absolute pointer-events-none" style={{ bottom: -12, left: '50%', transform: 'translateX(-50%)', width: capW + 36, height: 18, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(233,200,122,0.3), transparent 70%)' }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Owner trays + controls */}
      {isOwner && (
        <>
          <p className="text-[11px] mt-3 mb-1 px-1" style={{ color: 'var(--text-muted)' }}>
            Only your best go on display — center plinth is the hero. Drag to curate.
          </p>
          <div ref={achTrayRef} className="rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Achievements · drag onto a wall plaque</p>
            <div className="flex flex-wrap gap-2.5 min-h-[46px] items-center">
              {achTray.map((a) => (
                <div key={a.id} onPointerDown={(e) => startDrag('achievement', a.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === a.id ? 0.2 : 1 }}>
                  <AchievementBadge achievement={a} unlocked size="sm" />
                </div>
              ))}
              {earnedAchievements.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No achievements earned yet.</p>}
              {earnedAchievements.length > 0 && achTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Wall’s set ✨</p>}
            </div>
          </div>
          <div ref={trophyTrayRef} className="mt-2 rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Trophies · drag onto a pedestal</p>
            <div className="flex flex-wrap gap-4 min-h-[64px] items-end">
              {trophyTray.map((t) => (
                <div key={t.id} onPointerDown={(e) => startDrag('trophy', t.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === t.id ? 0.2 : 1 }}>
                  <TrophyArt trophy={t} earned height={76} />
                </div>
              ))}
              {earnedTrophies.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No trophies earned yet.</p>}
              {earnedTrophies.length > 0 && trophyTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All on display 🏆</p>}
            </div>
          </div>
          {dirty && (
            <div className="mt-3 rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)' }}>
              <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>Hall rearranged · not saved</p>
              <button onClick={() => { setPodiums(savedPodiums); setWall(savedWall); }} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Reset</button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>{saving ? 'Saving…' : 'Save hall'}</button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.12)' }}>
          {drag.kind === 'trophy' && trophyById[drag.id] && <TrophyArt trophy={trophyById[drag.id]} earned height={120} />}
          {drag.kind === 'achievement' && achById[drag.id] && <AchievementBadge achievement={achById[drag.id]} unlocked size="lg" />}
        </div>
      )}
    </div>
  );
}

function nothing(t: Trophy[], a: Achievement[]) {
  return t.length === 0 && a.length === 0;
}
