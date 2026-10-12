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
  let reservedCount = options.count ?? 0;
  let recordExists = options.recordExists !== false;
  let recordStatus = options.recordStatus || 'pending';
  let expectedMediaId = mediaId;
  let expectedUploadId = options.recordUploadId || uploadId;
  let savedDuration = null;
  let optimizationCalls = 0;
  let finalizationFilters = null;
  const mediaRecord = {
    id: expectedMediaId,
    property_id: propertyId,
    host_id: user.id,
    upload_id: expectedUploadId,
    media_type: 'video',
    deleted_at: null,
    storage_key: 'videos/test/original.mp4',
    original_filename: 'clip.mp4',
    mime_type: 'video/mp4',
  };

  supabaseAdmin.auth.getUser = async () => ({ data: { user }, error: null });
  supabaseAdmin.rpc = async (name, params) => {
    if (name === 'claim_property_video_finalization') {
      if (options.changeStateAtClaim) recordStatus = options.changeStateAtClaim;
      const identifiersMatch = params.p_property_id === propertyId
        && params.p_media_id === expectedMediaId
        && params.p_host_id === user.id
        && params.p_upload_id === expectedUploadId;
      if (!recordExists || !identifiersMatch || !['pending', 'uploading'].includes(recordStatus)) {
        return { data: [], error: null };
      }
      recordStatus = 'processing';
      return { data: [{ ...mediaRecord, status: 'processing' }], error: null };
    }
    assert.equal(name, 'reserve_property_video_upload');
    if (reservedCount >= params.p_max_count) return { data: [{ reserved: false, current_count: reservedCount }], error: null };
    reservedCount += 1;
    expectedMediaId = params.p_media_id;
    expectedUploadId = params.p_upload_id;
    mediaRecord.id = expectedMediaId;
    mediaRecord.upload_id = expectedUploadId;
    insertedRecord = { ...params, status: 'pending' };
    return { data: [{ reserved: true, current_count: reservedCount - 1 }], error: null };
  };
  supabaseAdmin.from = (table) => {
    if (table === 'listings') {
      const query = {
        select() { return this; },
        eq() { return this; },
        single: async () => ({ data: { id: propertyId, host_id: user.id, category: options.category || 'property' }, error: null }),
      };
      return query;
    }

    const query = {
      mode: null,
      filters: {},
      updateValues: null,
      select(_columns, selectOptions) {
        if (selectOptions && selectOptions.count === 'exact') this.mode = 'count';
        else if (!this.mode) this.mode = 'media';
        return this;
      },
      eq(column, value) { this.filters[column] = value; return this; },
      neq(column, value) { this.filters[`not:${column}`] = value; return this; },
      in() { return this; },
      is(column, value) { this.filters[column] = value; return this; },
      lte(column, value) { this.filters[`lte:${column}`] = value; return this; },
      insert(record) {
        insertedRecord = record;
        this.mode = 'insert';
        return this;
      },
      update(values) {
        this.mode = 'update';
        this.updateValues = values;
        return this;
      },
      single() {
        if (this.mode === 'insert') return Promise.resolve({ data: insertedRecord, error: null });
        if (this.mode === 'media') {
          const result = recordExists
            ? { data: { ...mediaRecord, status: recordStatus }, error: null }
            : { data: null, error: { code: 'PGRST116' } };
          if (options.deleteAfterLookup) recordExists = false;
          return Promise.resolve(result);
        }
        return Promise.resolve({
          data: { ...mediaRecord, status: recordStatus, duration_seconds: savedDuration },
          error: null,
        });
      },
      maybeSingle() {
        const currentRecord = { ...mediaRecord, status: recordStatus };
        const matches = Object.entries(this.filters).every(([column, value]) => {
          if (column.startsWith('not:')) return recordStatus !== value;
          if (column.startsWith('lte:')) return true;
          if (column === 'deleted_at') return value === null;
          return currentRecord[column] === value;
        });
        if (this.updateValues && this.updateValues.status === 'ready') {
          finalizationFilters = { ...this.filters };
        }
        if (this.mode !== 'update' || !recordExists || !matches) {
          return Promise.resolve({ data: null, error: null });
        }
        if (this.updateValues.status) recordStatus = this.updateValues.status;
        if (Object.prototype.hasOwnProperty.call(this.updateValues, 'duration_seconds')) {
          savedDuration = this.updateValues.duration_seconds;
        }
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

  mediaStorageService.generateR2ObjectKey = (_hostId, _propertyId, _mediaId, extension) =>
    `videos/test/original.${extension}`;
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
  mediaOptimizationService.optimizeStoredMediaObject = async () => {
    optimizationCalls++;
    if (options.optimizationDelay) await new Promise((resolve) => setTimeout(resolve, options.optimizationDelay));
    if (options.changeStateBeforeReady) recordStatus = options.changeStateBeforeReady;
    return { optimized: false, durationSeconds: options.actualDuration };
  };

  const app = express();
  app.use(express.json());
  app.use(videoRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    const send = async (path, body, method = 'POST') => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method,
        headers: {
          authorization: 'Bearer test-token',
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    await run({
      send,
      get insertedRecord() { return insertedRecord; },
      get recordStatus() { return recordStatus; },
      get savedDuration() { return savedDuration; },
      get optimizationCalls() { return optimizationCalls; },
      get finalizationFilters() { return finalizationFilters; },
    });
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

test('accepts WebM MIME and preserves its extension in upload initialization', async () => {
  assert.deepEqual(videoEntitlement.validateVideoFile('clip.webm', 'video/webm', 100), { valid: true });
  assert.equal(videoEntitlement.getFileExtension('clip.WEBM'), 'webm');
  await withServer({ count: 0 }, async (state) => {
    const response = await state.send(`/properties/${propertyId}/videos/upload-init`, {
      filename: 'clip.webm', mimeType: 'video/webm', fileSize: 100,
    });
    assert.equal(response.status, 200);
    assert.equal(state.insertedRecord.p_mime_type, 'video/webm');
    assert.equal(state.insertedRecord.p_storage_key.endsWith('.webm'), true);
  });
});

test('rejects unsupported video MIME types and keeps extension fallback safe', () => {
  assert.equal(videoEntitlement.validateVideoFile('clip.avi', 'video/x-msvideo', 100).valid, false);
  assert.equal(videoEntitlement.getFileExtension('clip.avi'), 'mp4');
});

test('failed rows do not consume quota while ready videos still do', async () => {
  const eligibleStatuses = ['pending', 'uploading', 'processing', 'ready'];
  assert.deepEqual(eligibleStatuses, ['pending', 'uploading', 'processing', 'ready']);
  // Count query explicitly filters to these quota-reserving lifecycle states;
  // failed/deleted rows are consequently excluded and ready rows retained.
  let filteredStatuses;
  const query = {
    select() { return this; }, eq() { return this; },
    in(_column, values) { filteredStatuses = values; return this; },
    is() { return this; }, then(resolve) { return Promise.resolve({ count: 1, error: null }).then(resolve); },
  };
  const count = await videoEntitlement.getPropertyVideoCount({ from: () => query }, propertyId);
  assert.equal(count, 1);
  assert.deepEqual(filteredStatuses, eligibleStatuses);
});

test('concurrent upload initialization cannot exceed the quota', async () => {
  await withServer({ count: videoEntitlement.VIDEO_MAX_COUNT_PER_PROPERTY - 1 }, async (state) => {
    const results = await Promise.all([initializeUpload(state.send), initializeUpload(state.send)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 403]);
  });
});

async function initializeUpload(send, durationSeconds) {
  return send(`/properties/${propertyId}/videos/upload-init`, initBody(durationSeconds));
}

async function completeUpload(send, durationSeconds, currentUploadId = uploadId, currentMediaId = mediaId) {
  return send(`/properties/${propertyId}/videos/${currentMediaId}/complete`, {
    uploadId: currentUploadId,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  });
}

test('allows initialization below the video-count limit', async () => {
  await withServer({ count: videoEntitlement.VIDEO_MAX_COUNT_PER_PROPERTY - 1 }, async (state) => {
    const response = await initializeUpload(state.send);
    assert.equal(response.status, 200);
    assert.equal(state.insertedRecord.status, 'pending');
  });

  test('video upload initialization and finalization retain the existing flow across listing niches', async (t) => {
    for (const category of ['property', 'shop', 'office', 'hotel', 'airbnb', 'venue']) {
      await t.test(category, async () => {
        await withServer({ category, count: 0, actualDuration: 3 }, async (state) => {
          const initialized = await initializeUpload(state.send);
          assert.equal(initialized.status, 200);
          const completed = await completeUpload(state.send, undefined, initialized.body.uploadId, initialized.body.mediaId);
          assert.equal(completed.status, 200);
          assert.equal(completed.body.status, 'ready');
        });
      });
    }
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
    const response = await completeUpload(state.send, 10, initialized.body.uploadId, initialized.body.mediaId);
    assert.equal(response.status, 400);
    assert.equal(state.recordStatus, 'failed');
    assert.notEqual(state.recordStatus, 'ready');
  });
});

test('rejects an over-limit probed duration when client duration is omitted', async () => {
  await withServer({ count: 0, actualDuration: videoEntitlement.VIDEO_MAX_DURATION_SECONDS + 1 }, async (state) => {
    const initialized = await initializeUpload(state.send);
    assert.equal(initialized.status, 200);
    const response = await completeUpload(state.send, undefined, initialized.body.uploadId, initialized.body.mediaId);
    assert.equal(response.status, 400);
    assert.equal(state.recordStatus, 'failed');
  });
});

test('successful completion records the probed duration', async () => {
  await withServer({ count: 0, actualDuration: 3 }, async (state) => {
    const initialized = await initializeUpload(state.send);
    assert.equal(initialized.status, 200);
    const response = await completeUpload(state.send, 2, initialized.body.uploadId, initialized.body.mediaId);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ready');
    assert.equal(state.recordStatus, 'ready');
    assert.equal(state.savedDuration, 3);
    assert.deepEqual(state.finalizationFilters, {
      id: initialized.body.mediaId,
      property_id: propertyId,
      host_id: user.id,
      upload_id: initialized.body.uploadId,
      media_type: 'video',
      status: 'processing',
      deleted_at: null,
    });
  });
});

test('completion conflicts if the media record disappears after its scoped lookup', async () => {
  await withServer({ deleteAfterLookup: true, actualDuration: 3 }, async (state) => {
    const response = await completeUpload(state.send);
    assert.equal(response.status, 409);
    assert.notEqual(state.recordStatus, 'ready');
    assert.equal(state.optimizationCalls, 0);
  });
});

test('completion rejects an upload ID that does not match its media record', async () => {
  await withServer({ recordUploadId: '55555555-5555-4555-8555-555555555555' }, async (server) => {
    const response = await completeUpload(server.send);
    assert.equal(response.status, 400);
    assert.equal(server.optimizationCalls, 0);
    assert.notEqual(server.recordStatus, 'ready');
  });
});

test('completion conflicts when another operation changes the lifecycle before the claim', async () => {
  await withServer({ changeStateAtClaim: 'failed', actualDuration: 3 }, async (state) => {
    const response = await completeUpload(state.send);
    assert.equal(response.status, 409);
    assert.equal(state.recordStatus, 'failed');
    assert.equal(state.optimizationCalls, 0);
  });
});

test('completion cannot overwrite a lifecycle change during processing', async () => {
  await withServer({ changeStateBeforeReady: 'failed', actualDuration: 3 }, async (state) => {
    const response = await completeUpload(state.send);
    assert.equal(response.status, 409);
    assert.equal(state.recordStatus, 'failed');
  });
});

test('concurrent completion requests claim and process a video only once', async () => {
  await withServer({ optimizationDelay: 20, actualDuration: 3 }, async (state) => {
    const results = await Promise.all([
      completeUpload(state.send),
      completeUpload(state.send),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(state.optimizationCalls, 1);
    assert.equal(state.recordStatus, 'ready');
  });
});

test('video deletion cannot remove an upload while finalization is processing', async () => {
  await withServer({ optimizationDelay: 50, actualDuration: 3 }, async (state) => {
    const completion = completeUpload(state.send);
    while (state.optimizationCalls === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    const deletion = await state.send(
      `/properties/${propertyId}/videos/${mediaId}`,
      undefined,
      'DELETE'
    );
    assert.equal(deletion.status, 409);
    assert.equal((await completion).status, 200);
    assert.equal(state.recordStatus, 'ready');
  });
});
