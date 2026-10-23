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
const draftId = '11111111-1111-4111-8111-111111111111';
const listingId = '44444444-4444-4444-8444-444444444444';

function queryFor(table, rows) {
  const filters = [];
  let operation = 'select';
  let values = null;
  const query = {
    select() { return this; },
    eq(column, value) { filters.push((row) => row[column] === value); return this; },
    order() { return this; },
    insert(next) { operation = 'insert'; values = next; return this; },
    update(next) { operation = 'update'; values = next; return this; },
    matches() { return rows.filter((row) => filters.every((filter) => filter(row))); },
    async maybeSingle() {
      const matched = this.matches();
      if (operation === 'insert') {
        if (rows.some((row) => row.id === values.id)) return { data: null, error: Object.assign(new Error('duplicate'), { code: '23505' }) };
        rows.push(structuredClone(values));
        return { data: structuredClone(values), error: null };
      }
      if (operation === 'update') matched.forEach((row) => Object.assign(row, values));
      return { data: matched[0] ? structuredClone(matched[0]) : null, error: null };
    },
    async single() { return this.maybeSingle(); },
    then(resolve, reject) {
      return Promise.resolve({ data: this.matches().map((row) => structuredClone(row)), error: null }).then(resolve, reject);
    },
  };
  return query;
}

async function withDraftApi(hostNiche, run, listingCategory = hostNiche) {
  const originalFrom = supabaseAdmin.from;
  const originalGetUser = supabaseAdmin.auth.getUser;
  const drafts = [];
  const profiles = [
    { id: ownerId, role: 'host', listing_categories: [hostNiche] },
    { id: otherId, role: 'host', listing_categories: [hostNiche] },
  ];
  const listings = [{ id: listingId, host_id: ownerId, category: listingCategory }];
  supabaseAdmin.auth.getUser = async (token) => ({
    data: { user: token === 'owner-token' ? { id: ownerId } : token === 'other-token' ? { id: otherId } : null },
    error: null,
  });
  supabaseAdmin.from = (table) => {
    if (table === 'profiles') return queryFor(table, profiles);
    if (table === 'account_controls') return queryFor(table, []);
    if (table === 'host_listing_drafts') return queryFor(table, drafts);
    if (table === 'listings') return queryFor(table, listings);
    throw new Error(`Unexpected table: ${table}`);
  };
  const app = express();
  app.use(express.json());
  app.use('/api', listingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const send = async (path, { token = 'owner-token', method = 'GET', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, body: await response.json().catch(() => ({})) };
  };
  try { await run({ send, drafts }); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = originalFrom;
    supabaseAdmin.auth.getUser = originalGetUser;
  }
}

test('saves complete host-owned drafts with revision conflicts instead of overwriting newer state', async () => {
  await withDraftApi('property', async ({ send, drafts }) => {
    const original = {
      category: 'property',
      form_data: { fields: { title: 'A place', description: 'Line one\nLine two' }, controls: [{ id: 'amenity-wifi', checked: true }], currentStep: 3, amenities: [{ key: 'wifi', checked: true }] },
      media_metadata: [{ name: 'living-room.jpg', type: 'image/jpeg', kind: 'listing_media', size: 1500, lastModified: 10 }],
      revision: 0,
    };
    const first = await send(`/api/listing-drafts/${draftId}`, { method: 'PUT', body: original });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.draft.revision, 1);
    assert.deepEqual(first.body.draft.form_data, original.form_data);
    assert.deepEqual(first.body.draft.media_metadata, original.media_metadata);

    const newer = structuredClone(original);
    newer.revision = 1;
    newer.form_data.fields.title = 'A newer title';
    const second = await send(`/api/listing-drafts/${draftId}`, { method: 'PUT', body: newer });
    assert.equal(second.response.status, 200);
    assert.equal(second.body.draft.revision, 2);

    const stale = await send(`/api/listing-drafts/${draftId}`, { method: 'PUT', body: original });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.code, 'LISTING_DRAFT_REVISION_CONFLICT');
    assert.equal(drafts[0].form_data.fields.title, 'A newer title');

    const retry = await send(`/api/listing-drafts/${draftId}`, { method: 'PUT', body: newer });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.draft.revision, 2);

    const privateRead = await send(`/api/listing-drafts/${draftId}`, { token: 'other-token' });
    assert.equal(privateRead.response.status, 404);
  });
});

test('accepts each canonical niche and refuses linked listing or category mismatches', async (t) => {
  for (const category of ['property', 'office', 'shop', 'hotel', 'airbnb', 'venue']) {
    await t.test(category, async () => {
      await withDraftApi(category, async ({ send }) => {
        const saved = await send(`/api/listing-drafts/${draftId}`, {
          method: 'PUT', body: { category, form_data: { fields: { title: category } }, media_metadata: [], revision: 0 },
        });
        assert.equal(saved.response.status, 200);
        assert.equal(saved.body.draft.category, category);
      });
    });
  }
  await withDraftApi('property', async ({ send }) => {
    const categoryMismatch = await send(`/api/listing-drafts/${draftId}`, {
      method: 'PUT', body: { category: 'office', form_data: { fields: {} }, media_metadata: [], revision: 0 },
    });
    assert.equal(categoryMismatch.response.status, 403);

    const linkedListingMismatch = await send(`/api/listing-drafts/${draftId}`, {
      method: 'PUT', body: { category: 'property', listing_id: listingId, form_data: { fields: {} }, media_metadata: [], revision: 0 },
    });
    assert.equal(linkedListingMismatch.response.status, 409);
  }, 'office');
});
