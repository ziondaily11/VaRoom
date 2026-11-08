import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

// The Discover feeds' rendering window (Client home and Host home).
//
// One IntersectionObserver per feed watches every card's wrapper. Wrappers
// near the scroll viewport hold the full card; the others hold nothing and
// keep the card's last measured height, so the DOM, image decoding and video
// elements stay bounded however many listings are loaded, while the scroll
// height (and the saved scroll positions) stay what they were. The same
// observer reports when a card first comes near, which is when its media
// (video lookups) are requested. A second observer on the sentinel after the
// last card asks for the next page.
//
// The feeds scroll inside their own column on wide screens and as the
// document on phones, so every observer's root follows that breakpoint.

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Phones scroll the document; wider screens scroll the feed's own column (both feeds' CSS). */
export const FEED_DOCUMENT_SCROLL_QUERY = '(max-width: 860px)';

/**
 * The element the feed scrolls in: the feed column on wide screens, `null`
 * (the viewport) on phones, `undefined` until mounted.
 */
export function useFeedScrollRoot(area: RefObject<HTMLElement | null>): HTMLElement | null | undefined {
  const [root, setRoot] = useState<HTMLElement | null | undefined>(undefined);
  useIsomorphicLayoutEffect(() => {
    const query = window.matchMedia(FEED_DOCUMENT_SCROLL_QUERY);
    const update = () => setRoot(query.matches ? null : area.current);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [area]);
  return root;
}

/** How far beyond the visible area cards stay mounted: about one and a half screens. */
export function windowMargin(root: HTMLElement | null, viewportHeight: number): number {
  const height = root ? root.clientHeight : viewportHeight;
  return Math.round(Math.max(800, (height || 0) * 1.5));
}

// ---------- Measured heights ----------

// Card heights by listing, kept across visits so a return to Discover lays
// the placeholders out at their real heights (the saved scroll position then
// lands where it was). Heights depend on the feed width, so each is stored
// with the width it was measured at. Not private data (numbers only).
const HEIGHT_LIMIT = 4000;
const heights = new Map<string, { width: number; height: number }>();

export function rememberHeight(id: string, width: number, height: number): void {
  if (!(height > 0)) return;
  heights.delete(id);
  heights.set(id, { width: Math.round(width), height: Math.round(height) });
  if (heights.size > HEIGHT_LIMIT) {
    const oldest = heights.keys().next().value;
    if (oldest !== undefined) heights.delete(oldest);
  }
}

/** The height to reserve for a card that is not mounted. */
export function placeholderHeight(id: string, width: number, fallback: number): number {
  const known = heights.get(id);
  if (known && (!width || Math.abs(known.width - width) <= 2)) return known.height;
  return fallback;
}

/** For tests. */
export function resetMeasuredHeights(): void {
  heights.clear();
}

/** Whether a card is mounted: what the observer last reported, else whether it is among the first few. */
export function isWindowMounted(reported: boolean | undefined, index: number, initialCount: number): boolean {
  return reported === undefined ? index < initialCount : reported;
}

// ---------- The window ----------

const DEFAULT_HEIGHT = 640;
const MOUNTED_STYLE: CSSProperties = { display: 'flow-root' };

export interface FeedWindowOptions {
  /** From useFeedScrollRoot; nothing is observed while undefined. */
  root: HTMLElement | null | undefined;
  /** Cards mounted before the observer first reports (the first screen). */
  initialCount?: number;
  /** Called each time a card comes near the viewport. */
  onNear?: (id: string) => void;
}

export interface FeedWindowItemProps {
  ref: (element: HTMLDivElement | null) => void;
  style: CSSProperties;
  'data-feed-window': 'mounted' | 'placeholder';
}

export interface FeedWindow {
  /** Whether the card's content is rendered. */
  isMounted: (id: string, index: number) => boolean;
  /** Props for the card's wrapper element (always rendered, with a stable key). */
  itemProps: (id: string, index: number) => FeedWindowItemProps;
}

export function useFeedWindow({ root, initialCount = 3, onNear }: FeedWindowOptions): FeedWindow {
  const supported = typeof window !== 'undefined' && typeof IntersectionObserver !== 'undefined';
  const near = useRef(new Map<string, boolean>());
  const elements = useRef(new Map<string, HTMLDivElement>());
  const idsByElement = useRef(new WeakMap<Element, string>());
  const refs = useRef(new Map<string, (element: HTMLDivElement | null) => void>());
  const intersection = useRef<IntersectionObserver | null>(null);
  const resize = useRef<ResizeObserver | null>(null);
  const width = useRef(0);
  const measured = useRef({ total: 0, count: 0 });
  const frame = useRef(0);
  const onNearRef = useRef(onNear);
  onNearRef.current = onNear;
  const [, setVersion] = useState(0);

  // Window changes are applied once per frame, however many cards crossed.
  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setVersion((version) => version + 1);
    });
  }, []);

  // Mounted cards report their height (after layout, without forcing one).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const id = idsByElement.current.get(element);
        if (!id || element.dataset.feedWindow !== 'mounted') return;
        const box = entry.borderBoxSize && entry.borderBoxSize[0];
        const height = box ? box.blockSize : entry.contentRect.height;
        const inline = box ? box.inlineSize : entry.contentRect.width;
        if (!(height > 0)) return;
        width.current = Math.round(inline);
        rememberHeight(id, inline, height);
        measured.current.total += height;
        measured.current.count += 1;
      });
    });
    resize.current = observer;
    elements.current.forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); resize.current = null; };
  }, []);

  // One observer for every card, recreated when the scroll root changes.
  useEffect(() => {
    if (!supported || root === undefined) return undefined;
    const margin = windowMargin(root, window.innerHeight);
    const observer = new IntersectionObserver((entries) => {
      let changed = false;
      entries.forEach((entry) => {
        const id = idsByElement.current.get(entry.target);
        if (!id) return;
        const next = entry.isIntersecting;
        if (next && onNearRef.current) onNearRef.current(id);
        if (near.current.get(id) !== next) {
          near.current.set(id, next);
          changed = true;
        }
      });
      if (changed) schedule();
    }, { root, rootMargin: `${margin}px 0px` });
    intersection.current = observer;
    elements.current.forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); intersection.current = null; };
  }, [root, supported, schedule]);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const refFor = useCallback((id: string) => {
    let ref = refs.current.get(id);
    if (ref) return ref;
    ref = (element: HTMLDivElement | null) => {
      const previous = elements.current.get(id);
      if (previous && previous !== element) {
        intersection.current?.unobserve(previous);
        resize.current?.unobserve(previous);
        elements.current.delete(id);
      }
      if (element) {
        elements.current.set(id, element);
        idsByElement.current.set(element, id);
        intersection.current?.observe(element);
        resize.current?.observe(element);
      } else {
        // The listing left the feed: forget it.
        near.current.delete(id);
        refs.current.delete(id);
      }
    };
    refs.current.set(id, ref);
    return ref;
  }, []);

  const isMounted = useCallback((id: string, index: number) => (
    !supported || isWindowMounted(near.current.get(id), index, initialCount)
  ), [supported, initialCount]);

  const itemProps = useCallback((id: string, index: number): FeedWindowItemProps => {
    const mounted = isMounted(id, index);
    if (mounted) return { ref: refFor(id), style: MOUNTED_STYLE, 'data-feed-window': 'mounted' };
    const average = measured.current.count ? measured.current.total / measured.current.count : DEFAULT_HEIGHT;
    return {
      ref: refFor(id),
      style: { display: 'flow-root', height: placeholderHeight(id, width.current, Math.round(average)) },
      'data-feed-window': 'placeholder',
    };
  }, [isMounted, refFor]);

  return { isMounted, itemProps };
}

// ---------- The next page ----------

export interface LoadMoreOptions {
  root: HTMLElement | null | undefined;
  /** Whether more can load now (more exist, this view pages, nothing loading). */
  enabled: boolean;
  /** Loads the next page; resolves false when it failed. */
  onLoadMore: () => Promise<boolean> | void;
  /** An extra condition checked before each load (Host home waits for the reader to scroll). */
  canLoad?: () => boolean;
  /** Changes when the list grows, so a sentinel still in range asks again. */
  itemCount: number;
  /** How far before the end the next page is requested. */
  margin?: number;
}

const RETRY_DELAYS = [2000, 5000, 10000, 30000];

/**
 * The sentinel after the last card. When it comes within `margin` of the
 * viewport (and while it stays there after a page arrives) the next page is
 * requested; a failed page is retried with a growing delay while the reader
 * is still at the end. Returns the sentinel's ref and `check`, for callers
 * that also react to scrolling.
 */
export function useLoadMore({ root, enabled, onLoadMore, canLoad, itemCount, margin = 700 }: LoadMoreOptions) {
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  const near = useRef(false);
  const running = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const latest = useRef({ enabled, onLoadMore, canLoad });
  latest.current = { enabled, onLoadMore, canLoad };

  const check = useCallback(() => {
    const { enabled: allowed, onLoadMore: load, canLoad: extra } = latest.current;
    if (!near.current || !allowed || running.current || retryTimer.current !== null) return;
    if (extra && !extra()) return;
    running.current = true;
    Promise.resolve(load()).then((ok) => {
      running.current = false;
      if (ok === false) {
        const delay = RETRY_DELAYS[Math.min(failures.current, RETRY_DELAYS.length - 1)];
        failures.current += 1;
        retryTimer.current = window.setTimeout(() => { retryTimer.current = null; check(); }, delay);
      } else {
        failures.current = 0;
      }
    }, () => { running.current = false; });
  }, []);

  useEffect(() => {
    if (!sentinel || root === undefined || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      near.current = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (near.current) check();
    }, { root, rootMargin: `${margin}px 0px` });
    observer.observe(sentinel);
    return () => { observer.disconnect(); near.current = false; };
  }, [sentinel, root, margin, check]);

  // A page arrived (or loading was re-enabled) while the sentinel is still in range.
  useEffect(() => { check(); }, [itemCount, enabled, check]);

  useEffect(() => () => { if (retryTimer.current !== null) window.clearTimeout(retryTimer.current); }, []);

  return { ref: setSentinel, check, isNear: () => near.current };
}
