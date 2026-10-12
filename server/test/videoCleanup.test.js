process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';
process.env.VIDEO_CLEANUP_DRY_RUN = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { cleanupStuckMediaRecords } = require('../lib/videoCleanup');

function configureCleanup(records, existingKeys = [], changedStates = {}) {
  const updates = [];
  mediaStorageService.getR2ObjectMetadata = async (key) => ({
    exists: existingKeys.includes(key), contentLength: 100, contentType: 'video/mp4',
  });
  supabaseAdmin.from = () => ({
    filters: {},
    values: null,
    select() { return this; },
    in() { return this; },
    then(resolve) { return Promise.resolve({ data: records, error: null }).then(resolve); },
    update(values) {
      this.values = values;
      return this;
    },
    eq(column, value) {
      this.filters[column] = value;
      return this;
    },
    lte(column, value) {
      this.filters[`lte:${column}`] = value;
      return this;
    },
    maybeSingle() {
      updates.push({ ...this.filters, values: this.values });
      const changedState = changedStates[this.filters.id];
      if (changedState && changedState !== this.filters.status) {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: { id: this.filters.id }, error: null });
    },
    select() { return this; },
  });
  return updates;
}

test('stale uploads are failed while recent uploads keep their reservation', async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const updates = configureCleanup([
    { id: 'abandoned', status: 'pending', updated_at: old },
    { id: 'uploaded-but-abandoned', status: 'uploading', updated_at: old },
    { id: 'active', status: 'uploading', updated_at: recent },
  ]);
  const result = await cleanupStuckMediaRecords();
  assert.equal(result.count, 2);
  assert.deepEqual(updates.map(({ id, status, values }) => ({ id, status, values })), [
    { id: 'abandoned', status: 'pending', values: { status: 'failed' } },
    { id: 'uploaded-but-abandoned', status: 'uploading', values: { status: 'failed' } },
  ]);
  assert.ok(updates.every((update) => Boolean(update['lte:updated_at'])));
});

test('stale processing records expire even when the source object remains', async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const updates = configureCleanup([
    { id: 'stuck-processing', status: 'processing', updated_at: old, storage_key: 'present' },
  ]);
  const result = await cleanupStuckMediaRecords();
  assert.equal(result.count, 1);
  assert.equal(updates[0].id, 'stuck-processing');
  assert.equal(updates[0].status, 'processing');
  assert.deepEqual(updates[0].values, { status: 'failed' });
});

test('cleanup does not overwrite a lifecycle transition that won the race', async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const updates = configureCleanup([
    { id: 'finalized', status: 'processing', updated_at: old },
  ], [], { finalized: 'ready' });
  const result = await cleanupStuckMediaRecords();
  assert.equal(result.count, 0);
  assert.equal(updates[0].status, 'processing');
  assert.deepEqual(updates[0].values, { status: 'failed' });
});
