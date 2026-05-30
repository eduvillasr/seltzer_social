// components/ShowroomCase.tsx
//
// A museum gallery of trophies. Each trophy stands tall on its own lit podium
// under a spotlight beam, with an engraved nameplate on the plinth. The owner
// DRAGS a trophy from the tray onto any podium, swaps between podiums, or drags
// one back to the tray — then Saves. Visitors see the saved arrangement,
// read-only. Pointer-based drag, so it works on touch (native app) too.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, RARITY_META } from '@/lib/trophies';
import { TrophyStatue } from './TrophyStatue';
import { haptic } from '@/lib/haptics';

// A single museum floor — eight podiums, two across.
const ALL_SLOTS = ['0', '1', '2', '3', '4', '5', '6', '7'];

function hexA(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

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
      {/* The museum hall */}
      <div
        className="relative overflow-hidden rounded-3xl"
        style={{
          padding: '20px 14px 24px',
          background:
            'radial-gradient(ellipse 120% 70% at 50% -10%, rgba(60,48,30,0.45), transparent 60%), linear-gradient(180deg, #0c1020 0%, #0a0e1a 55%, #06080f 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 40px rgba(0,0,0,0.5)',
        }}
      >
        {earned.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center pointer-events-none z-10">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isOwner ? 'Earn trophies and they’ll appear here to display.' : 'No trophies on display yet.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ALL_SLOTS.map((slot) => {
            const trophy = placement[slot] ? earnedById[placement[slot]] : null;
            const color = trophy ? RARITY_META[trophy.rarity].color : '#ffffff';
            return (
              <div
                key={slot}
                ref={(el) => { slotRefs.current[slot] = el; }}
                className="relative flex flex-col items-center justify-end"
                style={{ minHeight: 168 }}
              >
                {/* Spotlight beam */}
                {trophy && (
                  <div
                    className="spotlight-beam absolute pointer-events-none"
                    style={{
                      top: 0, left: '50%', transform: 'translateX(-50%)', width: '78%', height: '64%',
                      clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.20), rgba(255,255,255,0.03) 65%, transparent)',
                      filter: 'blur(4px)',
                    }}
                  />
                )}

                {/* Trophy */}
                <div className="relative z-[1] flex items-end" style={{ height: 96 }}>
                  {trophy ? (
                    <div
                      onPointerDown={(e) => startDrag(trophy.id, { type: 'slot', slotId: slot }, e)}
                      style={{
                        touchAction: isOwner ? 'none' : 'auto',
                        cursor: isOwner ? 'grab' : 'default',
                        opacity: draggingId === trophy.id ? 0.2 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <TrophyStatue trophy={trophy} earned height={88} />
                    </div>
                  ) : (
                    <div
                      className="rounded-full mb-2"
                      style={{ width: 30, height: 30, border: '1.5px dashed rgba(255,255,255,0.12)', opacity: 0.5 }}
                    />
                  )}
                </div>

                {/* Glow pool on the podium top */}
                {trophy && (
                  <div
                    className="pointer-events-none"
                    style={{ width: '70%', height: 9, marginTop: -1, borderRadius: '50%', background: `radial-gradient(ellipse at center, ${hexA(color, 0.55)}, transparent 70%)` }}
                  />
                )}

                {/* Plinth / pedestal */}
                <div className="relative w-full z-[1]" style={{ maxWidth: 124 }}>
                  <div
                    className="relative overflow-hidden"
                    style={{
                      height: 54, borderRadius: '5px 5px 2px 2px',
                      background: 'linear-gradient(180deg, #333c5a 0%, #1c2238 55%, #10162a 100%)',
                      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.12), 0 8px 16px rgba(0,0,0,0.5)',
                    }}
                  >
                    {/* lit top edge */}
                    <div className="absolute top-0 left-0 right-0" style={{ height: 7, background: 'linear-gradient(180deg, rgba(255,255,255,0.16), transparent)' }} />
                    {/* engraved nameplate */}
                    {trophy && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2"
                        style={{ bottom: 9, maxWidth: '86%', padding: '2px 6px', borderRadius: 3, background: 'linear-gradient(180deg, #d8b46b, #8a6a2f)', boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                      >
                        <p className="text-[8px] font-bold truncate text-center" style={{ color: '#241606' }}>
                          {trophy.name}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
              {tray.length ? 'Your trophies · drag onto a podium' : 'Drag a trophy here to take it off display'}
            </p>
            <div className="flex flex-wrap gap-4 min-h-[64px] items-end">
              {tray.map((t) => (
                <div
                  key={t.id}
                  onPointerDown={(e) => startDrag(t.id, { type: 'tray' }, e)}
                  style={{ touchAction: 'none', cursor: 'grab', opacity: draggingId === t.id ? 0.2 : 1 }}
                >
                  <TrophyStatue trophy={t} earned height={66} />
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
              <p className="text-xs flex-1" style={{ color: 'var(--text-primary)' }}>Gallery rearranged · not saved</p>
              <button onClick={() => setPlacement(savedSnapshot)} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px' }}>
                Reset
              </button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>
                {saving ? 'Saving…' : 'Save gallery'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Drag ghost */}
      {drag && earnedById[drag.trophyId] && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.12)', filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.55))' }}
        >
          <TrophyStatue trophy={earnedById[drag.trophyId]} earned height={88} />
        </div>
      )}
    </div>
  );
}
