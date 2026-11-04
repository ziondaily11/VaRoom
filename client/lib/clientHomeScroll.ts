// Client Home's scroll restoration: the feed scrolls inside its own area on
// desktop and as the document on phones; a position is kept as an anchor card
// and its offset so it survives cards loading above it.

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
