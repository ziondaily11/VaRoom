import type { PropertyNewsItem } from '../propertyNewsCache';

// Requests the Property News page makes to its own /api/news routes. A
// non-OK response throws so the page can show its error state.

/** The index list (up to 50 items). `force` bypasses the browser HTTP cache. */
export async function fetchNewsList(signal?: AbortSignal, force = false): Promise<PropertyNewsItem[]> {
  const response = await fetch('/api/news?limit=50', {
    headers: { Accept: 'application/json' },
    signal,
    cache: force ? 'no-store' : 'default',
  });
  if (!response.ok) {
    throw new Error(`Failed to load property news: ${response.status}`);
  }
  const data: PropertyNewsItem[] = await response.json();
  return Array.isArray(data) ? data : [];
}

/** One complete article, including its body. */
export async function fetchNewsArticle(id: string, signal?: AbortSignal): Promise<PropertyNewsItem> {
  const response = await fetch(`/api/news/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load news article: ${response.status}`);
  }
  const fullItem: PropertyNewsItem = await response.json();
  return fullItem;
}
