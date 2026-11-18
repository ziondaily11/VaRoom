import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/**
 * A segmented control's moving pill (animation.md §8.1, B9): the selected
 * option (aria-selected="true") is measured inside its row, and the
 * returned style places one indicator under it with a transform, so a
 * change of tab slides the pill instead of swapping two backgrounds. One
 * ResizeObserver per row keeps it in place when widths change. `ready` is
 * false until the first measurement, so the first paint never animates.
 */
export function useSegmentIndicator(row: RefObject<HTMLElement | null>, activeKey: string): { style: CSSProperties; ready: boolean } {
  const [box, setBox] = useState<{ x: number; width: number; height: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return undefined;
    const measure = () => {
      const selected = element.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!selected) { setBox(null); return; }
      setBox({ x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [row, activeKey]);
  if (!box) return { style: { opacity: 0 }, ready: false };
  return {
    style: { width: box.width, height: box.height, transform: `translate(${box.x}px, ${box.y}px)` },
    ready: true,
  };
}
