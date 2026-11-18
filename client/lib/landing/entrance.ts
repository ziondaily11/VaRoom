import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { prefersReducedMotion } from '../motion/reducedMotion';

// Landing page entrances (animation.md §2.3, §8.14, §14.3): a section renders
// visible (also without JavaScript); only a section still below the screen
// when the page loads waits, and plays once when it comes into view. Once
// played it is remembered for the tab, so coming back (the landing page
// reopens at the top) does not play it again.

export type Reveal = 'none' | 'waiting' | 'playing';

/** Whether this entrance has already played in this tab. */
export function playedThisTab(key: string): boolean {
  try { return window.sessionStorage.getItem(key) === '1'; } catch { return false; }
}

/** Remembers for this tab that the entrance played. */
export function rememberPlayed(key: string): void {
  try { window.sessionStorage.setItem(key, '1'); } catch { /* It may play again. */ }
}

/** A point is "below the screen" from 85% of its height down. */
export const isBelowScreen = (rect: DOMRect): boolean => rect.top >= window.innerHeight * 0.85;

/**
 * The entrance state of one section. Measured two frames after mounting,
 * once the browser has restored the scroll position, so a section already on
 * screen then never waits.
 */
export function useSectionEntrance(ref: RefObject<HTMLElement | null>, key: string, threshold = 0.2): Reveal {
  const [state, setState] = useState<Reveal>('none');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion() || playedThisTab(key)) return undefined;
    let observer: IntersectionObserver | null = null;
    const begin = () => {
      if (!isBelowScreen(el.getBoundingClientRect())) return;
      setState('waiting');
      const watcher = observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState('playing');
        rememberPlayed(key);
        watcher.disconnect();
      }, { threshold });
      watcher.observe(el);
    };
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(begin); });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [ref, key, threshold]);
  return state;
}
