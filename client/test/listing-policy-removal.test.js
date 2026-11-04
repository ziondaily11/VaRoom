'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { removeCurrentPolicyDocument } = loadTs(path.join(__dirname, '..', 'lib', 'listWizard', 'policyDocuments.ts'));

const listingId = '11111111-1111-4111-8111-111111111111';
const token = 'owner-session-token';
const oldPolicy = { id: 'old-policy-id', documentType: 'property_policy', filename: 'policy.pdf', mimeType: 'application/pdf', fileSize: 128, downloadUrl: 'https://storage.example/current' };
const currentPolicy = { id: 'replacement-policy-id', documentType: 'property_policy', filename: 'replacement.pdf', mimeType: 'application/pdf', fileSize: 256, downloadUrl: 'https://storage.example/replacement' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json(){ return body; } });


test('removes only the currently attached policy through the authenticated delete API and clears form refs', async () => {
  const calls = [];
  const result = await removeCurrentPolicyDocument(listingId, token, async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'DELETE') return response(null, 204);
    return response({ documents: [oldPolicy] });
  });
  const state = result.formState;

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
  // The page keeps its state: the helper throws before returning anything.
  await assert.rejects(removeCurrentPolicyDocument(listingId, token, async (_url, options) => (
    options.method === 'DELETE'
      ? response({ error: 'Unable to remove this listing document' }, 500)
      : response({ documents: [oldPolicy] })
  )), /Unable to remove this listing document/);
});

test('reconciles a document already retired without deleting a replacement', async () => {
  const calls = [];
  const result = await removeCurrentPolicyDocument(listingId, token, async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'DELETE') return response({ error: 'Document not found' }, 404);
    return response({ documents: calls.filter((call) => !call.options.method).length === 1 ? [oldPolicy] : [currentPolicy] });
  });
  const state = result.formState;

  assert.equal(result.alreadyUnavailable, true);
  assert.deepEqual(calls.filter((call) => call.options.method === 'DELETE').map((call) => call.url), [`/api/listing-documents/${oldPolicy.id}`]);
  assert.deepEqual(state.documentRefs.map((item) => item.id), [currentPolicy.id]);
  assert.equal(state.existingPolicyUrl, currentPolicy.downloadUrl);
});

test('repeated Remove clicks are guarded and the edit form uses the authenticated deletion helper', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'pages', 'list.tsx'), 'utf8');
  const field = fs.readFileSync(path.join(__dirname, '..', 'components', 'listWizard', 'PolicyDocument.tsx'), 'utf8');
  assert.match(page, /if \(policyRemoving\) return;/);
  assert.match(field, /id="policy-remove-btn" disabled=\{removing\}/);
  assert.match(page, /await removeCurrentPolicyDocument\(policyListingId, await token\(\)\)/);
  assert.match(page, /property_policy: result\.formState\.documentRefs/);
});
