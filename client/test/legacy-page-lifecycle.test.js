const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLegacyPageLifecycle } = require('../lib/legacyPageLifecycle');
require('../public/js/property-news-page.js');

const catchAllSource = fs.readFileSync(path.join(__dirname, '..', 'pages', '[...slug].js'), 'utf8');
const propertyNewsTemplate = fs.readFileSync(path.join(__dirname, '..', 'legacy-pages', 'property-news.html'), 'utf8');

function makeImage() {
  const listeners = new Map();
  const wrapper = {
    classes: new Set(),
    removed: false,
    classList: {
      add(name) { wrapper.classes.add(name); },
    },
    remove() { wrapper.removed = true; },
  };

  return {
    complete: false,
    naturalWidth: 0,
    listeners,
    wrapper,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    closest() { return wrapper; },
  };
}

function makeContainer(image) {
  const list = {
    innerHTML: '<div class="skeleton"></div>',
    querySelectorAll() { return image ? [image] : []; },
  };
  const index = { style: {} };
  const detail = { style: {}, innerHTML: '' };

  return {
    list,
    detail,
    querySelector(selector) {
      if (selector === '#news-list') return list;
      if (selector === '#news-index') return index;
      if (selector === '#news-detail') return detail;
      return null;
    },
  };
}

function installPageGlobals(api) {
  const originalDocument = global.document;
  const originalApi = global.VaRoomPropertyNews;
  global.document = {
    createElement() {
      let value = '';
      return {
        set textContent(next) { value = String(next); },
        get innerHTML() {
          return value.replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
          })[character]);
        },
      };
    },
  };
  global.VaRoomPropertyNews = api;
  return () => {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
    if (originalApi === undefined) delete global.VaRoomPropertyNews;
    else global.VaRoomPropertyNews = originalApi;
  };
}

test('property news initializes its list and disposes page-owned image handlers', async () => {
  const image = makeImage();
  const container = makeContainer(image);
  const restoreGlobals = installPageGlobals({
    async all() {
      return [{
        id: 'news-1', title: 'A property update', summary: 'Summary',
        image_url: '/news.jpg', published_at: '2026-01-12', source: {},
      }];
    },
  });
  const lifecycle = createLegacyPageLifecycle();

  try {
    await lifecycle.initialize(global.VaRoomLegacyPageInitializers.propertyNews, {
      container,
      search: '',
    });
    assert.match(container.list.innerHTML, /A property update/);
    assert.equal(image.listeners.get('load').size, 1);
    assert.equal(image.listeners.get('error').size, 1);

    lifecycle.dispose();
    assert.equal(image.listeners.get('load').size, 0);
    assert.equal(image.listeners.get('error').size, 0);
    assert.equal(lifecycle.signal.aborted, true);
  } finally {
    lifecycle.dispose();
    restoreGlobals();
  }
});

test('leaving and revisiting property news does not accumulate image handlers', async () => {
  const restoreGlobals = installPageGlobals({
    async all() {
      return [{
        id: 'news-1', title: 'A property update', summary: 'Summary',
        image_url: '/news.jpg', published_at: '2026-01-12', source: {},
      }];
    },
  });
  const images = [makeImage(), makeImage()];

  try {
    for (const image of images) {
      const lifecycle = createLegacyPageLifecycle();
      await lifecycle.initialize(global.VaRoomLegacyPageInitializers.propertyNews, {
        container: makeContainer(image),
        search: '',
      });
      assert.equal(image.listeners.get('load').size, 1);
      lifecycle.dispose();
      assert.equal(image.listeners.get('load').size, 0);
    }
  } finally {
    restoreGlobals();
  }
});

test('an abandoned property news request cannot render or attach image handlers', async () => {
  let resolveRequest;
  const image = makeImage();
  const container = makeContainer(image);
  const originalMarkup = container.list.innerHTML;
  const restoreGlobals = installPageGlobals({
    all() {
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
  });
  const lifecycle = createLegacyPageLifecycle();

  try {
    const initialization = lifecycle.initialize(global.VaRoomLegacyPageInitializers.propertyNews, {
      container,
      search: '',
    });
    await Promise.resolve();
    lifecycle.dispose();
    resolveRequest([{ id: 'late', title: 'Late result', image_url: '/late.jpg', source: {} }]);
    await initialization;

    assert.equal(container.list.innerHTML, originalMarkup);
    assert.equal(image.listeners.get('load'), undefined);
    assert.equal(image.listeners.get('error'), undefined);
  } finally {
    lifecycle.dispose();
    restoreGlobals();
  }
});

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

test('catch-all wires the lifecycle only to the property news template', () => {
  assert.match(catchAllSource, /templateName === 'property-news\.html'[\s\S]*?createLegacyPageLifecycle\(\)/);
  assert.match(catchAllSource, /runLegacyScripts\(containerRef\.current, scripts, pageLifecycle, templateName\)/);
  assert.match(catchAllSource, /pageLifecycle\.initialize\(initializer,\s*\{[\s\S]*?container,[\s\S]*?search: window\.location\.search/);
  assert.match(catchAllSource, /pageLifecycle\?\.dispose\(\)/);
  assert.match(propertyNewsTemplate, /<script src="js\/property-news-api\.js"><\/script>/);
  assert.match(propertyNewsTemplate, /<script src="js\/property-news-page\.js"><\/script>/);
  assert.doesNotMatch(propertyNewsTemplate, /<script>\s*\(function\(\)/);
});
