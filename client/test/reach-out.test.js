const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const ro = loadTs(path.join(root, 'lib', 'reachOut', 'reachOut.ts'));
const bl = loadTs(path.join(root, 'lib', 'booking', 'bookingListing.ts'));

const enquiry = { title: 'Palm View', url: 'https://varoom.example/booking?listing=L1', forSale: false };

test('WhatsApp: wa.me with digits only, Kenyan numbers normalised, the listing in the message', () => {
  for (const saved of ['+254712345678', '0712345678', '254712345678']) {
    const href = ro.whatsappHref(saved, enquiry);
    assert.match(href, /^https:\/\/wa\.me\/254712345678\?text=/, saved);
  }
  const text = decodeURIComponent(ro.whatsappHref('+254712345678', enquiry).split('?text=')[1]);
  assert.equal(text, "Hello, I'm interested in renting this space. I found your listing on VaRoom: Palm View\nhttps://varoom.example/booking?listing=L1");
  assert.match(decodeURIComponent(ro.whatsappHref('+254712345678', { ...enquiry, forSale: true })), /interested in buying/);
});

test('email: mailto with the subject and a body naming the listing, encoded', () => {
  const href = ro.mailtoHref('host@example.com', { title: 'Loft & Co', url: enquiry.url });
  assert.match(href, /^mailto:host@example\.com\?subject=Enquiry%20About%20Your%20VaRoom%20Listing&body=/);
  const body = decodeURIComponent(href.split('&body=')[1]);
  assert.match(body, /Listing: Loft & Co\nLink: https:\/\/varoom\.example\/booking\?listing=L1/);
  assert.doesNotMatch(href.split('&body=')[1], /&/, 'the & in the title is encoded');
});

test('phone: tel links in +254 form; the listing URL is the booking page', () => {
  assert.equal(ro.telHref('0712 345 678'), 'tel:+254712345678');
  assert.equal(ro.telHref('+254712345678'), 'tel:+254712345678');
  assert.equal(ro.listingUrl('https://varoom.example', 'a b'), 'https://varoom.example/booking?listing=a%20b');
});

test('fields show saved values, else the account; WhatsApp follows the phone', () => {
  const account = { phone: '+254711111111', email: 'me@example.com' };
  assert.deepEqual(ro.contactFieldValues(ro.DEFAULT_REACH_OUT, account), { phone: '+254711111111', whatsapp: '+254711111111', email: 'me@example.com' });
  const custom = { ...ro.DEFAULT_REACH_OUT, phone: '+254722222222' };
  assert.deepEqual(ro.contactFieldValues(custom, account), { phone: '+254722222222', whatsapp: '+254722222222', email: 'me@example.com' });
  assert.deepEqual(ro.contactFieldValues(ro.DEFAULT_REACH_OUT, { phone: null, email: '' }), { phone: '', whatsapp: '', email: '' });
});

test('saving: values equal to what they follow are stored empty, so they keep following the account', () => {
  const account = { phone: '0711111111', email: 'Me@Example.com' };
  assert.deepEqual(ro.contactPatch({ phone: '+254711111111', whatsapp: '711111111', email: 'me@example.com' }, account).patch, { phone: null, whatsapp: null, email: null });
  assert.deepEqual(ro.contactPatch({ phone: '0722222222', whatsapp: '0722222222', email: 'biz@example.com' }, account).patch, { phone: '+254722222222', whatsapp: null, email: 'biz@example.com' });
  assert.deepEqual(ro.contactPatch({ phone: '', whatsapp: '0733333333', email: '' }, account).patch, { phone: null, whatsapp: '+254733333333', email: null });
  assert.equal(ro.contactPatch({ phone: '12', whatsapp: '', email: '' }, account).error, 'Please enter a valid phone number.');
  assert.equal(ro.contactPatch({ phone: '', whatsapp: 'abc', email: '' }, account).error, 'Please enter a valid WhatsApp number.');
  assert.equal(ro.contactPatch({ phone: '', whatsapp: '', email: 'not-an-email' }, account).error, 'Please enter a valid email address.');
});

test('saved settings: no row means every default; saving upserts only the given columns', async () => {
  const fakeRead = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) });
  assert.deepEqual(await ro.loadReachOut(fakeRead(null), 'U1'), ro.DEFAULT_REACH_OUT);
  assert.equal((await ro.loadReachOut(fakeRead({ email_enabled: false }), 'U1')).email_enabled, false);
  let sent = null;
  const fakeWrite = { from: (table) => ({ upsert: async (row, options) => { sent = { table, row, options }; return { error: null }; } }) };
  assert.equal(await ro.saveReachOut(fakeWrite, 'U1', { phone_enabled: false }), null);
  assert.equal(sent.table, 'profile_contact_settings');
  assert.equal(sent.options.onConflict, 'profile_id');
  assert.deepEqual(Object.keys(sent.row).sort(), ['phone_enabled', 'profile_id', 'updated_at']);
});

test('booking: contact options load with the listing and never break it', async () => {
  const quiet = console.warn;
  console.warn = () => {};
  try {
    const failing = { rpc: async () => ({ data: null, error: { message: 'no function' } }) };
    assert.deepEqual(await ro.fetchListingContact(failing, 'L1'), ro.NO_CONTACT);
    const throwing = { rpc: async () => { throw new Error('offline'); } };
    assert.deepEqual(await ro.fetchListingContact(throwing, 'L1'), ro.NO_CONTACT);
  } finally {
    console.warn = quiet;
  }
  let args = null;
  const ok = { rpc: async (name, params) => { args = { name, params }; return { data: [{ whatsapp: '+254712345678', email: null, phone: '+254712345678' }], error: null }; } };
  assert.deepEqual(await ro.fetchListingContact(ok, 'L1'), { whatsapp: '+254712345678', email: null, phone: '+254712345678' });
  assert.deepEqual(args, { name: 'listing_contact', params: { p_listing_id: 'L1' } });
  assert.doesNotMatch(bl.LISTING_SELECT, /phone/, 'the host phone comes from Reach Out, not the profile');
});
