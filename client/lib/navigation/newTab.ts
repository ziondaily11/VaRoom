// Pages that always open in a new tab, outside the app: Help & Support and
// the legal pages. Links to them carry target="_blank", and the app's
// client-side navigation leaves them alone.

const NEW_TAB_PAGES = ['/support', '/terms', '/privacy'];

/** Whether a link goes to one of those pages (a query or hash still counts). */
export function opensInNewTab(href: string): boolean {
  const path = String(href || '').split(/[?#]/)[0];
  return NEW_TAB_PAGES.includes(path);
}

/** The attributes such a link needs; none for any other link. */
export function newTabProps(href: string): { target?: '_blank'; rel?: string } {
  return opensInNewTab(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}
