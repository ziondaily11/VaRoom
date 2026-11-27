import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from './reducedMotion';

// FLIP along x (animation.md B20): an element that a layout change moves
// sideways (a list pushed over by a panel) slides there instead of jumping,
// animating transform only. Instant with reduced motion.

// The server renders nothing to animate; this avoids React's useLayoutEffect warning there.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Call the returned `measure()` just before the change; when `key` changes,
 * the element slides from where it was to where it now is.
 */
export function useFlipX(ref: RefObject<HTMLElement | null>, key: unknown, timing: { duration: number; easing: string }): () => void {
  const first = useRef<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    const from = first.current;
    first.current = null;
    if (!el || from === null || prefersReducedMotion() || typeof el.animate !== 'function') return;
    const delta = from - el.getBoundingClientRect().left;
    if (Math.abs(delta) >= 1) el.animate([{ transform: `translateX(${delta}px)` }, { transform: 'none' }], timing);
  }, [key]);
  return useCallback(() => { first.current = ref.current ? ref.current.getBoundingClientRect().left : null; }, [ref]);
}
