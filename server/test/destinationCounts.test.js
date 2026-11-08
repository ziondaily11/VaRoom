'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createDestinationCounts, DESTINATION_CITIES } = require('../lib/destinationCounts');

// A Supabase stand-in: records each listings count query and answers from
// `countFor`; the profiles lookup returns the deactivated account ids.
function fakeSupabase(countFor, deactivated = []) {
  const queries = [];
  const profileLookups = [];
  return {
    queries,
    profileLookups,
    from(table) {
      const ops = [['from', table]];
      const query = {};
      ['select', 'eq', 'is', 'ilike', 'not'].forEach((name) => {
        query[name] = (...args) => { ops.push([name, ...args]); return query; };
      });
      if (table === 'profiles') {
        profileLookups.push(ops);
        query.then = (resolve, reject) => Promise.resolve({ data: deactivated.map((id) => ({ id })), error: null }).then(resolve, reject);
        return query;
      }
      queries.push(ops);
      query.then = (resolve, reject) => Promise.resolve()
        .then(() => countFor(ops.find(([name]) => name === 'ilike')[2].slice(1, -1), ops))
        .then(resolve, reject);
      return query;
    },
  };
}

const ok = (count) => () => ({ count, error: null });

test('counts follow the public-listing rule: published, active, host not deactivated (a missing profile still counts)', async () => {
  const supabase = fakeSupabase(ok(3), ['host-a', 'host-b']);
  const counts = createDestinationCounts({ supabase });
  const { counts: result } = await counts.get();
  assert.deepEqual(result, Object.fromEntries(DESTINATION_CITIES.map((city) => [city, 3])));
  assert.equal(supabase.profileLookups.length, 1, 'deactivated accounts are read once per refresh');
  assert.deepEqual(supabase.profileLookups[0].slice(1), [['select', 'id'], ['not', 'deactivated_at', 'is', null]]);
  const ops = supabase.queries[0];
  assert.deepEqual(ops, [
    ['from', 'listings'],
    ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'publication_state', 'published'],
    ['eq', 'moderation_status', 'active'],
    ['ilike', 'location_text', '%Nairobi%'],
    ['not', 'host_id', 'in', '(host-a,host-b)'],
  ]);
  assert.ok(!ops.some(([name, value]) => name === 'select' && /profiles/.test(value)), 'no join: hosts without a profile row are not dropped');
  const none = fakeSupabase(ok(1));
  await createDestinationCounts({ supabase: none }).get();
  assert.ok(!none.queries[0].some(([name]) => name === 'not'), 'no exclusion when nobody is deactivated');
});

test('one shared answer: fresh counts are served from memory, simultaneous requests share a refresh', async () => {
  let time = 0;
  const supabase = fakeSupabase(ok(1));
  const counts = createDestinationCounts({ supabase, ttlMs: 1000, now: () => time });
  await Promise.all([counts.get(), counts.get(), counts.get()]);
  assert.equal(supabase.queries.length, DESTINATION_CITIES.length, 'one query per city, not per request');
  time = 999;
  await counts.get();
  assert.equal(supabase.queries.length, DESTINATION_CITIES.length);
});

test('stale counts are served at once while one background refresh runs', async () => {
  let time = 0;
  let value = 1;
  const supabase = fakeSupabase(() => ({ count: value, error: null }));
  const counts = createDestinationCounts({ supabase, ttlMs: 1000, now: () => time });
  await counts.get();
  time = 5000;
  value = 2;
  const stale = await counts.get();
  assert.equal(stale.counts.Nairobi, 1, 'served without waiting');
  await new Promise((resolve) => setImmediate(resolve));
  const fresh = await counts.get();
  assert.equal(fresh.counts.Nairobi, 2);
  assert.equal(supabase.queries.length, DESTINATION_CITIES.length * 2);
});

test('a failed refresh keeps the last good counts; with none yet, the error reaches the caller', async () => {
  let time = 0;
  let fail = false;
  const supabase = fakeSupabase(() => (fail ? { count: null, error: new Error('db down') } : { count: 4, error: null }));
  const counts = createDestinationCounts({ supabase, ttlMs: 1000, now: () => time });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await counts.get();
    fail = true;
    time = 5000;
    assert.equal((await counts.get()).counts.Nairobi, 4);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await counts.get()).counts.Nairobi, 4);
  } finally {
    console.warn = warn;
  }
  const empty = createDestinationCounts({ supabase: fakeSupabase(() => ({ count: null, error: new Error('db down') })) });
  await assert.rejects(empty.get(), /db down/);
  const invalid = createDestinationCounts({ supabase: fakeSupabase(() => ({ count: -1, error: null })) });
  await assert.rejects(invalid.get(), /Invalid listing count/);
});

test('GET /destination-counts answers publicly cacheable counts, and no-store on failure', async () => {
  const supabaseAdmin = require('../lib/supabaseClient');
  const originalFrom = supabaseAdmin.from;
  let failing = false;
  supabaseAdmin.from = (table) => fakeSupabase(() => (failing ? { count: null, error: new Error('x') } : { count: 7, error: null })).from(table);
  delete require.cache[require.resolve('../routes/listingRoutes')];
  const listingRoutes = require('../routes/listingRoutes');
  const app = express();
  app.use(listingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/destination-counts`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300, s-maxage=300');
    assert.deepEqual(body.counts, Object.fromEntries(DESTINATION_CITIES.map((city) => [city, 7])));
    assert.ok(!Number.isNaN(Date.parse(body.updatedAt)));

    // A fresh route (no counts yet) whose queries fail.
    failing = true;
    delete require.cache[require.resolve('../routes/listingRoutes')];
    const failingApp = express();
    failingApp.use(require('../routes/listingRoutes'));
    const failingServer = failingApp.listen(0, '127.0.0.1');
    await new Promise((resolve) => failingServer.once('listening', resolve));
    const error = console.error;
    console.error = () => {};
    try {
      const failed = await fetch(`http://127.0.0.1:${failingServer.address().port}/destination-counts`);
      assert.equal(failed.status, 500);
      assert.equal(failed.headers.get('cache-control'), 'no-store');
    } finally {
      console.error = error;
      failingServer.close();
    }
  } finally {
    supabaseAdmin.from = originalFrom;
    server.close();
  }
});
