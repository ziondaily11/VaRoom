'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// The review routes read Supabase through lib/supabaseClient at load time;
// a recording stand-in replaces it for this test.
const calls = [];
const rows = [
  { id: 'r1', rating: 5, comment: 'Great', created_at: '2026-10-02', client_id: 'c1' },
  { id: 'r2', rating: 3, comment: 'Fine', created_at: '2026-10-01', client_id: 'c1' },
];
const fake = {
  from(table) {
    const entry = { table, ops: [] };
    calls.push(entry);
    const result = table === 'reviews' ? { data: rows, error: null } : { data: [{ id: 'c1', full_name: 'Guest One', avatar_url: null }], error: null };
    const chain = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return (resolve) => resolve(result);
        return (...args) => { entry.ops.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  },
};
const clientPath = require.resolve(path.join(__dirname, '..', 'lib', 'supabaseClient'));
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: fake };
const router = require('../routes/reviewRoutes');

async function call(routePath, params) {
  const layer = router.stack.find((item) => item.route && item.route.path === routePath);
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await layer.route.stack[0].handle({ params, headers: {} }, res);
  return res;
}

test('host and listing reviews show only published reviews; the summary counts those', async () => {
  const host = await call('/hosts/:id/reviews', { id: '11111111-1111-4111-8111-111111111111' });
  assert.equal(host.code, 200);
  const reviewsQuery = calls.find((entry) => entry.table === 'reviews');
  assert.deepEqual(reviewsQuery.ops.filter((op) => op[0] === 'eq'), [['eq', 'host_id', '11111111-1111-4111-8111-111111111111'], ['eq', 'status', 'published']]);
  assert.equal(host.body.summary.review_count, 2);
  assert.equal(host.body.summary.average_rating, 4);
  assert.deepEqual(host.body.summary.distribution.find((d) => d.star === 5), { star: 5, count: 1 });
  assert.equal(host.body.reviews[0].client.full_name, 'Guest One');

  calls.length = 0;
  await call('/listings/:id/reviews', { id: '22222222-2222-4222-8222-222222222222' });
  assert.deepEqual(calls.find((entry) => entry.table === 'reviews').ops.filter((op) => op[0] === 'eq')[1], ['eq', 'status', 'published']);
});
