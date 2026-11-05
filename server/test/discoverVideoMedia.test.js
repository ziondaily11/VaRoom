'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const listingRoutes = require('../routes/listingRoutes');

const published = '11111111-1111-4111-8111-111111111111';
const plain = '22222222-2222-4222-8222-222222222222';
const draft = '33333333-3333-4333-8333-333333333333';

test('the batch video lookup says which listings it covers, so a missing video is not mistaken for "not public"', async () => {
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = (table) => {
    const rows = table === 'listings'
      ? [
        { id: published, publication_state: 'published', availability_status: 'available', created_at: new Date().toISOString() },
        { id: plain, publication_state: 'published', availability_status: 'available', created_at: new Date().toISOString() },
        { id: draft, publication_state: 'draft', availability_status: 'draft', created_at: new Date().toISOString() },
      ]
      : [{ id: 'video-1', property_id: published, sort_order: 0, width: 720, height: 1280 }];
    const query = {
      select() { return query; }, in() { return query; }, eq() { return query; }, is() { return query; }, order() { return query; },
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return query;
  };
  const app = express();
  app.use(listingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/discover/video-media?listingIds=${[published, plain, draft].join(',')}`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.videoMedia, { [published]: 'video-1' });
    assert.deepEqual(body.publishedIds.sort(), [published, plain].sort());
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = originalFrom;
  }
});
