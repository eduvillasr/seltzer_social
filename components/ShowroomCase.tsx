// components/ShowroomCase.tsx
//
// A warm wooden trophy case. Trophies stand on a lower wooden shelf (the hero
// big in the center, two supporters flanking); achievements hang as framed
// medal plaques on the upper shelf — rarer ones take ribbon/shield shapes (see
// AchievementMedal). A brass "HALL OF FAME" header tops it off and a velvet
// rope runs along the front. Owners drag trophies onto the shelf and
// achievements into the frames, then Save; visitors see the arrangement.
// Pointer-based drag so it works on touch (the native app) too.
//
// Saved layout: { podiums: {slotId: trophyId}, wall: {frameId: achId} }.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from '@/lib/trophies';
import { Achievement, TIER_META } from '@/lib/achievements';
import { TrophyArt } from './TrophyArt';
import { AchievementMedal } from './AchievementMedal';
import { haptic } from '@/lib/haptics';

const PODIUM_SLOTS = ['0', '1', '2'];
const FRAME_SLOTS = ['0', '1'];
const SEED_ORDER = ['1', '0', '2']; // best → hero (center)

// Trophies stand on the lower shelf; hero center is biggest.
const PEDESTALS: { slot: string; pos: React.CSSProperties; trophyH: number; hero?: boolean }[] = [
  { slot: '1', pos: { left: '50%', bottom: '28%', transform: 'translateX(-50%)' }, trophyH: 152, hero: true },
  { slot: '0', pos: { left: '21%', bottom: '28%', transform: 'translateX(-50%)' }, trophyH: 94 },
  { slot: '2', pos: { left: '79%', bottom: '28%', transform: 'translateX(-50%)' }, trophyH: 94 },
];
// Achievements hang framed on the upper shelf.
const FRAMES: { slot: string; pos: React.CSSProperties; size: number; hero?: boolean }[] = [
  { slot: '0', pos: { left: '26%', top: '20%', transform: 'translate(-50%,-50%)' }, size: 56, hero: true },
  { slot: '1', pos: { left: '74%', top: '20%', transform: 'translate(-50%,-50%)' }, size: 48 },
];

type ItemKind = 'trophy' | 'achievement';
type Zone = 'podium' | 'wall' | 'tray';
type DragState = { kind: ItemKind; id: string; from: { zone: Zone; slotId?: string }; x: number; y: number } | null;

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
  const nothing = earnedTrophies.length === 0 && earnedAchievements.length === 0;

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
      {/* Wooden cabinet frame */}
      <div style={{ padding: 9, borderRadius: 22, background: 'linear-gradient(160deg, #8a542a, #4a2c14)', boxShadow: '0 18px 44px rgba(0,0,0,0.55)' }}>
        <div className="relative w-full overflow-hidden" style={{ height: 'min(74vh, 600px)', borderRadius: 12, background: 'linear-gradient(180deg, #5e3719 0%, #4a2c14 100%)' }}>
          {/* back-panel wood grain */}
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.22, backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 13px)' }} />
          {/* warm top light + inner shadow */}
          <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: '42%', background: 'radial-gradient(ellipse at 50% 0%, rgba(255,210,140,0.16), transparent 70%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 52px 16px rgba(0,0,0,0.5)', borderRadius: 12 }} />

          {/* brass header */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 8, padding: '4px 16px', borderRadius: 5, background: 'linear-gradient(180deg, #f1d68f, #9c7a30)', boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
            <p className="text-[11px] font-extrabold tracking-[0.24em]" style={{ color: '#2a1c06', fontFamily: 'var(--font-display)' }}>HALL OF FAME</p>
          </div>

          {/* upper shelf board (behind framed achievements) */}
          <ShelfBoard top="33%" />
          {/* lower shelf board (under trophies) */}
          <ShelfBoard top="72%" />

          {/* framed achievement medals (upper shelf) */}
          {FRAMES.map(({ slot, pos, size, hero }) => {
            const ach = wall[slot] ? achById[wall[slot]] : null;
            const innerH = Math.round(size * 1.32);
            return (
              <div key={slot} className="absolute flex flex-col items-center" style={pos}>
                {ach && (
                  <p className="text-[7px] font-extrabold uppercase tracking-wider mb-0.5" style={{ color: '#f0d6a8', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>
                    {TIER_META[ach.tier].label}
                  </p>
                )}
                <div
                  ref={(el) => { frameRefs.current[slot] = el; }}
                  style={{ padding: hero ? 5 : 4, borderRadius: 4, background: ach ? 'linear-gradient(160deg, #e8c074, #7e5420)' : 'rgba(160,110,50,0.28)', boxShadow: ach ? `0 5px 12px rgba(0,0,0,0.55)${hero ? ', 0 0 14px rgba(233,200,122,0.35)' : ''}` : 'none' }}
                >
                  {/* gilt corners */}
                  {ach && [['-1px','-1px',true,true],['-1px',undefined,false,true],[undefined,'-1px',true,false],[undefined,undefined,false,false]].map((c, i) => (
                    <span key={i} className="absolute" style={{ width: 5, height: 5, borderRadius: 1, background: '#fbe6b0', left: c[3] ? -1 : undefined, right: c[3] ? undefined : -1, top: c[2] ? -1 : undefined, bottom: c[2] ? undefined : -1 }} />
                  ))}
                  {/* light cream backing (like a display mat) */}
                  <div className="relative flex items-center justify-center overflow-hidden" style={{ width: size, height: innerH, borderRadius: 2, background: 'linear-gradient(180deg, #f4e7c8, #d8c39a)', boxShadow: 'inset 0 0 10px rgba(120,80,30,0.35)' }}>
                    {ach ? (
                      <div onPointerDown={(e) => startDrag('achievement', ach.id, { zone: 'wall', slotId: slot }, e)} style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === ach.id ? 0.2 : 1 }}>
                        <AchievementMedal achievement={ach} height={innerH - 6} />
                      </div>
                    ) : (
                      <div className="rounded-full" style={{ width: 26, height: 26, border: '1.5px dashed rgba(90,60,20,0.4)', opacity: 0.6 }} />
                    )}
                  </div>
                </div>
                {ach && (
                  <div className="mx-auto" style={{ marginTop: 3, padding: '1.5px 6px', borderRadius: 2, background: 'linear-gradient(180deg, #f0d28a, #8a6a2c)', maxWidth: size + 16, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    <p className="text-[7px] font-extrabold truncate text-center" style={{ color: '#2a1c06' }}>{ach.name}</p>
                  </div>
                )}
              </div>
            );
          })}

          {nothing && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center pointer-events-none z-10">
              <p className="text-xs" style={{ color: 'rgba(255,235,200,0.7)' }}>
                {isOwner ? 'Earn trophies and achievements and your case fills up.' : 'Nothing on display yet.'}
              </p>
            </div>
          )}

          {/* trophies standing on the lower shelf (hero first so the pair overlaps it) */}
          {PEDESTALS.map(({ slot, pos, trophyH, hero }) => {
            const trophy = podiums[slot] ? trophyById[podiums[slot]] : null;
            return (
              <div key={slot} ref={(el) => { podiumRefs.current[slot] = el; }} className="absolute flex flex-col items-center justify-end" style={{ ...pos, width: Math.round(trophyH * 0.55) + 24, zIndex: hero ? 1 : 2 }}>
                {trophy && hero && (
                  <div className="spotlight-beam absolute pointer-events-none" style={{ bottom: trophyH * 0.5, left: '50%', transform: 'translateX(-50%)', width: 90, height: 150, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, rgba(255,236,190,0.32), rgba(255,236,190,0.03) 62%, transparent)', filter: 'blur(5px)' }} />
                )}
                {trophy ? (
                  <div onPointerDown={(e) => startDrag('trophy', trophy.id, { zone: 'podium', slotId: slot }, e)} style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === trophy.id ? 0.2 : 1, transition: 'opacity 0.15s' }}>
                    <TrophyArt trophy={trophy} earned height={trophyH} />
                  </div>
                ) : (
                  <div className="rounded-full mb-2" style={{ width: hero ? 30 : 22, height: hero ? 30 : 22, border: '1.5px dashed rgba(255,225,180,0.35)', opacity: 0.6 }} />
                )}
                {/* contact shadow on the shelf */}
                {trophy && <div className="pointer-events-none" style={{ width: trophyH * 0.42, height: 6, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', filter: 'blur(2px)', marginTop: -2 }} />}
              </div>
            );
          })}

          {/* velvet rope along the front */}
          <div className="absolute pointer-events-none" style={{ left: 0, right: 0, bottom: 4, height: 34 }}>
            {['28%', '72%'].map((l) => (
              <div key={l} className="absolute" style={{ left: l, bottom: 0, transform: 'translateX(-50%)' }}>
                <div style={{ width: 8, height: 30, borderRadius: 3, background: 'linear-gradient(90deg, #8a6a2c, #f1d68f 45%, #8a6a2c)' }} />
                <div style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fbe6b0, #b08a30)', boxShadow: '0 0 6px rgba(241,214,143,0.7)' }} />
              </div>
            ))}
            <svg className="absolute" style={{ left: '28%', width: '44%', bottom: 18, height: 22, overflow: 'visible' }} viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M3 3 Q50 34 97 3" fill="none" stroke="#5a0f26" strokeWidth="8" strokeLinecap="round" />
              <path d="M3 3 Q50 34 97 3" fill="none" stroke="#9a2747" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Owner trays + controls */}
      {isOwner && (
        <>
          <p className="text-[11px] mt-3 mb-1 px-1" style={{ color: 'var(--text-muted)' }}>
            Only your best go on display — center is the hero. Drag to curate.
          </p>
          <div ref={achTrayRef} className="rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Achievements · drag into a frame</p>
            <div className="flex flex-wrap gap-2 min-h-[54px] items-end">
              {achTray.map((a) => (
                <div key={a.id} onPointerDown={(e) => startDrag('achievement', a.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === a.id ? 0.2 : 1 }}>
                  <AchievementMedal achievement={a} height={48} />
                </div>
              ))}
              {earnedAchievements.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No achievements earned yet.</p>}
              {earnedAchievements.length > 0 && achTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Frames are set ✨</p>}
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
              <button onClick={() => { setPodiums(savedPodiums); setWall(savedWall); }} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Reset</button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>{saving ? 'Saving…' : 'Save case'}</button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.12)' }}>
          {drag.kind === 'trophy' && trophyById[drag.id] && <TrophyArt trophy={trophyById[drag.id]} earned height={120} />}
          {drag.kind === 'achievement' && achById[drag.id] && <AchievementMedal achievement={achById[drag.id]} height={72} />}
        </div>
      )}
    </div>
  );
}

// A wooden shelf board with a front lip + two bracket supports.
function ShelfBoard({ top }: { top: string }) {
  return (
    <div className="absolute pointer-events-none" style={{ left: '4%', right: '4%', top }}>
      <div style={{ height: 13, borderRadius: 3, background: 'linear-gradient(180deg, #9a652f, #5e3719)', boxShadow: '0 6px 11px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,220,170,0.32)' }} />
      <div style={{ position: 'absolute', left: '12%', top: 13, width: 10, height: 12, background: 'linear-gradient(180deg, #6e4220, #4a2c14)', clipPath: 'polygon(0 0, 100% 0, 60% 100%, 0 100%)' }} />
      <div style={{ position: 'absolute', right: '12%', top: 13, width: 10, height: 12, background: 'linear-gradient(180deg, #6e4220, #4a2c14)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 40% 100%)' }} />
    </div>
  );
}
