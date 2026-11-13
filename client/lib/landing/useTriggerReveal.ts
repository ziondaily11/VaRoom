import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Where a panel's trigger sat on screen when it was pressed. */
export type RevealOrigin = { top: number; left: number; width: number; height: number } | null;

const DURATION_MS = 220;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FULL = 'inset(0px round 0px)';

export const originOf = (el?: Element | null): RevealOrigin => {
  if (!el) return null;
  const { top, left, width, height } = el.getBoundingClientRect();
  return { top, left, width, height };
};

// The panel clipped down to the trigger's rectangle (or a small centre card
// when there is no trigger, e.g. opened from the URL).
function clipToOrigin(origin: RevealOrigin, box: DOMRect): string {
  if (!origin) return 'inset(42% 42% 42% 42% round 18px)';
  const clamp = (n: number) => Math.max(0, Math.round(n));
  const top = clamp(origin.top - box.top);
  const left = clamp(origin.left - box.left);
  const right = clamp(box.right - (origin.left + origin.width));
  const bottom = clamp(box.bottom - (origin.top + origin.height));
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 18px)`;
}

/**
 * Grows a panel out of the control that opened it and shrinks it back into that
 * control on close. Returns whether the panel should be rendered: it stays
 * shown through the closing animation.
 */
export function useTriggerReveal(ref: RefObject<HTMLElement | null>, open: boolean, origin: RevealOrigin): boolean {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const animatedOpen = useRef(open);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || animatedOpen.current === open) return;
    animatedOpen.current = open;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const collapsed = clipToOrigin(origin, el.getBoundingClientRect());
    const animation = el.animate(
      open ? [{ clipPath: collapsed }, { clipPath: FULL }] : [{ clipPath: FULL }, { clipPath: collapsed }],
      { duration: reduceMotion ? 1 : DURATION_MS, easing: EASING, fill: open ? 'none' : 'forwards' },
    );
    if (!open) animation.onfinish = () => setShown(false);
    return () => animation.cancel();
  }, [open, origin, ref]);

  return shown;
}
