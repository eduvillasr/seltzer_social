// lib/haptics.ts
//
// Tiny wrapper around @capacitor/haptics. Fires native haptic feedback inside
// the compiled Capacitor app and is a silent no-op on the web (and if the
// plugin isn't present). Everything is dynamically imported so the web bundle
// never hard-depends on the native plugin, and every call is wrapped so a
// failure can never break a tap handler.
//
// Usage:  import { haptic } from '@/lib/haptics';  haptic('light');

type HapticKind =
  | 'light'      // small confirmations — likes, toggles, tab switches
  | 'medium'     // a more deliberate action — submitting a rating, placing a drink
  | 'heavy'      // big moments
  | 'selection'  // scrubbing through discrete options
  | 'success'    // an action completed
  | 'warning'
  | 'error';

let nativeChecked = false;
let isNative = false;

async function ensureNative(): Promise<boolean> {
  if (nativeChecked) return isNative;
  try {
    const core = await import('@capacitor/core');
    isNative = !!core.Capacitor?.isNativePlatform?.();
  } catch {
    isNative = false;
  }
  nativeChecked = true;
  return isNative;
}

export async function haptic(kind: HapticKind = 'light'): Promise<void> {
  try {
    if (!(await ensureNative())) return;
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');

    if (kind === 'selection') {
      await Haptics.selectionStart();
      await Haptics.selectionEnd();
      return;
    }
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      const type =
        kind === 'success' ? NotificationType.Success
        : kind === 'warning' ? NotificationType.Warning
        : NotificationType.Error;
      await Haptics.notification({ type });
      return;
    }
    const style =
      kind === 'heavy' ? ImpactStyle.Heavy
      : kind === 'medium' ? ImpactStyle.Medium
      : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {
    // Web, missing plugin, or a transient native error — ignore.
  }
}
