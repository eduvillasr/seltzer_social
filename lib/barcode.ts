// lib/barcode.ts
// Barcode/UPC scanning with a native-first, web-fallback strategy:
//   • Native (Capacitor): @capacitor-mlkit/barcode-scanning — full-screen
//     ML Kit scanner. Optional dependency, loaded dynamically + guarded so
//     the web bundle never depends on it (same pattern as lib/push.ts).
//   • Web: the browser BarcodeDetector API over a getUserMedia stream, if
//     available. Otherwise scanning is unsupported and the caller falls back
//     to manual entry.

export type ScanResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'cancelled' | 'denied' | 'unsupported' | 'error' };

// ── Native (Capacitor ML Kit) ────────────────────────────────────
async function loadNativeScanner(): Promise<any | null> {
  try {
    // @ts-ignore optional native-only dependency
    const core = await import('@capacitor/core');
    if (!core.Capacitor?.isNativePlatform?.()) return null;
    // @ts-ignore optional native-only dependency
    const mod = await import('@capacitor-mlkit/barcode-scanning');
    return mod.BarcodeScanner;
  } catch {
    return null;
  }
}

async function scanNative(scanner: any): Promise<ScanResult> {
  try {
    const supported = await scanner.isSupported();
    if (!supported?.supported) return { ok: false, reason: 'unsupported' };

    const perm = await scanner.requestPermissions();
    if (perm?.camera !== 'granted' && perm?.camera !== 'limited') {
      return { ok: false, reason: 'denied' };
    }

    const { barcodes } = await scanner.scan();
    const value = barcodes?.[0]?.rawValue || barcodes?.[0]?.displayValue;
    if (!value) return { ok: false, reason: 'cancelled' };
    return { ok: true, value: String(value) };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

// ── Web (BarcodeDetector) ────────────────────────────────────────
export function isWebScanSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Decode a single frame from a <video> element already playing a camera
 * stream. The UI owns the camera/video lifecycle; this just runs detection.
 * Returns the first barcode value found, or null.
 */
export async function detectFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (!isWebScanSupported()) return null;
  try {
    // @ts-ignore BarcodeDetector is not in the TS DOM lib yet
    const detector = new window.BarcodeDetector({
      formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128'],
    });
    const codes = await detector.detect(video);
    return codes?.[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

/**
 * One-shot native scan entry point. On web this returns 'unsupported' so the
 * caller can show the in-page camera/manual flow instead.
 */
export async function scanBarcodeNative(): Promise<ScanResult> {
  const scanner = await loadNativeScanner();
  if (!scanner) return { ok: false, reason: 'unsupported' };
  return scanNative(scanner);
}

/** Loose validity check for a scanned UPC/EAN (8–14 digits). */
export function looksLikeBarcode(v: string): boolean {
  return /^\d{8,14}$/.test(v.trim());
}
