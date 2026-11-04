const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const am = loadTs(path.join(__dirname, '..', 'lib', 'listWizard', 'amenities.ts'));
const keys = (options) => options.map((option) => option[0]);
const libraryKeys = (options) => options.map((option) => option.key);

test('each category gets its own amenity checklist', () => {
  assert.equal(am.AMENITY_OPTIONS.length, 25);
  assert.equal(am.HOTEL_AMENITY_OPTIONS.length, 20);
  assert.equal(am.PROPERTY_AMENITY_OPTIONS.length, 20);
  assert.equal(am.amenityOptionsFor('airbnb'), am.AMENITY_OPTIONS);
  assert.equal(am.amenityOptionsFor('venue'), am.AMENITY_OPTIONS);
  assert.equal(am.amenityOptionsFor('office'), am.AMENITY_OPTIONS, 'office/shop keep the home-stay grid (hidden)');
  assert.equal(am.amenityOptionsFor('hotel'), am.HOTEL_AMENITY_OPTIONS);
  assert.equal(am.amenityOptionsFor('property'), am.PROPERTY_AMENITY_OPTIONS);
  assert.deepEqual(keys(am.AMENITY_OPTIONS).slice(0, 4), ['wifi', 'mountain', 'parking', 'kitchen']);
  assert.ok(keys(am.HOTEL_AMENITY_OPTIONS).every((key) => key.startsWith('hotel_')));
  assert.deepEqual(keys(am.PROPERTY_AMENITY_OPTIONS).slice(0, 3), ['security', 'security_cameras', 'power']);
  for (const list of [am.AMENITY_OPTIONS, am.HOTEL_AMENITY_OPTIONS, am.PROPERTY_AMENITY_OPTIONS]) {
    assert.equal(new Set(keys(list)).size, list.length, 'keys are unique');
    for (const [, label, icon] of list) {
      assert.ok(label);
      assert.match(icon, /^<svg viewBox="0 0 24 24"[^>]*>[\s\S]*<\/svg>$/);
    }
  }
});

test('shared icons are reused from the home-stay list', () => {
  const icon = (list, key) => list.find((option) => option[0] === key)[2];
  assert.equal(icon(am.HOTEL_AMENITY_OPTIONS, 'hotel_high_speed_wifi'), icon(am.AMENITY_OPTIONS, 'wifi'));
  assert.equal(icon(am.HOTEL_AMENITY_OPTIONS, 'hotel_climate_control'), icon(am.AMENITY_OPTIONS, 'air_conditioning'));
  assert.equal(icon(am.HOTEL_AMENITY_OPTIONS, 'hotel_quality_bedding'), am.HOTEL_GENERIC_AMENITY_ICON);
  assert.equal(icon(am.PROPERTY_AMENITY_OPTIONS, 'in_unit_laundry'), icon(am.AMENITY_OPTIONS, 'washing_machine'));
  assert.equal(icon(am.PROPERTY_AMENITY_OPTIONS, 'wifi'), icon(am.AMENITY_OPTIONS, 'wifi'));
});

test('only airbnb, hotel and property use the library', () => {
  assert.deepEqual(['airbnb', 'hotel', 'venue', 'office', 'shop', 'property'].map(am.isAmenityLibraryNiche), [true, true, false, false, false, true]);
});

test('library categories: tabs and assignment by terms', () => {
  assert.equal(am.libraryCategoriesFor('airbnb')[0], 'All');
  assert.deepEqual(am.libraryCategoriesFor('airbnb'), am.LIBRARY_AMENITY_CATEGORIES);
  assert.deepEqual(am.libraryCategoriesFor('shop'), ['All', 'Power', 'Building services', 'Internet', 'Water and washrooms', 'Security']);
  assert.equal(am.amenityCategoryFor('wifi', 'Free Wi-Fi'), 'Essentials');
  assert.equal(am.amenityCategoryFor('heating', 'Heating'), 'Comfort');
  assert.equal(am.amenityCategoryFor('kitchen', 'Kitchen'), 'Kitchen & dining');
  assert.equal(am.amenityCategoryFor('tv', 'TV'), 'Work & entertainment');
  assert.equal(am.amenityCategoryFor('balcony', 'Balcony'), 'Outdoor');
  assert.equal(am.amenityCategoryFor('pet', 'Pet Friendly'), 'Family & safety');
  assert.equal(am.amenityCategoryFor('hotel_luggage_storage', 'Luggage Storage'), 'Services');
  assert.equal(am.amenityCategoryFor('security', '24/7 Security & Guard'), 'Essentials', 'first matching tab wins');
  assert.equal(am.amenityCategoryFor('mystery', 'Something'), 'Comfort', 'Comfort by default');
});

test('library options per category', () => {
  const airbnb = am.libraryOptionsFor('airbnb');
  assert.deepEqual(libraryKeys(airbnb), keys(am.AMENITY_OPTIONS));
  assert.deepEqual(airbnb[0], { key: 'wifi', label: 'Free Wi-Fi', category: 'Essentials', icon: am.AMENITY_OPTIONS[0][2] });
  assert.deepEqual(libraryKeys(am.libraryOptionsFor('hotel')), keys(am.HOTEL_AMENITY_OPTIONS));
  const office = am.libraryOptionsFor('office');
  assert.equal(am.libraryOptionsFor('shop'), office);
  assert.equal(office.length, 26);
  assert.deepEqual(office[0], { key: 'mains_supply', label: 'Main supply', category: 'Power', icon: am.OFFICE_SHOP_AMENITY_ICONS.mains_supply });
  assert.equal(office.find((option) => option.key === 'meeting_rooms').category, 'Building services');
  assert.ok(office.every((option) => option.icon === am.OFFICE_SHOP_AMENITY_ICONS[option.key]), 'every office/shop key has its own icon');
  assert.match(am.OFFICE_SHOP_AMENITY_ICONS.ups, /aria-hidden="true"/);
  assert.equal(am.officeShopAmenityIcon('unknown_key'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8"/></svg>');
});

test('search filters by key, label and category within the active tab', () => {
  const options = am.libraryOptionsFor('airbnb');
  assert.equal(am.filterLibraryOptions(options, 'All', '').length, options.length);
  assert.deepEqual(libraryKeys(am.filterLibraryOptions(options, 'All', '  POOL ')), ['pool']);
  assert.deepEqual(libraryKeys(am.filterLibraryOptions(options, 'All', 'washing_')), ['washing_machine'], 'matches the key');
  assert.ok(am.filterLibraryOptions(options, 'All', 'outdoor').every((option) => option.category === 'Outdoor'), 'matches the category name');
  assert.ok(am.filterLibraryOptions(options, 'Outdoor', '').every((option) => option.category === 'Outdoor'));
  assert.deepEqual(am.filterLibraryOptions(options, 'Outdoor', 'wifi'), []);
  assert.deepEqual(libraryKeys(am.filterLibraryOptions(am.libraryOptionsFor('office'), 'Security', 'cc')), ['cctv']);
});

test('selected keys follow list order and ignore other categories', () => {
  const amenities = [{ key: 'pool', checked: true }, { key: 'wifi', checked: true }, { key: 'tv', checked: false }, { key: 'hotel_room_service', checked: true }];
  assert.deepEqual(am.selectedAmenityKeys('airbnb', amenities), ['wifi', 'pool']);
  assert.deepEqual(am.selectedAmenityKeys('hotel', amenities), ['hotel_room_service']);
  assert.deepEqual(am.selectedAmenityKeys('property', amenities), ['pool', 'wifi']);
  assert.deepEqual(am.selectedAmenityKeys('airbnb', []), []);
  assert.equal(am.isAmenityChecked([{ key: 'wifi', checked: true }, { key: 'wifi', checked: false }], 'wifi'), false, 'last entry wins');
});

test('setAmenityChecked updates or appends without mutating', () => {
  const start = [{ key: 'wifi', checked: true }];
  const off = am.setAmenityChecked(start, 'wifi', false);
  assert.deepEqual(off, [{ key: 'wifi', checked: false }]);
  assert.deepEqual(start, [{ key: 'wifi', checked: true }]);
  assert.deepEqual(am.setAmenityChecked(start, 'pool', true), [{ key: 'wifi', checked: true }, { key: 'pool', checked: true }]);
});

test('summary and count text', () => {
  assert.deepEqual(am.amenitySummary('airbnb', [], {}), { count: 0, countText: '0 selected', text: '', hidden: true });
  assert.deepEqual(am.amenitySummary('airbnb', [{ key: 'kitchen', checked: true }, { key: 'wifi', checked: true }], {}),
    { count: 2, countText: '2 selected', text: 'Free Wi-Fi · Kitchen', hidden: false });
  assert.equal(am.amenitySummary('property', [{ key: 'wifi', checked: true }], {}).text, 'High-Speed Internet / Fiber');
  const office = am.amenitySummary('office', [{ key: 'wifi', checked: true }], { cctv: true, mains_supply: true, ups: false });
  assert.deepEqual(office, { count: 2, countText: '2 selected', text: 'Main supply · CCTV', hidden: false });
  assert.equal(am.EMPTY_AMENITY_SUMMARY, 'No amenities selected yet.');
  assert.equal(am.NO_AMENITY_MATCHES, 'No amenities match this search.');
});

test('draft snapshot lists every library checkbox with its state', () => {
  const snapshot = am.amenitySnapshot('hotel', [{ key: 'hotel_mini_fridge', checked: true }], {});
  assert.equal(snapshot.length, 20);
  assert.deepEqual(snapshot.filter((entry) => entry.checked), [{ key: 'hotel_mini_fridge', checked: true }]);
  const office = am.amenitySnapshot('shop', [], { lift: true });
  assert.equal(office.length, 26);
  assert.deepEqual(office.filter((entry) => entry.checked), [{ key: 'lift', checked: true }]);
});

test('field copy per category', () => {
  assert.equal(am.amenitiesFieldCopy('airbnb').label, 'Amenities');
  assert.equal(am.amenitiesFieldCopy('hotel').label, 'Room & hotel amenities');
  assert.equal(am.amenitiesFieldCopy('property').label, 'Property features & amenities');
});
