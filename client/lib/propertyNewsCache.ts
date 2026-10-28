export interface PropertyNewsSource {
  name?: string;
  url?: string;
  platform?: string;
  published_at?: string;
}

export interface PropertyNewsItem {
  id: string | number;
  title: string;
  summary?: string;
  body?: string;
  counties?: string[];
  towns?: string[];
  location_summary?: string;
  published_at?: string;
  regulatory_status?: string;
  category?: string;
  image_url?: string;
  images?: Array<string | { url: string; caption?: string; credit?: string }>;
  image_urls?: string[];
  video_url?: string;
  video_thumbnail?: string;
  poster?: string;
  caption?: string;
  credit?: string;
  video_caption?: string;
  source?: PropertyNewsSource;
  hasFullBody?: boolean;
}

export interface CachedNewsListResult {
  items: PropertyNewsItem[];
  isFresh: boolean;
  age: number;
}

const CACHE_KEY = 'varoom_property_news_react_cache_v1';
const DETAILS_CACHE_KEY = 'varoom_property_news_article_details_v1';
const SCROLL_KEY = 'varoom_property_news_scroll_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh TTL
const ARTICLE_DETAIL_TTL_MS = 30 * 60 * 1000; // 30 minutes for full articles

interface InMemoryStore {
  items: PropertyNewsItem[] | null;
  timestamp: number;
  userId: string | null;
  details: Record<string, { item: PropertyNewsItem; timestamp: number }>;
  scrollPosition: number;
}

const inMemoryStore: InMemoryStore = {
  items: null,
  timestamp: 0,
  userId: null,
  details: {},
  scrollPosition: 0,
};

function getStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

export function getCachedNewsList(currentUserId?: string | null): CachedNewsListResult | null {
  const now = Date.now();

  // Check in-memory store first
  if (inMemoryStore.items) {
    if (!currentUserId || inMemoryStore.userId === currentUserId || !inMemoryStore.userId) {
      const age = now - inMemoryStore.timestamp;
      return {
        items: inMemoryStore.items,
        isFresh: age < CACHE_TTL_MS,
        age,
      };
    }
  }

  // Fall back to sessionStorage
  const storage = getStorageSafe();
  if (!storage) return null;

  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && typeof parsed.timestamp === 'number') {
      if (currentUserId && parsed.userId && parsed.userId !== currentUserId) {
        return null;
      }
      const age = now - parsed.timestamp;
      inMemoryStore.items = parsed.items;
      inMemoryStore.timestamp = parsed.timestamp;
      inMemoryStore.userId = parsed.userId || null;
      return {
        items: parsed.items,
        isFresh: age < CACHE_TTL_MS,
        age,
      };
    }
  } catch (error) {
    console.warn('Unable to read property news cache:', error);
  }

  return null;
}

export function setCachedNewsList(items: PropertyNewsItem[], currentUserId?: string | null): void {
  const now = Date.now();
  inMemoryStore.items = items;
  inMemoryStore.timestamp = now;
  inMemoryStore.userId = currentUserId || null;

  const storage = getStorageSafe();
  if (!storage) return;

  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        items,
        timestamp: now,
        userId: currentUserId || null,
      })
    );
  } catch (error) {
    console.warn('Unable to write property news cache:', error);
  }
}

/**
 * Returns a cached complete article only if it has been fully fetched (contains article body).
 * Does not confuse short listing previews for complete article records.
 */
export function getCachedArticle(id: string | number): PropertyNewsItem | null {
  const key = String(id);
  const now = Date.now();

  // Check in-memory details
  const cached = inMemoryStore.details[key];
  if (cached && cached.item) {
    const hasBody = Boolean(cached.item.body && cached.item.body.trim());
    const isFresh = (now - cached.timestamp) < ARTICLE_DETAIL_TTL_MS;
    if (hasBody || isFresh) {
      return cached.item;
    }
  }

  // Check sessionStorage details
  const storage = getStorageSafe();
  if (storage) {
    try {
      const raw = storage.getItem(DETAILS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed[key] && parsed[key].item) {
          const detail = parsed[key];
          inMemoryStore.details[key] = detail;
          return detail.item;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Returns a lightweight preview (headline, summary teaser, image, location)
 * from the loaded list to render headers immediately while fetching full article content.
 */
export function getCachedPreview(id: string | number): PropertyNewsItem | null {
  const key = String(id);
  if (inMemoryStore.items) {
    const match = inMemoryStore.items.find((item) => String(item.id) === key);
    if (match) return match;
  }
  return null;
}

/**
 * Caches a complete article record. Does not let an empty summary overwrite
 * a previously loaded complete article body.
 */
export function setCachedArticle(id: string | number, item: PropertyNewsItem): void {
  const key = String(id);
  const now = Date.now();

  const existing = inMemoryStore.details[key];
  if (existing && existing.item?.body && !item.body) {
    // Do not overwrite an existing full body with an empty or partial body
    return;
  }

  const completeItem: PropertyNewsItem = {
    ...item,
    hasFullBody: Boolean(item.body && item.body.trim()),
  };

  inMemoryStore.details[key] = {
    item: completeItem,
    timestamp: now,
  };

  const storage = getStorageSafe();
  if (storage) {
    try {
      let detailsMap: Record<string, { item: PropertyNewsItem; timestamp: number }> = {};
      const raw = storage.getItem(DETAILS_CACHE_KEY);
      if (raw) {
        detailsMap = JSON.parse(raw) || {};
      }
      detailsMap[key] = {
        item: completeItem,
        timestamp: now,
      };
      storage.setItem(DETAILS_CACHE_KEY, JSON.stringify(detailsMap));
    } catch (e) {
      console.warn('Unable to persist article details cache:', e);
    }
  }
}

export function saveScrollPosition(position: number): void {
  inMemoryStore.scrollPosition = position;
  const storage = getStorageSafe();
  if (storage) {
    try {
      storage.setItem(SCROLL_KEY, String(position));
    } catch {}
  }
}

export function getScrollPosition(): number {
  if (inMemoryStore.scrollPosition > 0) {
    return inMemoryStore.scrollPosition;
  }
  const storage = getStorageSafe();
  if (storage) {
    try {
      const raw = storage.getItem(SCROLL_KEY);
      if (raw) return parseInt(raw, 10) || 0;
    } catch {}
  }
  return 0;
}

export function clearPropertyNewsCache(): void {
  inMemoryStore.items = null;
  inMemoryStore.timestamp = 0;
  inMemoryStore.userId = null;
  inMemoryStore.details = {};
  inMemoryStore.scrollPosition = 0;

  const storage = getStorageSafe();
  if (storage) {
    try {
      storage.removeItem(CACHE_KEY);
      storage.removeItem(DETAILS_CACHE_KEY);
      storage.removeItem(SCROLL_KEY);
    } catch {}
  }
}
