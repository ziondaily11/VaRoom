const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { captureScrollPosition, restoreScrollPosition } = require('../lib/clientHomeScroll');

const pageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');

test('desktop restoration uses the independently scrolling feed container', () => {
  const feed = { scrollTop: 0 };
  const windowObject = {
    scrollY: 0,
    matchMedia: (query) => ({ matches: query === '(max-width: 860px)' ? false : null }),
    scrollTo() { throw new Error('Desktop restoration must not move document scroll.'); },
  };
  restoreScrollPosition(windowObject, feed, { windowY: 300, areaY: 740 });
  assert.equal(feed.scrollTop, 740);
});

test('mobile restoration uses document scroll and saves both positions for responsive changes', () => {
  const feed = { scrollTop: 40 };
  let restored = null;
  const windowObject = {
    scrollY: 615,
    matchMedia: (query) => ({ matches: query === '(max-width: 860px)' }),
    scrollTo(x, y) { restored = [x, y]; },
  };
  assert.deepEqual(captureScrollPosition(windowObject, feed), { windowY: 615, areaY: 40 });
  restoreScrollPosition(windowObject, feed, { windowY: 615, areaY: 740 });
  assert.deepEqual(restored, [0, 615]);
  assert.equal(feed.scrollTop, 40);
});

test('restoration waits for the current feed context and does not rerun after media or page updates', () => {
  const start = pageSource.indexOf('if (!feedReady || !key || loadedFeedKey !== key || loading || error || restoredScrollKey.current === key)');
  const end = pageSource.indexOf('\n  }, [error, feedReady, key, loadedFeedKey, loading]);', start);
  const effect = pageSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(effect, /restoredScrollKey\.current = key/);
  assert.match(effect, /window\.requestAnimationFrame/);
  assert.match(effect, /interactionVersion !== scrollInteractionVersion\.current/);
  assert.match(effect, /contextVersion !== feedContextVersion\.current/);
  assert.match(effect, /feedContextKey\.current !== key/);
  assert.doesNotMatch(effect, /items\.length/);
});

test('mobile document scrolling and desktop feed scrolling both persist their position', () => {
  assert.match(pageSource, /node\.addEventListener\('scroll', saveScroll/);
  assert.match(pageSource, /window\.addEventListener\('scroll', saveScroll/);
  assert.match(pageSource, /captureScrollPosition\(window, node\)/);
  assert.match(pageSource, /return \(\) => \{\s*saveScroll\(\);\s*node\.removeEventListener\('scroll', saveScroll/);
});

test('scroll intent cancels a late scheduled restoration', () => {
  assert.match(pageSource, /window\.addEventListener\('wheel', markScrollIntent/);
  assert.match(pageSource, /window\.addEventListener\('touchstart', markScrollIntent/);
  assert.match(pageSource, /window\.addEventListener\('keydown', markKeyboardScrollIntent/);
  assert.match(pageSource, /interactionVersion !== scrollInteractionVersion\.current \|\|/);
});
