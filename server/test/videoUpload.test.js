process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret';
process.env.VIDEO_UPLOADS_ENABLED = 'true';
process.env.VIDEO_PREMIUM_REQUIRED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const mediaOptimizationService = require('../lib/mediaOptimizationService');
const thumbnailService = require('../lib/videoThumbnailService');
const videoEntitlement = require('../lib/videoEntitlement');

const propertyId = '11111111-1111-4111-8111-111111111111';
const mediaId = '22222222-2222-4222-8222-222222222222';
const uploadId = '33333333-3333-4333-8333-333333333333';
const user = { id: '44444444-4444-4444-8444-444444444444' };

thumbnailService.generateVideoThumbnail = async () => null;
const videoRoutes = require('../routes/videoRoutes');

async function withServer(options, run) {
  let insertedRecord = null;
  let recordStatus = 'pending';
  let savedDuration = null;
  const mediaRecord = {
    id: mediaId,
    property_id: propertyId,
    host_id: user.id,
    upload_id: uploadId,
    storage_key: 'videos/test/original.mp4',
    original_filename: 'clip.mp4',
    mime_type: 'video/mp4',
  };

  supabaseAdmin.auth.getUser = async () => ({ data: { user }, error: null });
  supabaseAdmin.from = (table) => {
    if (table === 'listings') {
      const query = {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: { id: propertyId, host_id: user.id }, error: null }),
      };
      return query;
    }

    const query = {
      mode: null,
      select(_columns, selectOptions) {
        if (selectOptions && selectOptions.count === 'exact') this.mode = 'count';
        else if (!this.mode) this.mode = 'media';
        return this;
      },
      eq() { return this; },
      neq() { return this; },
      is() { return this; },
      insert(record) {
        insertedRecord = record;
        this.mode = 'insert';
        return this;
      },
      update(values) {
        this.mode = 'update';
        if (values.status) recordStatus = values.status;
        if (Object.prototype.hasOwnProperty.call(values, 'duration_seconds')) {
          savedDuration = values.duration_seconds;
        }
        return this;
      },
      single() {
        if (this.mode === 'insert') return Promise.resolve({ data: insertedRecord, error: null });
        return Promise.resolve({
          data: { ...mediaRecord, status: recordStatus, duration_seconds: savedDuration },
          error: null,
        });
      },
      then(resolve, reject) {
        if (this.mode === 'count') {
          if (options.countThrows) return Promise.reject(new Error('database unavailable')).then(resolve, reject);
          if (options.countError) {
            return Promise.resolve({ count: null, error: new Error('database unavailable') }).then(resolve, reject);
          }
          return Promise.resolve({ count: options.count ?? 0, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return query;
  };

  mediaStorageService.generateR2ObjectKey = () => mediaRecord.storage_key;
  mediaStorageService.generateR2UploadAuthorization = async () => ({
    uploadUrl: 'https://r2.example/upload',
    endpoint: 'https://r2.example',
    bucketName: 'test-bucket',
    objectKey: mediaRecord.storage_key,
    contentType: 'video/mp4',
    maxFileSize: 1024,
  });
  mediaStorageService.getR2ObjectMetadata = async () => ({
    exists: true,
    contentLength: 100,
    contentType: 'video/mp4',
  });
  mediaOptimizationService.optimizeStoredMediaObject = async () => ({
    optimized: false,
    durationSeconds: options.actualDuration,
  });

  const app = express();
  app.use(express.json());
  app.use(videoRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    const send = async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    await run({ send, get insertedRecord() { return insertedRecord; }, get recordStatus() { return recordStatus; }, get savedDuration() { return savedDuration; } });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function initBody(durationSeconds) {
  return {
    filename: 'clip.mp4',
    mimeType: 'video/mp4',
    fileSize: 100,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
}

async function initializeUpload(send, durationSeconds) {
  return send(`/properties/${propertyId}/videos/upload-init`, initBody(durationSeconds));
}

async function completeUpload(send, durationSeconds) {
  return send(`/properties/${propertyId}/videos/${mediaId}/complete`, {
    uploadId,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  });
}

test('allows initialization below the video-count limit', async () => {
  await withServer({ count: videoEntitlement.VIDEO_MAX_COUNT_PER_PROPERTY - 1 }, async (state) => {
    const response = await initializeUpload(state.send);
    assert.equal(response.status, 200);
    assert.equal(state.insertedRecord.status, 'pending');
  });
});

test('blocks initialization at the video-count limit', async () => {
  await withServer({ count: videoEntitlement.VIDEO_MAX_COUNT_PER_PROPERTY }, async (state) => {
    const response = await initializeUpload(state.send);
    assert.equal(response.status, 403);
    assert.equal(state.insertedRecord, null);
  });
});

for (const options of [{ countError: true }, { countThrows: true }]) {
  test(`fails initialization on a video-count ${options.countError ? 'query error' : 'thrown error'}`, async () => {
    await withServer(options, async (state) => {
      const response = await initializeUpload(state.send);
      assert.equal(response.status, 500);
      assert.equal(state.insertedRecord, null);
    });
  });
}

test('rejects an over-limit probed duration when the client reports a short duration', async () => {
  await withServer({ count: 0, actualDuration: videoEntitlement.VIDEO_MAX_DURATION_SECONDS + 1 }, async (state) => {
    const initialized = await initializeUpload(state.send, 10);
    assert.equal(initialized.status, 200);
    const response = await completeUpload(state.send, 10);
    assert.equal(response.status, 400);
    assert.equal(state.recordStatus, 'failed');
    assert.notEqual(state.recordStatus, 'ready');
  });
});

test('rejects an over-limit probed duration when client duration is omitted', async () => {
  await withServer({ count: 0, actualDuration: videoEntitlement.VIDEO_MAX_DURATION_SECONDS + 1 }, async (state) => {
    const initialized = await initializeUpload(state.send);
    assert.equal(initialized.status, 200);
    const response = await completeUpload(state.send);
    assert.equal(response.status, 400);
    assert.equal(state.recordStatus, 'failed');
  });
});

test('successful completion records the probed duration', async () => {
  await withServer({ count: 0, actualDuration: 3 }, async (state) => {
    const initialized = await initializeUpload(state.send);
    assert.equal(initialized.status, 200);
    const response = await completeUpload(state.send, 2);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ready');
    assert.equal(state.recordStatus, 'ready');
    assert.equal(state.savedDuration, 3);
  });
});
