import { useEffect, useLayoutEffect, type RefObject } from 'react';

// The Marketplace grid's one size standard: cards aim for CARD_TARGET_WIDTH
// on every screen, as many whole columns as fit, never fewer than
// MIN_COLUMNS (phones). One ResizeObserver on the grid writes the result
// as CSS variables, so a resize re-lays the grid without a React render.

export const CARD_TARGET_WIDTH = 280;
export const MIN_COLUMNS = 2;
/** Card height ÷ width, from the reference design. */
export const CARD_ASPECT = 0.95;

/** Columns for a grid of the given inner width and column gap. */
export function gridColumns(width: number, gap: number, target: number = CARD_TARGET_WIDTH): number {
  if (!(width > 0)) return MIN_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.floor((width + gap) / (target + gap)));
}

// Layout before paint in the browser; a no-op during server rendering.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useCardGrid(gridRef: RefObject<HTMLElement | null>): void {
  useIsomorphicLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    let lastWidth = -1;
    let lastColumns = 0;
    const apply = (width: number) => {
      if (width === lastWidth) return;
      lastWidth = width;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const columns = gridColumns(width, gap);
      if (columns !== lastColumns) {
        lastColumns = columns;
        grid.style.setProperty('--mkt-cols', String(columns));
        grid.dataset.cols = String(columns);
      }
      const cardWidth = (width - gap * (columns - 1)) / columns;
      grid.style.setProperty('--mkt-card-w', `${Math.floor(cardWidth)}px`);
    };

    apply(grid.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      apply(Math.round(entry.contentRect.width));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef]);
}
