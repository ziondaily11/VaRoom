'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildListingPolicyHtml, buildListingDocumentsHtml } = require('../public/js/booking-policy.js');

const document = (documentType, overrides = {}) => Object.assign({
  id: '99999999-9999-4999-8999-999999999999',
  documentType,
  filename: 'policy.pdf',
  mimeType: 'application/pdf',
  downloadUrl: 'https://storage.example/signed-policy'
}, overrides);

test('unrelated short-stay cancellation policy is not mislabeled as a residential property policy', () => {
  const html = buildListingPolicyHtml('property', { cancellation_policy: 'moderate' }, [], true);
  assert.doesNotMatch(html, /Cancellation policy/);
  assert.match(html, /No property policies provided/);
});

test('residential property policy document is recognized', () => {
  const html = buildListingPolicyHtml('property', {}, [document('property_policy')], true);
  assert.match(html, /policy\.pdf/);
  assert.match(html, /\/api\/listing-documents\/99999999-9999-4999-8999-999999999999\/preview/);
  assert.doesNotMatch(html, /No property policies provided/);
});

test('office rules and document display together without duplicating the document', () => {
  const details = { office_shop_details: { rules: { subletting: 'not_allowed' } } };
  const html = buildListingPolicyHtml('office', details, [document('commercial_policy')], true);
  assert.match(html, /Not allowed/);
  assert.match(html, /policy\.pdf/);
  assert.match(html, /href="\/api\/listing-documents\/[^\"]+\/preview" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Download document/);
  assert.equal((html.match(/Open document in new tab/g) || []).length, 1);
});

test('policy image documents open through the same-origin preview route and retain explicit downloads', () => {
  const imageDoc = document('property_policy', {
    id: 'abc123', filename: 'house-rules.png', mimeType: 'image/png'
  });
  const html = buildListingPolicyHtml('property', {}, [imageDoc], true);
  assert.match(html, /href="\/api\/listing-documents\/abc123\/preview"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /Download document/);
});

test('unsupported policy types omit the preview route and retain an explicit authorized download action', () => {
  const html = buildListingPolicyHtml('property', {}, [document('property_policy', {
    filename: 'policy.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })], true);
  assert.doesNotMatch(html, /\/preview"/);
  assert.match(html, /Preview unavailable/);
  assert.match(html, /href="\/api\/listing-documents\/99999999-9999-4999-8999-999999999999\/download"[^>]*>Download document/);
});

test('office and shop structured rules display as policy rows', () => {
  const details = { office_shop_details: { rules: {
    fitout: 'landlord_consent', subletting: 'not_allowed', noise_limits: 'Quiet after 6pm',
    permitted_uses: ['office_or_professional', 'fashion']
  } } };
  const html = buildListingPolicyHtml('office', details, [], true);
  assert.match(html, /Allowed with landlord consent/);
  assert.match(html, /Not allowed/);
  assert.match(html, /Quiet after 6pm/);
  assert.match(html, /Office or professional, Fashion/);
  assert.doesNotMatch(html, /No property policies provided/);
});

test('office/shop commercial policy document is recognized', () => {
  for (const category of ['office', 'shop']) {
    const html = buildListingPolicyHtml(category, {}, [document('commercial_policy')], true);
    assert.match(html, /policy\.pdf/);
    assert.doesNotMatch(html, /No property policies provided/);
  }
});

test('office/shop supporting documents render in the booking-card documents section, excluding policy duplicates', () => {
  const html = buildListingDocumentsHtml('office', [
    document('floor_plan', { filename: 'floor-plan.pdf' }),
    document('commercial_policy', { filename: 'rules.pdf' }),
    document('ownership_management', { filename: 'ownership.pdf' })
  ]);
  assert.match(html, /Documents/);
  assert.match(html, /floor-plan\.pdf/);
  assert.match(html, /ownership\.pdf/);
  assert.doesNotMatch(html, /rules\.pdf/);
  assert.equal((html.match(/property-policy-link/g) || []).length, 2);
  assert.equal(buildListingDocumentsHtml('property', [document('floor_plan')]), '');
});

test('genuinely empty listing shows the no-policy fallback after successful lookup', () => {
  const html = buildListingPolicyHtml('property', {}, [], true);
  assert.match(html, /No property policies provided/);
});

test('malformed policy metadata is ignored and lookup failure is not reported as no policy', () => {
  const html = buildListingPolicyHtml('property', { office_shop_details: 'invalid', cancellation_policy: { value: 'strict' } }, [
    null, {}, document('property_policy', { downloadUrl: 'javascript:alert(1)' })
  ], false);
  assert.match(html, /Policy information is temporarily unavailable/);
  assert.doesNotMatch(html, /No property policies provided/);
  assert.doesNotMatch(html, /javascript:/);
});

test('policy display keeps document authorization delegated to the existing endpoint', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'routes', 'listingDocumentRoutes.js'), 'utf8');
  assert.match(route, /if \(!owner && !publicListing\(listing\)\) return res\.status\(404\)/);
  assert.match(route, /if \(!owner\) query = query\.eq\('visibility', 'listing'\)/);
  assert.match(route, /documentTypeMatchesCategory\(item\.document_type, listing\.category\)/);
});
