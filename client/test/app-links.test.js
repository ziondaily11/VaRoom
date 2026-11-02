const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const { installAppLinks } = loadTs(path.join(__dirname, '..', 'lib', 'navigation', 'appLinks.ts'));
const { isModifiedClick } = loadTs(path.join(__dirname, '..', 'lib', 'navigation', 'clicks.ts'));

// Minimal document: one shell flag and anchors identified by attributes.
function fakeDocument(shell) {
  const listeners = {};
  return {
    listeners,
    querySelector: (selector) => (selector === `.${shell}-layout-active` ? {} : null),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
  };
}
function anchor(attrs) {
  const node = {
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs,
    closest: () => node,
  };
  return node;
}
function click(doc, attrs, init = {}) {
  const event = { button: 0, defaultPrevented: false, target: anchor(attrs), preventDefault() { this.defaultPrevented = true; }, ...init };
  doc.listeners.click.forEach((fn) => fn(event));
  return event;
}

test('plain clicks on internal shell links navigate client-side once', () => {
  const doc = fakeDocument('host');
  const pushed = [];
  installAppLinks({ doc, push: (href) => pushed.push(href), prefetch() {} });
  const event = click(doc, { href: '/bookings' });
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(pushed, ['/bookings']);
});

test('modifier keys, middle clicks, handled clicks, new tabs, downloads and external links keep browser behaviour', () => {
  const doc = fakeDocument('host');
  const pushed = [];
  installAppLinks({ doc, push: (href) => pushed.push(href), prefetch() {} });
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    click(doc, { href: '/bookings' }, init);
  }
  click(doc, { href: '/bookings', target: '_blank' });
  click(doc, { href: '/bookings', download: '' });
  click(doc, { href: 'https://example.com/bookings' });
  click(doc, { href: '/listings-guide' });
  assert.deepEqual(pushed, [], 'nothing intercepted');
});

test('outside a shell, links are left to the browser', () => {
  const doc = fakeDocument('none');
  const pushed = [];
  installAppLinks({ doc, push: (href) => pushed.push(href), prefetch() {} });
  click(doc, { href: '/bookings' });
  assert.deepEqual(pushed, []);
});

test('hovering or focusing an internal link prefetches its route once', () => {
  const doc = fakeDocument('client');
  const prefetched = [];
  installAppLinks({ doc, push() {}, prefetch: (href) => prefetched.push(href) });
  const target = anchor({ href: '/bookings#top' });
  doc.listeners.mouseover.forEach((fn) => fn({ target }));
  doc.listeners.focusin.forEach((fn) => fn({ target }));
  doc.listeners.mouseover.forEach((fn) => fn({ target: anchor({ href: '/analytics' }) }));
  assert.deepEqual(prefetched, ['/bookings'], 'deduplicated, hash removed, host-only route not prefetched for clients');
});

test('isModifiedClick recognises new-tab and non-primary clicks', () => {
  assert.equal(isModifiedClick({ button: 0 }), false);
  for (const event of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(isModifiedClick({ button: 0, ...event }), true);
  }
});
