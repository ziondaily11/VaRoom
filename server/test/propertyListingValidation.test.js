'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError, assertAllowedKeys, enumValue } = require('../lib/inputValidation');

test('assertAllowedKeys allows listing_purpose along with existing listing keys', () => {
  const allowed = [
    'title', 'description', 'property_description', 'category', 'location_text',
    'supports_stay', 'supports_table_reservation', 'latitude', 'longitude',
    'place_id', 'formatted_address', 'neighborhood', 'city', 'country', 'listing_purpose'
  ];
  assert.doesNotThrow(() => {
    assertAllowedKeys({ title: 'Karen Villas', listing_purpose: 'sale' }, allowed);
  });
});

test('property listing_purpose enum accepts valid values: rent, sale, both', () => {
  const PURPOSES = ['rent', 'sale', 'both'];
  assert.equal(enumValue('rent', 'listing_purpose', PURPOSES), 'rent');
  assert.equal(enumValue('sale', 'listing_purpose', PURPOSES), 'sale');
  assert.equal(enumValue('both', 'listing_purpose', PURPOSES), 'both');
});

test('property listing_purpose enum rejects invalid values', () => {
  const PURPOSES = ['rent', 'sale', 'both'];
  assert.throws(() => enumValue('invalid', 'listing_purpose', PURPOSES), ValidationError);
  assert.throws(() => enumValue('lease', 'listing_purpose', PURPOSES), ValidationError);
  assert.throws(() => enumValue('timeshare', 'listing_purpose', PURPOSES), ValidationError);
});

test('category boundary enforcement: non-property categories leave listing_purpose null/undefined', () => {
  const nonPropertyCategories = ['airbnb', 'hotel', 'venue', 'office', 'shop'];
  const PURPOSES = ['rent', 'sale', 'both'];

  nonPropertyCategories.forEach((category) => {
    const payload = { category };
    const reqBody = { listing_purpose: 'sale' };

    // Simulating the guarded logic in listingRoutes:
    // only if (category === 'property' && req.body.listing_purpose !== undefined)
    if (category === 'property' && reqBody.listing_purpose !== undefined) {
      payload.listing_purpose = enumValue(reqBody.listing_purpose, 'listing_purpose', PURPOSES);
    }

    assert.equal(payload.listing_purpose, undefined, `Category ${category} must not set listing_purpose`);
  });
});

test('property category assigns listing_purpose correctly', () => {
  const category = 'property';
  const PURPOSES = ['rent', 'sale', 'both'];

  ['rent', 'sale', 'both'].forEach((purpose) => {
    const payload = { category };
    const reqBody = { listing_purpose: purpose };

    if (category === 'property' && reqBody.listing_purpose !== undefined) {
      payload.listing_purpose = enumValue(reqBody.listing_purpose, 'listing_purpose', PURPOSES);
    }

    assert.equal(payload.listing_purpose, purpose);
  });
});
