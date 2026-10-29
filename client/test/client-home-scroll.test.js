const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  captureScrollPosition,
  isClientHomePageExit,
  preserveAnchorPosition,
  restoreScrollPosition,
} = require('../lib/clientHomeScroll');

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

test('restoration runs synchronously after the current feed context is committed', () => {
  const start = pageSource.indexOf('if (!feedReady || !key || loadedFeedKey !== key || loading || error || restoredScrollKey.current === key)');
  const end = pageSource.indexOf('\n  }, [error, feedReady, key, loadedFeedKey, loading]);', start);
  const effect = pageSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(effect, /restoredScrollKey\.current = key/);
  assert.match(effect, /restoreScrollPosition\(window, node, savedPosition\)/);
  assert.doesNotMatch(effect, /requestAnimationFrame/);
  assert.ok(effect.indexOf('restoreScrollPosition(window, node, savedPosition)') < effect.indexOf('return () =>'));
  assert.doesNotMatch(effect, /items\.length/);
});

test('mobile document scrolling and desktop feed scrolling both persist their position', () => {
  assert.match(pageSource, /node\.addEventListener\('scroll', saveScroll/);
  assert.match(pageSource, /window\.addEventListener\('scroll', saveScroll/);
  assert.match(pageSource, /captureScrollPosition\(window, node\)/);
  assert.match(pageSource, /return \(\) => \{\s*if \(!leavingClientHome\.current\) saveScroll\(\);\s*node\.removeEventListener\('scroll', saveScroll/);
  assert.match(pageSource, /router\.events\.on\('routeChangeStart', handleRouteStart\)/);
});

test('a Next.js top-scroll during page departure cannot overwrite the saved mobile feed position', () => {
  assert.match(pageSource, /const leavingClientHome = useRef\(false\)/);
  assert.match(pageSource, /if \(leavingClientHome\.current\) return;\s*try \{\s*sessionStorage\.setItem/);
  assert.match(pageSource, /saveBeforeNavigation\(\);\s*leavingClientHome\.current = isClientHomePageExit\(router\.asPath, nextUrl\)/);
  assert.match(pageSource, /if \(!leavingClientHome\.current\) saveScroll\(\)/);
  assert.match(pageSource, /router\.events\.on\('routeChangeError', handleRouteError\)/);
});

test('scroll intent cancels late anchor adjustments after restoration', () => {
  assert.match(pageSource, /window\.addEventListener\('wheel', markScrollIntent/);
  assert.match(pageSource, /window\.addEventListener\('touchstart', markScrollIntent/);
  assert.match(pageSource, /window\.addEventListener\('pointerdown', markScrollIntent/);
  assert.match(pageSource, /window\.addEventListener\('keydown', markKeyboardScrollIntent/);
  assert.match(pageSource, /preserveAnchorPosition\([\s\S]*?\(\) => interactionVersion !== scrollInteractionVersion\.current/);
});
