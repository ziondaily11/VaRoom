'use strict';

// A draft photo upload that failed or was abandoned must not keep a listing
// from publishing: promotion waits only for an upload that could still land,
// and upload-discard releases the upload's session.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { promoteListingMedia } = require('../lib/listingMediaPromotion');

const ENV = mediaStorageService.ENVIRONMENT;
const hostId = '22222222-2222-4222-8222-222222222222';
const listingId = '11111111-1111-4111-8111-111111111111';
const draftKey = (id) => `drafts/photos/${ENV}/${hostId}/${listingId}/${id}/original.jpg`;
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
const inMinutes = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

// Sessions and (already published) photos; no draft photos left to copy.
function fakeSupabase(sessions, photos = [{ storage_path: `photos/${ENV}/listing-photos/${hostId}/a/original.jpg` }]) {
  return {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        is() { return query; },
        then(resolve, reject) {
          const data = table === 'draft_media_upload_sessions' ? sessions : table === 'listing_photos' ? photos : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function promote(sessions, existing) {
  const checked = [];
  const storage = { verifyR2ObjectExists: async (key) => { checked.push(key); return existing.includes(key); } };
  return { checked, run: promoteListingMedia(listingId, { supabaseAdmin: fakeSupabase(sessions), mediaStorageService: storage, hostId }) };
}

test('an upload whose file never reached R2 no longer blocks publishing once it is 2 minutes old', async () => {
  const failed = { object_key: draftKey('failed'), expires_at: inMinutes(20), completed_at: null, created_at: minutesAgo(10) };
  const { run, checked } = promote([failed], []);
  await run;
  assert.deepEqual(checked, [failed.object_key]);
});

test('an upload that could still land keeps blocking: its file is in R2, or it only just started', async () => {
  const landed = { object_key: draftKey('landed'), expires_at: inMinutes(20), completed_at: null, created_at: minutesAgo(10) };
  await assert.rejects(promote([landed], [landed.object_key]).run, /still in progress/);
  const fresh = { object_key: draftKey('fresh'), expires_at: inMinutes(29), completed_at: null, created_at: minutesAgo(0.5) };
  const { run, checked } = promote([fresh], []);
  await assert.rejects(run, /still in progress/);
  assert.deepEqual(checked, [], 'no storage check needed');
});

test('an expired upload session is not checked at all', async () => {
  const expired = { object_key: draftKey('old'), expires_at: minutesAgo(1), completed_at: null, created_at: minutesAgo(31) };
  const { run, checked } = promote([expired], [expired.object_key]);
  await run;
  assert.deepEqual(checked, []);
});

test('upload-discard removes a draft photo and releases its session', async () => {
  const saved = { getUser: supabaseAdmin.auth.getUser, from: supabaseAdmin.from, remove: mediaStorageService.deleteR2Object };
  const log = [];
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: hostId } }, error: null });
  supabaseAdmin.from = (table) => {
    const query = {
      select() { return query; },
      delete() { log.push(['delete', table]); return query; },
      eq(column, value) { log.push(['eq', table, column, value]); return query; },
      maybeSingle: async () => ({ data: { id: listingId, host_id: hostId, publication_state: 'draft', created_at: minutesAgo(30) }, error: null }),
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    };
    return query;
  };
  mediaStorageService.deleteR2Object = async (key) => { log.push(['r2-delete', key]); };
  delete require.cache[require.resolve('../routes/photoRoutes')];
  const app = express();
  app.use(express.json());
  app.use(require('../routes/photoRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const key = draftKey('failed');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/photos/upload-discard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ category: 'listing-photos', key }),
    });
    assert.equal(response.status, 200);
    const sessionDelete = log.findIndex((entry) => entry[0] === 'delete' && entry[1] === 'draft_media_upload_sessions');
    assert.ok(log.findIndex((entry) => entry[0] === 'r2-delete') < sessionDelete, 'the file goes first, so a failure never orphans it');
    assert.deepEqual(log.slice(sessionDelete + 1), [['eq', 'draft_media_upload_sessions', 'object_key', key], ['eq', 'draft_media_upload_sessions', 'host_id', hostId]]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.auth.getUser = saved.getUser;
    supabaseAdmin.from = saved.from;
    mediaStorageService.deleteR2Object = saved.remove;
  }
});
