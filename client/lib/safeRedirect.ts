// Post-login destinations come from the URL, so they must stay on this
// origin. Ported from getSafeRedirect in legacy-pages/auth-callback.html.
// Rejects absolute and protocol-relative URLs to other origins as well as
// javascript:/data: URLs (their origin is "null").
export function getSafeRedirect(value: unknown, origin?: string): string {
  if (typeof value !== 'string' || !value) return '';
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '';
  try {
    const url = new URL(value, base);
    if (url.origin !== base) return '';
    return url.pathname + url.search + url.hash;
  } catch {
    return '';
  }
}

/** The single login entry point: the landing page's auth panel. */
export function loginUrl(redirect?: string): string {
  const safe = getSafeRedirect(redirect);
  return '/?auth=login' + (safe ? '&redirect=' + encodeURIComponent(safe) : '');
}
