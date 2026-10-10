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

function configureCleanup(records, existingKeys = []) {
  const updates = [];
  mediaStorageService.getR2ObjectMetadata = async (key) => ({
    exists: existingKeys.includes(key), contentLength: 100, contentType: 'video/mp4',
  });
  supabaseAdmin.from = () => ({
    select() { return this; },
    in() { return this; },
    then(resolve) { return Promise.resolve({ data: records, error: null }).then(resolve); },
    update(values) {
      this.values = values;
      return this;
    },
    eq(_column, id) {
      updates.push({ id, values: this.values });
      return Promise.resolve({ error: null });
    },
  });
  return updates;
}

test('stale uploads are failed while recent uploads keep their reservation', async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const updates = configureCleanup([
    { id: 'abandoned', status: 'pending', created_at: old },
    { id: 'uploaded-but-abandoned', status: 'uploading', created_at: old },
    { id: 'active', status: 'uploading', created_at: recent },
  ]);
  const result = await cleanupStuckMediaRecords();
  assert.equal(result.count, 2);
  assert.deepEqual(updates, [
    { id: 'abandoned', values: { status: 'failed' } },
    { id: 'uploaded-but-abandoned', values: { status: 'failed' } },
  ]);
});

test('stale processing records expire even when the source object remains', async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const updates = configureCleanup([
    { id: 'stuck-processing', status: 'processing', created_at: old, storage_key: 'present' },
  ]);
  const result = await cleanupStuckMediaRecords();
  assert.equal(result.count, 1);
  assert.deepEqual(updates, [{ id: 'stuck-processing', values: { status: 'failed' } }]);
});
