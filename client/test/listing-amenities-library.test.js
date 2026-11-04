const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

// The listing wizard's amenities (legacy list.html is retired; the library's
// own behaviour is covered in list-wizard-amenities.test.js).
const client = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(client, file), 'utf8');
const amenities = loadTs(path.join(client, 'lib', 'listWizard', 'amenities.ts'));
const library = read('components/listWizard/AmenitiesLibrary.tsx');
const page = read('pages/list.tsx');
const publish = read('lib/listWizard/publish.ts');
const policyField = read('components/listWizard/PolicyDocument.tsx');

test('listing amenities library is shared, searchable, and multi-select', () => {
  assert.match(library, /id="amenities-library-open"/);
  assert.match(library, /id="amenities-library-overlay"/);
  assert.match(library, /role="dialog"[^>]*aria-modal="true"|aria-modal="true"[^>]*role="dialog"/);
  assert.match(library, /id="amenities-library-search"/);
  assert.equal(amenities.LIBRARY_AMENITY_CATEGORIES[0], 'All');
  const options = amenities.libraryOptionsFor('airbnb');
  assert.ok(amenities.filterLibraryOptions(options, 'All', 'wi').some((option) => /wi/i.test(option.label + option.key)));
  // Toggling flips one key and keeps the others.
  let selected = amenities.setAmenityChecked([], 'wifi', true);
  selected = amenities.setAmenityChecked(selected, 'parking', true);
  selected = amenities.setAmenityChecked(selected, 'wifi', false);
  assert.deepEqual(amenities.selectedAmenityKeys('airbnb', selected), ['parking']);
  assert.match(publish, /amenities: selectedAmenityKeys\(category, form\.amenities\)/);
  for (const niche of ['airbnb', 'hotel', 'property']) assert.equal(amenities.isAmenityLibraryNiche(niche), true, niche);
  for (const niche of ['venue', 'office', 'shop']) assert.equal(amenities.isAmenityLibraryNiche(niche), false, niche);
});

test('Airbnb, hotel, and residential listings keep separate amenity catalogs', () => {
  assert.equal(amenities.amenityOptionsFor('hotel'), amenities.HOTEL_AMENITY_OPTIONS);
  assert.equal(amenities.amenityOptionsFor('property'), amenities.PROPERTY_AMENITY_OPTIONS);
  assert.equal(amenities.amenityOptionsFor('airbnb'), amenities.AMENITY_OPTIONS);
  assert.notDeepEqual(amenities.HOTEL_AMENITY_OPTIONS.map((option) => option[0]), amenities.AMENITY_OPTIONS.map((option) => option[0]));
  // The review names the category's own amenities.
  assert.match(page, /amenityOptionsFor\(category\)\.filter\(\(option\) => selected\.includes\(option\[0\]\)\)/);
});

test('property policy documents remain optional and visible only for residential property listings', () => {
  assert.match(page, /<PolicyField hidden=\{category !== 'property'\}/);
  assert.match(policyField, /id="property-policy-section" hidden=\{hidden\}/);
  assert.match(policyField, /id="policy-input"\s+accept="application\/pdf,image\/jpeg,image\/png,image\/webp,image\/gif,\.pdf,\.jpg,\.jpeg,\.png,\.webp,\.gif"/);
  assert.match(page, /if \(cat === 'property' && property\) \{\s*refs = \(await uploadListingDocument\(accessToken, property, 'property_policy', listingId, refs\)\)\.refs/);
  assert.doesNotMatch(policyField, /required/);
});

test('office and shop amenities remain on their existing custom-field path', () => {
  assert.match(page, /<AmenitiesField category=\{category\} amenities=\{form\.amenities\} hidden=\{officeShop \|\| tableOnly\}/);
  assert.match(page, /\{officeShop \? \(\s*<OfficeShopMedia /);
  assert.match(read('components/listWizard/OfficeShopFields.tsx'), /id="office-shop-media-fields"/);
});
