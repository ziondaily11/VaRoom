import { clearNotificationsCache } from '../notificationsCache';
import { clearPropertyNewsCache } from '../propertyNewsCache';
import type { ProfileStore } from './profileStore';

// Private, per-account data cached in this browser. Cleared when the signed-in
// user signs out or changes, so nothing from one account renders for another.
// Linked-account tokens (account switcher), listing drafts and the theme are
// deliberately kept.

export const PRIVATE_SESSION_PREFIXES = [
  'varoom:profile:v1:',
  'varoom:data-cache:v1:account:',
  'varoom:client-home:',
  'varoom:listings:feed:v1:',
  'varoom:listings:scroll:',
  'varoom_notifications_cache_v1_',
  'varoom_property_news_react_cache_v1',
  'varoom_property_news_article_details_v1',
];

const CACHED_PROFILE_KEY = 'varoom_cached_profile';
const ACTIVE_ACCOUNT_KEY = 'varoom_active_account_id';

interface ChatCacheApi {
  clearUser(userId: string): Promise<void>;
  clearMedia(): Promise<void>;
  clearAll(): Promise<void>;
}

export interface ClearUserDataOptions {
  localStorage?: Storage | null;
  sessionStorage?: Storage | null;
  profileStore?: ProfileStore | null;
  loadChatCache?: () => Promise<ChatCacheApi | null>;
}

function removeKeysWithPrefixes(storage: Storage | null | undefined, prefixes: string[]) {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage unavailable.
  }
}

function belongsTo(storage: Storage | null | undefined, key: string, userId: string | null, read: (raw: string) => string | null) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return false;
    return userId === null || read(raw) === userId;
  } catch {
    return false;
  }
}

/** Whether a signed-out browser still holds another account's cached identity. */
export function hasStaleAccountData(localStorage: Storage | null | undefined): boolean {
  try {
    return Boolean(localStorage?.getItem(CACHED_PROFILE_KEY) || localStorage?.getItem(ACTIVE_ACCOUNT_KEY));
  } catch {
    return false;
  }
}

/**
 * Clear private data for `userId` (the account that just signed out or was
 * replaced), or for any account when `userId` is null.
 */
export async function clearUserData(userId: string | null, options: ClearUserDataOptions = {}): Promise<void> {
  const { localStorage, sessionStorage, profileStore, loadChatCache } = options;

  profileStore?.clear(userId || undefined);

  if (belongsTo(localStorage, CACHED_PROFILE_KEY, userId, (raw) => (JSON.parse(raw) as { id?: string }).id || null)) {
    localStorage?.removeItem(CACHED_PROFILE_KEY);
  }
  if (belongsTo(localStorage, ACTIVE_ACCOUNT_KEY, userId, (raw) => raw)) {
    localStorage?.removeItem(ACTIVE_ACCOUNT_KEY);
  }

  removeKeysWithPrefixes(sessionStorage, PRIVATE_SESSION_PREFIXES);
  clearNotificationsCache();
  clearPropertyNewsCache();

  if (typeof window !== 'undefined') {
    try { window.VaRoomDataCache?.invalidate('account:'); } catch { /* ignore */ }
    const listingFeed = (window as unknown as { VaRoomListingFeedCache?: { invalidateAll?: () => void } }).VaRoomListingFeedCache;
    try { listingFeed?.invalidateAll?.(); } catch { /* ignore */ }
  }

  try {
    const chatCache = loadChatCache ? await loadChatCache() : null;
    if (chatCache) {
      if (userId) await Promise.all([chatCache.clearUser(userId), chatCache.clearMedia()]);
      else await chatCache.clearAll();
    }
  } catch {
    // IndexedDB unavailable or blocked; nothing else to clear.
  }
}

/** Browser defaults: real storages, the shared profile store and the chat cache. */
export function browserClearOptions(profileStore: ProfileStore): ClearUserDataOptions {
  return {
    localStorage: typeof window === 'undefined' ? null : window.localStorage,
    sessionStorage: typeof window === 'undefined' ? null : window.sessionStorage,
    profileStore,
    // Prefer the chat cache already on the page; otherwise load it on demand
    // so pages without chats do not pay for it until a sign-out happens.
    loadChatCache: async () => window.VaRoomChatCache || (await import('../chatCache')),
  };
}
