const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  captureScrollPosition,
  isClientHomePageExit,
  preserveAnchorPosition,
  restoreScrollPosition,
} = require('./helpers/loadTs').loadTs(require('node:path').join(__dirname, '..', 'lib', 'clientHomeScroll.ts'));
const { loadTs } = require('./helpers/loadTs');

const pageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

test('Client Home tab changes are distinct from leaving the page', () => {
  assert.equal(isClientHomePageExit('/client-home?view=home', '/client-home?view=saved'), false);
  assert.equal(isClientHomePageExit('/client-home', '/notifications'), true);
  assert.equal(isClientHomePageExit('/client-home', '/bookings?status=upcoming'), true);
});

test('desktop restoration uses the independently scrolling feed container', () => {
  const feed = {
    scrollTop: 0,
    clientHeight: 700,
    getBoundingClientRect: () => ({ top: 100, bottom: 800 }),
    querySelectorAll: () => [],
  };
  const windowObject = {
    scrollY: 0,
    matchMedia: (query) => ({ matches: query === '(max-width: 860px)' ? false : null }),
    scrollTo() { throw new Error('Desktop restoration must not move document scroll.'); },
  };
  restoreScrollPosition(windowObject, feed, { windowY: 300, areaY: 740 });
  assert.equal(feed.scrollTop, 740);
});

test('mobile restoration uses document scroll and saves both positions for responsive changes', () => {
  const feed = {
    scrollTop: 40,
    clientHeight: 700,
    getBoundingClientRect: () => ({ top: 0, bottom: 700 }),
    querySelectorAll: () => [],
  };
  let restored = null;
  const windowObject = {
    scrollY: 615,
    matchMedia: (query) => ({ matches: query === '(max-width: 860px)' }),
    scrollTo(x, y) { restored = [x, y]; },
  };
  assert.deepEqual(captureScrollPosition(windowObject, feed), {
    windowY: 615,
    areaY: 40,
    anchorId: null,
    anchorOffset: null,
  });
  restoreScrollPosition(windowObject, feed, { windowY: 615, areaY: 740 });
  assert.deepEqual(restored, [0, 615]);
  assert.equal(feed.scrollTop, 40);
});

test('a saved listing anchor restores its relative viewport position on desktop and mobile', () => {
  let anchorTop = 265;
  const anchor = { dataset: { media: 'distinctive-listing' }, getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 220 }) };
  const feed = {
    scrollTop: 500,
    clientHeight: 700,
    getBoundingClientRect: () => ({ top: 100, bottom: 800 }),
    querySelectorAll: () => [anchor],
  };
  const desktop = {
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    scrollTo() { throw new Error('Desktop must restore the nested feed.'); },
  };
  const desktopPosition = captureScrollPosition(desktop, feed);
  assert.equal(desktopPosition.anchorId, 'distinctive-listing');
  assert.equal(desktopPosition.anchorOffset, 165);
  feed.scrollTop = 0;
  anchorTop = 700;
  restoreScrollPosition(desktop, feed, desktopPosition);
  assert.equal(feed.scrollTop, 435);

  let mobileY = 450;
  const mobile = {
    get scrollY() { return mobileY; },
    matchMedia: () => ({ matches: true }),
    scrollTo(_x, y) { mobileY = y; },
    innerHeight: 800,
  };
  anchorTop = 240;
  const mobilePosition = captureScrollPosition(mobile, feed);
  assert.equal(mobilePosition.anchorOffset, 240);
  anchorTop = 300;
  restoreScrollPosition(mobile, feed, mobilePosition);
  assert.equal(mobileY, 510);
});

test('late media size changes above the anchor preserve its viewport position until user scrolls', () => {
  let anchorTop = 400;
  const beforeAnchor = { dataset: { media: 'preceding-listing' }, getBoundingClientRect: () => ({ top: 120, bottom: 400 }) };
  const anchor = { dataset: { media: 'anchor-listing' }, getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 200 }) };
  const feed = {
    scrollTop: 300,
    clientHeight: 700,
    getBoundingClientRect: () => ({ top: 100, bottom: 800 }),
    querySelectorAll: () => [beforeAnchor, anchor],
  };
  let resizeCallback;
  let observed = 0;
  let disconnected = false;
  const windowObject = {
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class {
      constructor(callback) { resizeCallback = callback; }
      observe() { observed += 1; }
      disconnect() { disconnected = true; }
    },
  };
  const cleanup = preserveAnchorPosition(windowObject, feed, { anchorId: 'anchor-listing', anchorOffset: 300 }, () => false);
  assert.equal(observed, 2);
  anchorTop += 85;
  resizeCallback();
  assert.equal(feed.scrollTop, 385);
  cleanup();
  assert.equal(disconnected, true);
});

test('DOM changes above the anchor keep the same listing visible and stop once the user scrolls', () => {
  let anchorTop = 470;
  const beforeAnchor = { dataset: { media: 'preceding' }, getBoundingClientRect: () => ({ top: 100, bottom: 300 }) };
  const anchor = { dataset: { media: 'anchor' }, getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 180 }) };
  const feed = {
    scrollTop: 210,
    clientHeight: 700,
    getBoundingClientRect: () => ({ top: 100, bottom: 800 }),
    querySelectorAll: () => [beforeAnchor, anchor],
  };
  let mutationCallback;
  let disconnected = false;
  const windowObject = {
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  };
  let userScrolled = false;
  const cleanup = preserveAnchorPosition(windowObject, feed, { anchorId: 'anchor', anchorOffset: 370 }, () => userScrolled);
  anchorTop += 120;
  mutationCallback();
  assert.equal(feed.scrollTop, 330);

  userScrolled = true;
  anchorTop += 60;
  mutationCallback();
  assert.equal(feed.scrollTop, 330);
  assert.equal(disconnected, true);
  cleanup();
});

test('removing the saved listing anchor falls back to the saved owner-specific scroll offset', () => {
  const preceding = { dataset: { media: 'preceding' }, getBoundingClientRect: () => ({ top: 100, bottom: 300 }) };
  const anchor = { dataset: { media: 'removed-anchor' }, getBoundingClientRect: () => ({ top: 480, bottom: 650 }) };
  let attached = true;
  const feed = {
    scrollTop: 0,
    clientHeight: 700,
    getBoundingClientRect: () => ({ top: 100, bottom: 800 }),
    querySelectorAll: () => attached ? [preceding, anchor] : [preceding],
    contains: (element) => attached && element === anchor,
  };
  let mutationCallback;
  const windowObject = {
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
      disconnect() {}
    },
  };
  preserveAnchorPosition(windowObject, feed, {
    anchorId: 'removed-anchor',
    anchorOffset: 380,
    areaY: 225,
    windowY: 50,
  }, () => false);
  attached = false;
  mutationCallback();
  assert.equal(feed.scrollTop, 225);
});

// --- Page wiring: restoration, persistence and scroll intent -----------------

function createSessionStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => { entries.set(key, String(value)); },
  };
}

class FakeHTMLElement {
  constructor(tagName, isContentEditable = false) {
    this.tagName = tagName;
    this.isContentEditable = isContentEditable;
  }
}

function createEventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type, event = {}) { [...(listeners.get(type) || [])].forEach((listener) => listener(event)); },
    count() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); },
  };
}

function createRouter(asPath) {
  const handlers = new Map();
  return {
    asPath,
    handlers,
    events: {
      on(type, handler) { handlers.set(type, handler); },
      off(type, handler) { if (handlers.get(type) === handler) handlers.delete(type); },
    },
    emit(type, ...args) { handlers.get(type)?.(...args); },
  };
}

function loadWiring(storage) {
  return loadTs(path.join(__dirname, '..', 'lib', 'clientHomeScroll.ts'), {
    globals: { sessionStorage: storage, HTMLElement: FakeHTMLElement, console: { warn() {} } },
  });
}

const desktopFeed = (scrollTop = 0, cards = []) => ({
  scrollTop,
  clientHeight: 700,
  getBoundingClientRect: () => ({ top: 100, bottom: 800 }),
  querySelectorAll: () => cards,
});

test('restoration waits for the current feed to be committed and runs once per feed key', () => {
  const { shouldRestoreFeedScroll } = loadWiring(createSessionStorage());
  const ready = { feedReady: true, key: 'k', loadedFeedKey: 'k', loading: false, error: '', restoredKey: '' };
  assert.equal(shouldRestoreFeedScroll(ready), true);
  assert.equal(shouldRestoreFeedScroll({ ...ready, feedReady: false }), false);
  assert.equal(shouldRestoreFeedScroll({ ...ready, key: '' }), false);
  assert.equal(shouldRestoreFeedScroll({ ...ready, loadedFeedKey: 'previous' }), false, 'listings of another key are not restored against');
  assert.equal(shouldRestoreFeedScroll({ ...ready, loading: true }), false);
  assert.equal(shouldRestoreFeedScroll({ ...ready, error: 'failed' }), false);
  assert.equal(shouldRestoreFeedScroll({ ...ready, restoredKey: 'k' }), false, 'already restored for this key');
});

test('restoration applies the saved position synchronously and keeps the anchor until the user scrolls', () => {
  const anchorTop = { value: 400 };
  const preceding = { dataset: { media: 'first' }, getBoundingClientRect: () => ({ top: 120, bottom: 400 }) };
  const anchor = { dataset: { media: 'anchor' }, getBoundingClientRect: () => ({ top: anchorTop.value, bottom: anchorTop.value + 200 }) };
  const feed = desktopFeed(0, [preceding, anchor]);
  const storage = createSessionStorage({ 'varoom:listings:scroll:k': JSON.stringify({ windowY: 0, areaY: 300, anchorId: 'anchor', anchorOffset: 200 }) });
  const { restoreClientHomeScroll } = loadWiring(storage);
  let mutate;
  const windowObject = {
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { constructor(callback) { mutate = callback; } observe() {} disconnect() {} },
  };
  const refs = { restoredKey: { current: '' }, interactionVersion: { current: 3 }, anchorCleanup: { current: null } };

  const cleanup = restoreClientHomeScroll(windowObject, feed, 'k', refs);
  assert.equal(refs.restoredKey.current, 'k');
  assert.equal(feed.scrollTop, 100, 'restored before returning, without waiting for a frame');
  assert.equal(typeof refs.anchorCleanup.current, 'function');

  anchorTop.value = 300; // where the browser now draws the anchor
  anchorTop.value += 50;
  mutate();
  assert.equal(feed.scrollTop, 150, 'late content above the anchor is compensated');
  refs.interactionVersion.current += 1;
  anchorTop.value += 50;
  mutate();
  assert.equal(feed.scrollTop, 150, 'user scrolling ends anchor preservation');

  cleanup();
  assert.equal(refs.anchorCleanup.current, null);
});

test('a feed key without a saved position is still marked restored, and unreadable positions are ignored', () => {
  const storage = createSessionStorage({ 'varoom:listings:scroll:broken': '{not json' });
  const { restoreClientHomeScroll } = loadWiring(storage);
  const windowObject = { scrollY: 0, matchMedia: () => ({ matches: false }) };
  const refs = { restoredKey: { current: '' }, interactionVersion: { current: 0 }, anchorCleanup: { current: null } };
  assert.equal(restoreClientHomeScroll(windowObject, desktopFeed(), 'empty', refs), undefined);
  assert.equal(refs.restoredKey.current, 'empty');
  assert.equal(restoreClientHomeScroll(windowObject, desktopFeed(), 'broken', refs), undefined);
});

function persistHarness(asPath = '/client-home') {
  const storage = createSessionStorage();
  const { persistClientHomeScroll } = loadWiring(storage);
  const windowObject = createEventTarget({ scrollY: 0, innerHeight: 800, matchMedia: () => ({ matches: false }) });
  const node = createEventTarget(desktopFeed(0));
  const router = createRouter(asPath);
  let anchorCleared = 0;
  const refs = { leaving: { current: false }, anchorCleanup: { current: () => { anchorCleared += 1; } } };
  const cleanup = persistClientHomeScroll(windowObject, node, 'k', router, refs);
  const saved = () => JSON.parse(storage.getItem('varoom:listings:scroll:k'));
  return { storage, windowObject, node, router, refs, cleanup, saved, anchorCleared: () => anchorCleared };
}

test('desktop feed scrolling and mobile document scrolling both persist the position for the feed key', () => {
  const harness = persistHarness();
  harness.node.scrollTop = 420;
  harness.node.dispatch('scroll');
  assert.equal(harness.saved().areaY, 420);
  harness.windowObject.scrollY = 615;
  harness.windowObject.dispatch('scroll');
  assert.equal(harness.saved().windowY, 615);
  harness.node.scrollTop = 10;
  harness.windowObject.dispatch('pagehide');
  assert.equal(harness.saved().areaY, 10);
});

test('leaving Client Home saves first, then a Next.js top-scroll cannot overwrite the saved position', () => {
  const harness = persistHarness();
  harness.node.scrollTop = 900;
  harness.router.emit('routeChangeStart', '/notifications');
  assert.equal(harness.saved().areaY, 900);
  assert.equal(harness.refs.leaving.current, true);
  assert.equal(harness.anchorCleared(), 1, 'anchor preservation stops before navigation');
  assert.equal(harness.refs.anchorCleanup.current, null);

  harness.node.scrollTop = 0;
  harness.windowObject.dispatch('scroll');
  harness.cleanup();
  assert.equal(harness.saved().areaY, 900);
  assert.equal(harness.windowObject.count(), 0);
  assert.equal(harness.node.count(), 0);
  assert.equal(harness.router.handlers.size, 0);
});

test('tab changes within Client Home and failed navigations keep saving', () => {
  const harness = persistHarness('/client-home?view=home');
  harness.router.emit('routeChangeStart', '/client-home?view=saved');
  assert.equal(harness.refs.leaving.current, false);

  harness.router.emit('routeChangeStart', '/bookings');
  assert.equal(harness.refs.leaving.current, true);
  harness.router.emit('routeChangeError');
  assert.equal(harness.refs.leaving.current, false);
  harness.node.scrollTop = 333;
  harness.cleanup();
  assert.equal(harness.saved().areaY, 333, 'unmounting while staying saves the latest position');
});

test('wheel, touch, pointer and scroll keys outside form fields count as scroll intent', () => {
  const { trackScrollIntent } = loadWiring(createSessionStorage());
  const windowObject = createEventTarget();
  let intents = 0;
  const stop = trackScrollIntent(windowObject, () => { intents += 1; });
  for (const type of ['wheel', 'touchstart', 'pointerdown']) windowObject.dispatch(type);
  assert.equal(intents, 3);
  windowObject.dispatch('keydown', { key: 'PageDown', target: new FakeHTMLElement('DIV') });
  windowObject.dispatch('keydown', { key: ' ', target: null });
  assert.equal(intents, 5);
  windowObject.dispatch('keydown', { key: 'ArrowDown', target: new FakeHTMLElement('INPUT') });
  windowObject.dispatch('keydown', { key: 'ArrowDown', target: new FakeHTMLElement('DIV', true) });
  windowObject.dispatch('keydown', { key: 'a', target: new FakeHTMLElement('DIV') });
  assert.equal(intents, 5);
  stop();
  assert.equal(windowObject.count(), 0);
});

test('the page restores before paint after the feed key commits and persists per key', () => {
  assert.match(pageSource, /useIsomorphicLayoutEffect\(\(\) => \{\s*if \(!shouldRestoreFeedScroll\([\s\S]*?return restoreClientHomeScroll\(window, feed\.current, key, \{[\s\S]*?\}, \[error, feedReady, key, loadedFeedKey, loading\]\);/);
  assert.match(pageSource, /return persistClientHomeScroll\(window, node, key, router, \{[\s\S]*?\}, \[key, router\]\);/);
  assert.match(pageSource, /trackScrollIntent\(window, \(\) => \{ scrollInteractionVersion\.current \+= 1; \}\)/);
});
