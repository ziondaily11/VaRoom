const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const propertyNewsPath = path.join(root, 'pages', 'property-news.tsx');
const legacyPropertyNewsPath = path.join(root, 'legacy-pages', 'property-news.html');
const legacyPropertyNewsScriptPath = path.join(root, 'public', 'js', 'property-news-page.js');
const slugPath = path.join(root, 'pages', '[...slug].js');
const { getAccountLayout } = loadTs(path.join(root, 'lib', 'accountRoleLayout.ts'));
const format = loadTs(path.join(root, 'lib', 'propertyNews', 'articleFormat.ts'));

const readPage = () => fs.readFileSync(propertyNewsPath, 'utf8');

// Loads the request helpers with a fetch stub that records each call.
function loadRequests(respond) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return respond(String(url));
  };
  return { requests: loadTs(path.join(root, 'lib', 'propertyNews', 'newsRequests.ts'), { globals: { fetch } }), calls };
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('Phase 1 & 2: Property News is a native React page with its own editorial layout', () => {
  assert.ok(fs.existsSync(propertyNewsPath), 'property-news.tsx must exist');
  const source = readPage();

  // The page supplies its own layout instead of the client/host shell.
  assert.match(source, /PropertyNewsPage\.getLayout\s*=/);
  // Editorial copy and blocks preserved from the legacy page.
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
  const { HOST_INTERNAL_ROUTES, CLIENT_INTERNAL_ROUTES, isInternalHref } = loadTs(
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
  assert.equal(fs.existsSync(legacyPropertyNewsPath), false);
  assert.equal(fs.existsSync(legacyPropertyNewsScriptPath), false);
});

test('the index list request: JSON from /api/news, explicit refresh bypasses the HTTP cache', async () => {
  const items = [{ id: 'a', title: 'A' }];
  const { requests, calls } = loadRequests(() => jsonResponse(200, items));
  const controller = new AbortController();

  assert.deepEqual(await requests.fetchNewsList(controller.signal), items);
  assert.equal(calls[0].url, '/api/news?limit=50');
  assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' });
  assert.equal(calls[0].options.signal, controller.signal, 'route changes abort the request');
  assert.equal(calls[0].options.cache, 'default');

  await requests.fetchNewsList(undefined, true);
  assert.equal(calls[1].options.cache, 'no-store', 'the Refresh button forces a network fetch');

  // A non-array payload becomes an empty list; a failed response throws for the error state.
  const odd = loadRequests(() => jsonResponse(200, { detail: 'x' }));
  assert.deepEqual(await odd.requests.fetchNewsList(), []);
  const down = loadRequests(() => jsonResponse(503, {}));
  await assert.rejects(down.requests.fetchNewsList(), /Failed to load property news: 503/);
});

test('the article request: one encoded id from /api/news/:id', async () => {
  const article = { id: 'a/b', title: 'A', body: 'Body' };
  const { requests, calls } = loadRequests(() => jsonResponse(200, article));
  const controller = new AbortController();

  assert.deepEqual(await requests.fetchNewsArticle('a/b c', controller.signal), article);
  assert.equal(calls[0].url, '/api/news/a%2Fb%20c');
  assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' });
  assert.equal(calls[0].options.signal, controller.signal);

  const missing = loadRequests(() => jsonResponse(404, {}));
  await assert.rejects(missing.requests.fetchNewsArticle('x'), /Failed to load news article: 404/);
});

test('native Property News wires cache-first article navigation, loading/error states and refresh', () => {
  // The cache-first decisions live in the page's load callbacks (state setters);
  // the cache itself is exercised in Phase 4 & 5 below.
  const source = readPage();
  assert.match(source, /getCachedNewsList\(\)/);
  assert.match(source, /getCachedArticle\(id\)/);
  assert.match(source, /getCachedPreview\(id\)/);
  assert.match(source, /setCachedArticle\(id, fullItem\)/);
  assert.match(source, /setCachedNewsList\(validItems\)/);
  // Articles open client-side; the dashboard link follows the account role.
  assert.match(source, /<Link[\s\S]*?href=\{`\/property-news\?id=\$\{encodeURIComponent\(/);
  assert.match(source, /href=\{dashboardHref\}/);
  assert.match(source, /className="index-loading-grid"/);
  assert.match(source, /onClick=\{\(\) => \{ void loadIndexNews\(undefined, true\); \}\}/);
});

test('Property News shared cache and Host Home API client remain in use', () => {
  const propertyNewsSource = readPage();
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

  const cache = loadTs(path.join(root, 'lib', 'propertyNewsCache.ts'), { globals: { window: global.window } });

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

test('Phase 6: article body paragraphs, subheads, pull quotes and the repeated-summary rule', () => {
  assert.deepEqual(
    format.splitArticleParagraphs('  First line.  \n\n\n Second line.\r\nThird\n   \n'),
    ['First line.', 'Second line.', 'Third'],
  );
  assert.deepEqual(format.splitArticleParagraphs(''), []);

  assert.deepEqual(format.classifyParagraph('## County budget'), { kind: 'subhead', text: 'County budget' });
  assert.deepEqual(format.classifyParagraph('# Title'), { kind: 'subhead', text: 'Title' });
  assert.deepEqual(format.classifyParagraph('### Small'), { kind: 'subhead', text: 'Small' });
  assert.deepEqual(format.classifyParagraph('#hashtag'), { kind: 'text', text: '#hashtag' });
  assert.deepEqual(format.classifyParagraph('> Rates will rise.'), { kind: 'quote', text: 'Rates will rise.' });
  assert.deepEqual(format.classifyParagraph('"We will comply."'), { kind: 'quote', text: '"We will comply."' });
  assert.deepEqual(format.classifyParagraph('“Curly quote.”'), { kind: 'quote', text: '“Curly quote.”' });
  assert.deepEqual(format.classifyParagraph("'Single.'"), { kind: 'quote', text: "'Single.'" });
  assert.deepEqual(format.classifyParagraph('"Opens but does not close'), { kind: 'text', text: '"Opens but does not close' });

  // A summary the body already opens with is not shown twice (first 50 chars,
  // case-insensitive, trailing full stop ignored).
  assert.equal(format.bodyRepeatsSummary('Nairobi approves rates.', 'Nairobi approves rates for 2027 landlords.'), true);
  assert.equal(format.bodyRepeatsSummary('NAIROBI APPROVES RATES', 'nairobi approves rates.'), true);
  assert.equal(format.bodyRepeatsSummary('A distinct standfirst.', 'The county assembly met on Monday.'), false);
  assert.equal(format.bodyRepeatsSummary('', 'Anything'), false, 'no summary, nothing to repeat');
  assert.equal(format.bodyRepeatsSummary('Summary', undefined), true, 'an empty first paragraph matches as before');

  const source = readPage();
  assert.match(source, /className="detail-body"/);
  assert.match(source, /idx === 0 && !showDistinctSummary \? 'detail-lead' : 'detail-p'/);
});

test('Phase 6: image fallbacks, safe source links and request cleanup', () => {
  assert.equal(format.safeSourceUrl('https://source.test/a'), 'https://source.test/a');
  assert.equal(format.safeSourceUrl('HTTP://source.test'), 'HTTP://source.test');
  assert.equal(format.safeSourceUrl('javascript:alert(1)'), '');
  assert.equal(format.safeSourceUrl('//source.test'), '');
  assert.equal(format.safeSourceUrl(undefined), '');

  const source = readPage();
  // Images reveal on load and remove themselves on error.
  assert.match(source, /function NewsCardImage/);
  assert.match(source, /function DetailImage/);
  assert.match(source, /onError=\{.*?setFailed\(true\).*?\}/);
  assert.match(source, /onLoad=\{.*?setLoaded\(true\).*?\}/);
  assert.match(source, /className=\{`news-card-image-wrap \$\{loaded \? 'is-loaded' : ''\}`\}/);
  // Outbound source links only for http(s), opened safely.
  assert.match(source, /safeSourceUrl\(detailItem\.source\.url\)/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  // Route changes abort the in-flight load.
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
});

test('locations, dates and regulatory labels', () => {
  assert.equal(format.detailedLocation({ counties: ['Nairobi', 'Kiambu'], towns: ['nairobi', 'Thika'] }), 'Nairobi · Kiambu · Thika');
  assert.equal(format.detailedLocation({}), 'Kenya');
  assert.equal(format.cardLocation({ location_summary: 'Coast', counties: ['Mombasa'] }), 'Coast');
  assert.equal(format.cardLocation({ counties: ['A', 'B', 'C', 'D', 'E', 'F'] }), 'National · Kenya');
  assert.equal(format.cardLocation({ counties: ['A', 'B', 'C', 'D', 'E'] }), 'A · B · C · D · E');
  assert.equal(format.cardLocation({ counties: [], towns: [] }), 'Kenya');

  assert.equal(format.formatDate(undefined), 'Publication date unavailable');
  assert.equal(format.formatDate('not a date'), 'Publication date unavailable');
  assert.match(format.formatDate('2026-11-01T09:00:00Z'), /2026/);

  assert.deepEqual(format.getRegulatoryStatus({ regulatory_status: 'Public_Participation' }), { label: 'PUBLIC INPUT', className: 'public_participation' });
  assert.deepEqual(format.getRegulatoryStatus({ regulatory_status: 'under_consideration' }), { label: 'UNDER REVIEW', className: 'under_consideration' });
  assert.deepEqual(format.getRegulatoryStatus({ regulatory_status: 'reported' }), { label: 'UPDATE', className: 'reported' });
  assert.deepEqual(format.getRegulatoryStatus({ category: 'market' }), { label: 'MARKET UPDATE', className: 'market' });
  assert.equal(format.getRegulatoryStatus({ regulatory_status: 'unknown', category: 'taxation' }), null);
});
