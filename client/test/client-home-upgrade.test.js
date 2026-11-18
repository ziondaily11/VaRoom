// Client Home upgrade: fast in-app links, the shared phone bar, no dead
// buttons, small errors as a toast, search by name, the shared category
// control, a closable ⋮ menu, and the brand font from the shell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const page = read('pages', 'client-home.tsx');
const css = read('pages', 'ClientHome.module.css');

test('in-app links switch page without reloading the app', () => {
  // Only external links (social, legal pages in a new tab) stay plain anchors.
  const anchors = page.match(/<a\b[^>]*href=\{?["'`][^"'`]*/g) || [];
  for (const anchor of anchors) {
    assert.match(anchor, /href="(https?:|\/privacy|\/terms|\/support)|href=\{SOCIAL_LINKS/, `plain anchor: ${anchor}`);
  }
  for (const href of ['/booking?listing=', '/map?listing=', '/property-news?id=', '/property-news"']) {
    assert.match(page, new RegExp(`<Link[^>]*href=\\{?[\`"]${href.replace(/[?]/g, '\\?')}`), href);
  }
  assert.match(page, /<Link className=\{styles\.marketplaceSwitch\} href=\{marketplaceHref\}>/);
});

test('phones use the shared bottom bar; no dead buttons', () => {
  const nav = loadTs(path.join(root, 'lib', 'navigation', 'mobileNav.ts'));
  assert.equal(nav.hidesMobileNav('/client-home'), false);
  assert.doesNotMatch(page, /styles\.bottomBar|Inbox<\/|coming soon/);
  assert.doesNotMatch(css, /\.bottomBar/);
  assert.match(page, /<Link href="\/marketplace">View all<\/Link>/);
  assert.doesNotMatch(page, /href="#"/, 'no links that go nowhere');
});

test('small failures are a toast; Retry stays for the feed itself', () => {
  assert.match(page, /showToast\('That like could not be saved\. Please try again\.'\)/);
  assert.match(page, /showToast\('That listing could not be saved\. Please try again\.'\)/);
  assert.match(page, /showToast\("We couldn't open the chat\. Please try again\."\)/);
  assert.doesNotMatch(page, /setError\(`Couldn't start that chat/);
});

test('search finds names and areas (safely), and @usernames', () => {
  assert.match(page, /const safeTerm = searchTerm\(term\.replace\(\/\^@\/, ''\)\);/);
  assert.match(page, /\.or\(`title\.ilike\.%\$\{safeTerm\}%,location_text\.ilike\.%\$\{safeTerm\}%`\)/);
  assert.match(page, /placeholder="Search by name, area or @username"/);
});

test('categories use the shared segmented control; the ⋮ menu closes outside or on Escape', () => {
  assert.match(page, /<SegmentedTabs label="Listing categories" activeKey=\{category\}>/);
  assert.match(page, /role="tab"\s+aria-selected=\{category === id\}/);
  assert.match(page, /document\.addEventListener\('pointerdown', onPointer\)/);
  assert.match(page, /if \(event\.key !== 'Escape'\) return;/);
  assert.match(css, /\.menuDropdown \{[^}]*animation: menuIn/);
});

test('the shell loads the logo font once; pages need not', () => {
  assert.doesNotMatch(page, /fonts\.googleapis/);
  const shell = read('components', 'shell', 'AppShell.tsx');
  assert.match(shell, /<link rel="stylesheet" href=\{BRAND_FONT_HREF\} key="brand-font" \/>/);
  assert.match(shell, /family=Fraunces/);
});
