import { useEffect, useLayoutEffect, type RefObject } from 'react';

// The listing-card grid's one size standard (Marketplace and public host
// profiles): cards aim for CARD_TARGET_WIDTH on every screen, as many whole
// columns as fit, never fewer than MIN_COLUMNS (phones). One ResizeObserver
// on the grid writes the result as CSS variables, so a resize re-lays the
// grid without a React render.

export const CARD_TARGET_WIDTH = 280;
export const MIN_COLUMNS = 2;
/** Card height ÷ width, from the reference design. */
export const CARD_ASPECT = 0.95;

/** Columns for a grid of the given inner width and column gap. */
export function gridColumns(width: number, gap: number, target: number = CARD_TARGET_WIDTH, minColumns: number = MIN_COLUMNS): number {
  if (!(width > 0)) return minColumns;
  return Math.max(minColumns, Math.floor((width + gap) / (target + gap)));
}

export interface CardGridOptions {
  /** Fewest columns at any width (default MIN_COLUMNS). */
  minColumns?: number;
  /**
   * A media query (e.g. "(max-width: 760px)") under which the grid shows one
   * full-width card per row. Read on each size change the observer reports:
   * crossing it always changes the grid's width, so no window listener is needed.
   */
  singleColumnQuery?: string;
}

// Layout before paint in the browser; a no-op during server rendering.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useCardGrid(gridRef: RefObject<HTMLElement | null>, { minColumns = MIN_COLUMNS, singleColumnQuery }: CardGridOptions = {}): void {
  useIsomorphicLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    let lastWidth = -1;
    let lastColumns = 0;
    const apply = (width: number) => {
      if (width === lastWidth) return;
      lastWidth = width;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      const single = Boolean(singleColumnQuery && window.matchMedia && window.matchMedia(singleColumnQuery).matches);
      const columns = single ? 1 : gridColumns(width, gap, CARD_TARGET_WIDTH, minColumns);
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
  }, [gridRef, minColumns, singleColumnQuery]);
}
