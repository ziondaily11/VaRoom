const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('robots.txt, sitemap.xml and llms.txt are real files, not the not-found page', () => {
  const robots = read('public', 'robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Sitemap: https:\/\/varoom\.co\.ke\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /</, 'plain directives, no markup');
  assert.match(read('public', 'sitemap.xml'), /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<loc>https:\/\/varoom\.co\.ke\/<\/loc>/);
  // llmstxt.org: an H1 name, a blockquote summary, then H2 sections of links.
  assert.match(read('public', 'llms.txt'), /^# VaRoom\r?\n\r?\n> .+\r?\n[\s\S]*^## Pages\r?\n\r?\n- \[Home\]\(https:\/\/varoom\.co\.ke\/\): /m);
});

test('the landing headline is never invisible, so the page has a largest contentful paint', () => {
  const page = read('pages', 'index.tsx');
  const rise = page.slice(page.indexOf('@keyframes heroRise'), page.indexOf('.hero-headline {'));
  assert.doesNotMatch(rise, /opacity/);
  assert.match(page, /\.hero-headline \{\s*animation: heroRise /);
});

test('landing hero photos are small WebP copies with hashed, long-cached names; fonts are self-hosted', () => {
  const page = read('pages', 'index.tsx');
  assert.match(page, /import heroDesktop from '\.\.\/assets\/landing\/hero-desktop\.webp';/);
  assert.match(page, /<source media="\(max-width: 767px\)" srcSet=\{heroPhone\.src\} \/>/);
  for (const name of ['hero-desktop.webp', 'hero-phone.webp']) {
    assert.ok(fs.statSync(path.join(root, 'assets', 'landing', name)).size < 200 * 1024, `${name} stays small`);
  }
  assert.doesNotMatch(page, /fonts\.googleapis\.com/, 'no third-party stylesheet holds up the first paint');
  assert.match(page, /font-family: var\(--font-landing-serif\), Georgia, serif !important;/);
});

test('the closed sign-in panel has nothing keyboard focus can land on', () => {
  assert.match(read('components', 'landing', 'AuthPanel.tsx'), /aria-label="Close sign-in panel"[\s\S]{0,200}tabIndex=\{isOpen \? undefined : -1\}/);
});

test('the shared account scripts load from content-hashed, long-cached copies', () => {
  const doc = read('pages', '_document.tsx');
  for (const key of ['accountAuthJsHref', 'accountSwitcherJsHref', 'googleSignInJsHref']) {
    assert.match(doc, new RegExp(`<Script src=\\{${key}\\} strategy="beforeInteractive" />`));
    assert.match(read('lib', 'chatsCssAssets.js'), new RegExp(`${key}: '/chats-assets/[a-z-]+/[a-f0-9]{64}\\.js'`));
  }
  assert.doesNotMatch(doc, /src="\/js\//);
  assert.match(read('vercel.json'), /"source": "\/chats-assets\/:path\*",\s*"headers": \[\s*\{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" \}/);
});
