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
  fetchPage<T>(key: string, offset: number, fetcher: PageFetcher<T>): Promise<FeedSnapshot<T>>;
  prefetchNext<T>(key: string, fetcher: PageFetcher<T>): Promise<FeedSnapshot<T>>;
  revalidate<T>(key: string, fetcher: PageFetcher<T>): Promise<FeedSnapshot<T>>;
};

export function getListingFeedCache(): ListingFeedCache | null {
  if (typeof window === 'undefined') return null;
  return ((window as Window & { VaRoomListingFeedCache?: ListingFeedCache }).VaRoomListingFeedCache) || null;
}

export function loadListingFeedCache(): Promise<ListingFeedCache> {
  const existing = getListingFeedCache();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const alreadyLoading = document.querySelector<HTMLScriptElement>('script[data-listing-feed-cache]');
    const complete = () => {
      const cache = getListingFeedCache();
      if (cache) resolve(cache);
      else reject(new Error('Listing feed cache did not initialize.'));
    };
    if (alreadyLoading) {
      alreadyLoading.addEventListener('load', complete, { once: true });
      alreadyLoading.addEventListener('error', () => reject(new Error('Unable to load listing feed cache.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/js/listing-feed-cache.js';
    script.dataset.listingFeedCache = 'true';
    script.addEventListener('load', complete, { once: true });
    script.addEventListener('error', () => reject(new Error('Unable to load listing feed cache.')), { once: true });
    document.head.appendChild(script);
  });
}
