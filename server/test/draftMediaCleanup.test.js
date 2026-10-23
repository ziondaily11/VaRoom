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
const { cleanupExpiredDraftMedia } = require('../lib/videoCleanup');

const listingId = '11111111-1111-4111-8111-111111111111';

async function withCleanupMocks({ failDelete = false } = {}, run) {
  const originalRpc = supabaseAdmin.rpc;
  const originalFrom = supabaseAdmin.from;
  const originalList = mediaStorageService.listR2Objects;
  const originalDelete = mediaStorageService.deleteR2Objects;
  const rpcCalls = [];
  const removed = [];
  const documentRows = [{
    listing_id: listingId,
    storage_provider: 'r2',
    storage_bucket: 'listing-documents',
    storage_key: 'listing-documents/development/host/listing/document/verified.pdf',
    status: 'ready',
  }];
  supabaseAdmin.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'claim_draft_media_cleanup') {
      return {
        data: [{
          listing_id: listingId,
          host_id: '22222222-2222-4222-8222-222222222222',
          attempts: 1,
          objects: {
            photos: ['drafts/photos/development/host/listing/photo/original.jpg'],
            media: [{
              storage_provider: 'r2',
              storage_key: 'drafts/videos/production/host/listing/media/original.mp4',
              thumbnail_key: 'drafts/videos/production/host/listing/media/thumbnail.jpg',
            }],
            uploads: [],
          },
        }],
        error: null,
      };
    }
    if (name === 'finish_draft_media_cleanup') return { data: true, error: null };
    if (name === 'retry_draft_media_cleanup') return { data: null, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  };
  supabaseAdmin.from = (table) => {
    if (table !== 'listing_documents') throw new Error(`Unexpected table: ${table}`);
    const filters = [];
    let update = null;
    const query = {
      select() { return this; },
      update(value) { update = value; return this; },
      eq(column, value) { filters.push((row) => row[column] === value); return this; },
      then(resolve, reject) {
        const matched = documentRows.filter((row) => filters.every((filter) => filter(row)));
        if (update) matched.forEach((row) => Object.assign(row, update));
        return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  mediaStorageService.listR2Objects = async (prefix) => [
    `${prefix}orphaned-thumbnail.jpg`,
  ];
  mediaStorageService.deleteR2Objects = async (keys) => {
    if (failDelete) throw new Error('R2 unavailable');
    removed.push(...keys);
  };
  try {
    await run({ rpcCalls, removed, documentRows });
  } finally {
    supabaseAdmin.rpc = originalRpc;
    supabaseAdmin.from = originalFrom;
    mediaStorageService.listR2Objects = originalList;
    mediaStorageService.deleteR2Objects = originalDelete;
  }
}

test('claims bounded cleanup jobs and removes referenced media, documents, and orphaned draft-prefix objects idempotently', async () => {
  await withCleanupMocks({}, async ({ rpcCalls, removed, documentRows }) => {
    const result = await cleanupExpiredDraftMedia();
    assert.deepEqual(result, { claimed: 1, completed: 1, retried: 0 });
    assert.equal(rpcCalls[0].name, 'claim_draft_media_cleanup');
    assert.equal(rpcCalls[0].args.p_batch_size, 25);
    assert.equal(rpcCalls.some((call) => call.name === 'finish_draft_media_cleanup'), true);
    assert.equal(removed.length, 6);
    assert.equal(removed.some((key) => key.includes('orphaned-thumbnail.jpg')), true);
    assert.equal(removed.some((key) => key.endsWith('/verified.pdf')), true);
    assert.equal(documentRows[0].status, 'deleted');
  });
});

test('records failures for durable retry and does not finalize failed object deletion', async () => {
  await withCleanupMocks({ failDelete: true }, async ({ rpcCalls, documentRows }) => {
    const result = await cleanupExpiredDraftMedia();
    assert.deepEqual(result, { claimed: 1, completed: 0, retried: 1 });
    assert.equal(rpcCalls.some((call) => call.name === 'retry_draft_media_cleanup'), true);
    assert.equal(rpcCalls.some((call) => call.name === 'finish_draft_media_cleanup'), false);
    assert.equal(documentRows[0].status, 'ready');
  });
});
