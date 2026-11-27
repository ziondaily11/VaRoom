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
        getAttribute(name) { return name === 'href' ? this.href : null; },
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
        remove() { links.splice(links.indexOf(this), 1); },
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
  const stop = stylesheet.awaitStylesheet(doc, href, () => { ready += 1; }, clock);
  const added = doc.appended[0];
  assert.equal(added.rel, 'stylesheet');
  assert.equal(added.href, href);
  assert.equal(ready, 0, 'hidden until it applies');
  added.listeners.get('load')();
  assert.equal(ready, 1);
  assert.equal(timers[0][1], 4000, 'never stays hidden longer than 4 s');
  stop();
  assert.equal(added.listeners.size, 0);
  assert.equal(timers[0], null);
  stylesheet.releaseStylesheet(doc, href);
  assert.equal(doc.links.length, 0, 'leaving Chats removes the link it added');

  // Already in the document and applied: ready at once, nothing added.
  const present = fakeDoc({ href, sheet: {} });
  let early = 0;
  stylesheet.awaitStylesheet(present, href, () => { early += 1; }, clock);
  assert.equal(early, 1);
  assert.equal(present.appended.length, 0);
  // Its rules are global (body flex-centring shrank /settings): the document's own copy leaves too.
  stylesheet.releaseStylesheet(present, href);
  assert.equal(present.links.length, 0, 'opened directly, leaving Chats still removes it');

  // A failed load shows the page too.
  const failing = fakeDoc(null);
  let shown = 0;
  stylesheet.awaitStylesheet(failing, href, () => { shown += 1; }, clock);
  failing.appended[0].listeners.get('error')();
  assert.equal(shown, 1);

  // Hidden while waiting; opened directly (server render) it is styled from the first paint.
  assert.equal(themes.chatShellStyle('charcoal', false).visibility, 'hidden');
  assert.equal(themes.chatShellStyle('charcoal', true).visibility, undefined);
  assert.doesNotMatch(renderChatsPage().html.match(/<div class="app-shell[^>]*>/)[0], /visibility/);
  const source = read('pages', 'chats.tsx');
  assert.doesNotMatch(source, /<link rel="stylesheet" href=\{chatsCssHref\} \/>/, 'no late next/head stylesheet');
  // While hydrating it renders as the server did (no mismatch); the check runs from the next render.
  assert.match(source, /return useSyncExternalStore\(noSubscription, \(\) => true, \(\) => false\);/);
  assert.match(source, /const stylesReady = !hydrated \|\| stylesLoaded \|\| chatsStylesheetApplied\(\);/);
  assert.match(source, /useEffect\(\(\) => \(\) => releaseStylesheet\(document, chatsCssHref\), \[\]\);/, 'chat styles do not leak onto other pages');
  const app = read('pages', '_app.tsx');
  // One dark-theme file on every route (nothing reloads entering Chats); the
  // always-light landing page only fetches it ahead, so it never blocks that first paint.
  assert.match(app, /const isLanding = path === '\/';/);
  assert.match(app, /<link rel=\{isLanding \? 'prefetch' : 'stylesheet'\} href=\{chatsThemeCssHref\} as=\{isLanding \? 'style' : undefined\} \/>/, 'one dark-theme file on every route: nothing reloads entering Chats');
  assert.match(app, /\{!isChatsRoute && !isLanding && <link rel="prefetch" href=\{chatsCssHref\} as="style" \/>\}/);
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

test('only messages that arrive while a conversation is open enter with motion', () => {
  const { createEntranceTracker } = loadTs(path.join(root, 'lib', 'chat', 'messageEntrance.ts'));
  const tracker = createEntranceTracker();
  assert.equal(tracker.entering('c1', []).size, 0, 'nothing loaded yet');
  assert.equal(tracker.entering('c1', ['a', 'b']).size, 0, 'the first messages shown appear at once');
  assert.deepEqual([...tracker.entering('c1', ['a', 'b', 'c'])], ['c'], 'a new one enters');
  assert.deepEqual([...tracker.entering('c1', ['a', 'b', 'c'])], ['c'], 'and keeps its class while it plays');
  assert.equal(tracker.entering('c2', ['x']).size, 0, 'another conversation starts afresh');
  assert.equal(tracker.entering('c1', ['a', 'b', 'c']).size, 0, 'coming back: nothing replays');
});
