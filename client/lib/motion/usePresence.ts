import { useEffect, useState } from 'react';

/**
 * Keeps an element mounted while it plays its exit (animation.md §8.3):
 * `mounted` stays true for `exitMs` after `open` turns false, and `closing`
 * is true during that time so the element can run its exit and ignore input.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted: open || mounted, closing: !open && mounted };
}
