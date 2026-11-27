// Chats' stylesheet (public/js/chats.css, fingerprinted): part of the
// document when /chats is opened directly. Arriving from another page it is
// loaded then, and the page stays hidden until it applies, so the unstyled
// page never shows; it never stays hidden longer than STYLESHEET_WAIT_MS.
// Its rules are global (body, *, .app-shell), so it leaves with Chats.

export const STYLESHEET_WAIT_MS = 4000;

/** The stylesheet at `href` has loaded and applies. */
export function stylesheetApplied(sheets: ArrayLike<{ href: string | null }>, href: string): boolean {
  return Array.from(sheets).some((sheet) => {
    try { return Boolean(sheet.href) && new URL(sheet.href as string).pathname === href; } catch { return false; }
  });
}

const stylesheetLinks = (doc: Document, href: string) => Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter((l) => l.getAttribute('href') === href);

/**
 * Removes the stylesheet at `href` from the document, whoever added it (the
 * document itself when the page was opened directly, or awaitStylesheet).
 */
export function releaseStylesheet(doc: Document, href: string): void {
  stylesheetLinks(doc, href).forEach((link) => link.remove());
}

/**
 * Calls `ready` once the stylesheet at `href` applies (or fails, or after
 * STYLESHEET_WAIT_MS), adding its <link> if the document has none.
 * Returns a function that removes the listeners and the timer.
 */
export function awaitStylesheet(doc: Document, href: string, ready: () => void, timers: Pick<Window, 'setTimeout' | 'clearTimeout'>): () => void {
  let link = stylesheetLinks(doc, href)[0];
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
  }
  const element = link;
  element.addEventListener('load', ready);
  element.addEventListener('error', ready);
  if (element.sheet) ready();
  // Never stay hidden: show the page after 4 s whatever happens.
  const fallback = timers.setTimeout(ready, STYLESHEET_WAIT_MS);
  return () => {
    element.removeEventListener('load', ready);
    element.removeEventListener('error', ready);
    timers.clearTimeout(fallback);
  };
}
