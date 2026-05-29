// components/AvatarCropper.tsx
//
// Lightweight, dependency-free avatar cropper. Shows the picked image in a
// square viewport with a circular mask, lets the user drag to pan and use a
// slider (or wheel) to zoom, then exports the visible square as a JPEG File.
// The output is square; avatars are masked to a circle wherever they render.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X, ZoomIn } from 'lucide-react';

const VIEWPORT = 288; // px — on-screen crop square
const OUTPUT = 512;    // px — exported image size

interface Props {
  file: File;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

export function AvatarCropper({ file, onCancel, onCropped }: Props) {
  const [imgUrl, setImgUrl] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const dragging = useRef(false);
  const dragStart = useRef({ px: 0, py: 0, ox: 0, oy: 0 });

  // Load the picked file into an Image element.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Base "cover" scale so the image always fills the viewport at zoom = 1.
  const baseScale = img ? Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  function clamp(x: number, y: number) {
    const maxX = Math.max(0, (dispW - VIEWPORT) / 2);
    const maxY = Math.max(0, (dispH - VIEWPORT) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  // Re-clamp the pan whenever zoom changes (a zoom-out can push the image
  // past the viewport edge).
  useEffect(() => {
    setOffset((o) => clamp(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img]);

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy));
  }
  function onPointerUp() { dragging.current = false; }

  function onWheel(e: React.WheelEvent) {
    const next = Math.min(3, Math.max(1, zoom - e.deltaY * 0.0015));
    setZoom(next);
  }

  async function confirm() {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');

      // Map the on-screen viewport square back to source-image coordinates.
      const sW = VIEWPORT / scale;
      const sH = VIEWPORT / scale;
      const sx = img.naturalWidth / 2 - (VIEWPORT / 2 + offset.x) / scale;
      const sy = img.naturalHeight / 2 - (VIEWPORT / 2 + offset.y) / scale;

      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.drawImage(img, sx, sy, sW, sH, 0, 0, OUTPUT, OUTPUT);

      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('crop failed');
      const cropped = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCropped(cropped);
    } catch {
      // Fall back to the original file so the user is never stuck.
      onCropped(file);
    } finally {
      setBusy(false);
    }
  }

  const imgLeft = VIEWPORT / 2 - dispW / 2 + offset.x;
  const imgTop = VIEWPORT / 2 - dispH / 2 + offset.y;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(5,8,16,0.86)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-3xl p-5" style={{ background: 'var(--bg-secondary, #0f1424)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Position your photo</p>
          <button onClick={onCancel} className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>

        {/* Crop viewport */}
        <div
          className="relative mx-auto overflow-hidden touch-none select-none"
          style={{ width: VIEWPORT, height: VIEWPORT, borderRadius: 16, background: '#0a0e1a', cursor: dragging.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt="Crop preview"
              draggable={false}
              style={{ position: 'absolute', left: imgLeft, top: imgTop, width: dispW, height: dispH, maxWidth: 'none' }}
            />
          )}
          {/* circular mask overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: 'inset 0 0 0 9999px rgba(5,8,16,0.55)', WebkitMaskImage: 'radial-gradient(circle at center, transparent 49%, #000 50%)', maskImage: 'radial-gradient(circle at center, transparent 49%, #000 50%)' }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ border: '2px solid rgba(34,211,238,0.7)' }} />
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-3 mt-4">
          <ZoomIn size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-cyan-400"
            aria-label="Zoom"
          />
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onCancel} className="btn-secondary flex-1" style={{ padding: '9px' }}>Cancel</button>
          <button onClick={confirm} disabled={busy || !img} className="btn-primary flex-1" style={{ padding: '9px' }}>
            <Check size={14} /> {busy ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
