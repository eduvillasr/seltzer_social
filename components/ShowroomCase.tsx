// components/ShowroomCase.tsx
//
// A physical trophy cabinet. Trophies sit on glass shelves on little pedestals
// with engraved nameplates. The owner can DRAG a trophy from the tray onto any
// shelf pedestal, rearrange between pedestals, or drag one back to the tray —
// then Save. Visitors see the saved arrangement, read-only. Drag is pointer-
// based so it works on touch (the native app) as well as mouse.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from '@/lib/trophies';
import { TrophyMedallion } from './Trophy';
import { haptic } from '@/lib/haptics';

// 3 glass shelves × 3 pedestals each.
const SHELVES: string[][] = [
  ['0', '1', '2'],
  ['3', '4', '5'],
  ['6', '7', '8'],
];
const ALL_SLOTS = SHELVES.flat();

type DragState = {
  trophyId: string;
  from: { type: 'slot'; slotId: string } | { type: 'tray' };
  x: number;
  y: number;
} | null;

export function ShowroomCase({
  earned,
  initialLayout,
  isOwner,
  onSave,
}: {
  earned: Trophy[];
  initialLayout: Record<string, string>;
  isOwner: boolean;
  onSave: (layout: Record<string, string>) => Promise<void>;
}) {
  const earnedById = useMemo(() => {
    const m: Record<string, Trophy> = {};
    for (const t of earned) m[t.id] = t;
    return m;
  }, [earned]);

  // Baseline arrangement: saved layout filtered to currently-earned trophies;
  // if there's nothing saved, auto-arrange earned trophies into the first
  // pedestals so the case is never sad and empty.
  const baseline = useMemo(() => {
    const valid: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of ALL_SLOTS) {
      const tid = initialLayout?.[slot];
      if (tid && earnedById[tid] && !used.has(tid)) { valid[slot] = tid; used.add(tid); }
    }
    if (Object.keys(valid).length === 0 && earned.length > 0) {
      earned.forEach((t, i) => { if (i < ALL_SLOTS.length) valid[ALL_SLOTS[i]] = t.id; });
    }
    return valid;
  }, [initialLayout, earnedById, earned]);

  const [placement, setPlacement] = useState<Record<string, string>>(baseline);
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, string>>(baseline);
  const [drag, setDrag] = useState<DragState>(null);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<DragState>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setPlacement(baseline); setSavedSnapshot(baseline); }, [baseline]);

  const placedIds = new Set(Object.values(placement));
  const tray = earned.filter((t) => !placedIds.has(t.id));
  const dirty = JSON.stringify(placement) !== JSON.stringify(savedSnapshot);

  function placeTrophy(trophyId: string, from: NonNullable<DragState>['from'], targetSlot: string) {
    setPlacement((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === trophyId) delete next[k];
      const occupant = next[targetSlot];
      if (occupant && from.type === 'slot') next[from.slotId] = occupant; // swap
      next[targetSlot] = trophyId;
      return next;
    });
  }

  function removeFromPlacement(trophyId: string) {
    setPlacement((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === trophyId) delete next[k];
      return next;
    });
  }

  function startDrag(trophyId: string, from: NonNullable<DragState>['from'], e: React.PointerEvent) {
    if (!isOwner) return;
    e.preventDefault();
    haptic('light');
    const d: DragState = { trophyId, from, x: e.clientX, y: e.clientY };
    dragRef.current = d;
    setDrag(d);
  }

  // Stable global drag listeners (set up once). They read live refs, so a stale
  // closure is fine.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      const d = { ...dragRef.current, x: e.clientX, y: e.clientY };
      dragRef.current = d;
      setDrag(d);
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      drop(d, e.clientX, e.clientY);
      dragRef.current = null;
      setDrag(null);
    }
    function drop(d: NonNullable<DragState>, x: number, y: number) {
      for (const slot of ALL_SLOTS) {
        const el = slotRefs.current[slot];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          placeTrophy(d.trophyId, d.from, slot);
          haptic('medium');
          return;
        }
      }
      const tr = trayRef.current?.getBoundingClientRect();
      if (tr && x >= tr.left && x <= tr.right && y >= tr.top && y <= tr.bottom) {
        removeFromPlacement(d.trophyId);
        haptic('light');
      }
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
    await onSave(placement);
    setSaving(false);
    setSavedSnapshot(placement);
    haptic('success');
  }

  const draggingId = drag?.trophyId ?? null;

  return (
    <div>
      {/* The cabinet */}
      <div
        style={{
          borderRadius: 22,
          padding: 13,
          background: 'linear-gradient(145deg, #4a3422, #281b11)',
          boxShadow: '0 20px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
          border: '1px solid rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 13,
            padding: '12px 12px 2px',
            background: 'linear-gradient(180deg, rgba(18,26,48,0.72), rgba(7,10,20,0.94))',
            boxShadow: 'inset 0 2px 18px rgba(0,0,0,0.65)',
          }}
        >
          {/* glass glare */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{ height: 46, background: 'linear-gradient(180deg, rgba(255,255,255,0.07), transparent)' }}
          />

          {earned.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center pointer-events-none z-10">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {isOwner ? 'Earn trophies and they’ll appear here to arrange.' : 'No trophies on display yet.'}
              </p>
            </div>
          )}

          {SHELVES.map((row, ri) => (
            <div key={ri} className="relative">
              <div className="grid grid-cols-3" style={{ alignItems: 'end', gap: 6, paddingBottom: 4 }}>
                {row.map((slot) => {
                  const trophy = placement[slot] ? earnedById[placement[slot]] : null;
                  return (
                    <div
                      key={slot}
                      ref={(el) => { slotRefs.current[slot] = el; }}
                      className="flex flex-col items-center justify-end"
                      style={{ minHeight: 96 }}
                    >
                      {trophy ? (
                        <div
                          onPointerDown={(e) => startDrag(trophy.id, { type: 'slot', slotId: slot }, e)}
                          className="flex flex-col items-center"
                          style={{
                            touchAction: isOwner ? 'none' : 'auto',
                            cursor: isOwner ? 'grab' : 'default',
                            opacity: draggingId === trophy.id ? 0.25 : 1,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          <TrophyMedallion trophy={trophy} earned size={52} />
                          {/* engraved nameplate */}
                          <div
                            className="mt-1 px-1.5 py-0.5 rounded"
                            style={{ maxWidth: 80, background: 'linear-gradient(180deg, #d8b46b, #8a6a2f)', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                          >
                            <p className="text-[8px] font-bold truncate text-center" style={{ color: '#241606' }}>
                              {trophy.name}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="rounded-full"
                          style={{ width: 44, height: 44, border: '1.5px dashed rgba(255,255,255,0.13)', opacity: 0.5 }}
                        />
                      )}
                      {/* pedestal light pool */}
                      <div
                        style={{ width: 50, height: 6, marginTop: 3, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.16), transparent 70%)' }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* wooden shelf board */}
              <div
                style={{
                  height: 9, borderRadius: 3, marginBottom: ri === SHELVES.length - 1 ? 8 : 12,
                  background: 'linear-gradient(180deg, #6b5134, #2e2114)',
                  boxShadow: '0 5px 9px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Owner tray + controls */}
      {isOwner && (
        <>
          <div
            ref={trayRef}
            className="mt-3 rounded-2xl p-3"
            style={{ background: 'rgba(15,20,36,0.5)', border: '1px dashed var(--border-medium)' }}
          >
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              {tray.length ? 'Your trophies · drag onto a shelf' : 'Drag a trophy here to take it off the shelf'}
            </p>
            <div className="flex flex-wrap gap-3 min-h-[48px] items-center">
              {tray.map((t) => (
                <div
                  key={t.id}
                  onPointerDown={(e) => startDrag(t.id, { type: 'tray' }, e)}
                  style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === t.id ? 0.25 : 1 }}
                >
                  <TrophyMedallion trophy={t} earned size={46} />
                </div>
              ))}
              {tray.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Everything’s on display 🏆</p>
              )}
            </div>
          </div>

          {dirty && (
            <div
              className="mt-3 rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up"
              style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)' }}
            >
              <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>Showroom rearranged · not saved</p>
              <button onClick={() => setPlacement(savedSnapshot)} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>
                Reset
              </button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>
                {saving ? 'Saving…' : 'Save showroom'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && earnedById[drag.trophyId] && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -50%) scale(1.18)', filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.5))' }}
        >
          <TrophyMedallion trophy={earnedById[drag.trophyId]} earned size={54} />
        </div>
      )}
    </div>
  );
}
