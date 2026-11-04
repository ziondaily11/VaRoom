const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('pages', 'chats.tsx');

test('no conversation open: no header (name, status, actions), only the centred empty state', () => {
  assert.match(source, /\{activeId && \(\s*<header className="chat-header">/);
  assert.match(source, /activeId && typingInConversation === activeId \? 'typing…'/, '"typing…" never shows without a conversation');
});

test('arriving from another page, Chats stays hidden until its stylesheet applies, then releases it on leaving', () => {
  assert.doesNotMatch(source, /<link rel="stylesheet" href=\{chatsCssHref\} \/>/, 'no late next/head stylesheet');
  assert.match(source, /useState\(\(\) => typeof document === 'undefined' \|\| chatsStylesheetApplied\(\)\)/, 'opened directly: styled from the first paint, no hiding');
  assert.match(source, /element\.addEventListener\('load', ready\);\s*element\.addEventListener\('error', ready\);/);
  assert.match(source, /const fallback = window\.setTimeout\(ready, 4000\);/, 'never stays hidden');
  assert.match(source, /\.\.\.\(stylesReady \? \{\} : \{ visibility: 'hidden' as const \}\)/);
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
