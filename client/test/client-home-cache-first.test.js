const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');
const sessionStart = source.indexOf('const resolveSession = async (session: any) => {');
const sessionEnd = source.indexOf('\n    };', sessionStart);
const sessionResolution = source.slice(sessionStart, sessionEnd);
const loadFeedStart = source.indexOf('const loadFeed = useCallback(async (nextPage = false) => {');
const loadFeedEnd = source.indexOf('\n  }, [feedReady,', loadFeedStart);
const loadFeed = source.slice(loadFeedStart, loadFeedEnd);

test('returning to Client Home restores loading state before clearing the old feed', () => {
  const resetIndex = sessionResolution.indexOf('setFeedReady(false)');
  assert.ok(resetIndex >= 0);
  assert.ok(sessionResolution.indexOf('setLoading(true)', resetIndex) > resetIndex);
  assert.ok(sessionResolution.indexOf('setItems([])', resetIndex) > resetIndex);
  assert.match(source, /feedContextReady && loadedFeedKey === key && !currentFeedLoading && !error && visibleItems\.length === 0/);
});

test('the account and authoritative profile filters are known before cached feed access', () => {
  const userIndex = sessionResolution.indexOf('setUser(account.user)');
  const interestIndex = sessionResolution.indexOf('setInterests(nextInterests)');
  const feedReadyIndex = sessionResolution.indexOf('setFeedReady(true)', interestIndex);
  const bookmarkIndex = sessionResolution.indexOf("from('bookmarks')", feedReadyIndex);
  assert.ok(userIndex >= 0 && interestIndex > userIndex);
  assert.ok(feedReadyIndex > interestIndex);
  assert.ok(bookmarkIndex > feedReadyIndex);
  assert.match(source, /\['client', user\.id, view, category, interests\.slice\(\)\.sort\(\)\.join\(','\), term\.toLowerCase\(\)\]/);
});

test('eligible cached feed pages render before bookmark completion and revalidate stale data', () => {
  assert.match(source, /if \(!feedReady \|\| !user \|\| !cache\.current \|\| !key \|\| view === 'saved'/);
  assert.match(loadFeed, /const snapshot = cache\.current\.snapshot<Listing>\(key\)/);
  assert.match(loadFeed, /if \(!nextPage && snapshot\.hasCachedPage\) \{\s*setItems\(snapshot\.items as Listing\[\]\)/);
  assert.match(loadFeed, /setLoadedFeedKey\(key\)/);
  assert.match(loadFeed, /setLoading\(false\)/);
  assert.match(loadFeed, /if \(snapshot\.isStale\) \{\s*const contextVersion = feedContextVersion\.current;\s*void cache\.current\.revalidate\(key, fetcher\)/);
  assert.match(loadFeed, /contextVersion !== feedContextVersion\.current \|\| feedContextKey\.current !== key/);
});

test('a current account-matched snapshot is applied before paint in an isomorphic layout effect', () => {
  assert.match(source, /const useIsomorphicLayoutEffect = typeof window === 'undefined' \? useEffect : useLayoutEffect/);
  assert.match(source, /useIsomorphicLayoutEffect\(\(\) => \{\s*if \(view !== 'saved'\) void loadFeed\(\);\s*\}, \[loadFeed, view\]\)/);
  assert.match(loadFeed, /const snapshot = cache\.current\.snapshot<Listing>\(key\)/);
  assert.match(source, /const visibleItems = loadedFeedKey === key \? items : \[\]/);
});

test('a cache miss keeps the loading state until the filtered request completes', () => {
  assert.match(loadFeed, /else \{\s*setLoading\(true\)/);
  assert.match(loadFeed, /setItems\(\[\]\);\s*setLoadedFeedKey\(''\);/);
  assert.match(loadFeed, /cache\.current\.fetchPage\(key, 0, fetcher\)/);
  assert.match(loadFeed, /finally \{[\s\S]*?setLoading\(false\)/);
});

test('Saved view remains gated on bookmark readiness and never uses the unfiltered feed cache', () => {
  assert.match(source, /if \(view !== 'saved' \|\| !user \|\| !ready\) return/);
  assert.match(source, /if \(!feedReady \|\| !user \|\| !cache\.current \|\| !key \|\| view === 'saved'/);
});

test('account changes invalidate pending feed readiness before selecting the new account cache key', () => {
  const resetIndex = sessionResolution.indexOf('setFeedReady(false)');
  const accountUserIndex = sessionResolution.indexOf('setUser(account.user)');
  assert.ok(resetIndex >= 0 && accountUserIndex > resetIndex);
  assert.match(source, /\['client', user\.id, view, category/);
  assert.match(source, /if \(currentVersion !== loadVersion\.current\) return/);
});

test('same-account token refreshes do not clear feed, media, or saved state', () => {
  assert.match(source, /if \(event === 'TOKEN_REFRESHED' && session\?\.user\?\.id === resolvedSessionUserId\.current\) return/);
  assert.match(source, /resolvedSessionUserId\.current = sessionUser\?\.id \|\| null/);
});

test('a stale response cannot replace a newer search, filter, account, or feed context', () => {
  assert.match(source, /if \(currentVersion !== loadVersion\.current\) return/);
  assert.match(source, /if \(contextVersion !== feedContextVersion\.current \|\| feedContextKey\.current !== key\) return/);
  assert.match(source, /if \(feedContextKey\.current !== key\) \{\s*feedContextKey\.current = key;\s*feedContextVersion\.current \+= 1;\s*\}/);
});

test('pagination does not invalidate a valid background revalidation for the same feed key', () => {
  const revalidationStart = loadFeed.indexOf('if (snapshot.isStale)');
  const revalidationEnd = loadFeed.indexOf('\n      return;', revalidationStart);
  const revalidation = loadFeed.slice(revalidationStart, revalidationEnd);
  assert.match(revalidation, /const contextVersion = feedContextVersion\.current/);
  assert.doesNotMatch(revalidation, /currentVersion !== loadVersion\.current/);
  assert.match(loadFeed, /cache\.current\.prefetchNext\(key, fetcher\)/);
});

test('stable listing IDs preserve mounted cards and their media state during revalidation', () => {
  assert.match(source, /<div key=\{listing\.id\} data-media=\{listing\.id\}>/);
  assert.match(source, /setItems\(\(result\.items \|\| \[\]\) as Listing\[\]\)/);
});

test('a cache miss cannot leave listings from a previous filter visible during the fresh request', () => {
  assert.match(loadFeed, /else \{\s*setLoading\(true\);\s*setItems\(\[\]\);\s*setLoadedFeedKey\(''\);\s*setHasMore\(false\);/);
  assert.match(source, /const visibleItems = loadedFeedKey === key/);
  assert.match(source, /currentFeedLoading && !error && visibleItems\.length === 0/);
  assert.match(source, /loadedFeedKey !== key\) return/);
});

test('initial auth events wait for the feed cache and are coalesced with getSession', () => {
  const initializationStart = source.indexOf('let initialSessionResolved = false;');
  const initializationEnd = source.indexOf('\n      .catch((loadError: Error)', initializationStart);
  const initialization = source.slice(initializationStart, initializationEnd);
  assert.match(initialization, /if \(!initialSessionResolved\) \{\s*hasPendingInitialSession = true;\s*pendingInitialSession = session;\s*return;/);
  assert.ok(initialization.indexOf('cache.current = listingCache') < initialization.indexOf('initialSessionResolved = true'));
  assert.match(initialization, /resolveSession\(hasPendingInitialSession \? pendingInitialSession : result\.data\.session\)/);
});
