'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const officeShop = loadTs(path.join(__dirname, '..', 'lib', 'listWizard', 'officeShop.ts'));
const { emptyForm } = loadTs(path.join(__dirname, '..', 'lib', 'listWizard', 'formState.ts'));
const {
  collectOfficeShopDetails, hydrateOfficeShopDetails, mergeOfficeShopPatch, officeShopConditions, officeShopPriceUnit,
  collectOfficeShopCharges, chargeRow, listingDocumentMimeType, listingDocumentsError, officeShopFromControls, officeShopControls,
  officeShopBusinessHoursError, documentCardLabel, toggleLayout, OFFICE_SHOP_AMENITY_KEYS,
} = officeShop;

const plain = (value) => JSON.parse(JSON.stringify(value));

const officeDetails = () => ({
  subtype: 'serviced_office', role: 'owner',
  amenities: Object.assign(Object.fromEntries(OFFICE_SHOP_AMENITY_KEYS.map((key) => [key, ['fibre', 'reception', 'cctv'].includes(key)])), {
    power_note: '3-phase', internet_note: null, after_hours: 'business_hours', operational_accessible_hours: '08:00-18:00', accessibility_note: null,
  }),
  location: { building_name: 'BMW Towers' },
  space: {
    area: 120.5, area_unit: 'm2', area_measure: 'usable', fitout_status: 'fitted', floor_level: '4', room_count: 3, ceiling_height: null,
    capacity: 12, desks: 10, office_layout: ['Open plan', 'Reception'], private_rooms: 2, furniture_included: true,
    customer_area: null, storage_area: null, shop_layout: [], street_frontage: 'not_confirmed', frontage_width: null,
    display_windows: 'not_confirmed', loading_access: 'not_confirmed', foot_traffic: null, nearby_anchors: null,
  },
  parking: { spaces: 2, allocated: true, visitor: false, customer: false, cost: 'paid', paid_amount: 3000 },
  rules: { permitted_uses: ['office_or_professional', 'not_sure_renter_to_confirm'], fitout: 'landlord_consent', signage: null, subletting: 'not_allowed', restoration: 'to_confirm', noise_limits: null },
  pricing: { basis: 'per_area', amount: 150, area_period: 'year', monthly_payment: 'to_confirm', desk_included: null, short_pricing_note: null, turnover_threshold: null },
  costs: {
    service_charge: 'not_included', service_amount: 5000, service_frequency: 'monthly', utilities: 'metered', utilities_amount: null, tax: 'added',
    security_deposit: '2 months', advance_rent: null, compulsory_charges: [{ type: 'cleaning', amount: 1500, frequency: 'quarterly' }], rent_increases: 'annual',
  },
  lease: {
    available_from: '2026-12-01', minimum_term: 12, payment_frequency: 'quarterly', viewing_required: 'yes', preferred_term: null,
    renewal: 'to_confirm', notice_period: '3 months', lock_in: null, viewing_availability: null, payment_methods: 'Bank transfer',
  },
  documents: { floor_plan_document_id: 'doc-1', documents_on_request: true },
});

test('hydrate then collect reproduces the stored office details, layouts included', () => {
  const stored = officeDetails();
  const form = mergeOfficeShopPatch(emptyForm(), hydrateOfficeShopDetails(stored));
  assert.equal(form.fields['os-office-layout'], 'open_plan,reception');
  assert.equal(form.fields['os-operating-hours-from'], '08:00');
  const collected = plain(collectOfficeShopDetails(form, 'office', stored.documents));
  assert.deepEqual(collected, stored);
  assert.deepEqual(Object.keys(collected.amenities).slice(0, 3), ['mains_supply', 'backup_generator', 'ups']);
});

test('shop layouts round trip and the office-only space reads as untouched for a shop', () => {
  const stored = officeDetails();
  stored.space.shop_layout = ['Sales floor', 'Loading / storage'];
  const form = mergeOfficeShopPatch(emptyForm(), hydrateOfficeShopDetails(stored));
  form.fields['os-signage'] = 'allowed';
  form.fields['os-customer-parking'] = true;
  const shop = collectOfficeShopDetails(form, 'shop', {});
  assert.deepEqual(shop.space.shop_layout, ['Sales floor', 'Loading / storage']);
  assert.deepEqual(shop.space.office_layout, []);
  assert.equal(shop.space.capacity, null);
  assert.equal(shop.space.furniture_included, false);
  assert.equal(shop.rules.signage, 'allowed');
  assert.equal(shop.parking.customer, true);
  // Back to office: the shop-only controls are not rendered, but their values stay in state.
  const office = collectOfficeShopDetails(form, 'office', {});
  assert.equal(office.rules.signage, null);
  assert.equal(office.parking.customer, false);
  assert.deepEqual(office.space.shop_layout, []);
  assert.equal(office.space.street_frontage, 'not_confirmed');
  assert.equal(office.space.capacity, 12);
  assert.equal(form.fields['os-signage'], 'allowed');
});

test('an untouched form collects the select defaults list.html read', () => {
  const details = collectOfficeShopDetails(emptyForm(), 'office', null);
  assert.equal(details.amenities.after_hours, 'not_confirmed');
  assert.equal(details.amenities.operational_accessible_hours, null);
  assert.equal(details.pricing.area_period, 'month');
  assert.equal(details.pricing.monthly_payment, 'to_confirm');
  assert.equal(details.rules.subletting, 'to_confirm');
  assert.equal(details.costs.rent_increases, 'not_confirmed');
  assert.equal(details.lease.renewal, 'to_confirm');
  assert.equal(details.space.area, null);
  assert.equal(details.subtype, '');
  assert.deepEqual(details.documents, { documents_on_request: false });
  // A turnover basis is only an option for shops.
  const form = emptyForm();
  form.fields['os-pricing-basis'] = 'turnover';
  assert.equal(collectOfficeShopDetails(form, 'office').pricing.basis, '');
  assert.equal(collectOfficeShopDetails(form, 'shop').pricing.basis, 'turnover');
});

test('conditions per pricing basis', () => {
  const at = (basis, kind = 'shop', extra = {}) => officeShopConditions(Object.assign({ 'os-pricing-basis': basis }, extra), kind);
  const shown = (c) => ['yearlyExtra', 'areaExtra', 'deskExtra', 'shortExtra', 'turnoverExtra'].filter((key) => c[key]);
  assert.deepEqual(shown(at('')), []);
  assert.deepEqual(shown(at('whole_month')), []);
  assert.deepEqual(shown(at('whole_year')), ['yearlyExtra']);
  assert.deepEqual(shown(at('per_area')), ['areaExtra']);
  assert.deepEqual(shown(at('per_desk')), ['deskExtra']);
  assert.deepEqual(shown(at('daily_weekly_hourly')), ['shortExtra']);
  assert.deepEqual(shown(at('turnover')), ['turnoverExtra']);
  assert.deepEqual(shown(at('turnover', 'office')), []);
  assert.equal(at('per_area').areaMeasureRequired, true);
  assert.equal(at('whole_year').areaMeasureRequired, false);
  assert.equal(at('daily_weekly_hourly').minTermLabel, 'Minimum booking duration');
  assert.equal(at('daily_weekly_hourly').minTermPlaceholder, 'Number of days, weeks or hours');
  assert.equal(at('whole_month').minTermLabel, 'Minimum lease term');
  assert.equal(at('whole_month').minTermPlaceholder, 'Months');
  assert.equal(at('per_area', 'shop', { 'os-area-unit': 'm2' }).priceUnit, 'm2');
  assert.equal(at('', 'office', { 'os-after-hours': 'business_hours' }).businessHours, true);
  assert.equal(at('').businessHours, false);
  assert.equal(at('', 'office', { 'os-subtype': 'coworking_desk' }).desksRequired, true);
  assert.equal(at('', 'office', { 'os-subtype': 'private_office' }).desksRequired, false);
  assert.equal(at('', 'shop').capacityRequired, false);
});

test('business hours must end after they start', () => {
  const fields = { 'os-after-hours': 'business_hours', 'os-operating-hours-from': '18:00', 'os-operating-hours-to': '09:00' };
  assert.equal(officeShopBusinessHoursError(fields, 'office'), 'End time must be later than the start time.');
  assert.equal(officeShopBusinessHoursError(Object.assign({}, fields, { 'os-operating-hours-to': '19:00' }), 'office'), null);
  assert.equal(officeShopBusinessHoursError(Object.assign({}, fields, { 'os-after-hours': '24_7' }), 'office'), null);
});

test('price unit per basis', () => {
  const unit = (basis, areaUnit) => officeShopPriceUnit({ pricing: { basis }, space: { area_unit: areaUnit } });
  assert.equal(unit('whole_month'), 'month');
  assert.equal(unit(''), 'month');
  assert.equal(unit('whole_year'), 'year');
  assert.equal(unit('per_area', 'm2'), 'm2');
  assert.equal(unit('per_area', 'sq_ft'), 'sq_ft');
  assert.equal(unit('per_area', ''), 'sq_ft');
  assert.equal(unit('per_desk'), 'desk');
  assert.equal(unit('daily_weekly_hourly'), 'day');
  assert.equal(unit('turnover'), 'turnover');
});

test('charges without an amount are dropped', () => {
  assert.deepEqual(plain(collectOfficeShopCharges([
    { type: 'parking', amount: '', frequency: 'monthly' },
    { type: 'agent_fee', amount: '0', frequency: 'one_off' },
    { type: 'internet', amount: '2500', frequency: 'monthly' },
  ])), [{ type: 'agent_fee', amount: 0, frequency: 'one_off' }, { type: 'internet', amount: 2500, frequency: 'monthly' }]);
  assert.deepEqual(plain(chargeRow({ amount: null })), { type: 'parking', amount: '', frequency: 'monthly' });
});

test('document validation messages', () => {
  assert.equal(listingDocumentMimeType({ name: 'plan.PDF', type: '', size: 10 }), 'application/pdf');
  assert.equal(listingDocumentMimeType({ name: 'photo.jpeg', type: 'image/jpeg', size: 10 }), 'image/jpeg');
  assert.throws(() => listingDocumentMimeType({ name: 'notes.docx', type: 'application/msword', size: 10 }), { message: 'Choose a PDF, JPEG, PNG, WebP, or GIF document.' });
  assert.throws(() => listingDocumentMimeType({ name: 'image.png', type: 'image/jpeg', size: 10 }), { message: 'Choose a PDF, JPEG, PNG, WebP, or GIF document.' });
  assert.throws(() => listingDocumentMimeType({ name: 'big.pdf', type: 'application/pdf', size: 15 * 1024 * 1024 + 1 }), { message: 'Documents must be no larger than 15 MB.' });
  assert.throws(() => listingDocumentMimeType({ name: 'empty.pdf', type: 'application/pdf', size: 0 }), { message: 'Documents must be no larger than 15 MB.' });
  assert.equal(listingDocumentsError([{ name: 'a.pdf', type: 'application/pdf', size: 1 }]), null);
  assert.equal(listingDocumentsError([{ name: 'a.pdf', type: 'application/pdf', size: 1 }, { name: 'b.exe', type: '', size: 1 }]), 'Choose a PDF, JPEG, PNG, WebP, or GIF document.');
});

test('document card labels', () => {
  assert.equal(documentCardLabel([], [], 'Property Policy', false), 'Property Policy');
  assert.equal(documentCardLabel([], ['lease.pdf', 'id.pdf'], 'X', true), 'lease.pdf, id.pdf');
  assert.equal(documentCardLabel([{ name: 'a.pdf' }, { name: 'b.pdf' }], ['old.pdf'], 'X', true), '2 files selected');
  assert.equal(documentCardLabel([{ name: 'a.pdf' }], [], 'X', true), 'a.pdf');
});

// A legacy controls[] slice as list.html's captureListingDraft wrote it, in
// document order: the amenity store, then the office and shop layouts.
function legacyControls({ amenities = [], office = [], shop = [], uses = [] }) {
  const controls = [];
  let formIndex = 40;
  const push = (osKey, osUse, isChecked) => controls.push({ formIndex: formIndex++, id: '', name: '', nameIndex: 0, osKey, osUse, type: 'checkbox', value: 'on', checked: isChecked });
  controls.push({ formIndex: 39, id: 'os-power-note', name: '', nameIndex: 0, osKey: '', osUse: '', type: 'text', value: 'x' });
  OFFICE_SHOP_AMENITY_KEYS.forEach((key) => push(key, '', amenities.includes(key)));
  officeShop.OFFICE_LAYOUTS.forEach(([key]) => push(key, '', office.includes(key)));
  officeShop.SHOP_LAYOUTS.forEach(([key]) => push(key, '', shop.includes(key)));
  officeShop.PERMITTED_USES.forEach(([key]) => push('', key, uses.includes(key)));
  controls.push({ formIndex: formIndex++, id: '', name: '', nameIndex: 0, osKey: '', osUse: '', type: 'number', value: '500' });
  return controls;
}

test('a legacy draft restores layouts, amenities and uses from controls[] ("reception" told apart by order)', () => {
  const patch = officeShopFromControls(legacyControls({ amenities: ['cctv'], office: ['reception', 'storage'], shop: ['back_room'], uses: ['fashion'] }));
  assert.deepEqual(patch.fields, { 'os-office-layout': 'reception,storage', 'os-shop-layout': 'back_room' });
  assert.equal(patch.officeShopAmenitySelections.reception, false);
  assert.equal(patch.officeShopAmenitySelections.cctv, true);
  assert.deepEqual(patch.officeShopPermittedUses, ['fashion']);

  const other = officeShopFromControls(legacyControls({ amenities: ['reception'] }));
  assert.equal(other.officeShopAmenitySelections.reception, true);
  assert.equal(other.fields['os-office-layout'], '');

  assert.deepEqual(plain(officeShopFromControls([])), {});
  assert.deepEqual(plain(officeShopFromControls(undefined)), {});
});

test('controls[] written for the legacy page restore back into the same state', () => {
  const form = emptyForm();
  form.fields['os-office-layout'] = toggleLayout(form.fields, 'os-office-layout', 'reception', true);
  form.fields['os-shop-layout'] = 'stockroom';
  form.officeShopAmenitySelections = { reception: false, lift: true };
  form.officeShopPermittedUses = ['other'];
  const controls = officeShopControls(form);
  // Layout entries come before the amenity ones (legacy restore matches the first data-os-key).
  const receptions = controls.filter((control) => control.osKey === 'reception');
  assert.deepEqual(receptions.map((control) => [control.name, control.checked]), [['os-office-layout', true], ['os-amenities', false]]);
  assert.ok(controls.every((control) => control.id === '' && control.type === 'checkbox'));
  const patch = officeShopFromControls(controls);
  assert.deepEqual(patch.fields, { 'os-office-layout': 'reception', 'os-shop-layout': 'stockroom' });
  assert.equal(patch.officeShopAmenitySelections.reception, false);
  assert.equal(patch.officeShopAmenitySelections.lift, true);
  assert.deepEqual(patch.officeShopPermittedUses, ['other']);
});
