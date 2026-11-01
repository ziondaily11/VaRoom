import { createCache } from './cache/createCache';
import { CACHE_NAMESPACES } from './cache/namespaces';

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

const SCROLL_KEY = 'varoom_property_news_scroll_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh TTL
const ARTICLE_DETAIL_TTL_MS = 30 * 60 * 1000; // 30 minutes for full articles
const MAX_CACHED_ARTICLES = 100;

// The Property News page caches the full list under 'list'; Client Home's
// short preview has its own key so neither overwrites the other.
const LIST_KEY = 'list';
const PREVIEW_KEY = 'preview';

interface CachedList {
  items: PropertyNewsItem[];
  userId: string | null;
}

const listCache = createCache<CachedList>({
  namespace: CACHE_NAMESPACES.propertyNews,
  ttlMs: CACHE_TTL_MS,
  validate: (value) => Boolean(value && Array.isArray((value as CachedList).items)),
});

const articleCache = createCache<PropertyNewsItem>({
  namespace: CACHE_NAMESPACES.propertyNewsArticles,
  ttlMs: ARTICLE_DETAIL_TTL_MS,
  maxEntries: MAX_CACHED_ARTICLES,
  validate: (value) => Boolean(value && typeof value === 'object' && 'id' in (value as object)),
});

let scrollPosition = 0;

function getStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

function readList(key: string, currentUserId?: string | null): CachedNewsListResult | null {
  const cached = listCache.read(key);
  if (!cached) return null;
  if (currentUserId && cached.value.userId && cached.value.userId !== currentUserId) return null;
  return { items: cached.value.items, isFresh: cached.isFresh, age: cached.age };
}

export function getCachedNewsList(currentUserId?: string | null): CachedNewsListResult | null {
  return readList(LIST_KEY, currentUserId);
}

export function setCachedNewsList(items: PropertyNewsItem[], currentUserId?: string | null): void {
  listCache.write(LIST_KEY, { items, userId: currentUserId || null });
}

/** Client Home's short "latest news" preview. */
export function getCachedNewsPreview(currentUserId?: string | null): CachedNewsListResult | null {
  return readList(PREVIEW_KEY, currentUserId);
}

export function setCachedNewsPreview(items: PropertyNewsItem[], currentUserId?: string | null): void {
  listCache.write(PREVIEW_KEY, { items, userId: currentUserId || null });
}

/**
 * Returns a cached complete article only if it has been fully fetched (contains article body).
 * Does not confuse short listing previews for complete article records.
 */
export function getCachedArticle(id: string | number): PropertyNewsItem | null {
  const cached = articleCache.read(String(id));
  if (!cached) return null;
  const hasBody = Boolean(cached.value.body && cached.value.body.trim());
  return hasBody || cached.isFresh ? cached.value : null;
}

/**
 * Returns a lightweight preview (headline, summary teaser, image, location)
 * from the loaded list to render headers immediately while fetching full article content.
 */
export function getCachedPreview(id: string | number): PropertyNewsItem | null {
  const key = String(id);
  const list = listCache.read(LIST_KEY);
  return (list && list.value.items.find((item) => String(item.id) === key)) || null;
}

/**
 * Caches a complete article record. Does not let an empty summary overwrite
 * a previously loaded complete article body.
 */
export function setCachedArticle(id: string | number, item: PropertyNewsItem): void {
  const key = String(id);
  const existing = articleCache.read(key);
  if (existing && existing.value.body && !item.body) return;
  articleCache.write(key, { ...item, hasFullBody: Boolean(item.body && item.body.trim()) });
}

export function saveScrollPosition(position: number): void {
  scrollPosition = position;
  const storage = getStorageSafe();
  if (storage) {
    try {
      storage.setItem(SCROLL_KEY, String(position));
    } catch {}
  }
}

export function getScrollPosition(): number {
  if (scrollPosition > 0) return scrollPosition;
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
  listCache.clear();
  articleCache.clear();
  scrollPosition = 0;
  const storage = getStorageSafe();
  if (storage) {
    try {
      storage.removeItem(SCROLL_KEY);
    } catch {}
  }
}
