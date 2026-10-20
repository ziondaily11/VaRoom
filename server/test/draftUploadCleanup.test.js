'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const { cleanupExpiredDraftUploadSessions } = require('../lib/videoCleanup');

test('does not delete an upload session extended during cleanup reconciliation', async () => {
  const originalFrom = supabaseAdmin.from;
  const originalDelete = mediaStorageService.deleteR2Object;
  const key = 'drafts/photos/development/host/listing/photo/original.jpg';
  const extendedExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let deleteCalled = false;

  supabaseAdmin.from = (table) => {
    let mode = 'select';
    const query = {
      select() { mode = 'select'; return this; },
      lte() { return this; },
      eq() { return this; },
      delete() { mode = 'delete'; return this; },
      limit() {
        return Promise.resolve(table === 'draft_media_upload_sessions'
          ? { data: [{ object_key: key, listing_id: 'listing' }], error: null }
          : { data: [], error: null });
      },
      maybeSingle() {
        return Promise.resolve({
          data: table === 'draft_media_upload_sessions' ? { expires_at: extendedExpiry } : null,
          error: null,
        });
      },
      then(resolve, reject) {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  mediaStorageService.deleteR2Object = async () => {
    deleteCalled = true;
  };

  try {
    const result = await cleanupExpiredDraftUploadSessions();
    assert.deepEqual(result, { examined: 1, deleted: 0 });
    assert.equal(deleteCalled, false);
  } finally {
    supabaseAdmin.from = originalFrom;
    mediaStorageService.deleteR2Object = originalDelete;
  }
});
