// Chats' stylesheet (public/js/chats.css, fingerprinted): part of the
// document when /chats is opened directly. Arriving from another page it is
// loaded then, and the page stays hidden until it applies, so the unstyled
// page never shows; it never stays hidden longer than STYLESHEET_WAIT_MS.

export const STYLESHEET_WAIT_MS = 4000;

/** The stylesheet at `href` has loaded and applies. */
export function stylesheetApplied(sheets: ArrayLike<{ href: string | null }>, href: string): boolean {
  return Array.from(sheets).some((sheet) => {
    try { return Boolean(sheet.href) && new URL(sheet.href as string).pathname === href; } catch { return false; }
  });
}

/**
 * Calls `ready` once the stylesheet at `href` applies (or fails, or after
 * STYLESHEET_WAIT_MS), adding its <link> if the document has none.
 * `added` is the link this added (removed on leaving Chats); `stop` removes
 * the listeners and the timer.
 */
export function awaitStylesheet(doc: Document, href: string, ready: () => void, timers: Pick<Window, 'setTimeout' | 'clearTimeout'>): { added: HTMLLinkElement | null; stop: () => void } {
  let added: HTMLLinkElement | null = null;
  let link = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find((l) => l.getAttribute('href') === href);
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
    added = link;
  }
  const element = link;
  element.addEventListener('load', ready);
  element.addEventListener('error', ready);
  if (element.sheet) ready();
  // Never stay hidden: show the page after 4 s whatever happens.
  const fallback = timers.setTimeout(ready, STYLESHEET_WAIT_MS);
  return {
    added,
    stop: () => {
      element.removeEventListener('load', ready);
      element.removeEventListener('error', ready);
      timers.clearTimeout(fallback);
    },
  };
}
