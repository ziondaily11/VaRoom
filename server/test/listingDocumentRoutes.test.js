'use strict';

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
const documentRoutes = require('../routes/listingDocumentRoutes');

const listingId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';

function makeQuery({ rows, table, onInsert, onUpdate }) {
  const filters = [];
  let operation = 'select';
  let values = null;
  const query = {
    select() { return this; },
    eq(column, value) { filters.push((row) => row[column] === value); return this; },
    neq(column, value) { filters.push((row) => row[column] !== value); return this; },
    is(column, value) { filters.push((row) => (row[column] === undefined ? null : row[column]) === value); return this; },
    in(column, valuesIn) { filters.push((row) => valuesIn.includes(row[column])); return this; },
    lte(column, value) { filters.push((row) => row[column] <= value); return this; },
    order() { return this; },
    limit() { return this; },
    insert(record) { operation = 'insert'; values = record; return this; },
    update(next) { operation = 'update'; values = next; return this; },
    delete() { operation = 'delete'; return this; },
    matching() { return rows.filter((row) => filters.every((filter) => filter(row))); },
    async maybeSingle() {
      const matched = this.matching();
      if (operation === 'update') {
        matched.forEach((row) => Object.assign(row, values));
        if (onUpdate) onUpdate(values, matched);
      }
      return { data: matched[0] ? structuredClone(matched[0]) : null, error: null };
    },
    async single() { return this.maybeSingle(); },
    then(resolve, reject) {
      if (operation === 'insert') {
        if (onInsert) onInsert(values);
        return Promise.resolve({ data: values, error: null }).then(resolve, reject);
      }
      if (operation === 'update') {
        const matched = this.matching();
        matched.forEach((row) => Object.assign(row, values));
        if (onUpdate) onUpdate(values, matched);
        return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
      }
      if (operation === 'delete') {
        const matched = new Set(this.matching());
        const retained = rows.filter((row) => !matched.has(row));
        rows.splice(0, rows.length, ...retained);
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: this.matching(), error: null }).then(resolve, reject);
    },
  };
  return query;
}

async function withDocumentServer({ category = 'property', publicationState = 'draft', seedDocuments = [] } = {}, run) {
  const saved = {
    from: supabaseAdmin.from,
    getUser: supabaseAdmin.auth.getUser,
    bucket: mediaStorageService.R2_BUCKET_NAME,
    environment: mediaStorageService.ENVIRONMENT,
    generateUpload: mediaStorageService.generateR2UploadAuthorization,
    metadata: mediaStorageService.getR2ObjectMetadata,
    download: mediaStorageService.downloadR2Object,
    copy: mediaStorageService.copyR2Object,
    delete: mediaStorageService.deleteR2Object,
    generateDownload: mediaStorageService.generateR2DownloadAuthorization,
  };
  const listings = [{ id: listingId, host_id: ownerId, category, publication_state: publicationState, moderation_status: 'active' }];
  const documents = structuredClone(seedDocuments);
  const objects = new Map();
  const deleted = [];
  mediaStorageService.R2_BUCKET_NAME = 'test-bucket';
  mediaStorageService.ENVIRONMENT = 'test';
  supabaseAdmin.auth.getUser = async (token) => ({
    data: { user: token === 'owner-token' ? { id: ownerId } : token === 'other-token' ? { id: otherId } : null },
    error: token === 'bad-token' ? new Error('invalid token') : null,
  });
  supabaseAdmin.from = (table) => {
    if (table === 'listings') return makeQuery({ rows: listings, table });
    if (table === 'listing_documents') return makeQuery({ rows: documents, table, onInsert: (record) => documents.push(record) });
    if (table === 'account_controls') return makeQuery({ rows: [], table });
    throw new Error(`Unexpected table: ${table}`);
  };
  mediaStorageService.generateR2UploadAuthorization = async (key, contentType, maxFileSize, expiry, expectedLength) => ({
    uploadUrl: 'https://r2.invalid/presigned-put', endpoint: 'https://r2.invalid', bucketName: 'test-bucket',
    objectKey: key, contentType, maxFileSize, expiresAt: new Date(Date.now() + expiry * 1000).toISOString(), expectedLength,
  });
  mediaStorageService.getR2ObjectMetadata = async (key) => {
    const item = objects.get(key);
    return item ? { exists: true, contentLength: item.bytes.length, contentType: item.contentType } : { exists: false, contentLength: 0, contentType: null };
  };
  mediaStorageService.downloadR2Object = async (key) => Buffer.from(objects.get(key).bytes);
  mediaStorageService.copyR2Object = async (source, destination) => {
    const item = objects.get(source);
    if (!item) throw new Error('source object missing');
    objects.set(destination, { bytes: Buffer.from(item.bytes), contentType: item.contentType });
    return { exists: true };
  };
  mediaStorageService.deleteR2Object = async (key) => { deleted.push(key); objects.delete(key); return { success: true }; };
  mediaStorageService.generateR2DownloadAuthorization = async (key, type, expiry, disposition) => ({
    url: `https://r2.invalid/signed/${encodeURIComponent(key)}?ttl=${expiry}&type=${encodeURIComponent(type)}&disposition=${encodeURIComponent(disposition || '')}`,
  });

  const app = express();
  app.use(express.json());
  app.use(documentRoutes);
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
      redirect: 'manual',
    });
    return { response, body: response.status === 204 ? null : await response.json().catch(() => ({})) };
  };
  try {
    await run({ send, listings, documents, objects, deleted });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    supabaseAdmin.from = saved.from;
    supabaseAdmin.auth.getUser = saved.getUser;
    mediaStorageService.generateR2UploadAuthorization = saved.generateUpload;
    mediaStorageService.getR2ObjectMetadata = saved.metadata;
    mediaStorageService.downloadR2Object = saved.download;
    mediaStorageService.copyR2Object = saved.copy;
    mediaStorageService.deleteR2Object = saved.delete;
    mediaStorageService.generateR2DownloadAuthorization = saved.generateDownload;
    // Exported constants are assigned at module load, so these remain the
    // environment-configured values used by the other test files.
    mediaStorageService.R2_BUCKET_NAME = saved.bucket;
    mediaStorageService.ENVIRONMENT = saved.environment;
  }
}

const pdfBytes = Buffer.from('%PDF-1.7\nVaRoom listing document\n%%EOF');

async function uploadAndComplete(state, { documentType, filename = 'support.pdf', mimeType = 'application/pdf', bytes = pdfBytes }) {
  const initialized = await state.send('/listing-documents/upload-init', {
    method: 'POST', body: { listingId, documentType, filename, mimeType, fileSize: bytes.length },
  });
  assert.equal(initialized.response.status, 201);
  const row = state.documents.find((item) => item.id === initialized.body.document.id);
  assert.equal(initialized.body.upload.expectedLength, bytes.length);
  assert.match(row.storage_key, /\/incoming\./);
  state.objects.set(row.storage_key, { bytes: Buffer.from(bytes), contentType: mimeType });
  const completed = await state.send(`/listing-documents/${row.id}/complete`, { method: 'POST' });
  return { initialized, row, completed };
}

test('accepts and verifies a PDF for a Property listing before persisting its immutable R2 reference', async () => {
  await withDocumentServer({ category: 'property' }, async (state) => {
    const { row, completed } = await uploadAndComplete(state, { documentType: 'property_policy' });
    assert.equal(completed.response.status, 200);
    assert.equal(row.status, 'ready');
    assert.match(row.storage_key, /\/verified\.pdf$/);
    assert.equal(row.sha256, require('crypto').createHash('sha256').update(pdfBytes).digest('hex'));
    assert.equal(state.objects.get(row.storage_key).bytes.equals(pdfBytes), true);
    assert.equal(state.objects.has(row.storage_key.replace('/verified.', '/incoming.')), false);
  });
});

test('accepts an Office or Shop PDF and preserves common supported image uploads', async (t) => {
  for (const category of ['office', 'shop']) {
    await t.test(`${category} PDF`, async () => {
      await withDocumentServer({ category }, async (state) => {
        const { completed, row } = await uploadAndComplete(state, { documentType: 'floor_plan' });
        assert.equal(completed.response.status, 200);
        assert.equal(row.status, 'ready');
      });
    });
  }
  await withDocumentServer({ category: 'office' }, async (state) => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const { completed, row } = await uploadAndComplete(state, {
      documentType: 'floor_plan', filename: 'floor-plan.png', mimeType: 'image/png', bytes: png,
    });
    assert.equal(completed.response.status, 200);
    assert.equal(row.status, 'ready');
  });
});

test('rejects mismatched type claims and malicious bytes, then retires the failed upload', async () => {
  await withDocumentServer({ category: 'property' }, async (state) => {
    const mismatch = await state.send('/listing-documents/upload-init', {
      method: 'POST', body: { listingId, documentType: 'property_policy', filename: 'policy.png', mimeType: 'application/pdf', fileSize: pdfBytes.length },
    });
    assert.equal(mismatch.response.status, 400);
    const malicious = Buffer.from('MZ executable, not a PDF');
    const { row, completed } = await uploadAndComplete(state, { documentType: 'property_policy', bytes: malicious });
    assert.equal(completed.response.status, 422);
    assert.equal(row.status, 'failed');
    assert.equal(state.objects.has(row.storage_key), false);
  });
});

test('requires the authenticated host to own the listing before issuing an upload URL', async () => {
  await withDocumentServer({ category: 'office' }, async (state) => {
    state.listings[0].host_id = otherId;
    const response = await state.send('/listing-documents/upload-init', {
      method: 'POST', token: 'owner-token',
      body: { listingId, documentType: 'floor_plan', filename: 'plan.pdf', mimeType: 'application/pdf', fileSize: pdfBytes.length },
    });
    assert.equal(response.response.status, 404);
    assert.equal(state.documents.length, 0);
  });
});

test('ownership documents remain host-only while public listing documents can be retrieved', async () => {
  const seedDocuments = [
    { id: '44444444-4444-4444-8444-444444444444', listing_id: listingId, host_id: ownerId, document_type: 'floor_plan', storage_provider: 'r2', storage_bucket: 'test-bucket', storage_key: 'listing-documents/test/floor-plan/verified.pdf', original_filename: 'plan.pdf', mime_type: 'application/pdf', file_size_bytes: pdfBytes.length, status: 'ready', visibility: 'listing', deleted_at: null },
    { id: '55555555-5555-4555-8555-555555555555', listing_id: listingId, host_id: ownerId, document_type: 'ownership_management', storage_provider: 'r2', storage_bucket: 'test-bucket', storage_key: 'listing-documents/test/ownership/verified.pdf', original_filename: 'ownership.pdf', mime_type: 'application/pdf', file_size_bytes: pdfBytes.length, status: 'ready', visibility: 'host_only', deleted_at: null },
  ];
  await withDocumentServer({ category: 'office', publicationState: 'published', seedDocuments }, async (state) => {
    const publicList = await state.send(`/listings/${listingId}/documents`, { token: null });
    assert.equal(publicList.response.status, 200);
    assert.deepEqual(publicList.body.documents.map((item) => item.documentType), ['floor_plan']);
    assert.match(publicList.body.documents[0].downloadUrl, /disposition=attachment/);
    assert.equal(publicList.body.documents[0].previewUrl, undefined);
    const publicPreview = await state.send('/listing-documents/44444444-4444-4444-8444-444444444444/preview', { token: null });
    assert.equal(publicPreview.response.status, 302);
    assert.match(publicPreview.response.headers.get('location'), /disposition=inline/);
    assert.match(publicPreview.response.headers.get('location'), /type=application%2Fpdf/);
    assert.equal(publicPreview.response.headers.get('cache-control'), 'private, no-store');
    assert.equal(publicPreview.response.headers.get('referrer-policy'), 'no-referrer');

    const privateDownload = await state.send('/listing-documents/55555555-5555-4555-8555-555555555555/download', { token: 'other-token' });
    assert.equal(privateDownload.response.status, 404);
    const privatePreview = await state.send('/listing-documents/55555555-5555-4555-8555-555555555555/preview', { token: 'other-token' });
    assert.equal(privatePreview.response.status, 404);
    const ownerList = await state.send(`/listings/${listingId}/documents`);
    assert.equal(ownerList.body.documents.length, 2);
    assert.match(ownerList.body.documents[0].downloadUrl, /ttl=300/);
    const ownerPreview = await state.send('/listing-documents/55555555-5555-4555-8555-555555555555/preview');
    assert.equal(ownerPreview.response.status, 302);
    assert.match(ownerPreview.response.headers.get('location'), /disposition=inline/);
  });
});

test('rejects document access to drafts and does not allow one host to delete another host document', async () => {
  const seedDocuments = [{
    id: '66666666-6666-4666-8666-666666666666', listing_id: listingId, host_id: ownerId,
    document_type: 'property_policy', storage_provider: 'r2', storage_bucket: 'test-bucket',
    storage_key: 'listing-documents/test/private/verified.pdf', original_filename: 'policy.pdf',
    mime_type: 'application/pdf', file_size_bytes: pdfBytes.length, status: 'ready', visibility: 'listing', deleted_at: null,
  }];
  await withDocumentServer({ category: 'property', publicationState: 'draft', seedDocuments }, async (state) => {
    const response = await state.send(`/listings/${listingId}/documents`, { token: null });
    assert.equal(response.response.status, 404);
    const preview = await state.send('/listing-documents/66666666-6666-4666-8666-666666666666/preview', { token: null });
    assert.equal(preview.response.status, 404);
    const deletion = await state.send('/listing-documents/66666666-6666-4666-8666-666666666666', { token: 'other-token', method: 'DELETE' });
    assert.equal(deletion.response.status, 404);
    assert.equal(state.documents[0].status, 'ready');
  });
});
