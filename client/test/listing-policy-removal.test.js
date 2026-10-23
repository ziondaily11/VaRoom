'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { removeCurrentPolicyDocument } = require('../public/js/listing-policy-removal.js');

const listingId = '11111111-1111-4111-8111-111111111111';
const token = 'owner-session-token';
const oldPolicy = { id: 'old-policy-id', documentType: 'property_policy', filename: 'policy.pdf', mimeType: 'application/pdf', fileSize: 128, downloadUrl: 'https://storage.example/current' };
const currentPolicy = { id: 'replacement-policy-id', documentType: 'property_policy', filename: 'replacement.pdf', mimeType: 'application/pdf', fileSize: 256, downloadUrl: 'https://storage.example/replacement' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json(){ return body; } });

function existingFormState(){
  return {
    documentRefs: [{ id: oldPolicy.id, documentType: 'property_policy', filename: oldPolicy.filename }],
    existingPolicyUrl: 'https://expired.example/old-policy',
  };
}

test('removes only the currently attached policy through the authenticated delete API and clears form refs', async () => {
  const calls = [];
  const state = existingFormState();
  const result = await removeCurrentPolicyDocument(listingId, token, async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'DELETE') return response(null, 204);
    return response({ documents: [oldPolicy] });
  }, state);

  assert.equal(result.removed, true);
  assert.deepEqual(calls.map((call) => call.options.method || 'GET'), ['GET', 'DELETE']);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[1].url, `/api/listing-documents/${oldPolicy.id}`);
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(state.documentRefs, []);
  assert.equal(state.existingPolicyUrl, null);
  assert.equal(state.visible, false);
});

test('preserves the current form state when the delete request fails', async () => {
  const state = existingFormState();
  const before = structuredClone(state);
  await assert.rejects(removeCurrentPolicyDocument(listingId, token, async (_url, options) => (
    options.method === 'DELETE'
      ? response({ error: 'Unable to remove this listing document' }, 500)
      : response({ documents: [oldPolicy] })
  ), state), /Unable to remove this listing document/);
  assert.deepEqual(state, before);
});

test('reconciles a document already retired without deleting a replacement', async () => {
  const calls = [];
  const state = existingFormState();
  const result = await removeCurrentPolicyDocument(listingId, token, async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'DELETE') return response({ error: 'Document not found' }, 404);
    return response({ documents: calls.filter((call) => !call.options.method).length === 1 ? [oldPolicy] : [currentPolicy] });
  }, state);

  assert.equal(result.alreadyUnavailable, true);
  assert.deepEqual(calls.filter((call) => call.options.method === 'DELETE').map((call) => call.url), [`/api/listing-documents/${oldPolicy.id}`]);
  assert.deepEqual(state.documentRefs.map((item) => item.id), [currentPolicy.id]);
  assert.equal(state.existingPolicyUrl, currentPolicy.downloadUrl);
});

test('repeated Remove clicks are guarded and the edit form uses the authenticated deletion helper', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'legacy-pages', 'list.html'), 'utf8');
  assert.match(page, /if \(policyRemoveInProgress\) return;/);
  assert.match(page, /policyRemoveBtn\.disabled = true/);
  assert.match(page, /PolicyRemoval\.removeCurrentPolicyDocument\(/);
  assert.match(page, /const state = result\.formState/);
  assert.match(page, /listingUploadedDocumentRefs\.property_policy = state\.documentRefs/);
});
