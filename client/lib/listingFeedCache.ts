import { CACHE_NAMESPACES } from './cache/namespaces';

// Paged listing-feed cache shared by Client Home and the legacy dashboards
// (window.VaRoomListingFeedCache). TypeScript port of
// public/js/listing-feed-cache.js with the same API and the same stored
// format, so feeds cached by either implementation stay readable. The public
// script remains as a fallback for pages served outside the Next app; inside
// it, this module defines the global first and the script steps aside.
//
// Callers include the user id in their feed key, so one account's cached
// listings are never served to another.

const STORAGE_PREFIX = CACHE_NAMESPACES.listingFeed;
const PAGE_SIZE = 12;
const STALE_AFTER_MS = 5 * 60 * 1000;

export interface FeedListing {
  id: string;
  [field: string]: unknown;
}

export type FeedSnapshot<T> = {
  items: T[];
  hasCachedPage: boolean;
  updatedAt: number;
  isStale: boolean;
  nextOffset: number | null;
  hasMore: boolean;
};

type PageResult<T> = { data?: T[]; hasMore?: boolean; error?: Error } | T[];
type PageFetcher<T> = (offset: number, limit: number) => Promise<PageResult<T>>;

export type ListingFeedCache = {
  pageSize: number;
  staleAfterMs: number;
  snapshot<T>(key: string): FeedSnapshot<T>;
  fetchPage<T>(key: string, offset: number, fetcher: PageFetcher<T>, options?: { force?: boolean }): Promise<FeedSnapshot<T>>;
  prefetchNext<T>(key: string, fetcher: PageFetcher<T>): Promise<FeedSnapshot<T>>;
  revalidate<T>(key: string, fetcher: PageFetcher<T>): Promise<FeedSnapshot<T>>;
  updateListing(id: string, patch: Record<string, unknown>): void;
  removeListing(id: string): void;
  invalidateAll(): void;
};

interface FeedEntry {
  version: number;
  updatedAt: number;
  pages: Record<string, FeedListing[]>;
  itemOrder: string[];
  endOffset: number | null;
}

type FeedStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

export interface ListingFeedCacheOptions {
  getStorage?: () => FeedStorage | null;
  now?: () => number;
  random?: () => number;
}

export function createListingFeedCache(options: ListingFeedCacheOptions = {}): ListingFeedCache {
  const getStorage = options.getStorage || (() => (typeof window === 'undefined' ? null : window.sessionStorage));
  const now = options.now || (() => Date.now());
  const random = options.random || (() => Math.random());
  const memory = new Map<string, FeedEntry>();
  const requests = new Map<string, Promise<FeedSnapshot<FeedListing>>>();

  const storageKey = (key: string) => STORAGE_PREFIX + encodeURIComponent(key);

  function blankEntry(): FeedEntry {
    return { version: 2, updatedAt: 0, pages: {}, itemOrder: [], endOffset: null };
  }

  function validPage(page: unknown): page is FeedListing[] {
    return Array.isArray(page) && page.every((listing) => listing && listing.id);
  }

  function shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const item = items[index];
      items[index] = items[swapIndex];
      items[swapIndex] = item;
    }
    return items;
  }

  function normalise(raw: unknown): FeedEntry {
    const entry = raw as FeedEntry | null;
    if (!entry || (entry.version !== 1 && entry.version !== 2) || !entry.pages || typeof entry.pages !== 'object') {
      return blankEntry();
    }
    Object.keys(entry.pages).forEach((offset) => {
      if (!validPage(entry.pages[offset])) delete entry.pages[offset];
    });
    if (entry.version === 1 || !Array.isArray(entry.itemOrder)) {
      entry.itemOrder = [];
      const seen: Record<string, boolean> = {};
      Object.keys(entry.pages)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((offset) => {
          entry.pages[offset].forEach((listing) => {
            if (seen[listing.id]) return;
            seen[listing.id] = true;
            entry.itemOrder.push(listing.id);
          });
        });
      if (entry.version === 1) shuffle(entry.itemOrder);
    }
    entry.version = 2;
    if (typeof entry.updatedAt !== 'number') entry.updatedAt = 0;
    if (typeof entry.endOffset !== 'number') entry.endOffset = null;
    return entry;
  }

  function read(key: string): FeedEntry {
    const cached = memory.get(key);
    if (cached) return cached;
    let entry = blankEntry();
    try {
      const raw = getStorage()?.getItem(storageKey(key));
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number };
        entry = normalise(parsed);
        if (parsed.version !== entry.version) {
          try {
            getStorage()?.setItem(storageKey(key), JSON.stringify(entry));
          } catch {
            // The migrated in-memory ordering remains stable for this page.
          }
        }
      }
    } catch {
      // A disabled or full storage area should not prevent the feed loading.
      entry = blankEntry();
    }
    memory.set(key, entry);
    return entry;
  }

  function write(key: string, entry: FeedEntry) {
    memory.set(key, entry);
    try {
      getStorage()?.setItem(storageKey(key), JSON.stringify(entry));
    } catch {
      // Keep the in-memory version for this page if browser storage is full.
    }
  }

  function orderedItems(entry: FeedEntry): FeedListing[] {
    const listingsById: Record<string, FeedListing> = {};
    Object.keys(entry.pages).forEach((offset) => {
      entry.pages[offset].forEach((listing) => {
        if (!listingsById[listing.id]) listingsById[listing.id] = listing;
      });
    });
    return entry.itemOrder.map((id) => listingsById[id]).filter(Boolean);
  }

  function nextOffset(entry: FeedEntry): number | null {
    let offset = 0;
    for (;;) {
      const page = entry.pages[offset];
      if (!page) return offset;
      if (entry.endOffset === offset || page.length < PAGE_SIZE) return null;
      offset += PAGE_SIZE;
    }
  }

  function snapshot<T>(key: string): FeedSnapshot<T> {
    const entry = read(key);
    const next = nextOffset(entry);
    return {
      items: orderedItems(entry) as unknown as T[],
      hasCachedPage: Object.keys(entry.pages).length > 0,
      updatedAt: entry.updatedAt,
      isStale: !entry.updatedAt || now() - entry.updatedAt > STALE_AFTER_MS,
      nextOffset: next,
      hasMore: next !== null,
    };
  }

  function resultParts<T>(result: PageResult<T>): { data: FeedListing[]; hasMore: boolean | undefined } {
    if (Array.isArray(result)) return { data: result as unknown as FeedListing[], hasMore: undefined };
    const parts = result || {};
    if (parts.error) throw parts.error;
    return { data: Array.isArray(parts.data) ? (parts.data as unknown as FeedListing[]) : [], hasMore: parts.hasMore };
  }

  function fetchPage<T>(key: string, offset: number, requestPage: PageFetcher<T>, fetchOptions: { force?: boolean } = {}): Promise<FeedSnapshot<T>> {
    const entry = read(key);
    if (!fetchOptions.force && entry.pages[offset]) return Promise.resolve(snapshot<T>(key));

    const requestKey = key + ':' + offset;
    const pending = requests.get(requestKey);
    if (pending) return pending as unknown as Promise<FeedSnapshot<T>>;

    const request = Promise.resolve()
      .then(() => requestPage(offset, PAGE_SIZE))
      .then((result) => {
        const parts = resultParts(result);
        const seen: Record<string, boolean> = {};
        const received = parts.data.filter((listing) => {
          if (!listing || !listing.id || seen[listing.id]) return false;
          seen[listing.id] = true;
          return true;
        });
        const previousIds: Record<string, boolean> = {};
        (entry.pages[offset] || []).forEach((listing) => { previousIds[listing.id] = true; });
        const receivedIds: Record<string, boolean> = {};
        received.forEach((listing) => { receivedIds[listing.id] = true; });
        if (fetchOptions.force) {
          const elsewhereIds: Record<string, boolean> = {};
          Object.keys(entry.pages).forEach((pageOffset) => {
            if (Number(pageOffset) === offset) return;
            entry.pages[pageOffset].forEach((listing) => { elsewhereIds[listing.id] = true; });
          });
          entry.itemOrder = entry.itemOrder.filter((id) => !previousIds[id] || receivedIds[id] || elsewhereIds[id]);
        }
        const knownIds: Record<string, boolean> = {};
        entry.itemOrder.forEach((id) => { knownIds[id] = true; });
        const newListings = shuffle(received.filter((listing) => !knownIds[listing.id]));
        entry.pages[offset] = received;
        newListings.forEach((listing) => {
          entry.itemOrder.push(listing.id);
          knownIds[listing.id] = true;
        });
        if (parts.hasMore === false || received.length < PAGE_SIZE) {
          entry.endOffset = offset;
          const retainedIds: Record<string, boolean> = {};
          Object.keys(entry.pages).forEach((pageOffset) => {
            if (Number(pageOffset) > offset) {
              delete entry.pages[pageOffset];
              return;
            }
            entry.pages[pageOffset].forEach((listing) => { retainedIds[listing.id] = true; });
          });
          entry.itemOrder = entry.itemOrder.filter((id) => retainedIds[id]);
        } else if (entry.endOffset !== null && offset <= entry.endOffset) {
          entry.endOffset = null;
        }
        entry.updatedAt = now();
        write(key, entry);
        return snapshot<FeedListing>(key);
      })
      .finally(() => {
        requests.delete(requestKey);
      });

    requests.set(requestKey, request);
    return request as unknown as Promise<FeedSnapshot<T>>;
  }

  function prefetchNext<T>(key: string, requestPage: PageFetcher<T>): Promise<FeedSnapshot<T>> {
    const offset = nextOffset(read(key));
    if (offset === null) return Promise.resolve(snapshot<T>(key));
    return fetchPage(key, offset, requestPage);
  }

  function revalidate<T>(key: string, requestPage: PageFetcher<T>): Promise<FeedSnapshot<T>> {
    if (!read(key).pages[0]) return Promise.resolve(snapshot<T>(key));
    return fetchPage(key, 0, requestPage, { force: true });
  }

  function eachEntry(callback: (key: string, entry: FeedEntry) => void) {
    Array.from(memory.keys()).forEach((key) => callback(key, read(key)));
    try {
      const storage = getStorage();
      for (let index = 0; storage && index < storage.length; index += 1) {
        const keyName = storage.key(index);
        if (!keyName || keyName.indexOf(STORAGE_PREFIX) !== 0) continue;
        const feedKey = decodeURIComponent(keyName.slice(STORAGE_PREFIX.length));
        if (!memory.has(feedKey)) callback(feedKey, read(feedKey));
      }
    } catch {
      // In-memory cache is still enough when sessionStorage is unavailable.
    }
  }

  function updateListing(id: string, patch: Record<string, unknown>) {
    eachEntry((key, entry) => {
      let changed = false;
      Object.keys(entry.pages).forEach((offset) => {
        entry.pages[offset] = entry.pages[offset].map((listing) => {
          if (listing.id !== id) return listing;
          changed = true;
          return { ...listing, ...patch };
        });
      });
      if (changed) {
        entry.updatedAt = now();
        write(key, entry);
      }
    });
  }

  function removeListing(id: string) {
    eachEntry((key, entry) => {
      let changed = false;
      Object.keys(entry.pages).forEach((offset) => {
        const page = entry.pages[offset];
        const nextPage = page.filter((listing) => listing.id !== id);
        if (nextPage.length !== page.length) {
          entry.pages[offset] = nextPage;
          changed = true;
        }
      });
      const nextOrder = entry.itemOrder.filter((listingId) => listingId !== id);
      if (nextOrder.length !== entry.itemOrder.length) {
        entry.itemOrder = nextOrder;
        changed = true;
      }
      if (changed) {
        // Ranges may shift after a deletion, so revalidate the first page on
        // the next visit while still rendering the corrected cache now.
        entry.updatedAt = 0;
        write(key, entry);
      }
    });
  }

  function invalidateAll() {
    eachEntry((key, entry) => {
      entry.updatedAt = 0;
      write(key, entry);
    });
  }

  return {
    pageSize: PAGE_SIZE,
    staleAfterMs: STALE_AFTER_MS,
    snapshot,
    fetchPage,
    prefetchNext,
    revalidate,
    updateListing,
    removeListing,
    invalidateAll,
  };
}

type FeedWindow = Window & { VaRoomListingFeedCache?: ListingFeedCache };

let sharedFeedCache: ListingFeedCache | null = null;

/** The page's feed cache: the existing global if one is defined, else this module's. */
export function getListingFeedCache(): ListingFeedCache | null {
  if (typeof window === 'undefined') return null;
  const feedWindow = window as FeedWindow;
  if (!feedWindow.VaRoomListingFeedCache) {
    sharedFeedCache = sharedFeedCache || createListingFeedCache();
    feedWindow.VaRoomListingFeedCache = sharedFeedCache;
  }
  return feedWindow.VaRoomListingFeedCache;
}

/** Kept for existing callers: resolves immediately; no script is injected. */
export function loadListingFeedCache(): Promise<ListingFeedCache> {
  const cache = getListingFeedCache();
  return cache ? Promise.resolve(cache) : Promise.reject(new Error('Listing feed cache is only available in the browser.'));
}
