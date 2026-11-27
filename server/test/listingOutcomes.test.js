'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

// Relist goes online through the real status path; media promotion is not part of these checks.
const promotionPath = require.resolve('../lib/listingMediaPromotion');
require.cache[promotionPath] = { id: promotionPath, filename: promotionPath, loaded: true, exports: { promoteListingMedia: async () => {} } };
const supabaseAdmin = require('../lib/supabaseClient');
const listingRoutes = require('../routes/listingRoutes');

const ownerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const listingId = '44444444-4444-4444-8444-444444444444';
const outcomeId = '55555555-5555-4555-8555-555555555555';
const bookingId = '66666666-6666-4666-8666-666666666666';

function table(rows) {
  const filters = [];
  let values = null;
  const matches = () => rows.filter((row) => filters.every((filter) => filter(row)));
  const run = () => {
    if (values) matches().forEach((row) => Object.assign(row, values));
    return { data: matches().map((row) => ({ ...row })), error: null };
  };
  return {
    select() { return this; },
    eq(column, value) { filters.push((row) => row[column] === value); return this; },
    update(next) { values = next; return this; },
    async maybeSingle() { const { data } = run(); return { data: data[0] || null, error: null }; },
    then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
  };
}

async function withServer({ listing = {}, details = {}, rpc = async () => ({ data: null, error: null }) } = {}, run) {
  const previous = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, getUser: supabaseAdmin.auth.getUser };
  const listings = [{ id: listingId, host_id: ownerId, category: 'property', listing_purpose: 'sale', availability_status: 'available', publication_state: 'published', ...listing }];
  const bookingDetails = [{ listing_id: listingId, listing_purpose: null, units_available: 4, ...details }];
  const calls = [];
  supabaseAdmin.auth.getUser = async (token) => ({ data: { user: token === 'owner' ? { id: ownerId } : token === 'other' ? { id: otherId } : null }, error: null });
  supabaseAdmin.from = (name) => {
    if (name === 'profiles') return table([{ id: ownerId, role: 'host' }, { id: otherId, role: 'host' }]);
    if (name === 'account_controls') return table([]);
    if (name === 'listings') return table(listings);
    if (name === 'listing_booking_details') return table(bookingDetails);
    throw new Error(`Unexpected table: ${name}`);
  };
  supabaseAdmin.rpc = async (name, params) => { calls.push([name, params]); return rpc(name, params); };
  const app = express();
  app.use(express.json());
  app.use('/api', listingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const send = async (method, route, body, token = 'owner') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/listings/${listingId}${route}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  try { await run({ send, calls, listings, bookingDetails }); } finally {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(supabaseAdmin, { from: previous.from, rpc: previous.rpc });
    supabaseAdmin.auth.getUser = previous.getUser;
  }
}

test('marking passes the acting host and the host\'s choices to record_listing_outcome', async () => {
  const result = { outcome: { id: outcomeId, outcome: 'sold', units: 2 }, listing: { id: listingId, availability_status: 'available', under_offer: false, units_available: 2 } };
  await withServer({ rpc: async () => ({ data: result, error: null }) }, async ({ send, calls }) => {
    const marked = await send('POST', '/outcomes', { outcome: 'sold', units: 2, agreed_amount: 12500000, booking_id: bookingId });
    assert.equal(marked.status, 200);
    assert.deepEqual(marked.body, result);
    assert.deepEqual(calls, [['record_listing_outcome', { p_host: ownerId, p_listing: listingId, p_outcome: 'sold', p_units: 2, p_amount: 12500000, p_booking: bookingId }]]);
    // Units and price are optional.
    await send('POST', '/outcomes', { outcome: 'rented' });
    assert.deepEqual(calls[1][1], { p_host: ownerId, p_listing: listingId, p_outcome: 'rented', p_units: 1, p_amount: null, p_booking: null });
  });
});

test('bad input never reaches the database, and refusals keep their reason', async () => {
  const refusals = { LISTING_NOT_FOUND: 404, OUTCOME_NOT_ALLOWED: 422, LISTING_NOT_MARKABLE: 409, UNITS_INVALID: 422 };
  let next = 'OUTCOME_NOT_ALLOWED';
  await withServer({ rpc: async () => ({ data: { code: next, error: 'Refused' }, error: null }) }, async ({ send, calls }) => {
    for (const body of [{ outcome: 'booked' }, { outcome: 'sold', units: 0 }, { outcome: 'sold', units: 1.5 }, { outcome: 'sold', agreed_amount: -1 },
      { outcome: 'sold', agreed_amount: '5000' }, { outcome: 'sold', booking_id: 'x' }, { outcome: 'sold', extra: true }]) {
      assert.equal((await send('POST', '/outcomes', body)).status, 400, JSON.stringify(body));
    }
    assert.equal(calls.length, 0);
    for (const [code, status] of Object.entries(refusals)) {
      next = code;
      const refused = await send('POST', '/outcomes', { outcome: 'sold' });
      assert.equal(refused.status, status);
      assert.deepEqual(refused.body, { error: 'Refused', code });
    }
    assert.equal((await send('POST', '/outcomes', { outcome: 'sold' }, 'nobody')).status, 401);
  });
});

test('Undo voids the record for the acting host', async () => {
  await withServer({ rpc: async () => ({ data: { code: 'UNDO_EXPIRED', error: 'It is too late to undo this.' }, error: null }) }, async ({ send, calls }) => {
    const late = await send('POST', `/outcomes/${outcomeId}/void`);
    assert.equal(late.status, 409);
    assert.deepEqual(calls, [['void_listing_outcome', { p_host: ownerId, p_outcome: outcomeId }]]);
    assert.equal((await send('POST', '/outcomes/not-a-uuid/void')).status, 400);
  });
});

test('Relist: only a sold, rented or leased listing; a property\'s units first, then online as Make available', async () => {
  await withServer({}, async ({ send, calls }) => {
    const live = await send('POST', '/relist', { units: 2 });
    assert.equal(live.status, 409);
    assert.equal(live.body.code, 'NOT_RELISTABLE');
    assert.equal(calls.length, 0);
  });
  const activated = { listing: { id: listingId, availability_status: 'available' } };
  await withServer({ listing: { availability_status: 'sold' }, rpc: async () => ({ data: activated, error: null }) }, async ({ send, calls, bookingDetails }) => {
    assert.equal((await send('POST', '/relist', { units: 3 }, 'other')).status, 403);
    const relisted = await send('POST', '/relist', { units: 3 });
    assert.equal(relisted.status, 200);
    assert.deepEqual(relisted.body, activated);
    assert.equal(bookingDetails[0].units_available, 3);
    assert.deepEqual(calls, [['activate_listing_with_entitlement', { p_listing_id: listingId, p_host_id: ownerId }]]);
  });
});

test('Under offer: sale properties on the market only', async () => {
  await withServer({}, async ({ send, listings }) => {
    const set = await send('PATCH', '/under-offer', { under_offer: true });
    assert.equal(set.status, 200);
    assert.equal(listings[0].under_offer, true);
    assert.equal((await send('PATCH', '/under-offer', { under_offer: 'yes' })).status, 400);
    assert.equal((await send('PATCH', '/under-offer', { under_offer: false }, 'other')).status, 403);
  });
  // Older properties keep the purpose in the details row.
  await withServer({ listing: { listing_purpose: null }, details: { listing_purpose: 'both' } }, async ({ send }) => {
    assert.equal((await send('PATCH', '/under-offer', { under_offer: true })).status, 200);
  });
  for (const [listing, code] of [[{ listing_purpose: 'rent' }, 'NOT_FOR_SALE'], [{ category: 'office', listing_purpose: null }, 'NOT_FOR_SALE'], [{ availability_status: 'sold' }, 'NOT_ON_MARKET']]) {
    await withServer({ listing }, async ({ send, listings }) => {
      const refused = await send('PATCH', '/under-offer', { under_offer: true });
      assert.equal(refused.body.code, code);
      assert.equal(listings[0].under_offer, undefined);
    });
  }
});

test('outcomes are recorded only through record_listing_outcome, which clients cannot call', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
  // Outcomes are recorded only through record_listing_outcome, never as a plain status.
  assert.match(routes, /const STATUSES = new Set\(\['available', 'booked', 'unavailable', 'paused', 'draft'\]\);/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127_000087_listing_outcomes.sql'), 'utf8');
  assert.match(migration, /grant execute on function public\.record_listing_outcome\(uuid, uuid, text, integer, numeric, uuid\) to service_role;/);
  assert.match(migration, /revoke all on function public\.record_listing_outcome\(uuid, uuid, text, integer, numeric, uuid\) from public, anon, authenticated;/);
});
