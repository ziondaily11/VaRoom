const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const ID = '6f1c2a9e-1b2c-4d3e-8f90-123456789abc';

function row(overrides = {}) {
  return {
    id: ID, title: 'Nairobi approves land rates', summary: 'Summary.', category: 'taxation',
    topics: ['land rates'], counties: ['Nairobi'], towns: ['Nairobi', 'Thika'],
    regulatory_status: 'approved', affected_groups: ['landlords'], risk_level: 'high',
    source_url: 'https://source.test/story', image_url: null,
    source_published_at: '2026-11-01T08:00:00+00:00', published_at: '2026-11-01T09:00:00+00:00',
    source_name: 'Source', source_tier: 2,
    ...overrides,
  };
}

// Loads the feed module with a stubbed fetch that records the request URL.
function loadFeed(respond) {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers });
    return respond(String(url));
  };
  const feed = loadTs(path.join(root, 'lib', 'propertyNewsFeed.ts'), { globals: { fetch } });
  return { feed, requests };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function loadRoute(file, respond) {
  const requests = [];
  const fetch = async (url) => { requests.push(String(url)); return respond(String(url)); };
  const route = loadTs(path.join(root, 'pages', 'api', 'news', file), { globals: { fetch } });
  return { handler: route.default, requests };
}

async function call(handler, { method = 'GET', query = {} } = {}) {
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method, query }, res);
  return res;
}

test('location summary mirrors the Python format_location_display', () => {
  const { feed } = loadFeed(() => jsonResponse(200, []));
  assert.equal(feed.formatLocationDisplay(['Nairobi', 'Kiambu'], ['Thika']), 'Nairobi · Kiambu · Thika');
  assert.equal(feed.formatLocationDisplay(['Nairobi'], ['nairobi']), 'Nairobi');
  assert.equal(feed.formatLocationDisplay([], null), 'Kenya');
  assert.equal(feed.formatLocationDisplay(['Nairobi', 'Kiambu', 'Machakos', 'Nakuru', 'Mombasa', 'Kisumu'], []), 'National · Kenya');
});

test('view rows map to the public item shape the pages consume', () => {
  const { feed } = loadFeed(() => jsonResponse(200, []));
  const item = feed.toPublicNewsItem(row({ body: 'Full text.' }));
  assert.deepEqual(item.source, { name: 'Source', url: 'https://source.test/story', tier: 2, published_at: '2026-11-01T08:00:00+00:00' });
  assert.equal(item.location_summary, 'Nairobi · Thika');
  assert.equal(item.body, 'Full text.');
  assert.equal(feed.toPublicNewsItem(row()).body, null);
  assert.equal(feed.toPublicNewsItem(row({ source_name: null })).source, null);
  assert.deepEqual(feed.toPublicNewsItem(row({ topics: null })).topics, []);
});

test('list reads only published-view columns without the body, newest first, with the anon key', async () => {
  const { feed, requests } = loadFeed(() => jsonResponse(200, [row()]));
  const items = await feed.listPublishedNews(5);
  assert.equal(items.length, 1);
  const url = new URL(requests[0].url);
  assert.match(url.pathname, /\/rest\/v1\/property_news_public_items$/);
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('order'), 'published_at.desc.nullslast,source_published_at.desc.nullslast');
  assert.doesNotMatch(url.searchParams.get('select'), /\bbody\b/);
  assert.ok(requests[0].headers.apikey);
});

test('limits and ids are validated like the Python API', () => {
  const { feed } = loadFeed(() => jsonResponse(200, []));
  assert.equal(feed.parseLimit(undefined, 20), 20);
  assert.equal(feed.parseLimit('50', 20), 50);
  for (const bad of ['0', '51', '-1', '2.5', 'abc', ['5', '6']]) assert.equal(feed.parseLimit(bad, 20), null);
  assert.ok(feed.isNewsId(ID));
  assert.ok(!feed.isNewsId('not-an-id'));
  assert.ok(!feed.isNewsId([ID]));
});

test('routes return cached JSON, 404, 422, 405 and 503 like the Python API', async () => {
  const list = loadRoute('index.ts', () => jsonResponse(200, [row()]));
  let res = await call(list.handler, { query: { limit: '3' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].id, ID);
  assert.match(res.headers['cache-control'], /s-maxage=60/);
  assert.equal(res.headers['x-property-news-source'], 'supabase-view');
  assert.equal(new URL(list.requests[0]).searchParams.get('limit'), '3');

  const latest = loadRoute('latest.ts', () => jsonResponse(200, []));
  await call(latest.handler);
  assert.equal(new URL(latest.requests[0]).searchParams.get('limit'), '2');

  res = await call(list.handler, { query: { limit: '500' } });
  assert.equal(res.statusCode, 422);

  res = await call(list.handler, { method: 'POST' });
  assert.equal(res.statusCode, 405);

  const missing = loadRoute('[id].ts', () => jsonResponse(200, []));
  res = await call(missing.handler, { query: { id: ID } });
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['cache-control'], 'no-store');

  res = await call(missing.handler, { query: { id: 'nope' } });
  assert.equal(res.statusCode, 422);

  const article = loadRoute('[id].ts', () => jsonResponse(200, [row({ body: 'Full text.' })]));
  res = await call(article.handler, { query: { id: ID } });
  assert.equal(res.body.body, 'Full text.');
  assert.match(new URL(article.requests[0]).searchParams.get('select'), /\bbody\b/);

  const down = loadRoute('index.ts', () => jsonResponse(500, { message: 'down' }));
  res = await call(down.handler);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('Vercel no longer rewrites /api/news to the Python service', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(!vercel.rewrites.some(({ source }) => source.startsWith('/api/news')));
  assert.ok(!JSON.stringify(vercel).includes('property-news-pnsj.onrender.com'));
});
