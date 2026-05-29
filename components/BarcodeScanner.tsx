// components/BarcodeScanner.tsx
//
// Web camera barcode scanner used as the fallback when the native ML Kit
// scanner isn't available (i.e. running in a browser rather than the native
// shell). Opens the rear camera via getUserMedia and polls the frame with
// the BarcodeDetector API. The native path lives in lib/barcode.ts and does
// not use this component.

'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ScanLine } from 'lucide-react';
import { detectFromVideo, isWebScanSupported } from '@/lib/barcode';

interface Props {
  onDetected: (value: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    if (!isWebScanSupported()) {
      setErr('This browser can’t scan barcodes. Try the app, or add the drink by name.');
      return;
    }
    let stream: MediaStream | null = null;
    let raf = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (doneRef.current) return;
          const value = await detectFromVideo(video);
          if (value && !doneRef.current) {
            doneRef.current = true;
            onDetected(value);
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr('Camera access was denied. Allow camera access, or add the drink by name.');
      }
    })();

    return () => {
      doneRef.current = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-[88] flex flex-col items-center justify-center p-4" style={{ background: 'rgba(5,8,16,0.92)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white flex items-center gap-2"><ScanLine size={16} /> Scan a barcode</p>
          <button onClick={onClose} className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-white/10 text-white" aria-label="Close scanner">
            <X size={18} />
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl p-5 text-center text-sm" style={{ background: 'var(--bg-secondary, #0f1424)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {err}
            <button onClick={onClose} className="btn-secondary w-full mt-4" style={{ padding: '9px' }}>Add by name instead</button>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '1', background: '#000' }}>
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div style={{ width: '70%', height: '40%', border: '2px solid rgba(34,211,238,0.8)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
            </div>
          </div>
        )}
        {!err && (
          <p className="text-center text-xs mt-3 text-white/70">Point at the barcode on the can or pack.</p>
        )}
      </div>
    </div>
  );
}
