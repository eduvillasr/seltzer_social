// components/ShowroomCase.tsx
//
// An exclusive little gallery ROOM you walk into — a single, no-scroll scene
// rather than a long collection. A perspective marble floor holds just THREE
// pedestals for your best trophies; the back wall hangs two framed achievements
// beside a window, with a couch and a plant for atmosphere. Owners drag their
// best pieces from the trays into the room and Save; visitors see the scene.
// Pointer-based drag so it works on touch (the native app) too.
//
// Saved layout: { podiums: {slotId: trophyId}, wall: {frameId: achId} }.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, RARITY_META } from '@/lib/trophies';
import { Achievement } from '@/lib/achievements';
import { TrophyArt } from './TrophyArt';
import { AchievementBadge } from './AchievementBadge';
import { haptic } from '@/lib/haptics';

// Deliberately tiny — only your best go on display.
const PODIUM_SLOTS = ['0', '1', '2'];
const FRAME_SLOTS = ['0', '1'];

// Each display spot is DIFFERENT, so where you place a piece actually matters.
// Center is the grand "hero" plinth — tall, tiered, with a wider spotlight and a
// gold rim — flanked by two smaller, shorter pedestals set further back.
const PEDESTALS: { slot: string; pos: React.CSSProperties; colW: number; colH: number; trophyH: number; hero?: boolean }[] = [
  { slot: '0', pos: { left: '15%', bottom: 44, transform: 'translateX(-50%)' }, colW: 60, colH: 60, trophyH: 96 },
  { slot: '1', pos: { left: '50%', bottom: 12, transform: 'translateX(-50%)' }, colW: 86, colH: 96, trophyH: 138, hero: true },
  { slot: '2', pos: { left: '85%', bottom: 48, transform: 'translateX(-50%)' }, colW: 70, colH: 52, trophyH: 86 },
];
// The wall frames differ too — a big ornate hero frame and a smaller one.
const FRAMES: { slot: string; pos: React.CSSProperties; size: number; hero?: boolean }[] = [
  { slot: '0', pos: { left: '13%', top: 24, transform: 'translateX(-50%)' }, size: 58, hero: true },
  { slot: '1', pos: { left: '87%', top: 36, transform: 'translateX(-50%)' }, size: 42 },
];

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
      {/* ── The room (single no-scroll scene) ── */}
      <div
        className="relative w-full overflow-hidden rounded-3xl"
        style={{ height: 'min(70vh, 540px)', border: '1px solid rgba(0,0,0,0.5)', boxShadow: '0 18px 44px rgba(0,0,0,0.55)' }}
      >
        {/* Back wall */}
        <div className="absolute inset-x-0 top-0" style={{ height: '62%', background: 'linear-gradient(180deg, #242b45 0%, #1a2036 100%)' }} />
        {/* ceiling glow */}
        <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: '40%', background: 'radial-gradient(ellipse 70% 100% at 50% 0%, rgba(255,240,210,0.10), transparent 70%)' }} />

        {/* Window on the wall */}
        <div className="absolute" style={{ left: '50%', top: 22, transform: 'translateX(-50%)', width: 78, height: 66, borderRadius: 5, padding: 4, background: 'linear-gradient(180deg, #6b5638, #3d3020)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: 2, background: 'linear-gradient(180deg, #3b3a6b 0%, #7d5a8c 55%, #e7a17a 100%)' }}>
            {/* moon + glow */}
            <div className="absolute" style={{ top: 8, right: 10, width: 12, height: 12, borderRadius: '50%', background: '#fdf3d0', boxShadow: '0 0 10px rgba(253,243,208,0.9)' }} />
            {/* mullions */}
            <div className="absolute top-0 bottom-0 left-1/2" style={{ width: 2, background: 'rgba(40,30,20,0.7)' }} />
            <div className="absolute left-0 right-0 top-1/2" style={{ height: 2, background: 'rgba(40,30,20,0.7)' }} />
          </div>
        </div>

        {/* Framed achievements (wall art) — hero frame is bigger + double-gilt */}
        {FRAMES.map(({ slot, pos, size, hero }) => {
          const ach = wall[slot] ? achById[wall[slot]] : null;
          const pad = hero ? 5 : 3;
          return (
            <div key={slot} className="absolute" style={pos}>
              <div
                ref={(el) => { frameRefs.current[slot] = el; }}
                style={{ padding: pad, borderRadius: 3, background: ach ? 'linear-gradient(160deg, #f0d28a, #8a6a2c)' : 'rgba(233,200,122,0.22)', boxShadow: ach ? `0 5px 12px rgba(0,0,0,0.5)${hero ? ', 0 0 14px rgba(233,200,122,0.35)' : ''}` : 'none' }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{ width: size, height: size, borderRadius: 1, background: 'linear-gradient(160deg, #0f1426, #060912)', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.6)', outline: hero ? '1.5px solid rgba(255,235,180,0.5)' : 'none', outlineOffset: hero ? -3 : 0 }}
                >
                  {ach ? (
                    <div
                      onPointerDown={(e) => startDrag('achievement', ach.id, { zone: 'wall', slotId: slot }, e)}
                      style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === ach.id ? 0.2 : 1 }}
                    >
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

        {/* Marble floor (perspective trapezoid) */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: '42%', clipPath: 'polygon(14% 0, 86% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, #9aa1b5 0%, #c4cad8 35%, #e7eaf1 100%)' }}>
          {/* perspective tile lines */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="50" y1="0" x2="-8" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
            <line x1="50" y1="0" x2="40" y2="100" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
            <line x1="50" y1="0" x2="60" y2="100" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
            <line x1="50" y1="0" x2="108" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
            <line x1="0" y1="48" x2="100" y2="48" stroke="rgba(255,255,255,0.22)" strokeWidth="0.4" />
            <line x1="0" y1="78" x2="100" y2="78" stroke="rgba(255,255,255,0.22)" strokeWidth="0.4" />
          </svg>
          {/* sheen */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(255,255,255,0.4), transparent 70%)' }} />
        </div>
        {/* baseboard line where wall meets floor */}
        <div className="absolute" style={{ left: '14%', right: '14%', top: '58%', height: 3, background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.4), transparent)' }} />

        {/* Rug */}
        <div className="absolute pointer-events-none" style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)', width: '74%', height: 40, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(124,58,120,0.28), rgba(124,58,120,0.10) 60%, transparent 72%)', border: '1px solid rgba(233,200,122,0.18)' }} />

        {/* Couch (corner) + plant (corner) */}
        <div className="absolute pointer-events-none" style={{ left: 6, bottom: 8, fontSize: 40, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5)) saturate(0.85) brightness(0.9)' }}>🛋️</div>
        <div className="absolute pointer-events-none" style={{ right: 6, bottom: 8, fontSize: 32, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5)) brightness(0.92)' }}>🪴</div>

        {/* Pedestals with trophies — each a different size, center is the hero */}
        {PEDESTALS.map(({ slot, pos, colW, colH, trophyH, hero }) => {
          const trophy = podiums[slot] ? trophyById[podiums[slot]] : null;
          const color = trophy ? RARITY_META[trophy.rarity].color : '#ffffff';
          const capW = colW + 10;
          return (
            <div
              key={slot}
              ref={(el) => { podiumRefs.current[slot] = el; }}
              className="absolute flex flex-col items-center"
              style={{ ...pos, width: colW + 24 }}
            >
              {/* spotlight — wider + warmer over the hero plinth */}
              {trophy && (
                <div
                  className="spotlight-beam absolute pointer-events-none"
                  style={{ bottom: colH - 4, left: '50%', transform: 'translateX(-50%)', width: hero ? colW + 18 : colW + 4, height: hero ? 130 : 104, clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)', background: `linear-gradient(180deg, rgba(255,245,220,${hero ? 0.32 : 0.24}), rgba(255,245,220,0.03) 65%, transparent)`, filter: 'blur(4px)' }}
                />
              )}
              {/* trophy */}
              <div className="relative z-[1] flex items-end" style={{ height: trophyH + 4 }}>
                {trophy ? (
                  <div
                    onPointerDown={(e) => startDrag('trophy', trophy.id, { zone: 'podium', slotId: slot }, e)}
                    style={{ touchAction: isOwner ? 'none' : 'auto', cursor: isOwner ? 'grab' : 'default', opacity: draggingId === trophy.id ? 0.2 : 1, transition: 'opacity 0.15s' }}
                  >
                    <TrophyArt trophy={trophy} earned height={trophyH} />
                  </div>
                ) : (
                  <div className="rounded-full mb-1" style={{ width: hero ? 26 : 20, height: hero ? 26 : 20, border: '1.5px dashed rgba(80,90,120,0.5)', opacity: 0.6 }} />
                )}
              </div>
              {/* glow pool */}
              {trophy && (
                <div className="pointer-events-none" style={{ width: colW * 0.86, height: 8, borderRadius: '50%', background: `radial-gradient(ellipse at center, ${hexA(color, 0.6)}, transparent 70%)`, marginBottom: -2 }} />
              )}
              {/* marble pedestal column */}
              <div
                className="relative z-[1]"
                style={{
                  width: colW, height: colH, borderRadius: '5px 5px 3px 3px',
                  background: 'linear-gradient(180deg, #eef1f7 0%, #c5cbd9 32%, #8a92a6 100%)',
                  boxShadow: `inset 0 2px 0 rgba(255,255,255,0.7), 0 10px 18px rgba(0,0,0,0.5)${hero ? ', 0 0 16px rgba(233,200,122,0.25)' : ''}`,
                }}
              >
                {/* top cap — gold-rimmed on the hero */}
                <div className="absolute" style={{ top: -5, left: '50%', transform: 'translateX(-50%)', width: capW, height: 11, borderRadius: '50%', background: 'linear-gradient(180deg, #f3f5fa, #cbd0dd)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', border: hero ? '1px solid rgba(233,200,122,0.8)' : 'none' }} />
                {/* hero tiered base */}
                {hero && (
                  <div className="absolute" style={{ bottom: -7, left: '50%', transform: 'translateX(-50%)', width: capW + 6, height: 9, borderRadius: 2, background: 'linear-gradient(180deg, #d4dae6, #8a92a6)', boxShadow: '0 6px 12px rgba(0,0,0,0.5)' }} />
                )}
              </div>
              {/* hero floor halo */}
              {hero && (
                <div className="absolute pointer-events-none" style={{ bottom: -10, left: '50%', transform: 'translateX(-50%)', width: capW + 30, height: 16, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(233,200,122,0.28), transparent 70%)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Owner trays + controls */}
      {isOwner && (
        <>
          <p className="text-[11px] mt-3 mb-1 px-1" style={{ color: 'var(--text-muted)' }}>
            Only your best go on display — 3 trophies, 2 wall pieces. Drag to curate.
          </p>

          {/* Achievements tray */}
          <div ref={achTrayRef} className="rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Achievements · drag onto a wall frame</p>
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

          {/* Trophies tray */}
          <div ref={trophyTrayRef} className="mt-2 rounded-2xl p-3" style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Trophies · drag onto a pedestal</p>
            <div className="flex flex-wrap gap-4 min-h-[58px] items-end">
              {trophyTray.map((t) => (
                <div key={t.id} onPointerDown={(e) => startDrag('trophy', t.id, { zone: 'tray' }, e)} style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === t.id ? 0.2 : 1 }}>
                  <TrophyArt trophy={t} earned height={72} />
                </div>
              ))}
              {earnedTrophies.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No trophies earned yet.</p>}
              {earnedTrophies.length > 0 && trophyTray.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All on display 🏆</p>}
            </div>
          </div>

          {dirty && (
            <div className="mt-3 rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)' }}>
              <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>Room rearranged · not saved</p>
              <button onClick={() => { setPodiums(savedPodiums); setWall(savedWall); }} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>Reset</button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>{saving ? 'Saving…' : 'Save room'}</button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.12)' }}>
          {drag.kind === 'trophy' && trophyById[drag.id] && <TrophyArt trophy={trophyById[drag.id]} earned height={110} />}
          {drag.kind === 'achievement' && achById[drag.id] && <AchievementBadge achievement={achById[drag.id]} unlocked size="lg" />}
        </div>
      )}
    </div>
  );
}
