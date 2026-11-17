const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/loadTs');

const clientRoot = path.resolve(__dirname, '..');
const spaces = loadTs(path.join(clientRoot, 'lib', 'landing', 'featuredSpaces.ts'));

const row = (overrides = {}) => ({
  id: 'l1',
  title: 'Garden Cottage',
  description: '  Quiet   cottage\nnear the park ',
  category: 'airbnb',
  listing_photos: [{ storage_path: 'photos/production/listing-photos/a.jpg' }],
  listing_booking_details: [{ price_amount: 4500, price_unit: 'night' }],
  ...overrides,
});

test('the five niches, offices and shops together, airbnbs in the middle', () => {
  assert.deepEqual(spaces.SPACE_NICHES.map((n) => n.id), ['property', 'office', 'airbnb', 'venue', 'hotel']);
  assert.deepEqual(spaces.SPACE_NICHES.find((n) => n.id === 'office').categories, ['office', 'shop']);
});

test('prices: per unit, sale prices, readable units, none', () => {
  assert.deepEqual(spaces.priceParts([{ price_amount: 4500, price_unit: 'night' }], 'airbnb'), { price: 'KSh 4,500', priceUnit: '/ night' });
  assert.deepEqual(spaces.priceParts({ price_amount: 350, price_unit: 'sq_ft' }, 'office'), { price: 'KSh 350', priceUnit: '/ sq ft' });
  assert.deepEqual(
    spaces.priceParts({ listing_purpose: 'sale', sale_price_amount: 12000000, sale_price_mode: 'starting' }, 'property'),
    { price: 'From KSh 12,000,000', priceUnit: '' },
  );
  assert.deepEqual(spaces.priceParts({ price_amount: null }, 'venue'), { price: null, priceUnit: '' });
  assert.deepEqual(spaces.priceParts({ price_amount: 0, price_unit: 'day' }, 'venue'), { price: null, priceUnit: '' });
  assert.deepEqual(spaces.priceParts(null, 'hotel'), { price: null, priceUnit: '' });
});

test('a card shows the title, the host summary, the price and opens the listing', () => {
  const niche = spaces.SPACE_NICHES.find((n) => n.id === 'airbnb');
  const card = spaces.toFeaturedSpace(niche, row());
  assert.equal(card.label, 'Airbnbs');
  assert.equal(card.href, '/booking?listing=l1');
  assert.equal(card.listing.title, 'Garden Cottage');
  assert.equal(card.listing.summary, 'Quiet cottage near the park');
  assert.equal(card.listing.price, 'KSh 4,500');
  assert.equal(card.listing.photoUrl, '/api/photos/listing-photos/photos/production/listing-photos/a.jpg?w=800');
});

test('a niche with no listing links to its marketplace filter', () => {
  const niche = spaces.SPACE_NICHES.find((n) => n.id === 'office');
  assert.deepEqual(spaces.toFeaturedSpace(niche, null), { slot: 'office', niche: 'office', label: 'Offices & Shops', listing: null, href: '/marketplace?category=office' });
});

test('picks the newest titled listing whose photo loads', async () => {
  const photoUrlOf = (r) => (r.listing_photos[0] ? `https://storage.example/${r.id}.jpg` : null);
  const rows = [
    row({ id: 'junk', title: 'test' }),
    row({ id: 'nophoto', listing_photos: [] }),
    row({ id: 'broken' }),
    row({ id: 'good' }),
  ];
  const picked = await spaces.pickListing(rows, photoUrlOf, async (url) => !url.includes('broken'));
  assert.equal(picked.row.id, 'good');
  assert.equal(picked.photoUrl, 'https://storage.example/good.jpg');

  const none = await spaces.pickListing([row({ id: 'a' }), row({ id: 'b' })], photoUrlOf, async () => false);
  assert.deepEqual({ id: none.row.id, photoUrl: none.photoUrl }, { id: 'a', photoUrl: null });

  assert.equal(await spaces.pickListing([], photoUrlOf), null);
});

const nicheOf = (id) => spaces.SPACE_NICHES.find((n) => n.id === id);
const listingsOf = (id, count, total = count) => ({
  niche: nicheOf(id),
  rows: Array.from({ length: count }, (_, i) => row({ id: `${id}-${i + 1}`, category: nicheOf(id).categories[0] })),
  total,
});
const cardsSummary = (cards) => cards.map((c) => [c.slot, c.niche, c.listing ? c.listing.id : null]);

test('an empty niche shows a second listing from the niche with the most listings', async () => {
  const cards = await spaces.buildFeaturedSpaces([
    listingsOf('property', 2, 2),
    listingsOf('office', 1, 1),
    listingsOf('airbnb', 3, 40),
    listingsOf('venue', 0, 0),
    listingsOf('hotel', 2, 9),
  ]);
  assert.deepEqual(cardsSummary(cards), [
    ['property', 'property', 'property-1'],
    ['office', 'office', 'office-1'],
    ['airbnb', 'airbnb', 'airbnb-1'],
    ['venue', 'airbnb', 'airbnb-2'],
    ['hotel', 'hotel', 'hotel-1'],
  ]);
  // The borrowed card keeps its own category and opens its own listing.
  assert.equal(cards[3].label, 'Airbnbs');
  assert.equal(cards[3].href, '/booking?listing=airbnb-2');
});

test('several empty niches borrow without repeating a listing, largest niche first', async () => {
  const cards = await spaces.buildFeaturedSpaces([
    listingsOf('property', 0, 0),
    listingsOf('office', 0, 0),
    listingsOf('airbnb', 2, 12),
    listingsOf('venue', 0, 0),
    listingsOf('hotel', 2, 5),
  ]);
  assert.deepEqual(cardsSummary(cards), [
    ['property', 'airbnb', 'airbnb-2'],
    ['office', 'hotel', 'hotel-2'],
    ['airbnb', 'airbnb', 'airbnb-1'],
    ['venue', 'venue', null],
    ['hotel', 'hotel', 'hotel-1'],
  ]);
  const ids = cards.filter((c) => c.listing).map((c) => c.listing.id);
  assert.equal(new Set(ids).size, ids.length);
  // Nothing left to borrow: that niche says it is coming soon.
  assert.equal(cards[3].listing, null);
  assert.equal(cards[3].href, '/marketplace?category=venue');
});

test('a niche whose query fails borrows like an empty one', async () => {
  const totals = { property: 6, office: 1, airbnb: 2, hotel: 1 };
  const query = () => {
    const chain = {
      select: () => chain, in: (_c, values) => { chain.values = values; return chain; }, eq: () => chain, or: () => chain, order: () => chain,
      limit: async () => {
        const id = chain.values[0];
        if (id === 'venue') return { data: null, error: { message: 'boom' }, count: null };
        const rows = Array.from({ length: Math.min(totals[id], 2) }, (_, i) => row({ id: `${id}-${i + 1}`, category: id }));
        return { data: rows, error: null, count: totals[id] };
      },
    };
    return chain;
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await spaces.fetchFeaturedSpaces({ from: query, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } });
    assert.deepEqual(cardsSummary(result), [
      ['property', 'property', 'property-1'],
      ['office', 'office', 'office-1'],
      ['airbnb', 'airbnb', 'airbnb-1'],
      ['venue', 'property', 'property-2'],
      ['hotel', 'hotel', 'hotel-1'],
    ]);
  } finally {
    console.warn = warn;
  }
});

function renderSection(spaceList) {
  const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
  const styles = new Proxy({}, { get: (_t, key) => String(key) });
  const { SpacesSection } = loadTs(path.join(clientRoot, 'components', 'landing', 'SpacesSection.tsx'), {
    mocks: { 'next/link': { __esModule: true, default: Link }, './SpacesSection.module.css': { __esModule: true, default: styles } },
  });
  return renderToStaticMarkup(React.createElement(SpacesSection, { spaces: spaceList }));
}

test('the section: centred heading, middle card first in focus, cards fanned around it', () => {
  const list = spaces.SPACE_NICHES.map((niche) => spaces.toFeaturedSpace(niche, row({ id: niche.id, category: niche.categories[0] })));
  const html = renderSection(list);
  assert.match(html, /<h2[^>]*id="spaces-heading"/);
  assert.match(html, /Discover <em>Spaces for<\/em>/);
  const order = [...html.matchAll(/data-offset="(-?\d)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(order, [-2, -1, 0, 1, 2]);
  // Title, category, summary and price on the card; Explore opens the listing.
  assert.match(html, /Garden Cottage[\s\S]*Airbnbs[\s\S]*Quiet cottage near the park[\s\S]*KSh 4,500/);
  assert.match(html, /href="\/booking\?listing=airbnb"/);
  assert.match(html, /href="\/marketplace"[^>]*>View more spaces/);
});

test('a card without a listing or price says so instead of inventing one', () => {
  const list = spaces.SPACE_NICHES.map((niche) => spaces.toFeaturedSpace(niche, niche.id === 'venue'
    ? null
    : row({ id: niche.id, category: niche.categories[0], listing_booking_details: [{ price_amount: null }] })));
  const html = renderSection(list);
  assert.match(html, /Event Venues are coming to VaRoom soon\./);
  assert.match(html, /href="\/marketplace\?category=venue"/);
  assert.match(html, /Price on request/);
});

test('an empty list renders nothing', () => {
  assert.equal(renderSection([]), '');
});
