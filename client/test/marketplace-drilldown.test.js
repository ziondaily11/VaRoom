const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const drill = loadTs(path.join(root, 'lib', 'marketplace', 'drilldown.ts'));
const mkt = loadTs(path.join(root, 'lib', 'marketplace', 'marketplace.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function fakeClient(result) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return (...args) => { calls.push([prop, ...args]); return builder; };
    },
  });
  return { calls, from(table) { calls.push(['from', table]); return builder; } };
}

test('steps: Property narrows Buy/Rent → type → bedrooms; Offices and Shops by their wizard subtypes; others none', () => {
  assert.deepEqual(drill.categorySteps('property').map((step) => step.key), ['purpose', 'type', 'beds']);
  assert.deepEqual(plain(drill.categorySteps('office')[0].options.map(([value]) => value)),
    ['private_office', 'shared_office', 'serviced_office', 'coworking_desk', 'meeting_room']);
  assert.deepEqual(plain(drill.categorySteps('shop')[0].options.map(([value]) => value)), ['street_front_shop', 'mall_unit', 'showroom', 'studio']);
  assert.deepEqual(plain(drill.categorySteps('airbnb')), []);
  assert.deepEqual(plain(drill.PROPERTY_TYPES.map(([value]) => value)), ['apartment', 'house', 'bungalow', 'maisonette', 'townhouse', 'villa']);
});

test('the path is read from the address in order and stops at the first missing or unknown step', () => {
  const read = (query) => (key) => query[key] || '';
  assert.deepEqual(plain(drill.pathFromQuery('property', read({ purpose: 'buy', type: 'apartment', beds: '3' }))), ['buy', 'apartment', '3']);
  assert.deepEqual(plain(drill.pathFromQuery('property', read({ type: 'apartment', beds: '3' }))), [], 'a type without Buy/Rent is not reached');
  assert.deepEqual(plain(drill.pathFromQuery('property', read({ purpose: 'buy', type: 'castle', beds: '3' }))), ['buy']);
  assert.deepEqual(plain(drill.pathFromQuery('office', read({ subtype: 'private_office' }))), ['private_office']);
  assert.deepEqual(plain(drill.pathFromQuery('hotel', read({ purpose: 'buy' }))), []);
  assert.deepEqual(plain(mkt.searchFromQuery({ category: 'property', purpose: 'Rent', type: 'house' })),
    { q: '', category: 'property', guests: '', path: ['rent', 'house'] });
});

test('the tab row: the next step, then the last step once all are chosen; choosing drops the steps after', () => {
  assert.equal(drill.currentStep('all', []), null);
  assert.equal(drill.currentStep('airbnb', []), null);
  assert.equal(drill.currentStep('property', []).step.key, 'purpose');
  assert.equal(drill.currentStep('property', ['buy']).step.key, 'type');
  assert.equal(drill.currentStep('property', ['buy', 'house', '3']).step.key, 'beds');
  assert.deepEqual(plain(drill.choose(['buy', 'house', '3'], 1, 'villa')), ['buy', 'villa']);
});

test('filters: Buy is sale or both; Rent is rent, both or no purpose; type and bedrooms match the wizard values', () => {
  assert.deepEqual(plain(drill.pathFilter('property', ['buy', 'apartment', '3'])),
    { purposes: ['sale', 'both'], includeNoPurpose: false, propertyType: 'apartment', sizeOrType: '3 bedrooms' });
  assert.deepEqual(plain(drill.pathFilter('property', ['rent', 'house', 'studio'])),
    { purposes: ['rent', 'both'], includeNoPurpose: true, propertyType: 'house', sizeOrType: 'Studio' });
  assert.equal(drill.pathFilter('office', ['coworking_desk']).sizeOrType, 'coworking_desk');
  assert.deepEqual(plain(drill.pathFilter('venue', [])), { purposes: null, includeNoPurpose: false, propertyType: null, sizeOrType: null });
});

test('the query narrows the listings themselves (inner join) only when a step filters the details row', async () => {
  const deep = fakeClient({ data: [], error: null });
  await mkt.fetchListingPage(deep, { q: '', category: 'property', guests: '', path: ['buy', 'apartment', '1'] }, 0);
  assert.match(deep.calls.find((call) => call[0] === 'select')[1], /listing_booking_details!inner\(\*\)/);
  assert.ok(deep.calls.some((call) => call[0] === 'in' && call[1] === 'listing_purpose' && call[2].join() === 'sale,both'));
  assert.ok(deep.calls.some((call) => call[0] === 'eq' && call[1] === 'listing_booking_details.property_type' && call[2] === 'apartment'));
  assert.ok(deep.calls.some((call) => call[0] === 'ilike' && call[1] === 'listing_booking_details.size_or_type' && call[2] === '1 bedroom'));

  const rent = fakeClient({ data: [], error: null });
  await mkt.fetchListingPage(rent, { q: '', category: 'property', guests: '', path: ['rent'] }, 0);
  assert.doesNotMatch(rent.calls.find((call) => call[0] === 'select')[1], /!inner/, 'Buy/Rent is on the listing row: no join');
  assert.ok(rent.calls.some((call) => call[0] === 'or' && call[1] === 'listing_purpose.in.(rent,both),listing_purpose.is.null'));

  const none = fakeClient({ data: [], error: null });
  await mkt.fetchListingPage(none, { q: '', category: 'hotel', guests: '' }, 0);
  assert.ok(!none.calls.some((call) => String(call[1]).startsWith('listing_purpose') || String(call[1]).includes('property_type')));
});

test('each step is its own cached page and list', () => {
  const base = { q: '', category: 'property', guests: '' };
  assert.notEqual(mkt.pageKey({ ...base, path: ['buy'] }, 0), mkt.pageKey({ ...base, path: ['rent'] }, 0));
  assert.equal(mkt.pageKey(base, 0), mkt.pageKey({ ...base, path: [] }, 0));
  mkt.setListSnapshot({ ...base, path: ['buy'] }, { listings: [], hasMore: false, offset: 12, scrollTop: 300 }, 1000);
  assert.equal(mkt.getListSnapshot({ ...base, path: ['rent'] }, 1000), null);
  assert.equal(mkt.getListSnapshot({ ...base, path: ['buy'] }, 1000).offset, 12);
});

test('breadcrumb: Marketplace › category › each step, every part linking back with the search words kept', () => {
  const trail = drill.crumbs('property', 'Property', ['buy', 'apartment', '3'], { q: 'Kilimani' });
  assert.deepEqual(trail.map((crumb) => crumb.label), ['Marketplace', 'Property', 'Buy', 'Apartment', '3 bedrooms']);
  assert.deepEqual(trail.map((crumb) => crumb.href), [
    '/marketplace?q=Kilimani',
    '/marketplace?q=Kilimani&category=property',
    '/marketplace?q=Kilimani&category=property&purpose=buy',
    '/marketplace?q=Kilimani&category=property&purpose=buy&type=apartment',
    '/marketplace?q=Kilimani&category=property&purpose=buy&type=apartment&beds=3',
  ]);
  assert.deepEqual(plain(drill.crumbs('all', 'All', [])), []);
  assert.deepEqual(drill.crumbs('office', 'Offices', ['private_office']).map((crumb) => crumb.label), ['Marketplace', 'Offices', 'Private office']);
  assert.deepEqual(mkt.searchSummary({ q: '', category: 'property', guests: '', path: ['buy'] }), [], 'the category and steps are the breadcrumb, not chips');
  assert.equal(mkt.emptyMessage({ q: '', category: 'property', guests: '', path: ['buy', 'villa'] }).title, 'No places here yet');
});

test('the trail to a listing page keeps only known values', () => {
  const isCategory = (key) => Object.prototype.hasOwnProperty.call(mkt.CATEGORY_LABELS, key);
  assert.equal(drill.encodeTrail('property', ['buy', 'apartment', '3']), 'property.buy.apartment.3');
  assert.equal(drill.encodeTrail('all', []), '');
  assert.deepEqual(plain(drill.decodeTrail('property.buy.apartment.3', isCategory)), { category: 'property', path: ['buy', 'apartment', '3'] });
  assert.deepEqual(plain(drill.decodeTrail('property.buy.<script>', isCategory)), { category: 'property', path: ['buy'] });
  assert.equal(drill.decodeTrail('castles.buy', isCategory), null);
  assert.equal(drill.decodeTrail(['property'], isCategory), null);
});

test('wiring: the step tabs and breadcrumb on the Marketplace, the trail on the listing page, the wizard and server field', () => {
  const page = read('pages', 'marketplace.tsx');
  assert.match(page, /currentStep\(active\.category, path\)/);
  assert.match(page, /<TrailNav crumbs=\{trail\} onBack=\{backTo\} \/>/);
  assert.match(page, /const go = step \? router\.push : router\.replace;/, 'a step is a history entry, typing is not');
  assert.match(page, /encodeTrail\(search\.category, searchPath\(search\)\)/);
  const booking = read('pages', 'booking.tsx');
  assert.match(booking, /decodeTrail\(router\.query\.trail/);
  assert.match(booking, /<TrailNav crumbs=\{trail\} current=\{listing\.title\} \/>/);
  const fields = read('components', 'listWizard', 'WizardFields.tsx');
  assert.match(fields, /<select \{\.\.\.bind\(binding, 'property-type'\)\} name="property-type" required>/);
  const publish = read('lib', 'listWizard', 'publish.ts');
  assert.match(publish, /details\.property_type = text\(fields, 'property-type'\) \|\| null;/);
  assert.match(publish, /if \(category === 'property'\) set\('property-type', details\.property_type\);/);
  const migration = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261123_000079_property_type.sql'), 'utf8');
  assert.match(migration, /add column if not exists property_type text/);
  assert.match(migration, /property_type in \('apartment', 'house', 'bungalow', 'maisonette', 'townhouse', 'villa'\)/);
});
