// The one place that decides the page theme. _document's pre-paint script is
// generated from it, and _app applies it on route changes.

export type Theme = 'light' | 'dark';

/** Pages that always render light, whatever the saved preference. */
export const FORCED_LIGHT_ROUTES = ['/', '/payments', '/property-news', '/privacy', '/terms'];
const FORCED_LIGHT_PREFIXES = ['/property-news/'];

/** Pages designed dark-first: dark unless the user chose Light in Settings. */
export const DARK_FIRST_ROUTES = ['/pricing'];

export function normalizePath(path: string): string {
  let routePath = (path || '/').split(/[?#]/)[0] || '/';
  if (routePath.length > 1 && routePath.endsWith('/')) routePath = routePath.slice(0, -1);
  return routePath;
}

export function isForcedLight(path: string): boolean {
  const routePath = normalizePath(path);
  return FORCED_LIGHT_ROUTES.includes(routePath) || FORCED_LIGHT_PREFIXES.some((prefix) => routePath.startsWith(prefix));
}

export function resolveTheme(path: string, saved: string | null, prefersDark: boolean): Theme {
  if (isForcedLight(path)) return 'light';
  if (DARK_FIRST_ROUTES.includes(normalizePath(path))) return saved === 'light' ? 'light' : 'dark';
  const preference = saved || 'system';
  const theme = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
  return theme === 'dark' ? 'dark' : 'light';
}

/** Apply the theme for `path`, writing only when it differs. Returns whether it changed. */
export function applyTheme(path: string, doc: Document = document): boolean {
  let saved: string | null = null;
  let prefersDark = false;
  try {
    saved = window.localStorage.getItem('varoom_theme');
    prefersDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    // Storage or matchMedia unavailable: fall back to the defaults.
  }
  const theme = resolveTheme(path, saved, prefersDark);
  const root = doc.documentElement;
  if (root.getAttribute('data-theme') === theme && root.style.colorScheme === theme) return false;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  return true;
}

/** Inline pre-paint script for _document, built from the same rules. */
export function themeBootScript(): string {
  return `(function () {
  try {
    var forced = ${JSON.stringify(FORCED_LIGHT_ROUTES)};
    var prefixes = ${JSON.stringify(FORCED_LIGHT_PREFIXES)};
    var path = window.location.pathname || '/';
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    var isForced = forced.indexOf(path) >= 0 || prefixes.some(function (prefix) { return path.indexOf(prefix) === 0; });
    var saved = isForced ? 'light' : (localStorage.getItem('varoom_theme') || 'system');
    if (!isForced && ${JSON.stringify(DARK_FIRST_ROUTES)}.indexOf(path) >= 0 && saved !== 'light') saved = 'dark';
    var theme = saved === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : saved;
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (error) {}
})();`;
}
