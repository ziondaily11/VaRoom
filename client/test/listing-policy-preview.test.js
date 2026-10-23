'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveCurrentPolicyPreview } = require('../public/js/listing-policy-preview.js');
const listingPage = fs.readFileSync(path.join(__dirname, '..', 'legacy-pages', 'list.html'), 'utf8');

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
  assert.match(listingPage, /VaRoomListingPolicyPreview\.resolveCurrentPolicyPreview\(editListingId, session && session\.access_token\)/);
  assert.match(listingPage, /This document is no longer available\. Please refresh the listing and try again\./);
  assert.doesNotMatch(listingPage, /const url = selectedPolicyFile \? URL\.createObjectURL\(selectedPolicyFile\) : existingPolicyUrl/);
});
