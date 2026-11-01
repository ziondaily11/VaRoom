import { createCache, type Cache } from './createCache';

// window.VaRoomDataCache, built on the shared cache core. Same API, key
// prefix, key encoding and stored entry format as public/js/varoom-data-cache.js,
// which remains as a fallback for pages served outside the Next app.
// Legacy pages namespace keys themselves: "account:<id>:..." or "public:...".

export const DATA_CACHE_NAMESPACE = 'varoom:data-cache:v1:';
const DEFAULT_TTL_MS = 2 * 60 * 1000;
const MAX_AGE_MS = 15 * 60 * 1000;

export interface DataCacheApi {
  get<T>(key: string, loader: () => T | Promise<T>, options?: { ttl?: number }): Promise<T>;
  invalidate(prefix?: string): void;
  remove(key: string): void;
}

// Loader results carrying an `error` field are returned but never cached.
function isCacheable(value: unknown): boolean {
  return !(value && typeof value === 'object' && (value as { error?: unknown }).error);
}

export function createDataCache(options: { getStorage?: () => Storage | null; now?: () => number } = {}): DataCacheApi & { cache: Cache<unknown> } {
  const cache = createCache<unknown>({
    namespace: DATA_CACHE_NAMESPACE,
    ttlMs: DEFAULT_TTL_MS,
    maxAgeMs: MAX_AGE_MS,
    maxEntries: 500,
    validate: isCacheable,
    getStorage: options.getStorage,
    now: options.now,
  });

  return {
    cache,
    get<T>(key: string, loader: () => T | Promise<T>, getOptions: { ttl?: number } = {}): Promise<T> {
      const ttl = typeof getOptions.ttl === 'number' ? getOptions.ttl : DEFAULT_TTL_MS;
      const cached = cache.read(key);
      if (cached && cached.age <= ttl) return Promise.resolve(cached.value as T);
      return cache.load(key, () => Promise.resolve().then(loader), { force: true }) as Promise<T>;
    },
    invalidate(prefix = '') {
      cache.invalidate(prefix);
    },
    remove(key: string) {
      cache.remove(key);
    },
  };
}

/** Define window.VaRoomDataCache once for the page (legacy scripts use it). */
export function installDataCacheGlobal(): void {
  if (typeof window === 'undefined' || window.VaRoomDataCache) return;
  const dataCache = createDataCache();
  window.VaRoomDataCache = { get: dataCache.get, invalidate: dataCache.invalidate, remove: dataCache.remove };
  // Another frame of this tab (e.g. the chat-settings iframe) may update the
  // shared sessionStorage; drop the stale in-memory copy so the next read
  // picks up its value.
  window.addEventListener('storage', (event) => {
    if (event.key && event.key.indexOf(DATA_CACHE_NAMESPACE) === 0) {
      dataCache.cache.dropMemory(decodeURIComponent(event.key.slice(DATA_CACHE_NAMESPACE.length)));
    }
  });
}
