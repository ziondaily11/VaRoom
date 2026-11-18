// Listing wizard, Phase 3: structured details for stays and venues (bedrooms,
// beds, bathrooms, rooms of this type, seated and standing guests), how they
// are saved, reloaded and shown.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const publish = loadTs(path.join(root, 'lib', 'listWizard', 'publish.ts'));
const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
const mkt = loadTs(path.join(root, 'lib', 'marketplace', 'marketplace.ts'));

test('saving: the numbers, plus size_or_type and max_guests for older readers', () => {
  assert.deepEqual({ ...publish.spaceDetails('airbnb', { 'stay-bedrooms': '2', 'stay-beds': '3', 'stay-bathrooms': '1' }, null, false) },
    { bedrooms: 2, beds: 3, bathrooms: 1, size_or_type: '2 bedrooms' });
  assert.equal(publish.spaceDetails('airbnb', { 'stay-bedrooms': '0' }, null, false).size_or_type, 'Studio');
  assert.equal(publish.spaceDetails('airbnb', {}, 'Cosy loft', false).size_or_type, 'Cosy loft', 'an older text stays until bedrooms are given');
  assert.deepEqual({ ...publish.spaceDetails('hotel', { 'stay-beds': '1', 'hotel-rooms-available': '12' }, null, false) }, { beds: 1, units_available: 12 });
  assert.deepEqual({ ...publish.spaceDetails('hotel', { 'stay-beds': '1' }, null, true) }, { beds: 1, units_available: null }, 'editing can clear the rooms');
  assert.deepEqual({ ...publish.spaceDetails('venue', { 'venue-seated': '80', 'venue-standing': '150' }, null, false) },
    { seated_capacity: 80, standing_capacity: 150, max_guests: 150, size_or_type: 'Seats 80 · 150 standing' });
  assert.equal(publish.venueCapacityLabel(null, 40), '40 standing');
  assert.deepEqual({ ...publish.spaceDetails('property', {}, null, false) }, {});
});

test('booking page chips and Marketplace cards', () => {
  assert.deepEqual(bl.spaceChips('airbnb', { bedrooms: 2, beds: 3, bathrooms: 1, max_guests: 4 }), ['2 bedrooms', '3 beds', '1 bathroom', 'Up to 4 guests']);
  assert.deepEqual(bl.spaceChips('airbnb', { size_or_type: '2 bedrooms, 1 bath', max_guests: 4 }), ['2 bedrooms, 1 bath', 'Up to 4 guests'], 'older listings');
  assert.deepEqual(bl.spaceChips('hotel', { size_or_type: 'Deluxe King room', beds: 1, max_guests: 2, units_available: 12 }), ['Deluxe King room', '1 bed', 'Up to 2 guests', '12 rooms of this type']);
  assert.deepEqual(bl.spaceChips('venue', { seated_capacity: 80, standing_capacity: 150, size_or_type: 'Seats 80 · 150 standing' }), ['Seats 80', '150 standing']);
  assert.deepEqual(bl.spaceChips('venue', { size_or_type: 'Seats up to 50' }), ['Seats up to 50'], 'older venues');
  assert.match(fs.readFileSync(path.join(root, 'components', 'booking', 'ListingDetails.tsx'), 'utf8'), /chips\.push\(\.\.\.spaceChips\(listing\.category, details\)\)/);
  const card = (category, details) => ({ ...mkt.propertyRooms({ category, listing_booking_details: [details] }) });
  assert.deepEqual(card('airbnb', { bedrooms: 0, bathrooms: 1 }), { beds: 'Studio', baths: 1 });
  assert.deepEqual(card('airbnb', { bedrooms: 3, bathrooms: 2 }), { beds: '3', baths: 2 });
  assert.deepEqual(card('property', { size_or_type: '2 bedrooms', bathrooms: 1 }), { beds: '2', baths: 1 });
});

test('the wizard asks for them under "The space" and reloads them when editing', () => {
  const fields = fs.readFileSync(path.join(root, 'components', 'listWizard', 'WizardFields.tsx'), 'utf8');
  const space = fields.slice(fields.indexOf('export function SpaceFields'), fields.indexOf('export function BookingFields'));
  for (const id of ['stay-bedrooms', 'stay-beds', 'stay-bathrooms', 'hotel-rooms-available', 'venue-seated', 'venue-standing']) assert.ok(space.includes(`'${id}'`), id);
  const formState = loadTs(path.join(root, 'lib', 'listWizard', 'formState.ts'));
  const form = publish.editForm(formState.emptyForm(), 'airbnb', { title: 'T' }, { bedrooms: 0, beds: 2, bathrooms: 1, price_amount: 1 }, null);
  assert.equal(form.fields['stay-bedrooms'], '0', 'a studio reloads as 0');
  assert.equal(form.fields['stay-beds'], '2');
  assert.equal(form.fields['stay-bathrooms'], '1');
  const venue = publish.editForm(formState.emptyForm(), 'venue', { title: 'V' }, { seated_capacity: 80, standing_capacity: 150 }, null);
  assert.equal(venue.fields['venue-seated'], '80');
  assert.equal(venue.fields['venue-standing'], '150');
});
