// Listing wizard, Phase 2 fixes that show outside the wizard: card prices of
// sale-only property, office/shop rental totals, the duplicate office/shop
// chip, opening hours, property rent terms, and "price to confirm" bookings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('a sale-only property card shows its sale price, from the listing or from its prices', () => {
  const mkt = loadTs(path.join(root, 'lib', 'marketplace', 'marketplace.ts'));
  const saleOnly = { price_amount: 9000000, price_unit: 'month', sale_price_amount: 9000000, sale_price_mode: 'exact' };
  assert.equal(mkt.formatPrice(saleOnly, 'property', 'sale').isSale, true, 'the listing says sale');
  assert.equal(mkt.formatPrice(saleOnly, 'property').isSale, true, 'no purpose: the price matches the sale price');
  const both = { price_amount: 50000, price_unit: 'month', sale_price_amount: 9000000 };
  assert.deepEqual({ ...mkt.formatPrice(both, 'property') }, { amount: 50000, unit: 'month' }, 'rent and sale: the monthly rent');
  assert.match(read('components', 'marketplace', 'MarketplaceCard.tsx'), /formatPrice\(listing\.listing_booking_details, listing\.category, listing\.listing_purpose\)/);
});

test('office and shop rentals: totals that follow the price unit, or "the host confirms the price"', () => {
  const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));
  assert.equal(bl.rentalLine({ price_amount: 50000, price_unit: 'month' }, 3).total, 150000);
  assert.equal(bl.rentalLine({ price_amount: 1200000, price_unit: 'year' }, 6).total, 600000, 'a yearly price is a twelfth a month');
  assert.equal(bl.rentalLine({ price_amount: 100, price_unit: 'sq_ft', office_shop_details: { space: { area: 500 }, pricing: { area_period: 'month' } } }, 2).total, 100000);
  assert.equal(bl.rentalLine({ price_amount: 1200, price_unit: 'm2', office_shop_details: { space: { area: 100 }, pricing: { area_period: 'year' } } }, 12).total, 120000);
  assert.equal(bl.rentalLine({ price_amount: 15000, price_unit: 'desk' }, 2).label, '1 desk · 2 months');
  for (const unit of ['day', 'turnover']) {
    const line = bl.rentalLine({ price_amount: 3000, price_unit: unit }, 2);
    assert.equal(line.onRequest, true, unit);
    assert.equal(line.total, 0, unit);
  }
  assert.match(read('components', 'booking', 'BookingWidget.tsx'), /line = rentalLine\(details, months\);/);
  const format = loadTs(path.join(root, 'lib', 'bookings', 'format.ts'));
  assert.equal(format.bookingAmountText(0), 'Price to confirm');
  assert.equal(format.bookingAmountText('12000'), 'KES 12,000');
  assert.match(read('components', 'bookings', 'BookingDetail.tsx'), /\{approved && !priceToConfirm\(booking\.total_price\) && <button/, 'nothing to pay before the host confirms');
});

test('booking page: one office/shop type chip, opening hours with times, property deposit and utilities', () => {
  assert.match(read('components', 'booking', 'ListingDetails.tsx'), /else if \(!officeShop\) chips\.push\(\.\.\.spaceChips\(listing\.category, details\)\)/, 'offices and shops: the subtype label only');
  assert.match(read('lib', 'booking', 'commercial.ts'), /value: openingHours\(amenities\.after_hours, amenities\.operational_accessible_hours\)/);
  const widget = read('components', 'booking', 'BookingWidget.tsx');
  assert.match(widget, /Deposit KES \$\{Number\(details\.deposit_amount\)\.toLocaleString\(\)\}/);
  assert.match(widget, /details\.utilities_included === true \? 'Utilities included'/);
});
