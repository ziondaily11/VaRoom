'use strict';

// Client Home's cache-first feed: which cached page renders, when it is
// revalidated, which responses may still apply, and what the feed area shows
// (lib/clientHome/feed.ts, used by pages/client-home.tsx).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const feed = loadTs(path.join(__dirname, '..', 'lib', 'clientHome', 'feed.ts'));
const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

const ready = { feedReady: true, hasUser: true, key: 'client:u1:home:all::', view: 'home', nextPage: false, loadingMore: false };

test('the feed cache is used only once the account and its profile filters are known', () => {
  assert.equal(feed.canLoadClientHomeFeed(ready), true);
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, feedReady: false }), false, 'filters not yet known');
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, hasUser: false }), false, 'no account');
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, key: '' }), false, 'no account-scoped key');
});

test('the Saved view never reads the unfiltered feed cache', () => {
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, view: 'saved' }), false);
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, view: 'marketplace' }), true);
});

test('a next-page request is ignored while one is already loading', () => {
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, nextPage: true, loadingMore: true }), false);
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, nextPage: true, loadingMore: false }), true);
  assert.equal(feed.canLoadClientHomeFeed({ ...ready, nextPage: false, loadingMore: true }), true, 'a first-page load is never blocked');
});

test('a cached first page renders immediately and is revalidated only when stale', () => {
  assert.deepEqual(feed.planClientHomeFeedLoad({ hasCachedPage: true, isStale: false }, false), { useCached: true, revalidate: false });
  assert.deepEqual(feed.planClientHomeFeedLoad({ hasCachedPage: true, isStale: true }, false), { useCached: true, revalidate: true });
});

test('a cache miss and pagination go to the network instead of the snapshot', () => {
  assert.deepEqual(feed.planClientHomeFeedLoad({ hasCachedPage: false, isStale: false }, false), { useCached: false, revalidate: false });
  assert.deepEqual(feed.planClientHomeFeedLoad({ hasCachedPage: true, isStale: true }, true), { useCached: false, revalidate: false });
});

test('a background revalidation applies only while its feed key and context are current', () => {
  const keyRef = { current: '' };
  const versionRef = { current: 0 };
  feed.syncFeedContext(keyRef, versionRef, 'client:u1:home:all::');
  const captured = versionRef.current;
  const current = () => ({ version: versionRef.current, key: keyRef.current });

  feed.syncFeedContext(keyRef, versionRef, 'client:u1:home:all::');
  assert.equal(versionRef.current, captured, 're-rendering with the same key (e.g. pagination) keeps the context');
  assert.equal(feed.isCurrentFeedContext(captured, 'client:u1:home:all::', current()), true);

  feed.syncFeedContext(keyRef, versionRef, 'client:u1:home:hotel::');
  assert.equal(feed.isCurrentFeedContext(captured, 'client:u1:home:all::', current()), false, 'a newer filter wins');

  feed.syncFeedContext(keyRef, versionRef, 'client:u1:home:all::');
  assert.equal(feed.isCurrentFeedContext(captured, 'client:u1:home:all::', current()), false, 'returning to the key is a new context');
});

test('an account change invalidates the context even when the key is unchanged', () => {
  const keyRef = { current: 'client:u1:home:all::' };
  const versionRef = { current: 4 };
  // resolveSession bumps the version directly when the session changes.
  versionRef.current += 1;
  assert.equal(feed.isCurrentFeedContext(4, 'client:u1:home:all::', { version: versionRef.current, key: keyRef.current }), false);
});

const view = (overrides) => feed.deriveClientHomeFeedView({
  view: 'home', ready: false, feedReady: true, key: 'k2', loadedFeedKey: 'k2', loading: false, error: '', items: [{ id: 'a' }], ...overrides,
});

test('listings loaded for another filter, search or account are never shown', () => {
  const state = view({ loadedFeedKey: 'k1' });
  assert.deepEqual(state.visibleItems, []);
  assert.equal(state.showSkeleton, true, 'the current key is still loading');
  assert.equal(state.showEmpty, false);
});

test('a returning visit keeps the skeleton until the current feed is known, then shows items or the empty state', () => {
  assert.equal(view({ feedReady: false, loadedFeedKey: '', loading: true, items: [] }).showSkeleton, true);
  const loaded = view({});
  assert.deepEqual(loaded.visibleItems, [{ id: 'a' }]);
  assert.equal(loaded.showSkeleton, false);
  const empty = view({ items: [] });
  assert.equal(empty.showSkeleton, false);
  assert.equal(empty.showEmpty, true);
});

test('errors replace both the skeleton and the empty state', () => {
  const state = view({ items: [], loading: true, error: 'Could not load listings.' });
  assert.equal(state.showSkeleton, false);
  assert.equal(state.showEmpty, false);
});

test('the Saved view waits for bookmark readiness, not feed readiness', () => {
  assert.equal(view({ view: 'saved', ready: false, loadedFeedKey: '', items: [] }).showSkeleton, false);
  assert.equal(view({ view: 'saved', ready: true, loadedFeedKey: '', items: [] }).showSkeleton, true);
  assert.equal(view({ view: 'saved', ready: false, items: [] }).showEmpty, false);
  assert.equal(view({ view: 'saved', ready: true, items: [] }).showEmpty, true);
});

test('auth events before the cache and getSession() resolve are coalesced into one resolution with the latest session', () => {
  const gate = feed.createInitialSessionGate();
  assert.equal(gate.defer({ user: { id: 'u1' } }), true);
  assert.equal(gate.defer({ user: { id: 'u2' } }), true);
  assert.deepEqual(gate.release({ user: { id: 'from-getSession' } }), { user: { id: 'u2' } });
  assert.equal(gate.defer({ user: { id: 'u3' } }), false, 'later events resolve normally');

  const quiet = feed.createInitialSessionGate();
  assert.deepEqual(quiet.release({ user: { id: 'from-getSession' } }), { user: { id: 'from-getSession' } });
  const signedOut = feed.createInitialSessionGate();
  signedOut.defer(null);
  assert.equal(signedOut.release({ user: { id: 'stale' } }), null, 'a pending sign-out is not replaced by the getSession() result');
});

test('same-account token refreshes do not reset the feed, media or saved state', () => {
  assert.equal(feed.isSameAccountTokenRefresh('TOKEN_REFRESHED', 'u1', 'u1'), true);
  assert.equal(feed.isSameAccountTokenRefresh('TOKEN_REFRESHED', 'u2', 'u1'), false, 'another account');
  assert.equal(feed.isSameAccountTokenRefresh('SIGNED_IN', 'u1', 'u1'), false);
  assert.equal(feed.isSameAccountTokenRefresh('TOKEN_REFRESHED', undefined, null), false, 'no session');
});

test('profile interests become normalised feed filters only for clients looking soon', () => {
  assert.deepEqual(feed.clientHomeInterests({ looking_timeline: 'soon', interested_categories: [' Hotel ', 'AIRBNB', '  '] }), ['hotel', 'airbnb']);
  assert.deepEqual(feed.clientHomeInterests({ looking_timeline: 'later', interested_categories: ['hotel'] }), []);
  assert.deepEqual(feed.clientHomeInterests({ looking_timeline: 'soon', interested_categories: null }), []);
});

// Wiring kept as source checks: effect ordering inside resolveSession and the
// render/effect structure cannot be exercised without rendering the page.

test('session resolution clears the old account before selecting the new cache key and reads bookmarks last', () => {
  const start = source.indexOf('const resolveSession = async (session: Session | null) => {');
  const body = source.slice(start, source.indexOf('\n    };', start));
  const order = ['setFeedReady(false)', 'setLoading(true)', 'setItems([])', 'setUser(account.user)', 'setInterests(nextInterests)'];
  const positions = order.map((call) => body.indexOf(call));
  positions.forEach((position, index) => assert.ok(position >= 0 && (index === 0 || position > positions[index - 1]), order[index]));
  const feedReadyIndex = body.indexOf('setFeedReady(true)', positions[4]);
  assert.ok(feedReadyIndex > positions[4] && body.indexOf("from('bookmarks')", feedReadyIndex) > feedReadyIndex);
  assert.match(body, /if \(!active \|\| epoch !== authEpoch\.current\) return;/);
});

test('the page feeds the tested decisions from an account-scoped key, before paint', () => {
  assert.match(source, /\['client', user\.id, view, category, interests\.slice\(\)\.sort\(\)\.join\(','\), term\.toLowerCase\(\)\]/);
  assert.match(source, /useIsomorphicLayoutEffect\(\(\) => \{\s*if \(view !== 'saved'\) void loadFeed\(\);\s*\}, \[loadFeed, view\]\)/);
  assert.match(source, /if \(view !== 'saved' \|\| !user \|\| !ready\) return/);
  assert.match(source, /if \(currentVersion !== loadVersion\.current\) return/);
  assert.match(source, /else \{\s*setLoading\(true\);\s*setItems\(\[\]\);\s*setLoadedFeedKey\(''\);\s*setHasMore\(false\);/);
  assert.match(source, /<div key=\{listing\.id\} data-media=\{listing\.id\}>/);
});
