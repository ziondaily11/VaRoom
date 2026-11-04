// The listing wizard's on-device draft store, ported from
// public/js/listing-draft-cache.js with the same database, store and keys, so
// drafts saved before the migration still restore: IndexedDB
// "varoom-listing-drafts" (store "drafts", keyPath "cacheKey") holds the
// whole form and the chosen media files; localStorage
// "varoom_listing_draft_pointer:<host>" points at the host's current draft
// (Pricing reads it too, see lib/billing/pricing.ts).

export const DATABASE_NAME = 'varoom-listing-drafts';
export const STORE_NAME = 'drafts';
export const POINTER_PREFIX = 'varoom_listing_draft_pointer:';
/** A payment checkout's saved form: `varoom_listing_checkout_state:<host>:<listing>`. */
export const CHECKOUT_POINTER_PREFIX = 'varoom_listing_checkout_state:';

export interface DraftPointer {
  hostId: string;
  cacheKey: string;
  draftId?: string | null;
  listingId?: string | null;
  category?: string | null;
  createdAt: number;
  returnTo?: string;
}

/** A stored draft: at least its key; the wizard snapshot's other fields ride along. */
export interface StoredDraft {
  cacheKey: string;
  policyFile?: unknown;
  officeShopFiles?: unknown;
  [field: string]: unknown;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ListingDraftCache {
  save(draft: StoredDraft): Promise<void>;
  load<T extends StoredDraft = StoredDraft>(cacheKey: string | null | undefined): Promise<T | null>;
  remove(cacheKey: string | null | undefined): Promise<void>;
  setPointer(hostId: string, pointer: DraftPointer): void;
  getPointer(hostId: string): DraftPointer | null;
  clearPointer(hostId: string, expectedCacheKey?: string): boolean;
  clearForHost(hostId: string): Promise<void>;
}

/** Private documents never go into browser storage (they upload to the server); only their metadata stays. */
function safeDraftCopy(draft: StoredDraft): StoredDraft {
  const safe: StoredDraft = { ...draft, policyFile: null };
  if (safe.officeShopFiles && typeof safe.officeShopFiles === 'object') safe.officeShopFiles = { floorPlan: null, policy: null, documents: [] };
  return safe;
}

export function createListingDraftCache(options: { indexedDBRef?: IDBFactory | null; storage?: KeyValueStorage | null } = {}): ListingDraftCache {
  const idb = options.indexedDBRef !== undefined ? options.indexedDBRef : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const storage = options.storage !== undefined ? options.storage : (typeof localStorage !== 'undefined' ? localStorage : null);

  function openDatabase(): Promise<IDBDatabase> {
    if (!idb) return Promise.reject(new Error('Browser draft storage is unavailable.'));
    return new Promise((resolve, reject) => {
      const request = idb.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open browser draft storage.'));
      request.onblocked = () => reject(new Error('Browser draft storage is blocked by another tab.'));
    });
  }

  function transact<T>(cacheKey: string, action: (store: IDBObjectStore, key: string) => IDBRequest | null): Promise<T | undefined> {
    return openDatabase().then((database) => new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = action(transaction.objectStore(STORE_NAME), cacheKey);
      let result: T | undefined;
      if (request) request.onsuccess = () => { result = request.result as T; };
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Unable to update browser draft storage.')); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Browser draft storage update was aborted.')); };
    }));
  }

  const cache: ListingDraftCache = {
    save(draft) {
      if (!draft || typeof draft.cacheKey !== 'string' || !draft.cacheKey) return Promise.reject(new Error('A valid listing draft key is required.'));
      return transact(draft.cacheKey, (store) => store.put(safeDraftCopy(draft))).then(() => undefined);
    },
    load<T extends StoredDraft = StoredDraft>(cacheKey: string | null | undefined) {
      if (typeof cacheKey !== 'string' || !cacheKey) return Promise.resolve(null);
      return transact<T>(cacheKey, (store, key) => store.get(key)).then((value) => value || null);
    },
    remove(cacheKey) {
      if (typeof cacheKey !== 'string' || !cacheKey) return Promise.resolve();
      return transact(cacheKey, (store, key) => store.delete(key)).then(() => undefined);
    },
    setPointer(hostId, pointer) {
      if (!storage) throw new Error('Browser draft index is unavailable.');
      if (!hostId || !pointer || pointer.hostId !== hostId || !pointer.cacheKey) throw new Error('A valid host-scoped draft pointer is required.');
      storage.setItem(POINTER_PREFIX + hostId, JSON.stringify(pointer));
    },
    getPointer(hostId) {
      if (!storage || !hostId) return null;
      const value = storage.getItem(POINTER_PREFIX + hostId);
      if (!value) return null;
      let pointer: DraftPointer | null;
      try {
        pointer = JSON.parse(value) as DraftPointer | null;
      } catch (error) {
        console.warn('Ignoring a corrupt saved listing draft pointer:', error);
        storage.removeItem(POINTER_PREFIX + hostId);
        return null;
      }
      if (!pointer || pointer.hostId !== hostId || typeof pointer.cacheKey !== 'string' || !Number.isFinite(pointer.createdAt)) return null;
      return pointer;
    },
    clearPointer(hostId, expectedCacheKey) {
      if (!storage || !hostId) return false;
      const pointer = cache.getPointer(hostId);
      if (!pointer || (expectedCacheKey && pointer.cacheKey !== expectedCacheKey)) return false;
      storage.removeItem(POINTER_PREFIX + hostId);
      return true;
    },
    clearForHost(hostId) {
      if (!storage || !hostId) return Promise.resolve();
      const pointer = cache.getPointer(hostId);
      storage.removeItem(POINTER_PREFIX + hostId);
      return cache.remove(pointer && pointer.cacheKey);
    },
  };
  return cache;
}

/**
 * Sign-out: remove the host's saved listing drafts from this browser (they
 * hold the chosen photos and videos). Other accounts' drafts on a shared
 * browser stay; with no host id, every draft goes. Server copies stay in My Profile.
 */
export async function clearListingDrafts(hostId: string | null, options: { indexedDBRef?: IDBFactory | null; storage?: Pick<Storage, 'key' | 'length' | 'removeItem'> | null } = {}): Promise<void> {
  const storage = options.storage !== undefined ? options.storage : (typeof localStorage !== 'undefined' ? localStorage : null);
  const idb = options.indexedDBRef !== undefined ? options.indexedDBRef : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const mine = (key: string) => (hostId
    ? key === POINTER_PREFIX + hostId || key.startsWith(`${CHECKOUT_POINTER_PREFIX}${hostId}:`)
    : key.startsWith(POINTER_PREFIX) || key.startsWith(CHECKOUT_POINTER_PREFIX));
  if (storage) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && mine(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  }
  if (!idb) return;
  if (!hostId) {
    await new Promise<void>((resolve) => {
      const request = idb.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    return;
  }
  // Records are keyed "<host>:<draft>" and "<host>:checkout:<listing>".
  await new Promise<void>((resolve) => {
    const open = idb.open(DATABASE_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) open.result.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
    };
    open.onerror = () => resolve();
    open.onblocked = () => resolve();
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const range = IDBKeyRange.bound(`${hostId}:`, `${hostId}:${String.fromCharCode(0xffff)}`);
      transaction.objectStore(STORE_NAME).delete(range);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); resolve(); };
    };
  });
}
