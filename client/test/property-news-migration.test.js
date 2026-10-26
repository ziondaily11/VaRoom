const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const propertyNewsPath = path.join(root, 'pages', 'property-news.tsx');
const clientLayoutPath = path.join(root, 'components', 'ClientLayout.jsx');
const hostLayoutPath = path.join(root, 'components', 'HostLayout.jsx');
const slugPath = path.join(root, 'pages', '[...slug].js');
const { getAccountLayout } = require('../lib/accountRoleLayout');

test('Phase 1 & 2: Property News is a native React page in client/pages/property-news.tsx', () => {
  assert.ok(fs.existsSync(propertyNewsPath), 'property-news.tsx must exist');
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Verify default export
  assert.match(source, /export default function PropertyNewsPage/);
  // Verify self-contained layout assignment
  assert.match(source, /PropertyNewsPage\.getLayout\s*=/);
  // Verify Next.js Head & Link usage
  assert.match(source, /import Head from 'next\/head'/);
  assert.match(source, /import Link from 'next\/link'/);
  assert.match(source, /import \{ useRouter \} from 'next\/router'/);
  // Verify semantic editorial UI elements preserved
  assert.match(source, /className="eyebrow">Property Intelligence<\/p>/);
  assert.match(source, /<h1>Property News on VaRoom<\/h1>/);
  assert.match(source, /className="fact-grid"/);
  assert.match(source, /className="source-box"/);
  assert.match(source, /24\/7 Source Monitoring Active/);
  assert.match(source, /All Caught Up/);
});

test('Phase 2: Property News route resolves to none layout, preserving clean editorial shell', () => {
  assert.equal(getAccountLayout('/property-news', '/property-news', null), 'none');
  assert.equal(getAccountLayout('/property-news', '/property-news', 'client'), 'none');
  assert.equal(getAccountLayout('/property-news', '/property-news', 'host'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/property-news', 'client'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/property-news', 'host'), 'none');
});

test('Phase 3: ClientLayout and HostLayout include /property-news in internalRoutes for client-side navigation', () => {
  const clientLayoutSource = fs.readFileSync(clientLayoutPath, 'utf8');
  const hostLayoutSource = fs.readFileSync(hostLayoutPath, 'utf8');

  // ClientLayout check
  assert.match(clientLayoutSource, /'\/property-news'/);
  assert.match(clientLayoutSource, /internalRoutes\.some\(\(route\) => href === route \|\| href\.startsWith\(`\$\{route\}\/`\) \|\| href\.startsWith\(`\$\{route\}\?`\)\)/);
  assert.match(clientLayoutSource, /router\.push\(href\)/);

  // HostLayout check
  assert.match(hostLayoutSource, /'\/property-news'/);
  assert.match(hostLayoutSource, /internalRoutes\.some\(\(route\) => href\.startsWith\(route\)\)/);
  assert.match(hostLayoutSource, /router\.push\(href\)/);
});

test('Phase 2 & 3: [...slug].js excludes property-news.html from getStaticPaths', () => {
  const slugSource = fs.readFileSync(slugPath, 'utf8');
  assert.match(slugSource, /'property-news\.html'/);
  assert.match(slugSource, /!\[.*?property-news\.html.*?\]\.includes\(file\)/);
});

test('Phase 4 & 5: State preservation and caching logic', async () => {
  // Mock browser sessionStorage for testing
  const store = new Map();
  global.window = {
    sessionStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: (key) => store.delete(key),
    },
  };

  // Compile and load cache module
  const ts = require('typescript');
  const cacheTsSource = fs.readFileSync(path.join(root, 'lib', 'propertyNewsCache.ts'), 'utf8');
  const compiled = ts.transpileModule(cacheTsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const m = { exports: {} };
  const fn = new Function('module', 'exports', compiled);
  fn(m, m.exports);
  const cache = m.exports;

  cache.clearPropertyNewsCache();

  // Test initial empty state
  assert.equal(cache.getCachedNewsList(), null);

  // Test caching items
  const mockItems = [
    { id: 'item-1', title: 'New Land Registration Law in Kenya', summary: 'Summary 1', counties: ['Nairobi', 'Kiambu'] },
    { id: 'item-2', title: 'Mombasa Coastal Zoning Update', summary: 'Summary 2', counties: ['Mombasa'] },
  ];
  cache.setCachedNewsList(mockItems, 'user-1');

  const cached = cache.getCachedNewsList('user-1');
  assert.ok(cached);
  assert.equal(cached.items.length, 2);
  assert.equal(cached.items[0].id, 'item-1');
  assert.equal(cached.isFresh, true);

  // Test detail retrieval from items list
  const detail = cache.getCachedArticle('item-1');
  assert.ok(detail);
  assert.equal(detail.title, 'New Land Registration Law in Kenya');

  // Test explicit detail caching
  cache.setCachedArticle('item-detail-99', { id: 'item-detail-99', title: 'Detailed Gazette Notice' });
  const customDetail = cache.getCachedArticle('item-detail-99');
  assert.ok(customDetail);
  assert.equal(customDetail.title, 'Detailed Gazette Notice');

  // Test scroll position preservation
  cache.saveScrollPosition(520);
  assert.equal(cache.getScrollPosition(), 520);

  // Test account isolation
  const isolatedResult = cache.getCachedNewsList('user-2');
  // Different user should not see user-1's session cache if scoped
  assert.equal(isolatedResult, null);

  // Cleanup
  cache.clearPropertyNewsCache();
  assert.equal(cache.getCachedNewsList(), null);
  delete global.window;
});

test('Phase 6: Image lifecycle resilience and safe URL validation in property-news.tsx', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Image graceful handling
  assert.match(source, /function NewsCardImage/);
  assert.match(source, /function DetailImage/);
  assert.match(source, /onError=\{.*?setFailed\(true\).*?\}/);
  assert.match(source, /onLoad=\{.*?setLoaded\(true\).*?\}/);
  assert.match(source, /className=\{`news-card-image-wrap \$\{loaded \? 'is-loaded' : ''\}`\}/);

  // Safe source url protocol validation
  assert.match(source, /function safeSourceUrl/);
  assert.match(source, /safeSourceUrl\(detailItem\.source\.url\)/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);

  // AbortController used for lifecycle cleanup
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
});
