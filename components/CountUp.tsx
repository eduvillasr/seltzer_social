// components/CountUp.tsx
//
// Animates a number from 0 up to its target with an easeOutCubic curve when it
// first scrolls into view. Used for profile stats and the compare "agreement %"
// so the numbers feel alive instead of just appearing. Falls back to rendering
// the final value immediately if IntersectionObserver isn't available.

'use client';

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  style,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!value) { setDisplay(0); return; }
    const el = ref.current;
    let raf = 0;
    let cancelled = false;

    const animate = () => {
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setDisplay(value * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else setDisplay(value);
      };
      raf = requestAnimationFrame(tick);
    };

    if (el && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            animate();
            io.disconnect();
          }
        },
        { threshold: 0.2 }
      );
      io.observe(el);
      return () => { cancelled = true; io.disconnect(); cancelAnimationFrame(raf); };
    }

    animate();
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [value, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}
