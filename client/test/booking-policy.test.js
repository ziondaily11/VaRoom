'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const { listingPolicy, commercialDocuments } = loadTs(path.join(__dirname, '..', 'lib', 'booking', 'bookingPolicy.ts'));

const document = (documentType, overrides = {}) => Object.assign({
  id: '99999999-9999-4999-8999-999999999999',
  documentType,
  filename: 'policy.pdf',
  mimeType: 'application/pdf',
  downloadUrl: 'https://storage.example/signed-policy'
}, overrides);

test('unrelated short-stay cancellation policy is not mislabeled as a residential property policy', () => {
  const policy = listingPolicy('property', { cancellation_policy: 'moderate' }, [], true);
  assert.deepEqual(policy.rows, []);
  assert.equal(policy.empty, 'No property policies provided.');
});

test('residential property policy document is recognized and opens through the preview route', () => {
  const policy = listingPolicy('property', {}, [document('property_policy')], true);
  assert.equal(policy.document.filename, 'policy.pdf');
  assert.equal(policy.document.openUrl, '/api/listing-documents/99999999-9999-4999-8999-999999999999/preview');
  assert.equal(policy.empty, null);
});

test('office rules and document display together, with an explicit download', () => {
  const policy = listingPolicy('office', { office_shop_details: { rules: { subletting: 'not_allowed' } } }, [document('commercial_policy')], true);
  assert.deepEqual(policy.rows, [{ label: 'Subletting or assignment', value: 'Not allowed' }]);
  assert.match(policy.document.openUrl, /^\/api\/listing-documents\/[^/]+\/preview$/);
  assert.equal(policy.document.downloadUrl, '/api/listing-documents/99999999-9999-4999-8999-999999999999/download');
});

test('policy image documents open through the same-origin preview route and retain downloads', () => {
  const policy = listingPolicy('property', {}, [document('property_policy', { id: 'abc123', filename: 'house-rules.png', mimeType: 'image/png' })], true);
  assert.equal(policy.document.openUrl, '/api/listing-documents/abc123/preview');
  assert.equal(policy.document.downloadUrl, '/api/listing-documents/abc123/download');
});

test('unsupported policy types omit the preview route and keep the authorized download', () => {
  const policy = listingPolicy('property', {}, [document('property_policy', {
    filename: 'policy.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })], true);
  assert.equal(policy.document.openUrl, null, 'shown as "Preview unavailable"');
  assert.equal(policy.document.downloadUrl, '/api/listing-documents/99999999-9999-4999-8999-999999999999/download');
});

test('office and shop structured rules display as policy rows', () => {
  const policy = listingPolicy('office', { office_shop_details: { rules: {
    fitout: 'landlord_consent', subletting: 'not_allowed', noise_limits: 'Quiet after 6pm',
    permitted_uses: ['office_or_professional', 'fashion']
  } } }, [], true);
  assert.deepEqual(policy.rows.map((row) => row.value), ['Allowed with landlord consent', 'Not allowed', 'Quiet after 6pm', 'Office or professional, Fashion']);
  assert.equal(policy.empty, null);
});

test('office/shop policy rows stay in the booking card; the main column has no duplicate rules', () => {
  const policy = listingPolicy('office', { office_shop_details: { rules: {
    fitout: 'allowed', subletting: 'not_allowed', restoration: 'tenant_must_restore', permitted_uses: ['office_or_professional']
  } } }, [], true);
  assert.deepEqual(policy.rows.map((row) => row.label), ['Fit-out or renovation', 'Subletting or assignment', 'Restoration on exit', 'Permitted business uses']);
  const sections = fs.readFileSync(path.join(__dirname, '..', 'components', 'booking', 'CommercialSections.tsx'), 'utf8');
  assert.doesNotMatch(sections, /commercial-rules-heading|Please confirm licences, zoning/);
  for (const title of ['Amenities and building services', 'Pricing and costs', 'Lease and availability']) assert.match(sections, new RegExp(title));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'components', 'booking', 'ListingDetails.tsx'), 'utf8'), /What guests say/);
});

test('office/shop commercial policy document is recognized', () => {
  for (const category of ['office', 'shop']) {
    const policy = listingPolicy(category, {}, [document('commercial_policy')], true);
    assert.equal(policy.document.filename, 'policy.pdf');
    assert.equal(policy.empty, null);
  }
});

test('office/shop supporting documents, excluding policy duplicates', () => {
  const documents = commercialDocuments('office', [
    document('floor_plan', { filename: 'floor-plan.pdf' }),
    document('commercial_policy', { filename: 'rules.pdf' }),
    document('ownership_management', { filename: 'ownership.pdf' })
  ]);
  assert.deepEqual(documents.map((item) => [item.label, item.filename]), [['Floor plan', 'floor-plan.pdf'], ['Ownership and management', 'ownership.pdf']]);
  assert.deepEqual(commercialDocuments('property', [document('floor_plan')]), []);
});

test('genuinely empty listing shows the no-policy fallback after a successful lookup', () => {
  assert.equal(listingPolicy('property', {}, [], true).empty, 'No property policies provided.');
  assert.equal(listingPolicy('airbnb', {}, [], true), null, 'other categories show no policy section');
});

test('malformed policy metadata is ignored and a lookup failure is not reported as no policy', () => {
  const policy = listingPolicy('property', { office_shop_details: 'invalid', cancellation_policy: { value: 'strict' } }, [
    null, {}, document('property_policy', { downloadUrl: 'javascript:alert(1)' })
  ], false);
  assert.equal(policy.empty, 'Policy information is temporarily unavailable.');
  assert.equal(policy.document, null);
});

test('policy display keeps document authorization delegated to the existing endpoint', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'routes', 'listingDocumentRoutes.js'), 'utf8');
  assert.match(route, /if \(!owner && !publicListing\(listing\)\) return res\.status\(404\)/);
  assert.match(route, /if \(!owner\) query = query\.eq\('visibility', 'listing'\)/);
  assert.match(route, /documentTypeMatchesCategory\(item\.document_type, listing\.category\)/);
});
