// components/PullIndicator.tsx
//
// Companion piece to hooks/usePullToRefresh. Renders the floating
// spinner blob and applies the rubber-band translateY to the wrapped
// content. Cuts boilerplate from every page that wants pull-to-refresh.
//
// Usage:
//   const ptr = usePullToRefresh(async () => await reload());
//   return (
//     <>
//       <PullIndicator ptr={ptr} />
//       <main {...ptr.bind} style={ptr.contentStyle}> ... </main>
//     </>
//   );
//
// (Or just spread `ptr.bind` and `ptr.contentStyle` manually.)

'use client';

import { RotateCcw } from 'lucide-react';

interface Ptr {
  pull: number;
  progress: number;
  isRefreshing: boolean;
  triggered: boolean;
}

export function PullIndicator({ ptr }: { ptr: Ptr }) {
  return (
    <div
      className="fixed top-0 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center justify-center"
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(15,20,36,0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border-subtle)',
        opacity: ptr.progress,
        transform: `translate(-50%, ${Math.max(8, ptr.pull - 24)}px) scale(${0.6 + 0.4 * ptr.progress})`,
        transition: ptr.pull === 0 ? 'transform 240ms ease, opacity 240ms ease' : 'none',
      }}
    >
      <RotateCcw
        size={16}
        className={ptr.isRefreshing ? 'animate-spin' : ''}
        style={{
          color: ptr.triggered ? 'var(--cyan-400)' : 'var(--text-muted)',
          transform: `rotate(${ptr.progress * -180}deg)`,
          transition: ptr.isRefreshing ? 'none' : 'transform 80ms linear',
        }}
      />
    </div>
  );
}

/** Style object to apply to the page's main element so it springs up
 *  while the user is pulling. */
export function pullContentStyle(ptr: Ptr): React.CSSProperties {
  return {
    transform: ptr.pull > 0 ? `translateY(${ptr.pull * 0.4}px)` : undefined,
    transition: ptr.pull === 0 ? 'transform 280ms cubic-bezier(0.18, 0.89, 0.32, 1.28)' : 'none',
  };
}
