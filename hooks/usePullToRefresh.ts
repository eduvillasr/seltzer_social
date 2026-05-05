// hooks/usePullToRefresh.ts
// Lightweight pull-to-refresh for any scroll container.
//
// Usage:
//   const { pull, isRefreshing, bind } = usePullToRefresh(async () => {
//     await reloadData();
//   });
//   return <div {...bind}>...</div>
//
// `pull` is 0..1 once the user is dragging past the threshold so you can
// fade in / scale a spinner accordingly.

'use client';

import { useEffect, useRef, useState } from 'react';

const TRIGGER_DISTANCE = 70; // px — pulled distance to trigger refresh
const MAX_PULL = 110;        // px — visual cap

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const [pull, setPull] = useState(0); // current pull distance (px)
  const [isRefreshing, setIsRefreshing] = useState(false);

  // touch handlers
  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY > 0 || isRefreshing) return;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current || startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // resistance curve — pull feels heavier the further you go
    const eased = Math.min(MAX_PULL, dy * 0.55);
    setPull(eased);
  }

  async function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
    if (pull >= TRIGGER_DISTANCE) {
      setIsRefreshing(true);
      setPull(TRIGGER_DISTANCE); // hold at trigger position
      try { await onRefresh(); }
      finally {
        setIsRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  // also clean up if component unmounts mid-drag
  useEffect(() => () => { dragging.current = false; startY.current = null; }, []);

  return {
    pull,                       // raw pixel distance
    progress: Math.min(1, pull / TRIGGER_DISTANCE),
    isRefreshing,
    triggered: pull >= TRIGGER_DISTANCE,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
