const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const propertyNewsPath = path.join(root, 'pages', 'property-news.tsx');
const legacyPropertyNewsPath = path.join(root, 'legacy-pages', 'property-news.html');
const legacyPropertyNewsScriptPath = path.join(root, 'public', 'js', 'property-news-page.js');
const clientLayoutPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const hostLayoutPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const slugPath = path.join(root, 'pages', '[...slug].js');
const { getAccountLayout } = require('./helpers/loadTs').loadTs(require('node:path').join(__dirname, '..', 'lib', 'accountRoleLayout.ts'));

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

test('Phase 3: both shells navigate to /property-news client-side with exact route matching', () => {
  const { HOST_INTERNAL_ROUTES, CLIENT_INTERNAL_ROUTES, isInternalHref } = require('./helpers/loadTs').loadTs(
    path.join(root, 'lib', 'navigation', 'appLinks.ts'),
  );
  for (const routes of [HOST_INTERNAL_ROUTES, CLIENT_INTERNAL_ROUTES]) {
    assert.equal(isInternalHref('/property-news', routes), true);
    assert.equal(isInternalHref('/property-news/123', routes), true);
    assert.equal(isInternalHref('/property-newsletter', routes), false);
  }
  // The host list no longer matches by bare prefix (/list must not catch /listings).
  assert.equal(isInternalHref('/list', HOST_INTERNAL_ROUTES), true);
  assert.equal(isInternalHref('/listings-guide', HOST_INTERNAL_ROUTES), false);
  assert.equal(isInternalHref('/host/abc', HOST_INTERNAL_ROUTES), true);
});

test('Property News is independent of the retired catch-all template and initializer', () => {
  assert.equal(fs.existsSync(slugPath), false, 'the legacy catch-all is retired (E1)');
  const pageSource = fs.readFileSync(propertyNewsPath, 'utf8');

  assert.equal(fs.existsSync(legacyPropertyNewsPath), false);
  assert.equal(fs.existsSync(legacyPropertyNewsScriptPath), false);
  assert.match(pageSource, /export default function PropertyNewsPage/);
  assert.match(pageSource, /fetch\('\/api\/news\?limit=50'/);
  assert.match(pageSource, /fetch\(`\/api\/news\/\$\{encodeURIComponent\(id\)\}`/);
});

test('native Property News provides cached article navigation, loading/error states, and explicit refresh', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  assert.match(source, /getCachedNewsList\(\)/);
  assert.match(source, /getCachedArticle\(id\)/);
  assert.match(source, /getCachedPreview\(id\)/);
  assert.match(source, /setCachedArticle\(id, fullItem\)/);
  assert.match(source, /<Link[\s\S]*?href=\{`\/property-news\?id=\$\{encodeURIComponent\(/);
  assert.match(source, /href=\{dashboardHref\}/);
  assert.match(source, /className="index-loading-grid"/);
  assert.match(source, /listError/);
  assert.match(source, /detailError/);
  assert.match(source, /onClick=\{\(\) => \{ void loadIndexNews\(undefined, true\); \}\}/);
  assert.match(source, /cache: force \? 'no-store' : 'default'/);
});

test('Property News shared cache and Host Home API client remain in use', () => {
  const propertyNewsSource = fs.readFileSync(propertyNewsPath, 'utf8');
  const clientHomeSource = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  const hostHomeSource = fs.readFileSync(path.join(root, 'pages', 'host-home.tsx'), 'utf8');

  assert.match(clientHomeSource, /from '\.\.\/lib\/propertyNewsCache'/);
  assert.match(propertyNewsSource, /from '\.\.\/lib\/propertyNewsCache'/);
  assert.match(hostHomeSource, /from '\.\.\/lib\/propertyNewsCache'/);
  assert.equal(fs.existsSync(path.join(root, 'public', 'js', 'property-news-api.js')), false, 'retired with Host Home');
});

test('Phase 4 & 5: State preservation, preview vs. complete article distinction, and caching logic', async () => {
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
  // The module imports the shared cache core; load it with relative imports resolved.
  const m = { exports: require('./helpers/loadTs').loadTs(path.join(root, 'lib', 'propertyNewsCache.ts'), { globals: { window: global.window } }) };
  const cache = m.exports;

  cache.clearPropertyNewsCache();

  // Test initial empty state
  assert.equal(cache.getCachedNewsList(), null);
  cache.setCachedNewsList([], 'user-empty');
  assert.deepEqual(cache.getCachedNewsList('user-empty').items, [], 'a successful empty list remains cacheable');
  cache.clearPropertyNewsCache();

  // Test caching list items (previews without full body)
  const mockItems = [
    { id: 'item-1', title: 'New Land Registration Law in Kenya', summary: 'Short summary 1', counties: ['Nairobi', 'Kiambu'] },
    { id: 'item-2', title: 'Mombasa Coastal Zoning Update', summary: 'Short summary 2', counties: ['Mombasa'] },
  ];
  cache.setCachedNewsList(mockItems, 'user-1');

  const cached = cache.getCachedNewsList('user-1');
  assert.ok(cached);
  assert.equal(cached.items.length, 2);
  assert.equal(cached.items[0].id, 'item-1');
  assert.equal(cached.isFresh, true);

  // Test that a listing item without body is NOT mistaken for a complete article
  const articleWithoutBody = cache.getCachedArticle('item-1');
  assert.equal(articleWithoutBody, null, 'List preview should not be mistaken for complete article');

  // Test preview lookup from loaded list items
  const preview = cache.getCachedPreview('item-1');
  assert.ok(preview);
  assert.equal(preview.title, 'New Land Registration Law in Kenya');

  // Test caching full article with complete body
  const fullArticle = {
    id: 'item-1',
    title: 'New Land Registration Law in Kenya',
    summary: 'Short summary 1',
    body: 'Paragraph 1: Full legal context.\n\nParagraph 2: Implementation timeline and county mandates.',
  };
  cache.setCachedArticle('item-1', fullArticle);

  const cachedFull = cache.getCachedArticle('item-1');
  assert.ok(cachedFull);
  assert.equal(cachedFull.hasFullBody, true);
  assert.match(cachedFull.body, /Paragraph 2/);

  // Test that an empty body cannot overwrite a previously loaded complete article
  cache.setCachedArticle('item-1', { id: 'item-1', title: 'New Land Registration Law in Kenya', summary: 'Short summary 1' });
  const stillFull = cache.getCachedArticle('item-1');
  assert.ok(stillFull.body, 'Cached full body must not be overwritten by empty body');

  // Test scroll position preservation
  cache.saveScrollPosition(520);
  assert.equal(cache.getScrollPosition(), 520);

  // Test account isolation
  const isolatedResult = cache.getCachedNewsList('user-2');
  assert.equal(isolatedResult, null);

  // Cleanup
  cache.clearPropertyNewsCache();
  assert.equal(cache.getCachedNewsList(), null);
  delete global.window;
});

test('Phase 6: Full article rendering and image lifecycle resilience in property-news.tsx', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Full article rendering logic
  assert.match(source, /const paragraphs = bodyText\s*\.split\(\/\\n\+\/\)/);
  assert.match(source, /paragraphs\.map\(\(paragraph, idx\)/);
  assert.match(source, /className="detail-body"/);
  assert.match(source, /detail-lead/);

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
