// components/ShowroomCase.tsx
//
// A decorated museum room with TWO kinds of exhibit:
//   • Trophies stand as sculptures on the floor's spotlit podiums.
//   • Achievements hang as framed art on the back wall.
// The owner drags trophies onto podiums and achievements onto wall frames (each
// from its own tray), then Saves. Visitors see the saved arrangement. Drag is
// pointer-based so it works on touch (the native app) too.
//
// Saved layout shape: { podiums: {slotId: trophyId}, wall: {frameId: achId} }.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, RARITY_META } from '@/lib/trophies';
import { Achievement } from '@/lib/achievements';
import { TrophyArt } from './TrophyArt';
import { AchievementBadge } from './AchievementBadge';
import { haptic } from '@/lib/haptics';

const PODIUM_SLOTS = ['0', '1', '2', '3', '4', '5', '6', '7'];
const FRAME_SLOTS = ['0', '1', '2', '3'];

function hexA(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

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

  // Auto-arrange podiums: fill with earned trophies in order if nothing saved.
  const basePodiums = useMemo(() => {
    const valid: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of PODIUM_SLOTS) {
      const id = initialPodiums?.[slot];
      if (id && trophyById[id] && !used.has(id)) { valid[slot] = id; used.add(id); }
    }
    if (Object.keys(valid).length === 0 && earnedTrophies.length > 0) {
      earnedTrophies.forEach((t, i) => { if (i < PODIUM_SLOTS.length) valid[PODIUM_SLOTS[i]] = t.id; });
    }
    return valid;
  }, [initialPodiums, trophyById, earnedTrophies]);

  // Auto-arrange wall: saved layout, else the user's pinned favorites, else the
  // first earned achievements.
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
      if (occ && fromSlot) next[fromSlot] = occ; // swap
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
            haptic('medium');
            dragRef.current = null; setDrag(null); return;
          }
        }
        if (inside(trophyTrayRef.current, x, y)) { removeFrom(setPodiums, d.id); haptic('light'); }
      } else {
        for (const f of FRAME_SLOTS) {
          if (inside(frameRefs.current[f], x, y)) {
            placeInto(setWall, d.id, d.from.zone === 'wall' ? d.from.slotId : undefined, f);
            haptic('medium');
            dragRef.current = null; setDrag(null); return;
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
  const nothing = earnedTrophies.length === 0 && earnedAchievements.length === 0;

  return (
    <div>
      {/* The museum room */}
      <div className="relative overflow-hidden rounded-3xl" style={{ border: '1px solid rgba(0,0,0,0.5)', boxShadow: '0 18px 44px rgba(0,0,0,0.55)' }}>
        {/* ── Back wall (framed achievements) ── */}
        <div className="relative" style={{ height: 150, background: 'linear-gradient(180deg, #20263e 0%, #161b30 100%)', overflow: 'hidden' }}>
          {/* sconces */}
          {['12%', '88%'].map((l) => (
            <div key={l} className="absolute flex flex-col items-center" style={{ top: 6, left: l, transform: 'translateX(-50%)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffd98a', boxShadow: '0 0 10px 3px rgba(255,205,120,0.7)' }} />
              <div className="pointer-events-none" style={{ width: 26, height: 26, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, rgba(255,210,130,0.20), transparent)' }} />
            </div>
          ))}
          {/* placard */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 8, padding: '3px 12px', borderRadius: 4, background: 'linear-gradient(180deg, #e9c87a, #9b7a32)', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
            <p className="text-[9px] font-extrabold tracking-[0.22em]" style={{ color: '#2a1c06', fontFamily: 'var(--font-display)' }}>THE COLLECTION</p>
          </div>

          {/* framed achievements row */}
          <div className="absolute left-0 right-0 flex justify-center gap-2.5" style={{ bottom: 16 }}>
            {FRAME_SLOTS.map((f) => {
              const ach = wall[f] ? achById[wall[f]] : null;
              return (
                <div
                  key={f}
                  ref={(el) => { frameRefs.current[f] = el; }}
                  style={{ padding: 3, borderRadius: 3, background: ach ? 'linear-gradient(160deg, #e9c87a, #9b7a32)' : 'rgba(233,200,122,0.25)', boxShadow: ach ? '0 3px 8px rgba(0,0,0,0.5)' : 'none' }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 52, height: 52, borderRadius: 1, background: 'linear-gradient(160deg, #0f1426, #060912)', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.6)' }}
                  >
                    {ach ? (
                      <div
                        onPointerDown={(e) => startDrag('achievement', ach.id, { zone: 'wall', slotId: f }, e)}
                        style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === ach.id ? 0.2 : 1 }}
                      >
                        <AchievementBadge achievement={ach} unlocked size="md" />
                      </div>
                    ) : (
                      <div className="rounded-full" style={{ width: 30, height: 30, border: '1.5px dashed rgba(255,255,255,0.14)', opacity: 0.5 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* crown molding */}
          <div className="absolute bottom-0 left-0 right-0" style={{ height: 8, background: 'linear-gradient(180deg, #2a3150, #11152a)', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }} />
        </div>

        {/* ── Gallery floor (trophy podiums) ── */}
        <div
          className="relative"
          style={{ padding: '14px 14px 22px', background: 'radial-gradient(ellipse 100% 60% at 50% 0%, rgba(255,235,200,0.05), transparent 55%), linear-gradient(180deg, #0e1222 0%, #0a0e1a 60%, #06080f 100%)' }}
        >
          <div className="absolute top-0 left-0 right-0" style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)' }} />

          {nothing && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center pointer-events-none z-10">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {isOwner ? 'Earn trophies and achievements and they’ll appear here.' : 'Nothing on display yet.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {PODIUM_SLOTS.map((slot) => {
              const trophy = podiums[slot] ? trophyById[podiums[slot]] : null;
              const color = trophy ? RARITY_META[trophy.rarity].color : '#ffffff';
              return (
                <div
                  key={slot}
                  ref={(el) => { podiumRefs.current[slot] = el; }}
                  className="relative flex flex-col items-center justify-end"
                  style={{ minHeight: 176 }}
                >
                  {trophy && (
                    <div className="spotlight-beam absolute pointer-events-none" style={{ top: 0, left: '50%', transform: 'translateX(-50%)', width: '82%', height: '66%', clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, rgba(255,245,220,0.22), rgba(255,245,220,0.03) 65%, transparent)', filter: 'blur(4px)' }} />
                  )}
                  <div className="relative z-[1] flex items-end" style={{ height: 104 }}>
                    {trophy ? (
                      <div
                        onPointerDown={(e) => startDrag('trophy', trophy.id, { zone: 'podium', slotId: slot }, e)}
                        style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === trophy.id ? 0.2 : 1, transition: 'opacity 0.15s' }}
                      >
                        <TrophyArt trophy={trophy} earned height={98} />
                      </div>
                    ) : (
                      <div className="rounded-full mb-2" style={{ width: 28, height: 28, border: '1.5px dashed rgba(255,255,255,0.12)', opacity: 0.5 }} />
                    )}
                  </div>
                  {trophy && (
                    <div className="pointer-events-none" style={{ width: '70%', height: 9, marginTop: -1, borderRadius: '50%', background: `radial-gradient(ellipse at center, ${hexA(color, 0.55)}, transparent 70%)` }} />
                  )}
                  <div className="relative w-full z-[1]" style={{ maxWidth: 124 }}>
                    <div className="relative overflow-hidden" style={{ height: 52, borderRadius: '5px 5px 2px 2px', background: 'linear-gradient(180deg, #cdd3e0 0%, #99a1b8 30%, #5b6378 100%)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.5), 0 8px 16px rgba(0,0,0,0.55)' }}>
                      <div className="absolute top-0 left-0 right-0" style={{ height: 8, background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)' }} />
                      {trophy && (
                        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 8, maxWidth: '88%', padding: '2px 6px', borderRadius: 3, background: 'linear-gradient(180deg, #3a2c12, #241806)' }}>
                          <p className="text-[8px] font-bold truncate text-center" style={{ color: '#e9c87a' }}>{trophy.name}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Owner trays + controls */}
      {isOwner && (
        <>
          {/* Achievements tray (wall art) */}
          <div ref={achTrayRef} className="mt-3 rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              {achTray.length ? 'Achievements · drag onto a wall frame' : 'Drag an achievement here to take it off the wall'}
            </p>
            <div className="flex flex-wrap gap-2.5 min-h-[48px] items-center">
              {achTray.map((a) => (
                <div key={a.id} onPointerDown={(e) => startDrag('achievement', a.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === a.id ? 0.2 : 1 }}>
                  <AchievementBadge achievement={a} unlocked size="sm" />
                </div>
              ))}
              {earnedAchievements.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No achievements earned yet.</p>}
              {earnedAchievements.length > 0 && achTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Wall’s full ✨</p>}
            </div>
          </div>

          {/* Trophies tray */}
          <div ref={trophyTrayRef} className="mt-2 rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              {trophyTray.length ? 'Trophies · drag onto a podium' : 'Drag a trophy here to take it off display'}
            </p>
            <div className="flex flex-wrap gap-4 min-h-[60px] items-end">
              {trophyTray.map((t) => (
                <div key={t.id} onPointerDown={(e) => startDrag('trophy', t.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === t.id ? 0.2 : 1 }}>
                  <TrophyArt trophy={t} earned height={64} />
                </div>
              ))}
              {earnedTrophies.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No trophies earned yet.</p>}
              {earnedTrophies.length > 0 && trophyTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All on display 🏆</p>}
            </div>
          </div>

          {dirty && (
            <div className="mt-3 rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)' }}>
              <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>Exhibit rearranged · not saved</p>
              <button onClick={() => { setPodiums(savedPodiums); setWall(savedWall); }} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Reset</button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>{saving ? 'Saving…' : 'Save exhibit'}</button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.12)' }}>
          {drag.kind === 'trophy' && trophyById[drag.id] && <TrophyArt trophy={trophyById[drag.id]} earned height={98} />}
          {drag.kind === 'achievement' && achById[drag.id] && <AchievementBadge achievement={achById[drag.id]} unlocked size="lg" />}
        </div>
      )}
    </div>
  );
}
