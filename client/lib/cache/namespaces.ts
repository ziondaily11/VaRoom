// Every client cache namespace in one place, so caches never collide and the
// sign-out clean-up knows what to clear even when a cache's module is not
// loaded on the current page.

export const CACHE_NAMESPACES = {
  profile: 'varoom:profile:v1:',
  clientHomeWidgets: 'varoom:client-home:widget:v1:',
  clientHomeVideoMetadata: 'varoom:client-home:video-metadata:v1:',
  notifications: 'varoom:notifications:v2:',
  propertyNews: 'varoom:property-news:v2:',
  propertyNewsArticles: 'varoom:property-news:articles:v2:',
  listingFeed: 'varoom:listings:feed:v1:',
  listingFeedScroll: 'varoom:listings:scroll:',
  // Written by lib/chatCache.ts (kept import-free); per-user prefetch stamp.
  chatPrefetch: 'varoom:chat:prefetch:v1:',
  // VaRoomDataCache stores "account:<id>:..." keys URL-encoded.
  dataCacheAccount: 'varoom:data-cache:v1:' + encodeURIComponent('account:'),
} as const;

/** sessionStorage prefixes holding data private to the signed-in account. */
export const USER_SCOPED_SESSION_PREFIXES: string[] = [
  CACHE_NAMESPACES.profile,
  CACHE_NAMESPACES.clientHomeVideoMetadata,
  CACHE_NAMESPACES.notifications,
  CACHE_NAMESPACES.listingFeed,
  CACHE_NAMESPACES.listingFeedScroll,
  CACHE_NAMESPACES.chatPrefetch,
  CACHE_NAMESPACES.dataCacheAccount,
  'varoom:client-home:',
  // Pre-A3 key formats, cleared until existing sessions age out.
  'varoom_notifications_cache_v1_',
  'varoom_property_news_react_cache_v1',
  'varoom_property_news_article_details_v1',
];
