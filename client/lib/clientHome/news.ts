import { getCachedNewsPreview, setCachedNewsPreview } from '../propertyNewsCache';
import type { PropertyNewsItem } from '../propertyNewsCache';

// Client Home's Property News panel: cached articles render at once, a fresh
// cache skips the request unless Refresh forces one, and a failed refresh
// keeps the articles already shown. Responses for an older request or another
// account are ignored.

export interface ClientHomeNewsContext {
  /** The account the request is made for. */
  accountId: string | null;
  /** The account the page currently shows. */
  currentAccountId: () => string | null;
  requestVersion: { current: number };
  abortController: { current: AbortController | null };
  setNews: (items: PropertyNewsItem[]) => void;
  setNewsFailed: (failed: boolean) => void;
  setNewsLoading: (loading: boolean) => void;
  /** Refresh keeps its spinner up at least this long, so the click visibly does something. */
  minimumRefreshMs?: number;
}

function isNewsList(value: unknown): value is PropertyNewsItem[] {
  return Array.isArray(value) && value.every((item: { id?: unknown } | null) =>
    item && (typeof item.id === 'string' || typeof item.id === 'number'));
}

export async function loadClientHomeNews(force: boolean, context: ClientHomeNewsContext): Promise<void> {
  const { accountId } = context;
  const cached = getCachedNewsPreview();
  if (force) {
    // Refresh: the spinner replaces the list until the new articles arrive
    // (a failed refresh brings the articles already shown back).
    context.setNewsLoading(true);
  } else if (cached) {
    context.setNews(cached.items);
    context.setNewsFailed(false);
    context.setNewsLoading(false);
    if (cached.isFresh) return;
  } else {
    context.setNewsLoading(true);
  }
  context.abortController.current?.abort();
  const controller = new AbortController();
  context.abortController.current = controller;
  const requestVersion = ++context.requestVersion.current;
  const isCurrent = () => requestVersion === context.requestVersion.current && context.currentAccountId() === accountId;
  try {
    const minimum = force && context.minimumRefreshMs
      ? new Promise((resolve) => { setTimeout(resolve, context.minimumRefreshMs); })
      : null;
    const response = await fetch('/api/news/latest?limit=5', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: force ? 'no-store' : 'default',
    });
    if (!response.ok) throw new Error(`Property News request returned ${response.status}.`);
    const result: unknown = await response.json();
    if (!isNewsList(result)) {
      throw new Error('Property News returned an invalid response.');
    }
    if (minimum) await minimum;
    if (!isCurrent()) return;
    setCachedNewsPreview(result);
    context.setNews(result);
    context.setNewsFailed(false);
  } catch (newsError) {
    if (controller.signal.aborted) return;
    if (!isCurrent()) return;
    console.warn('Property News could not be loaded:', newsError);
    context.setNewsFailed(true);
  } finally {
    if (isCurrent()) {
      context.setNewsLoading(false);
    }
  }
}
