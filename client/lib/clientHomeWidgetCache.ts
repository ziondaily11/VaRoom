import { createCache } from './cache/createCache';
import { CACHE_NAMESPACES } from './cache/namespaces';

// Public Client Home widgets (destination counts, VaRoom updates,
// recommendations). Stale entries still render immediately and are refreshed
// in the background; invalid or failed responses are never cached.

export type ClientHomeWidgetKey = 'destinations' | 'updates' | 'recommended';

const MAX_AGE_MS = 5 * 60 * 1000;

function isValidValue(value: unknown, key: string): boolean {
  if (key === 'destinations') {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length > 0 &&
      Object.values(value as Record<string, unknown>).every((count) => count === null || (Number.isSafeInteger(count) && (count as number) >= 0));
  }
  if (key === 'updates') {
    return Array.isArray(value) && value.every((item) =>
      item && typeof item.id === 'string' && typeof item.body === 'string');
  }
  if (key === 'recommended') {
    return Array.isArray(value) && value.every((item) => item && typeof item.id === 'string');
  }
  return false;
}

const cache = createCache<unknown>({
  namespace: CACHE_NAMESPACES.clientHomeWidgets,
  ttlMs: MAX_AGE_MS,
  validate: isValidValue,
});

export function readClientHomeWidgetCache<T>(key: string): { value: T; isFresh: boolean } | null {
  const cached = cache.read(key);
  return cached ? { value: cached.value as T, isFresh: cached.isFresh } : null;
}

export function writeClientHomeWidgetCache(key: string, value: unknown): boolean {
  return cache.write(key, value);
}

/** Shares one in-flight request between simultaneous consumers of a widget. */
export function fetchClientHomeWidget<T>(key: string, loader: () => Promise<T>): Promise<T> {
  return cache.load(key, loader, { force: true }) as Promise<T>;
}
