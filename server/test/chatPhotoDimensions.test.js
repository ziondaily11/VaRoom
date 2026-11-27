'use strict';

// A chat photo keeps its size (sent by the sender's browser at upload) so its
// bubble opens at that size; older photos get theirs from the backfill script.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const supabaseAdmin = require('../lib/supabaseClient');
const mediaStorageService = require('../lib/mediaStorageService');
const chatAttachmentRoutes = require('../routes/chatAttachmentRoutes');

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '33333333-3333-4333-8333-333333333333';

/** Calls upload-init with a fake database; returns the response and the inserted row. */
async function uploadInit(body) {
  const inserted = [];
  const query = (result) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result };
    return chain;
  };
  const restore = { from: supabaseAdmin.from, getUser: supabaseAdmin.auth.getUser, auth: mediaStorageService.generateR2UploadAuthorization };
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: userId } } });
  supabaseAdmin.from = (table) => {
    if (table === 'account_controls') return query({ data: null, error: null });
    if (table === 'conversations') return query({ data: { id: conversationId, host_id: userId, client_id: 'guest' }, error: null });
    if (table === 'message_attachments') return { insert: async (row) => { inserted.push(row); return { error: null }; } };
    throw new Error(`unexpected table ${table}`);
  };
  mediaStorageService.generateR2UploadAuthorization = async () => ({ uploadUrl: 'https://r2.example/put', expiresAt: 'later' });
  try {
    const layer = chatAttachmentRoutes.stack.find((l) => l.route && l.route.path.endsWith('/attachments/upload-init'));
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    await layer.route.stack[0].handle({ headers: { authorization: 'Bearer token' }, params: { conversationId }, body }, res);
    return { res, row: inserted[0] };
  } finally {
    supabaseAdmin.from = restore.from;
    supabaseAdmin.auth.getUser = restore.getUser;
    mediaStorageService.generateR2UploadAuthorization = restore.auth;
  }
}

const photo = { filename: 'IMG_1.jpg', mimeType: 'image/jpeg', fileSize: 2048, kind: 'photo' };

test('a photo is stored with its size; a file, or a photo without one, is stored without', async () => {
  const sized = await uploadInit({ ...photo, width: 1200, height: 1600 });
  assert.equal(sized.res.statusCode, 200);
  assert.equal(sized.row.width, 1200);
  assert.equal(sized.row.height, 1600);

  const unsized = await uploadInit(photo);
  assert.equal(unsized.res.statusCode, 200);
  assert.ok(!('width' in unsized.row) && !('height' in unsized.row), 'an older client sends none');

  const file = await uploadInit({ filename: 'lease.pdf', mimeType: 'application/pdf', fileSize: 10, kind: 'file', width: 5, height: 5 });
  assert.equal(file.res.statusCode, 200);
  assert.ok(!('width' in file.row), 'only photos have a size');
});

test('a size that is not a positive whole number is refused', async () => {
  for (const size of [{ width: 0, height: 10 }, { width: 10.5, height: 10 }, { width: '10', height: 10 }]) {
    const { res, row } = await uploadInit({ ...photo, ...size });
    assert.equal(res.statusCode, 400, JSON.stringify(size));
    assert.equal(row, undefined);
  }
});

test('threads and the send response return the size; the migration and backfill add it', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assert.equal((routes.match(/\.select\('id,original_filename,mime_type,file_size_bytes,kind,status,width,height'\)/g) || []).length, 2);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127_000085_chat_photo_dimensions.sql'), 'utf8');
  assert.match(migration, /add column if not exists width integer,\s*add column if not exists height integer;/);
  assert.match(migration, /check \(\(width is null or width > 0\) and \(height is null or height > 0\)\)/);
  const backfill = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'backfill-chat-photo-dimensions.js'), 'utf8');
  assert.match(backfill, /\.is\('width', null\)\.gt\('id', after\)/, 'pages by id, so photos it cannot read are not read again forever');
  assert.match(backfill, /\[5, 6, 7, 8\]\.includes\(metadata\.orientation\)/, 'rotated photos keep the size they show at');
});
