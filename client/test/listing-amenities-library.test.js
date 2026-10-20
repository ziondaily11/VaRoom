const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const listingPath = path.join(__dirname, '..', 'legacy-pages', 'list.html');
const listingHtml = fs.readFileSync(listingPath, 'utf8');

test('listing amenities library is shared, searchable, and multi-select', () => {
  assert.match(listingHtml, /id="amenities-library-open"/);
  assert.match(listingHtml, /id="amenities-library-overlay"[^>]*hidden/);
  assert.match(listingHtml, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(listingHtml, /id="amenities-library-search"/);
  assert.match(listingHtml, /LIBRARY_AMENITY_CATEGORIES\s*=\s*\['All'/);
  assert.match(listingHtml, /amenitiesLibrarySearch\.addEventListener\('input',\s*renderAmenityLibrary\)/);
  assert.match(listingHtml, /checkbox\.checked\s*=\s*!checkbox\.checked/);
  assert.match(listingHtml, /function getSelectedAmenities\(\)/);
  assert.match(listingHtml, /amenities:\s*getSelectedAmenities\(\)/);
  assert.match(listingHtml, /amenitiesLibraryOverlay\.hidden\s*=\s*true/);
  assert.match(listingHtml, /function isAmenityLibraryNiche\(category\)\{ return category === 'airbnb' \|\| category === 'hotel' \|\| category === 'property'; \}/);
});

test('Airbnb, hotel, and residential listings keep separate amenity catalogs', () => {
  assert.match(listingHtml, /const AMENITY_OPTIONS\s*=\s*\[/);
  assert.match(listingHtml, /const HOTEL_AMENITY_OPTIONS\s*=\s*\[/);
  assert.match(listingHtml, /const PROPERTY_AMENITY_OPTIONS\s*=\s*\[/);
  assert.match(listingHtml, /if \(category === 'hotel'\) choices = HOTEL_AMENITY_OPTIONS/);
  assert.match(listingHtml, /else if \(category === 'property'\) choices = PROPERTY_AMENITY_OPTIONS/);
  assert.match(listingHtml, /if \(category === 'property'\) choices = PROPERTY_AMENITY_OPTIONS/);
});

test('policy PDF remains optional and visible only for residential property listings', () => {
  assert.match(listingHtml, /id="property-policy-section" hidden/);
  assert.match(listingHtml, /propertyPolicySection\.hidden\s*=\s*cat !== 'property'/);
  assert.match(listingHtml, /id="policy-input" accept="application\/pdf,\.pdf"/);
  assert.match(listingHtml, /if \(hostNiche === 'property'\)[\s\S]{0,400}policy_storage_path/);
  assert.doesNotMatch(listingHtml, /policyInput\.required\s*=\s*true/);
});

test('office and shop amenities remain on their existing custom-field path', () => {
  assert.match(listingHtml, /const officeShop = isOfficeShop\(cat\);\s*document\.getElementById\('amenities-field'\)\.style\.display = officeShop \? 'none' : '';/);
  assert.match(listingHtml, /renderOfficeShopFields\(\);/);
  assert.match(listingHtml, /id="office-shop-media-fields"/);
});
