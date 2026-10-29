const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLegacyPageLifecycle } = require('../lib/legacyPageLifecycle');

const catchAllSource = fs.readFileSync(path.join(__dirname, '..', 'pages', '[...slug].js'), 'utf8');

test('initializer failure cleans resources registered before the failure', async () => {
  const lifecycle = createLegacyPageLifecycle();
  let pageResourceActive = false;
  const sharedResourceActive = true;

  await assert.rejects(lifecycle.initialize(({ onCleanup }) => {
    pageResourceActive = true;
    onCleanup(() => { pageResourceActive = false; });
    throw new Error('setup failed');
  }), /setup failed/);

  assert.equal(pageResourceActive, false);
  assert.equal(sharedResourceActive, true);
  assert.equal(lifecycle.isActive(), false);
  assert.equal(lifecycle.signal.aborted, true);
});

test('cleanup registered after disposal runs immediately and disposal is idempotent', () => {
  const lifecycle = createLegacyPageLifecycle();
  let cleaned = 0;
  let registerCleanup;
  return lifecycle.initialize(({ onCleanup }) => {
    registerCleanup = onCleanup;
  }).then(() => {
    lifecycle.dispose();
    lifecycle.dispose();
    registerCleanup(() => { cleaned += 1; });
    assert.equal(cleaned, 1);
  });
});

test('Home resource registration disposes global listeners, observers and subscriptions on re-entry', async () => {
  const target = new EventTarget();
  let events = 0;
  let observerDisconnects = 0;
  let unsubscribes = 0;

  for (let entry = 0; entry < 3; entry += 1) {
    const lifecycle = createLegacyPageLifecycle();
    lifecycle.listen(target, 'home-event', () => { events += 1; });
    lifecycle.trackObserver({ disconnect() { observerDisconnects += 1; } });
    lifecycle.trackSubscription({ unsubscribe() { unsubscribes += 1; } });
    await lifecycle.initialize(() => {});
    target.dispatchEvent(new Event('home-event'));
    lifecycle.dispose();
    target.dispatchEvent(new Event('home-event'));
  }

  assert.equal(events, 3);
  assert.equal(observerDisconnects, 3);
  assert.equal(unsubscribes, 3);
});

test('page timers stop on disposal while the shared cache remains usable', async () => {
  const lifecycle = createLegacyPageLifecycle();
  let timerFired = false;
  let intervalFired = false;
  const sharedService = { available: true };

  lifecycle.timeout(() => { timerFired = true; }, 10);
  lifecycle.interval(() => { intervalFired = true; }, 5);
  await lifecycle.initialize(() => {});
  lifecycle.dispose();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(timerFired, false);
  assert.equal(intervalFired, false);
  assert.equal(sharedService.available, true);
});

test('catch-all no longer loads or initializes the retired Property News template', () => {
  const legacyHtmlPath = path.join(__dirname, '..', 'legacy-pages', 'property-news.html');
  const legacyInitializerPath = path.join(__dirname, '..', 'public', 'js', 'property-news-page.js');

  assert.equal(fs.existsSync(legacyHtmlPath), false);
  assert.equal(fs.existsSync(legacyInitializerPath), false);
  assert.doesNotMatch(catchAllSource, /property-news\.html/);
  assert.doesNotMatch(catchAllSource, /VaRoomLegacyPageInitializers\.propertyNews/);
  assert.match(catchAllSource, /const pageLifecycle = \['host-home\.html', 'client-home\.html'\]\.includes\(templateName\)/);
  assert.match(catchAllSource, /runLegacyScripts\(containerRef\.current, scripts, pageLifecycle, templateName\)/);
  assert.match(catchAllSource, /pageLifecycle\?\.dispose\(\)/);
});
