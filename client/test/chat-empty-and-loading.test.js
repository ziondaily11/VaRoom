'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { renderChatsPage, section } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const stylesheet = loadTs(path.join(root, 'lib', 'chat', 'chatsStylesheet.ts'));
const themes = loadTs(path.join(root, 'lib', 'chat', 'chatThemes.ts'));

test('no conversation open: no header (name, status, actions), only the centred empty state', () => {
  const { html } = renderChatsPage();
  assert.doesNotMatch(html, /class="chat-header"/);
  assert.match(html, /<div class="messages empty-state"><div class="chat-empty-state" role="status"><h2>Select a conversation<\/h2><p>Choose a conversation from your inbox to view messages\.<\/p><\/div>/);
  const open = section(renderChatsPage({ initialConversationId: 'c1' }).html, '<header class="chat-header">', '</header>');
  assert.match(open, /<span id="statusText"><\/span>/, 'blank until presence syncs; never "typing…" by itself');
});

test('arriving from another page, Chats stays hidden until its stylesheet applies, then releases it on leaving', () => {
  const href = '/js/chats.abc123.css';
  assert.equal(stylesheet.stylesheetApplied([{ href: null }, { href: 'https://varoom.example/js/chats.abc123.css' }], href), true);
  assert.equal(stylesheet.stylesheetApplied([{ href: 'https://varoom.example/js/other.css' }, { href: 'not a url' }], href), false);

  function fakeDoc(existing) {
    const head = [];
    const make = (attrs) => {
      const listeners = new Map();
      return Object.assign({
        sheet: null,
        listeners,
        getAttribute: (name) => (name === 'href' ? attrs.href : null),
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
      }, attrs);
    };
    const links = existing ? [make(existing)] : [];
    return {
      links,
      head: { appendChild: (el) => { head.push(el); links.push(el); } },
      appended: head,
      querySelectorAll: (selector) => { assert.equal(selector, 'link[rel="stylesheet"]'); return links; },
      createElement: (tag) => { assert.equal(tag, 'link'); return make({}); },
    };
  }
  const timers = [];
  const clock = { setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimeout: (id) => { timers[id - 1] = null; } };

  // Not in the document: added, shown once it loads.
  const doc = fakeDoc(null);
  let ready = 0;
  const added = stylesheet.awaitStylesheet(doc, href, () => { ready += 1; }, clock);
  assert.equal(added.added, doc.appended[0]);
  assert.equal(added.added.rel, 'stylesheet');
  assert.equal(added.added.href, href);
  assert.equal(ready, 0, 'hidden until it applies');
  added.added.listeners.get('load')();
  assert.equal(ready, 1);
  assert.equal(timers[0][1], 4000, 'never stays hidden longer than 4 s');
  added.stop();
  assert.equal(added.added.listeners.size, 0);
  assert.equal(timers[0], null);

  // Already in the document and applied: ready at once, nothing added.
  const present = fakeDoc({ href, sheet: {} });
  let early = 0;
  const reused = stylesheet.awaitStylesheet(present, href, () => { early += 1; }, clock);
  assert.equal(reused.added, null);
  assert.equal(early, 1);
  assert.equal(present.appended.length, 0);

  // A failed load shows the page too.
  const failing = fakeDoc(null);
  let shown = 0;
  stylesheet.awaitStylesheet(failing, href, () => { shown += 1; }, clock).added.listeners.get('error')();
  assert.equal(shown, 1);

  // Hidden while waiting; opened directly (server render) it is styled from the first paint.
  assert.equal(themes.chatShellStyle('charcoal', false).visibility, 'hidden');
  assert.equal(themes.chatShellStyle('charcoal', true).visibility, undefined);
  assert.doesNotMatch(renderChatsPage().html.match(/<div class="app-shell[^>]*>/)[0], /visibility/);
  const source = read('pages', 'chats.tsx');
  assert.doesNotMatch(source, /<link rel="stylesheet" href=\{chatsCssHref\} \/>/, 'no late next/head stylesheet');
  assert.match(source, /useState\(\(\) => typeof document === 'undefined' \|\| chatsStylesheetApplied\(\)\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{ addedStylesheetRef\.current\?\.remove\(\); \}, \[\]\);/, 'chat styles do not leak onto other pages');
  const app = read('pages', '_app.tsx');
  assert.match(app, /<link rel="stylesheet" href=\{chatsThemeCssHref\} \/>/, 'one dark-theme file on every route: nothing reloads entering Chats');
  assert.match(app, /\{!isChatsRoute && <link rel="prefetch" href=\{chatsCssHref\} as="style" \/>\}/);
  assert.match(read('pages', '_document.tsx'), /<link rel="stylesheet" href=\{chatsCssHref\} \/>/, 'opened directly, the document carries it');
});

test('chat backgrounds: small WebP tiles (PNG fallback), cached for a year', () => {
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /image-set\(url\("\/assets\/chat-bg\/chat-dark-v1\.webp"\) type\("image\/webp"\), url\("\/assets\/chatbackground\.png"\) type\("image\/png"\)\)/);
  assert.match(css, /image-set\(url\("\/assets\/chat-bg\/chat-light-v1\.webp"\) type\("image\/webp"\), url\("\/assets\/chatbackground-light\.png"\) type\("image\/png"\)\)/);
  for (const file of ['chat-dark-v1.webp', 'chat-light-v1.webp']) {
    const size = fs.statSync(path.join(root, 'public', 'assets', 'chat-bg', file)).size;
    assert.ok(size < 80 * 1024, `${file} is ${Math.round(size / 1024)} KB`);
  }
  const vercel = JSON.parse(read('vercel.json'));
  const rule = vercel.headers.find((h) => h.source === '/assets/chat-bg/:path*');
  assert.ok(rule && rule.headers.some((h) => h.key === 'Cache-Control' && h.value === 'public, max-age=31536000, immutable'));
});
