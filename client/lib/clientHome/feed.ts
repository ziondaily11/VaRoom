// Client Home feed and session decisions, kept pure so they can be tested
// without rendering the page. The page owns the state and the effects; these
// helpers only decide what the state should be.

export type ClientHomeView = 'home' | 'marketplace' | 'saved';

/** The categories a client is "looking soon" for, normalised for the feed filter and key. */
export function clientHomeInterests(profile: {
  looking_timeline?: string | null;
  interested_categories?: string[] | null;
}): string[] {
  return profile.looking_timeline === 'soon'
    ? (profile.interested_categories || []).map((value: string) => value.trim().toLowerCase()).filter(Boolean)
    : [];
}

/** A background token refresh for the account already shown must not reset the page. */
export function isSameAccountTokenRefresh(event: string, sessionUserId: string | undefined, resolvedUserId: string | null): boolean {
  return event === 'TOKEN_REFRESHED' && sessionUserId === resolvedUserId;
}

/**
 * Holds auth events that arrive before the listing cache and the initial
 * getSession() have resolved, so the first resolution happens once, with the
 * latest session.
 */
export function createInitialSessionGate<S>() {
  let resolved = false;
  let hasPending = false;
  let pending: S | null = null;
  return {
    /** True while the initial resolution is pending; the session is kept for it. */
    defer(session: S): boolean {
      if (resolved) return false;
      hasPending = true;
      pending = session;
      return true;
    },
    /** Opens the gate and returns the session the first resolution should use. */
    release(fallback: S): S {
      resolved = true;
      return hasPending ? (pending as S) : fallback;
    },
  };
}

/** Whether loadFeed may use the listing feed cache now. The Saved view never does. */
export function canLoadClientHomeFeed(state: {
  feedReady: boolean;
  hasUser: boolean;
  key: string;
  view: ClientHomeView;
  nextPage: boolean;
  loadingMore: boolean;
}): boolean {
  return !(!state.feedReady || !state.hasUser || !state.key || state.view === 'saved' || (state.nextPage && state.loadingMore));
}

/** A cached first page renders immediately; stale cached pages are also revalidated. */
export function planClientHomeFeedLoad(
  snapshot: { hasCachedPage: boolean; isStale: boolean },
  nextPage: boolean,
): { useCached: boolean; revalidate: boolean } {
  const useCached = !nextPage && snapshot.hasCachedPage;
  return { useCached, revalidate: useCached && snapshot.isStale };
}

/** Bumps the context version when the feed key changes, invalidating older responses. */
export function syncFeedContext(keyRef: { current: string }, versionRef: { current: number }, key: string): void {
  if (keyRef.current !== key) {
    keyRef.current = key;
    versionRef.current += 1;
  }
}

/** A response belongs to the current feed only if neither the context version nor the key moved on. */
export function isCurrentFeedContext(
  contextVersion: number,
  key: string,
  current: { version: number; key: string },
): boolean {
  return !(contextVersion !== current.version || current.key !== key);
}

/** What the feed area shows for the current key. Items loaded for another key are never shown. */
export function deriveClientHomeFeedView<T>(state: {
  view: ClientHomeView;
  ready: boolean;
  feedReady: boolean;
  key: string;
  loadedFeedKey: string;
  loading: boolean;
  error: string;
  items: T[];
}) {
  const feedContextReady = state.view === 'saved' ? state.ready : state.feedReady;
  const currentFeedLoading = state.loadedFeedKey === state.key
    ? state.loading
    : state.loading || feedContextReady;
  const visibleItems = state.loadedFeedKey === state.key ? state.items : [];
  return {
    visibleItems,
    showSkeleton: currentFeedLoading && !state.error && visibleItems.length === 0,
    showEmpty: feedContextReady && state.loadedFeedKey === state.key && !currentFeedLoading && !state.error && visibleItems.length === 0,
  };
}
