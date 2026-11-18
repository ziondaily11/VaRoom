import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Where a panel's trigger sat on screen when it was pressed. */
export type RevealOrigin = { top: number; left: number; width: number; height: number } | null;

// Opening is a little slower than closing and decelerates into place; closing
// accelerates gently into the trigger. Both run on the compositor-friendly
// clip-path, with the panel's content fading so it never shows squeezed.
export const REVEAL_OPEN_MS = 460;
export const REVEAL_CLOSE_MS = 340;
const OPEN_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const CLOSE_EASING = 'cubic-bezier(0.55, 0, 0.25, 1)';
const FULL = 'inset(0px round 0px)';
/** Elements inside the panel marked with this attribute fade in and out with it. */
export const REVEAL_CONTENT_SELECTOR = '[data-reveal-content]';

// The server renders nothing to animate; this avoids React's useLayoutEffect warning there.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

/** How far (0–1) a running animation has got; 1 when there is none. */
function progressOf(animation: Animation | null): number {
  if (!animation || animation.playState !== 'running') return 1;
  const total = Number(animation.effect?.getTiming().duration) || 1;
  return Math.min(1, Math.max(0, Number(animation.currentTime ?? total) / total));
}

/**
 * Grows a panel out of the control that opened it and shrinks it back into that
 * control on close. Returns whether the panel should be rendered: it stays
 * shown through the closing animation. Pressing again mid-animation turns it
 * around from where it is instead of jumping.
 */
export function useTriggerReveal(ref: RefObject<HTMLElement | null>, open: boolean, origin: RevealOrigin): boolean {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const animatedOpen = useRef(open);
  const running = useRef<Animation[]>([]);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || animatedOpen.current === open) return;
    animatedOpen.current = open;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const collapsed = clipToOrigin(origin, el.getBoundingClientRect());

    // Turning around mid-way: start from the current shape, and take only as
    // long as the way back is.
    const previous = running.current[0] ?? null;
    const interrupted = previous !== null && previous.playState === 'running';
    const start = interrupted ? getComputedStyle(el).clipPath : open ? collapsed : FULL;
    const content = Array.from(el.querySelectorAll<HTMLElement>(REVEAL_CONTENT_SELECTOR));
    const startOpacity = content.map((node) => (interrupted ? getComputedStyle(node).opacity : open ? '0' : '1'));
    const share = interrupted ? progressOf(previous) : 1;
    running.current.forEach((animation) => animation.cancel());

    const duration = reduceMotion ? 1 : Math.max(120, Math.round((open ? REVEAL_OPEN_MS : REVEAL_CLOSE_MS) * share));
    const easing = open ? OPEN_EASING : CLOSE_EASING;
    el.style.willChange = 'clip-path';

    const panel = el.animate(
      [{ clipPath: start }, { clipPath: open ? FULL : collapsed }],
      { duration, easing, fill: open ? 'none' : 'forwards' },
    );
    // The content appears once the panel has room for it, and is gone before
    // the panel is small enough to squeeze it.
    const fades = content.map((node, i) => node.animate(
      open
        ? [{ opacity: startOpacity[i], offset: 0 }, { opacity: startOpacity[i], offset: interrupted ? 0 : 0.25 }, { opacity: 1, offset: 1 }]
        : [{ opacity: startOpacity[i], offset: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 0, offset: 1 }],
      { duration, easing: 'ease-out', fill: open ? 'none' : 'forwards' },
    ));
    running.current = [panel, ...fades];

    panel.onfinish = () => {
      el.style.willChange = '';
      if (!open) setShown(false);
    };
  }, [open, origin, ref]);

  // Stop anything still running when the panel goes away for good.
  useEffect(() => () => running.current.forEach((animation) => animation.cancel()), []);

  return shown;
}
