// Client Home's scroll restoration: the feed scrolls inside its own area on
// desktop and as the document on phones; a position is kept as an anchor card
// and its offset so it survives cards loading above it.

import type { NextRouter } from 'next/router';

const MOBILE_SCROLL_QUERY = '(max-width: 860px)';

export interface ScrollPosition {
  windowY: number;
  areaY: number;
  anchorId: string | null;
  anchorOffset: number | null;
}

/** The parts of `window` these helpers use (tests pass a stand-in). */
export type ScrollWindow = Pick<Window, 'matchMedia' | 'innerHeight' | 'scrollY' | 'scrollTo'> & {
  ResizeObserver?: typeof ResizeObserver;
  MutationObserver?: typeof MutationObserver;
};

export function isClientHomePageExit(currentUrl: string, nextUrl: string): boolean {
  const pathname = (value: string) => {
    try {
      return new URL(value, 'http://varoom.local').pathname.replace(/\/+$/, '') || '/';
    } catch {
      return '';
    }
  };
  return pathname(currentUrl) === '/client-home' && pathname(nextUrl) !== '/client-home';
}

function isDocumentScroll(windowObject: ScrollWindow): boolean {
  return windowObject.matchMedia(MOBILE_SCROLL_QUERY).matches;
}

const mediaCards = (feedElement: HTMLElement) => Array.from(feedElement.querySelectorAll<HTMLElement>('[data-media]'));

export function captureScrollPosition(windowObject: ScrollWindow, feedElement: HTMLElement | null | undefined): ScrollPosition {
  const documentScroll = isDocumentScroll(windowObject);
  const viewportTop = documentScroll ? 0 : feedElement?.getBoundingClientRect().top || 0;
  const viewportBottom = documentScroll ? windowObject.innerHeight : viewportTop + (feedElement?.clientHeight || 0);
  const anchor = feedElement
    ? mediaCards(feedElement).find((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom > viewportTop && bounds.top < viewportBottom;
    })
    : null;
  return {
    windowY: windowObject.scrollY || 0,
    areaY: feedElement ? feedElement.scrollTop || 0 : 0,
    anchorId: anchor?.dataset.media || null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - viewportTop : null,
  };
}

export function restoreScrollPosition(windowObject: ScrollWindow, feedElement: HTMLElement | null | undefined, position: Partial<ScrollPosition> | null | undefined): void {
  if (!position || typeof position !== 'object') return;
  const documentScroll = isDocumentScroll(windowObject);
  if (feedElement && position.anchorId && Number.isFinite(position.anchorOffset)) {
    const anchor = mediaCards(feedElement).find((element) => element.dataset.media === position.anchorId);
    if (anchor) {
      const viewportTop = documentScroll ? 0 : feedElement.getBoundingClientRect().top;
      const delta = anchor.getBoundingClientRect().top - viewportTop - Number(position.anchorOffset);
      if (documentScroll) windowObject.scrollTo(0, Math.max(0, windowObject.scrollY + delta));
      else feedElement.scrollTop = Math.max(0, feedElement.scrollTop + delta);
      return;
    }
  }
  if (documentScroll) {
    windowObject.scrollTo(0, Math.max(0, Number(position.windowY) || 0));
    return;
  }
  if (feedElement) feedElement.scrollTop = Math.max(0, Number(position.areaY) || 0);
}

/** Keeps the anchor card in place while cards above it change size; stops once the user scrolls. */
export function preserveAnchorPosition(windowObject: ScrollWindow, feedElement: HTMLElement | null | undefined, position: Partial<ScrollPosition> | null | undefined, onUserScroll: () => boolean): () => void {
  if (!feedElement || !position?.anchorId || !Number.isFinite(position.anchorOffset)
      || (typeof windowObject.ResizeObserver !== 'function' && typeof windowObject.MutationObserver !== 'function')) return () => {};
  const documentScroll = isDocumentScroll(windowObject);
  const cards = mediaCards(feedElement);
  const anchorIndex = cards.findIndex((element) => element.dataset?.media === position.anchorId);
  if (anchorIndex <= 0) return () => {};

  const anchor = cards[anchorIndex];
  const anchorOffset = Number(position.anchorOffset);
  const viewportTop = () => (documentScroll ? 0 : feedElement.getBoundingClientRect().top);
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  const reconcile = () => {
    if (onUserScroll()) {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      return;
    }
    if (typeof feedElement.contains === 'function' && !feedElement.contains(anchor)) {
      restoreScrollPosition(windowObject, feedElement, position);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      return;
    }
    const delta = anchor.getBoundingClientRect().top - viewportTop() - anchorOffset;
    if (Math.abs(delta) < 1) return;
    if (documentScroll) windowObject.scrollTo(0, Math.max(0, windowObject.scrollY + delta));
    else feedElement.scrollTop = Math.max(0, feedElement.scrollTop + delta);
  };
  resizeObserver = typeof windowObject.ResizeObserver === 'function' ? new windowObject.ResizeObserver(reconcile) : null;
  mutationObserver = typeof windowObject.MutationObserver === 'function' ? new windowObject.MutationObserver(reconcile) : null;
  resizeObserver?.observe(feedElement);
  cards.slice(0, anchorIndex).forEach((element) => resizeObserver?.observe(element));
  mutationObserver?.observe(feedElement, { childList: true, subtree: true, characterData: true });
  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}

// ---------------------------------------------------------------------------
// Page wiring: where positions are saved, when they are restored, and what
// counts as the user taking over scrolling.

type Ref<T> = { current: T };
type ScrollRouter = Pick<NextRouter, 'asPath' | 'events'>;

export function clientHomeScrollStorageKey(feedKey: string): string {
  return `varoom:listings:scroll:${feedKey}`;
}

/** Restore once per feed key, only after that key's listings are committed without an error. */
export function shouldRestoreFeedScroll(state: {
  feedReady: boolean;
  key: string;
  loadedFeedKey: string;
  loading: boolean;
  error: string;
  restoredKey: string;
}): boolean {
  return !(!state.feedReady || !state.key || state.loadedFeedKey !== state.key || state.loading || state.error || state.restoredKey === state.key);
}

const KEYBOARD_SCROLL_KEYS = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '];

/** Calls `onIntent` whenever the user starts scrolling (wheel, touch, pointer or scroll keys outside form fields). */
export function trackScrollIntent(windowObject: Pick<Window, 'addEventListener' | 'removeEventListener'>, onIntent: () => void): () => void {
  const markScrollIntent = () => { onIntent(); };
  const markKeyboardScrollIntent = (event: KeyboardEvent) => {
    if (!KEYBOARD_SCROLL_KEYS.includes(event.key)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
    markScrollIntent();
  };
  windowObject.addEventListener('wheel', markScrollIntent, { passive: true });
  windowObject.addEventListener('touchstart', markScrollIntent, { passive: true });
  windowObject.addEventListener('pointerdown', markScrollIntent, { passive: true });
  windowObject.addEventListener('keydown', markKeyboardScrollIntent);
  return () => {
    windowObject.removeEventListener('wheel', markScrollIntent);
    windowObject.removeEventListener('touchstart', markScrollIntent);
    windowObject.removeEventListener('pointerdown', markScrollIntent);
    windowObject.removeEventListener('keydown', markKeyboardScrollIntent);
  };
}

/**
 * Restores the saved position for `feedKey` synchronously, then keeps the
 * anchor card in place until the user scrolls. Returns the anchor clean-up.
 */
export function restoreClientHomeScroll(
  windowObject: ScrollWindow,
  node: HTMLElement | null,
  feedKey: string,
  refs: { restoredKey: Ref<string>; interactionVersion: Ref<number>; anchorCleanup: Ref<(() => void) | null> },
): (() => void) | undefined {
  try {
    const rawPosition = sessionStorage.getItem(clientHomeScrollStorageKey(feedKey));
    refs.restoredKey.current = feedKey;
    if (!rawPosition) return;
    const savedPosition = JSON.parse(rawPosition);
    const interactionVersion = refs.interactionVersion.current;
    restoreScrollPosition(windowObject, node, savedPosition);
    refs.anchorCleanup.current?.();
    refs.anchorCleanup.current = preserveAnchorPosition(
      windowObject,
      node,
      savedPosition,
      () => interactionVersion !== refs.interactionVersion.current,
    );
    return () => {
      refs.anchorCleanup.current?.();
      refs.anchorCleanup.current = null;
    };
  } catch (restoreError) {
    console.warn('Client Home scroll position could not be restored:', restoreError);
  }
}

/**
 * Saves the position for `feedKey` on feed and document scroll, on pagehide
 * and before navigation. Once a navigation leaves Client Home, later scroll
 * events (such as Next.js scrolling the new page to the top) are not saved.
 */
export function persistClientHomeScroll(
  windowObject: ScrollWindow & Pick<Window, 'addEventListener' | 'removeEventListener'>,
  node: HTMLElement,
  feedKey: string,
  router: ScrollRouter,
  refs: { leaving: Ref<boolean>; anchorCleanup: Ref<(() => void) | null> },
): () => void {
  const saveScroll = () => {
    if (refs.leaving.current) return;
    try {
      sessionStorage.setItem(clientHomeScrollStorageKey(feedKey), JSON.stringify({
        ...captureScrollPosition(windowObject, node),
      }));
    } catch (saveError) {
      console.warn('Client Home scroll position could not be saved:', saveError);
    }
  };
  const saveBeforeNavigation = () => {
    refs.anchorCleanup.current?.();
    refs.anchorCleanup.current = null;
    saveScroll();
  };
  const handleRouteStart = (nextUrl: string) => {
    saveBeforeNavigation();
    refs.leaving.current = isClientHomePageExit(router.asPath, nextUrl);
  };
  const handleRouteError = () => {
    refs.leaving.current = false;
  };
  node.addEventListener('scroll', saveScroll, { passive: true });
  windowObject.addEventListener('scroll', saveScroll, { passive: true });
  windowObject.addEventListener('pagehide', saveScroll);
  router.events.on('routeChangeStart', handleRouteStart);
  router.events.on('routeChangeError', handleRouteError);
  return () => {
    if (!refs.leaving.current) saveScroll();
    node.removeEventListener('scroll', saveScroll);
    windowObject.removeEventListener('scroll', saveScroll);
    windowObject.removeEventListener('pagehide', saveScroll);
    router.events.off('routeChangeStart', handleRouteStart);
    router.events.off('routeChangeError', handleRouteError);
  };
}
