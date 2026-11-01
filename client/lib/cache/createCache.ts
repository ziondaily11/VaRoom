// The shared cache primitive for client-side data: one place for storage,
// freshness, size limits, request de-duplication and sign-out clearing.
//
// Entries are stored as { value, updatedAt } under `namespace + encodeURIComponent(key)`,
// the format the earlier per-feature caches already used.

export type CacheStorageKind = 'memory' | 'session' | 'local';

export interface CacheOptions<T> {
  /** Storage key prefix, e.g. 'varoom:client-home:widget:v1:'. Must be unique. */
  namespace: string;
  storage?: CacheStorageKind;
  /** How long an entry counts as fresh. Older entries are still returned, marked stale. */
  ttlMs: number;
  /** Entries older than this are dropped. Defaults to never. */
  maxAgeMs?: number;
  /** Least-recently-used bound on entries held by this cache. */
  maxEntries?: number;
  /** Holds data private to the signed-in account; cleared on sign-out. */
  userScoped?: boolean;
  /** Rejects stored values that no longer have the expected shape. */
  validate?: (value: unknown, key: string) => boolean;
  getStorage?: () => Storage | null;
  now?: () => number;
}

export interface CacheEntry<T> {
  value: T;
  updatedAt: number;
}

export interface CacheRead<T> extends CacheEntry<T> {
  isFresh: boolean;
  age: number;
}

export interface LoadOptions {
  /** Ignore a fresh entry and load again (still shares an in-flight load). */
  force?: boolean;
  signal?: AbortSignal;
}

export interface Cache<T> {
  readonly namespace: string;
  read(key: string): CacheRead<T> | null;
  write(key: string, value: T): boolean;
  remove(key: string): void;
  /** Remove entries whose key starts with `prefix` (all entries when omitted). */
  invalidate(prefix?: string): void;
  clear(): void;
  /** Fresh entry, or one shared load whose result is cached (errors are not). */
  load(key: string, loader: (signal?: AbortSignal) => Promise<T>, options?: LoadOptions): Promise<T>;
}

const userScopedCaches = new Set<Cache<unknown>>();

/** Clear every user-scoped cache created on this page (used by sign-out clean-up). */
export function clearUserScopedCaches(): void {
  userScopedCaches.forEach((cache) => cache.clear());
}

function browserStorage(kind: CacheStorageKind): Storage | null {
  if (kind === 'memory' || typeof window === 'undefined') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function abortError(): Error {
  const error = new Error('The cache load was aborted.');
  error.name = 'AbortError';
  return error;
}

export function createCache<T>(options: CacheOptions<T>): Cache<T> {
  const {
    namespace,
    storage: kind = 'session',
    ttlMs,
    maxAgeMs = Infinity,
    maxEntries = Infinity,
    userScoped = false,
    validate,
    now = () => Date.now(),
  } = options;
  const getStorage = options.getStorage || (() => browserStorage(kind));
  const memory = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();
  const generations = new Map<string, number>();

  const storageKey = (key: string) => namespace + encodeURIComponent(key);

  function forget(key: string) {
    memory.delete(key);
    inflight.delete(key);
    generations.set(key, (generations.get(key) || 0) + 1);
    try {
      getStorage()?.removeItem(storageKey(key));
    } catch {
      // Storage unavailable.
    }
  }

  function touch(key: string, entry: CacheEntry<T>) {
    memory.delete(key);
    memory.set(key, entry);
    while (memory.size > maxEntries) {
      const oldest = memory.keys().next().value as string;
      forget(oldest);
    }
  }

  function readEntry(key: string): CacheEntry<T> | null {
    let entry = memory.get(key) || null;
    if (!entry) {
      try {
        const raw = getStorage()?.getItem(storageKey(key));
        const parsed = raw ? (JSON.parse(raw) as Partial<CacheEntry<T>>) : null;
        if (parsed && typeof parsed.updatedAt === 'number' && 'value' in parsed) {
          entry = { value: parsed.value as T, updatedAt: parsed.updatedAt };
        }
      } catch {
        entry = null;
      }
    }
    if (!entry) return null;
    const age = now() - entry.updatedAt;
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs || (validate && !validate(entry.value, key))) {
      forget(key);
      return null;
    }
    touch(key, entry);
    return entry;
  }

  function keysMatching(prefix: string): string[] {
    const keys = new Set<string>();
    memory.forEach((_entry, key) => {
      if (key.startsWith(prefix)) keys.add(key);
    });
    // Loads still in flight have no entry yet; they must be invalidated too
    // so their results are not cached after a clear (e.g. on sign-out).
    inflight.forEach((_request, key) => {
      if (key.startsWith(prefix)) keys.add(key);
    });
    try {
      const storage = getStorage();
      for (let i = 0; storage && i < storage.length; i += 1) {
        const name = storage.key(i);
        if (!name || !name.startsWith(namespace)) continue;
        const key = decodeURIComponent(name.slice(namespace.length));
        if (key.startsWith(prefix)) keys.add(key);
      }
    } catch {
      // Storage unavailable.
    }
    return Array.from(keys);
  }

  const cache: Cache<T> = {
    namespace,

    read(key) {
      const entry = readEntry(key);
      if (!entry) return null;
      const age = now() - entry.updatedAt;
      return { ...entry, age, isFresh: age < ttlMs };
    },

    write(key, value) {
      if (validate && !validate(value, key)) return false;
      const entry = { value, updatedAt: now() };
      touch(key, entry);
      try {
        const storage = getStorage();
        if (storage) storage.setItem(storageKey(key), JSON.stringify(entry));
        return true;
      } catch {
        // Quota exceeded or storage unavailable: memory still serves this page.
        return kind === 'memory';
      }
    },

    remove: forget,

    invalidate(prefix = '') {
      keysMatching(prefix).forEach(forget);
    },

    clear() {
      cache.invalidate('');
    },

    load(key, loader, { force = false, signal } = {}) {
      if (signal?.aborted) return Promise.reject(abortError());
      const cached = force ? null : cache.read(key);
      if (cached && cached.isFresh) return Promise.resolve(cached.value);

      let request = inflight.get(key);
      if (!request) {
        const generation = generations.get(key) || 0;
        request = Promise.resolve()
          .then(() => loader(signal))
          .then((value) => {
            // A clear or invalidate during the load means the result is stale.
            if ((generations.get(key) || 0) === generation) cache.write(key, value);
            return value;
          });
        const settled = request;
        inflight.set(key, settled);
        settled.then(
          () => { if (inflight.get(key) === settled) inflight.delete(key); },
          () => { if (inflight.get(key) === settled) inflight.delete(key); },
        );
      }
      if (!signal) return request;
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener('abort', onAbort, { once: true });
        request!.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    },
  };

  if (userScoped) userScopedCaches.add(cache as Cache<unknown>);
  return cache;
}
