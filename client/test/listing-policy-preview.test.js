'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { resolveCurrentPolicyPreview } = loadTs(path.join(__dirname, '..', 'lib', 'listWizard', 'policyDocuments.ts'));
// The listing wizard (legacy list.html is retired).
const listingPage = fs.readFileSync(path.join(__dirname, '..', 'pages', 'list.tsx'), 'utf8');
const policyComponent = fs.readFileSync(path.join(__dirname, '..', 'components', 'listWizard', 'PolicyDocument.tsx'), 'utf8');

const listingId = '11111111-1111-4111-8111-111111111111';
const accessToken = 'host-session-token';

function jsonResponse(body, status = 200){
  return { ok: status >= 200 && status < 300, async json(){ return body; } };
}

test('refreshes an expired policy URL with a fresh authorized listing-document response', async () => {
  const issuedUrls = ['https://storage.example/signed-old', 'https://storage.example/signed-fresh'];
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({ documents: [{ documentType: 'property_policy', filename: 'policy.pdf', downloadUrl: issuedUrls[requests.length - 1] }] });
  };

  const first = await resolveCurrentPolicyPreview(listingId, accessToken, fetchImpl);
  const refreshed = await resolveCurrentPolicyPreview(listingId, accessToken, fetchImpl);

  assert.equal(first.url, issuedUrls[0]);
  assert.equal(refreshed.url, issuedUrls[1]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, `/api/listings/${listingId}/documents`);
  assert.equal(requests[1].options.headers.Authorization, `Bearer ${accessToken}`);
  assert.equal(requests[1].options.cache, 'no-store');
});

test('uses the replacement currently attached to the listing instead of the initially loaded document', async () => {
  const fetchImpl = async () => jsonResponse({ documents: [
    { id: 'retired-policy', documentType: 'property_policy', filename: 'old.pdf', downloadUrl: 'https://storage.example/old-retired' },
    { id: 'current-policy', documentType: 'property_policy', filename: 'new.pdf', downloadUrl: 'https://storage.example/new-current' },
  ] });

  const current = await resolveCurrentPolicyPreview(listingId, accessToken, fetchImpl);

  assert.deepEqual(current, { url: 'https://storage.example/new-current', filename: 'new.pdf' });
});

test('reports an unavailable policy when it was removed or the request fails', async () => {
  await assert.rejects(
    resolveCurrentPolicyPreview(listingId, accessToken, async () => jsonResponse({ documents: [] })),
    /document is no longer available/i,
  );
  await assert.rejects(
    resolveCurrentPolicyPreview(listingId, accessToken, async () => jsonResponse({ error: 'Listing documents not found' }, 404)),
    /Listing documents not found/,
  );
  await assert.rejects(
    resolveCurrentPolicyPreview(listingId, accessToken, async () => { throw new Error('network down'); }),
    /network down/,
  );
});

test('the existing policy Preview button resolves a fresh URL and shows unavailable feedback on failure', () => {
  assert.match(listingPage, /await resolveCurrentPolicyPreview\(policyListingId, await token\(\)\)/);
  assert.match(listingPage, /setPolicyPreview\(\{ filename: 'Document unavailable', src: null \}\)/);
  assert.match(policyComponent, /This document is no longer available\. Please refresh the listing and try again\./);
  // The unavailable page and a document are never set together, so a later preview is not hidden behind it.
  assert.match(policyComponent, /srcDoc=\{preview && !preview\.src \? UNAVAILABLE_DOCUMENT_PAGE : undefined\}/);
  assert.doesNotMatch(listingPage, /URL\.createObjectURL\(policyFile\) : existingPolicyUrl/);
});
