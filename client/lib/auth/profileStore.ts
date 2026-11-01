import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../types/profile';

// One cached copy of the signed-in user's profile row. Every consumer reads it
// through get(), so concurrent callers share a request and a hard load within
// the TTL needs none. Writes to `profiles` through the shared client (React or
// legacy pages) invalidate it, so edits show up on the next read.

export const PROFILE_COLUMNS = 'id,full_name,username,avatar_url,role,onboarding_completed,interested_categories,looking_timeline,verified';
export const PROFILE_STORAGE_PREFIX = 'varoom:profile:v1:';
export const PROFILE_FRESH_MS = 5 * 60 * 1000;

export interface ProfileResult {
  data: Profile | null;
  error: Error | null;
}

interface Entry {
  profile: Profile | null;
  fetchedAt: number;
}

type Listener = (userId: string, profile: Profile | null) => void;

interface StoreOptions {
  getClient: () => SupabaseClient | null;
  getStorage?: () => Storage | null;
  now?: () => number;
}

const MUTATIONS = ['insert', 'update', 'upsert', 'delete'] as const;

interface Thenable {
  then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => unknown;
}

export interface ProfileStore {
  get(userId: string, options?: { force?: boolean }): Promise<ProfileResult>;
  peek(userId: string): Profile | null;
  invalidate(userId?: string): void;
  clear(userId?: string): void;
  subscribe(listener: Listener): () => void;
  installWriteHook(client: SupabaseClient): void;
}

export function createProfileStore({ getClient, getStorage = () => null, now = () => Date.now() }: StoreOptions): ProfileStore {
  const memory = new Map<string, Entry>();
  const inflight = new Map<string, Promise<ProfileResult>>();
  const versions = new Map<string, number>();
  const listeners = new Set<Listener>();

  const storageKey = (userId: string) => PROFILE_STORAGE_PREFIX + encodeURIComponent(userId);

  function read(userId: string): Entry | null {
    const cached = memory.get(userId);
    if (cached) return cached;
    try {
      const raw = getStorage()?.getItem(storageKey(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<Entry>;
      if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.profile || parsed.profile.id !== userId) return null;
      const entry = { profile: parsed.profile, fetchedAt: parsed.fetchedAt };
      memory.set(userId, entry);
      return entry;
    } catch {
      return null;
    }
  }

  function write(userId: string, entry: Entry) {
    memory.set(userId, entry);
    try {
      getStorage()?.setItem(storageKey(userId), JSON.stringify(entry));
    } catch {
      // Storage full or unavailable: memory still serves this tab.
    }
  }

  function remove(userId: string) {
    memory.delete(userId);
    try {
      getStorage()?.removeItem(storageKey(userId));
    } catch {
      // Ignore unavailable storage.
    }
  }

  function notify(userId: string, profile: Profile | null) {
    listeners.forEach((listener) => listener(userId, profile));
  }

  function bump(userId: string): number {
    const next = (versions.get(userId) || 0) + 1;
    versions.set(userId, next);
    return next;
  }

  function knownUserIds(): string[] {
    const ids = new Set<string>(memory.keys());
    try {
      const storage = getStorage();
      for (let i = 0; storage && i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith(PROFILE_STORAGE_PREFIX)) ids.add(decodeURIComponent(key.slice(PROFILE_STORAGE_PREFIX.length)));
      }
    } catch {
      // Ignore unavailable storage.
    }
    return Array.from(ids);
  }

  async function load(userId: string, version: number): Promise<ProfileResult> {
    const client = getClient();
    if (!client) return { data: null, error: new Error('Supabase is unavailable.') };
    try {
      const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
      if (error) return { data: null, error };
      const profile = (data as Profile | null) || null;
      if (versions.get(userId) === version) {
        write(userId, { profile, fetchedAt: now() });
        notify(userId, profile);
      }
      return { data: profile, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  const store: ProfileStore = {
    get(userId, { force = false } = {}) {
      if (!userId) return Promise.resolve({ data: null, error: new Error('A user id is required.') });
      const entry = read(userId);
      if (!force && entry && now() - entry.fetchedAt < PROFILE_FRESH_MS) {
        return Promise.resolve({ data: entry.profile, error: null });
      }
      const pending = inflight.get(userId);
      if (pending && !force) return pending;

      const request = load(userId, bump(userId)).finally(() => {
        if (inflight.get(userId) === request) inflight.delete(userId);
      });
      inflight.set(userId, request);
      return request;
    },

    peek(userId) {
      return (userId && read(userId)?.profile) || null;
    },

    invalidate(userId) {
      for (const id of userId ? [userId] : knownUserIds()) {
        const entry = read(id);
        bump(id);
        inflight.delete(id);
        if (entry) write(id, { profile: entry.profile, fetchedAt: 0 });
        if (listeners.size > 0) void store.get(id);
      }
    },

    clear(userId) {
      for (const id of userId ? [userId] : knownUserIds()) {
        bump(id);
        inflight.delete(id);
        remove(id);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Wrap client.from('profiles') so mutations made anywhere through the
    // shared client mark the cached row stale once the write settles.
    installWriteHook(client) {
      const hookable = client as SupabaseClient & { __varoomProfileWriteHookInstalled?: boolean };
      if (hookable.__varoomProfileWriteHookInstalled) return;
      hookable.__varoomProfileWriteHookInstalled = true;

      const originalFrom = client.from.bind(client) as (relation: string) => Record<string, unknown>;
      client.from = ((relation: string) => {
        const builder = originalFrom(relation);
        if (relation !== 'profiles') return builder;
        for (const method of MUTATIONS) {
          const original = builder[method];
          if (typeof original !== 'function') continue;
          builder[method] = (...args: unknown[]) => {
            const filterBuilder = (original as (...a: unknown[]) => Thenable).apply(builder, args);
            const originalThen = filterBuilder.then.bind(filterBuilder);
            filterBuilder.then = (onFulfilled, onRejected) => originalThen((value) => {
              store.invalidate();
              return onFulfilled ? onFulfilled(value) : value;
            }, (reason) => {
              store.invalidate();
              if (onRejected) return onRejected(reason);
              throw reason;
            });
            return filterBuilder;
          };
        }
        return builder;
      }) as unknown as SupabaseClient['from'];
    },
  };

  return store;
}

let sharedStore: ProfileStore | null = null;

export interface LegacyProfileStoreApi {
  get(userId: string, options?: { force?: boolean }): Promise<ProfileResult>;
  peek(userId: string): Profile | null;
  invalidate(userId?: string): void;
}

/** The app-wide store, bound to the shared Supabase client. */
export function getProfileStore(getClient: () => SupabaseClient | null): ProfileStore {
  if (!sharedStore) {
    sharedStore = createProfileStore({
      getClient,
      getStorage: () => (typeof window === 'undefined' ? null : window.sessionStorage),
    });
  }
  if (typeof window !== 'undefined') {
    const client = getClient();
    if (client) sharedStore.installWriteHook(client);
    if (!window.VaRoomProfileStore) {
      const store = sharedStore;
      window.VaRoomProfileStore = {
        get: (userId, options) => store.get(userId, options),
        peek: (userId) => store.peek(userId),
        invalidate: (userId) => store.invalidate(userId),
      };
    }
  }
  return sharedStore;
}
