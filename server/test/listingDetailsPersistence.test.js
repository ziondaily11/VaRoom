'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const listingRoutes = require('../routes/listingRoutes');

const ownerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const listingId = '44444444-4444-4444-8444-444444444444';
const allowedPriceUnits = new Set(['hour', 'day', 'week', 'night', 'month', 'year', 'sq_ft', 'm2', 'desk', 'turnover']);

function queryFor(table, rows, options) {
  const filters = [];
  let operation = 'select';
  let values = null;
  const opts = options || {};
  const matches = () => rows.filter((row) => filters.every((filter) => filter(row)));
  const apply = () => {
    if (operation === 'insert') {
      if (opts.failWrite) return { data: null, error: Object.assign(new Error('simulated database constraint failure'), { code: '23514', constraint: 'listing_booking_details_price_unit_check', table }) };
      if (table === 'listing_booking_details' && values.price_unit && !allowedPriceUnits.has(values.price_unit)) {
        return { data: null, error: Object.assign(new Error('price_unit violates check constraint'), { code: '23514', constraint: 'listing_booking_details_price_unit_check' }) };
      }
      if (table === 'listing_booking_details' && rows.some((row) => row.listing_id === values.listing_id)) {
        return { data: null, error: Object.assign(new Error('duplicate listing detail row'), { code: '23505' }) };
      }
      const record = structuredClone(values);
      rows.push(record);
      return { data: structuredClone(record), error: null };
    }
    if (operation === 'update') {
      if (opts.failWrite) return { data: null, error: Object.assign(new Error('simulated database constraint failure'), { code: '23514', constraint: 'listing_booking_details_price_unit_check', table }) };
      const found = matches();
      found.forEach((row) => Object.assign(row, structuredClone(values)));
      return { data: found.map((row) => structuredClone(row)), error: null };
    }
    return { data: matches().map((row) => structuredClone(row)), error: null };
  };
  return {
    select() { return this; },
    eq(column, value) { filters.push((row) => row[column] === value); return this; },
    order() { return this; },
    insert(record) { operation = 'insert'; values = record; return this; },
    update(record) { operation = 'update'; values = record; return this; },
    async maybeSingle() {
      if (operation !== 'select') {
        const result = apply();
        return { data: Array.isArray(result.data) ? result.data[0] || null : result.data, error: result.error };
      }
      return { data: matches()[0] ? structuredClone(matches()[0]) : null, error: null };
    },
    then(resolve, reject) { return Promise.resolve(apply()).then(resolve, reject); },
  };
}

async function withListingServer({ category, details = [], failWrite = false } = {}, run) {
  const previous = { from: supabaseAdmin.from, getUser: supabaseAdmin.auth.getUser };
  const listings = [{
    id: listingId, host_id: ownerId, category: category || 'property', title: 'Saved listing',
    publication_state: 'draft', availability_status: 'draft',
  }];
  const bookingDetails = structuredClone(details);
  supabaseAdmin.auth.getUser = async (token) => ({
    data: { user: token === 'owner-token' ? { id: ownerId } : token === 'other-token' ? { id: otherId } : null },
    error: null,
  });
  supabaseAdmin.from = (table) => {
    if (table === 'profiles') return queryFor(table, [{ id: ownerId, role: 'host' }, { id: otherId, role: 'host' }]);
    if (table === 'account_controls') return queryFor(table, []);
    if (table === 'listings') return queryFor(table, listings);
    if (table === 'listing_booking_details') return queryFor(table, bookingDetails, { failWrite });
    throw new Error(`Unexpected table: ${table}`);
  };
  const app = express();
  app.use(express.json());
  app.use('/api', listingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const send = async (body, token = 'owner-token') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/listings/${listingId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json().catch(() => ({})) };
  };
  try { await run({ send, listings, bookingDetails }); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = previous.from;
    supabaseAdmin.auth.getUser = previous.getUser;
  }
}

test('persists the same amenity array and niche price units for every listing category', async (t) => {
  const cases = [
    ['property', 'month'], ['office', 'sq_ft'], ['shop', 'turnover'],
    ['hotel', 'night'], ['airbnb', 'night'], ['venue', 'day'],
  ];
  for (const [category, priceUnit] of cases) {
    await t.test(category, async () => {
      await withListingServer({ category }, async ({ send, listings, bookingDetails }) => {
        const amenities = ['Reliable water supply', 'Fibre available', 'Controlled entry'];
        const saved = await send({ booking_details: { price_unit: priceUnit, price_amount: 2500, amenities } });
        assert.equal(saved.response.status, 200);
        assert.deepEqual(bookingDetails[0].amenities, amenities);
        assert.equal(bookingDetails[0].price_unit, priceUnit);
        assert.equal(listings.length, 1, 'saving details must not create a duplicate listing');
      });
    });
  }
});

test('a section update preserves unrelated saved details and rejects non-owner edits', async () => {
  const seed = [{ listing_id: listingId, price_unit: 'month', price_amount: 45000, max_guests: 4, amenities: ['Old selection'] }];
  await withListingServer({ category: 'airbnb', details: seed }, async ({ send, bookingDetails }) => {
    const denied = await send({ booking_details: { amenities: ['Should not save'] } }, 'other-token');
    assert.equal(denied.response.status, 403);
    assert.deepEqual(bookingDetails[0].amenities, ['Old selection']);

    const saved = await send({ booking_details: { amenities: ['Wi-Fi', 'Kitchen'] } });
    assert.equal(saved.response.status, 200);
    assert.deepEqual(bookingDetails[0].amenities, ['Wi-Fi', 'Kitchen']);
    assert.equal(bookingDetails[0].max_guests, 4);
    assert.equal(bookingDetails[0].price_amount, 45000);
  });
});

test('a database constraint failure stays actionable and leaves the paid draft recoverable', async () => {
  await withListingServer({ category: 'office', failWrite: true }, async ({ send, listings }) => {
    const failed = await send({ booking_details: { amenities: ['Fibre available'] } });
    assert.equal(failed.response.status, 500);
    assert.equal(failed.body.code, 'LISTING_DETAILS_WRITE_FAILED');
    assert.match(failed.body.error, /listing and payment are preserved/i);
    assert.equal(listings[0].publication_state, 'draft');
    assert.equal(listings.length, 1);
  });
});
