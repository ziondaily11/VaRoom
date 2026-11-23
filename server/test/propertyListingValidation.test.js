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

test('stay and venue details: allowed keys, ranges and the listing types they belong to', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
  assert.match(source, /'bedrooms', 'beds', 'seated_capacity', 'standing_capacity',/);
  assert.match(source, /key === 'bedrooms'\) \{\s*detailUpdate\[key\] = value === null \? null : number\(value, key, \{ integer: true, min: 0, max: 100 \}\);/);
  assert.match(source, /key === 'beds'\) \{\s*detailUpdate\[key\] = value === null \? null : number\(value, key, \{ integer: true, min: 1, max: 500 \}\);/);
  assert.match(source, /units_available: \['property', 'hotel'\],\s*rooms: \['airbnb', 'hotel'\],\s*bathrooms: \['property', 'airbnb', 'hotel'\],/);
  assert.match(source, /listing\.category !== 'venue' && \['seated_capacity', 'standing_capacity'\]\.some\(has\)/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261120_000075_stay_and_venue_details.sql'), 'utf8');
  for (const column of ['bedrooms', 'beds', 'seated_capacity', 'standing_capacity']) assert.match(migration, new RegExp(`add column if not exists ${column} integer`), column);
});

test('property type: allowed key, one of the six types, property listings only (migration 000079)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
  assert.match(source, /const PROPERTY_TYPES = \['apartment', 'house', 'bungalow', 'maisonette', 'townhouse', 'villa'\];/);
  assert.match(source, /'seated_capacity', 'standing_capacity', 'property_type',/);
  assert.match(source, /key === 'property_type'\) \{\s*detailUpdate\[key\] = value === null \? null : enumValue\(value, key, PROPERTY_TYPES\);/);
  assert.match(source, /property_type: \['property'\],/);
  assert.match(source, /!DETAIL_CATEGORIES\.property_type\.includes\(listing\.category\) && has\('property_type'\)/);
  assert.equal(enumValue('villa', 'property_type', ['apartment', 'house', 'bungalow', 'maisonette', 'townhouse', 'villa']), 'villa');
  assert.throws(() => enumValue('castle', 'property_type', ['apartment', 'house', 'bungalow', 'maisonette', 'townhouse', 'villa']), ValidationError);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261123_000079_property_type.sql'), 'utf8');
  assert.match(migration, /add column if not exists property_type text/);
});
