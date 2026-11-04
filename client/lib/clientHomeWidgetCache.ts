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

export interface ClientHomeWidgetView<T> {
  /** False once the consumer has unmounted; late results are then cached but not shown. */
  isActive: () => boolean;
  setValue: (value: T) => void;
  setLoading: (loading: boolean) => void;
  setFailed: (failed: boolean) => void;
}

/**
 * Shows a cached widget value at once, then refreshes it unless it is fresh.
 * A failed refresh keeps the cached value and only flags the failure.
 * `createLoader` returns null when the data source is unavailable.
 */
export function hydrateClientHomeWidget<T>(
  key: ClientHomeWidgetKey,
  view: ClientHomeWidgetView<T>,
  createLoader: () => (() => Promise<T>) | null,
  errorLabel: string,
): void {
  const cached = readClientHomeWidgetCache<T>(key);
  if (cached) {
    view.setValue(cached.value);
    view.setLoading(false);
    view.setFailed(false);
  } else {
    view.setLoading(true);
    view.setFailed(false);
  }
  if (cached?.isFresh) return;
  const loader = createLoader();
  if (!loader) {
    view.setFailed(true);
    view.setLoading(false);
    return;
  }
  void fetchClientHomeWidget(key, loader).then((value: T) => {
    writeClientHomeWidgetCache(key, value);
    if (view.isActive()) {
      view.setValue(value);
      view.setFailed(false);
    }
  }).catch((widgetError: Error) => {
    console.error(errorLabel, widgetError);
    if (view.isActive()) view.setFailed(true);
  }).finally(() => {
    if (view.isActive()) view.setLoading(false);
  });
}
