// Client-side navigation for links inside the host/client shells (React
// sidebars and legacy page markup). Installed once from _app instead of one
// document listener per layout.

export const HOST_INTERNAL_ROUTES = [
  '/host-home',
  '/bookings',
  '/chats',
  '/notifications',
  '/profile',
  '/settings',
  '/analytics',
  '/support',
  '/marketplace',
  '/list',
  '/pricing',
  '/host/',
  '/property-news',
];

export const CLIENT_INTERNAL_ROUTES = [
  '/client-home',
  '/bookings',
  '/chats',
  '/notifications',
  '/profile',
  '/settings',
  '/support',
  '/marketplace',
  '/signup-host',
  '/host/',
  '/property-news',
];

/** Exact route, a sub-path or a query; routes ending in "/" match as prefixes. */
export function isInternalHref(href: string, routes: string[]): boolean {
  return routes.some((route) => (route.endsWith('/')
    ? href.startsWith(route)
    : href === route || href.startsWith(`${route}/`) || href.startsWith(`${route}?`)));
}

function isPlainInternalLink(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute('href');
  if (!href) return null;
  if (/^(https?:|\/\/|mailto:|tel:|#)/i.test(href)) return null;
  if (anchor.hasAttribute('download')) return null;
  const target = anchor.getAttribute('target');
  if (target && target !== '_self') return null;
  return href;
}

/** Routes for the shell on the page now, or null outside the shells. */
function currentShellRoutes(doc: Document): string[] | null {
  if (doc.querySelector('.host-layout-active')) return HOST_INTERNAL_ROUTES;
  if (doc.querySelector('.client-layout-active')) return CLIENT_INTERNAL_ROUTES;
  return null;
}

export interface AppLinkDeps {
  doc: Document;
  push: (href: string) => void;
  prefetch: (href: string) => void;
}

/**
 * One delegated click handler: plain left-clicks on internal links inside a
 * shell navigate client-side. Modifier keys, middle/right clicks, links a
 * handler already took (defaultPrevented), new-tab targets and downloads keep
 * the browser's default behaviour. Hovering or focusing an internal link
 * prefetches its route once.
 */
export function installAppLinks({ doc, push, prefetch }: AppLinkDeps): () => void {
  const prefetched = new Set<string>();

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const routes = currentShellRoutes(doc);
    if (!routes) return;
    const anchor = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = isPlainInternalLink(anchor);
    if (!href || !isInternalHref(href.split('#')[0], routes)) return;
    event.preventDefault();
    push(href);
  };

  const onIntent = (event: Event) => {
    const routes = currentShellRoutes(doc);
    if (!routes) return;
    const anchor = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = isPlainInternalLink(anchor);
    const path = href ? href.split('#')[0] : '';
    if (!path || !isInternalHref(path, routes)) return;
    if (prefetched.has(path)) return;
    prefetched.add(path);
    try {
      prefetch(path);
    } catch {
      // Prefetch is an optimisation only.
    }
  };

  doc.addEventListener('click', onClick);
  doc.addEventListener('mouseover', onIntent);
  doc.addEventListener('focusin', onIntent);
  return () => {
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('mouseover', onIntent);
    doc.removeEventListener('focusin', onIntent);
  };
}
