// Secondary work on the Discover pages (side widgets, Property News, the
// lightbox code) waits until the listing feed has had its turn: once the
// feed's first page is on screen (or failed), it runs when the browser is
// idle; if the feed is slow, it runs after `fallbackMs` regardless, so the
// widgets are never held back for long. Cached widget values are shown
// before any of this.

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Runs `work` once, soon after the feed settles; returns a cancel function. */
export function afterFeedSettles(feedSettled: boolean, work: () => void, fallbackMs = 2500): () => void {
  if (typeof window === 'undefined') return () => {};
  const idleWindow = window as IdleWindow;
  if (!feedSettled) {
    const timer = window.setTimeout(work, fallbackMs);
    return () => window.clearTimeout(timer);
  }
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(work, { timeout: 1200 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const timer = window.setTimeout(work, 150);
  return () => window.clearTimeout(timer);
}
