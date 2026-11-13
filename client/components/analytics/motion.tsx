import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { formatMetric } from '../../lib/analytics/format';
import type { MetricFormat } from '../../lib/analytics/niche';

// Motion for the analytics cards: each card plays its animations the first
// time it scrolls into view (CSS keys off `data-seen`; JS counters read the
// context). Reduced motion shows the final state straight away.

const SeenContext = createContext(true);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A card section that marks itself seen once a quarter of it is on screen. */
export function SeenSection({ children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} data-seen={seen || undefined} {...props}>
      <SeenContext.Provider value={seen}>{children}</SeenContext.Provider>
    </section>
  );
}

export const useSeen = () => useContext(SeenContext);

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that counts to `target` once its card is seen, and from the old
 * value to the new one when it changes. Whole targets count in whole steps.
 */
export function useCountUp(target: number | null, duration = 900): number | null {
  const seen = useSeen();
  const [shown, setShown] = useState<number | null>(target === null ? null : 0);
  const from = useRef(0);
  useEffect(() => {
    if (target === null) { setShown(null); return undefined; }
    if (!seen) return undefined;
    if (reducedMotion()) { setShown(target); from.current = target; return undefined; }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = origin + (target - origin) * easeOut(t);
      setShown(Number.isInteger(target) ? Math.round(value) : value);
      from.current = value;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, seen, duration]);
  return shown;
}

/** A metric that counts up to its value, formatted like everywhere else. */
export function Count({ value, format }: { value: number | null; format: MetricFormat }) {
  return <>{formatMetric(useCountUp(value), format)}</>;
}
