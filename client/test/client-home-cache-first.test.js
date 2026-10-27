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
  assert.match(source, /\(view === 'saved' \? ready : feedReady\) && !loading && !error && items\.length === 0/);
});

test('the account and authoritative profile filters are known before cached feed access', () => {
  const userIndex = sessionResolution.indexOf('setUser(account.user)');
  const interestIndex = sessionResolution.indexOf('setInterests(nextInterests)');
  const feedReadyIndex = sessionResolution.indexOf('setFeedReady(true)');
  const bookmarkIndex = sessionResolution.indexOf("from('bookmarks')");
  assert.ok(userIndex >= 0 && interestIndex > userIndex);
  assert.ok(feedReadyIndex > interestIndex);
  assert.ok(bookmarkIndex > feedReadyIndex);
  assert.match(source, /\['client', user\.id, view, category, interests\.slice\(\)\.sort\(\)\.join\(','\), term\.toLowerCase\(\)\]/);
});

test('eligible cached feed pages render before bookmark completion and revalidate stale data', () => {
  assert.match(source, /if \(!feedReady \|\| !user \|\| !cache\.current \|\| !key \|\| view === 'saved'/);
  assert.match(loadFeed, /const snapshot = cache\.current\.snapshot<Listing>\(key\)/);
  assert.match(loadFeed, /if \(!nextPage && snapshot\.hasCachedPage\) \{\s*setItems\(snapshot\.items as Listing\[\]\)/);
  assert.match(loadFeed, /setLoading\(false\)/);
  assert.match(loadFeed, /if \(snapshot\.isStale\) \{\s*void cache\.current\.revalidate\(key, fetcher\)/);
});

test('a cache miss keeps the loading state until the filtered request completes', () => {
  assert.match(loadFeed, /else setLoading\(true\)/);
  assert.match(loadFeed, /cache\.current\.fetchPage\(key, 0, fetcher\)/);
  assert.match(loadFeed, /finally \{[\s\S]*?setLoading\(false\)/);
});

test('Saved view remains gated on bookmark readiness and never uses the unfiltered feed cache', () => {
  assert.match(source, /if \(view !== 'saved' \|\| !user \|\| !ready\) return/);
  assert.match(source, /if \(!feedReady \|\| !user \|\| !cache\.current \|\| !key \|\| view === 'saved'/);
});

test('account changes invalidate pending feed readiness before selecting the new account cache key', () => {
  const resetIndex = sessionResolution.indexOf('setFeedReady(false)');
  const sessionUserIndex = sessionResolution.indexOf('const sessionUser = session?.user');
  assert.ok(resetIndex >= 0 && sessionUserIndex > resetIndex);
  assert.match(source, /\['client', user\.id, view, category/);
  assert.match(source, /if \(currentVersion !== loadVersion\.current\) return/);
});

test('initial auth events wait for the feed cache and are coalesced with getSession', () => {
  const initializationStart = source.indexOf('let initialSessionResolved = false;');
  const initializationEnd = source.indexOf('\n      .catch((loadError: Error)', initializationStart);
  const initialization = source.slice(initializationStart, initializationEnd);
  assert.match(initialization, /if \(!initialSessionResolved\) \{\s*hasPendingInitialSession = true;\s*pendingInitialSession = session;\s*return;/);
  assert.ok(initialization.indexOf('cache.current = listingCache') < initialization.indexOf('initialSessionResolved = true'));
  assert.match(initialization, /resolveSession\(hasPendingInitialSession \? pendingInitialSession : result\.data\.session\)/);
});
