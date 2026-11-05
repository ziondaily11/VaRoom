'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, render } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const enquiry = loadTs(path.join(root, 'lib', 'chat', 'listingEnquiry.ts'));
const source = read('pages', 'chats.tsx');

const listing = { id: 'l 1', title: 'Garden flat', location_text: 'Kilimani', category: 'airbnb', listing_photos: [], listing_booking_details: [{ price_amount: 5000, price_unit: 'night' }] };

test('the card shows the price as the Marketplace does, and where and what the listing is', () => {
  assert.equal(enquiry.listingPriceText({ category: 'airbnb', listing_booking_details: [{ price_amount: 5000, price_unit: 'night' }] }), 'KSh 5,000 / night');
  assert.equal(enquiry.listingPriceText({ category: 'property', listing_booking_details: { listing_purpose: 'sale', sale_price_amount: 9000000, sale_price_mode: 'starting' } }), 'From KSh 9,000,000');
  assert.equal(enquiry.listingPriceText({ category: 'airbnb', listing_booking_details: null }), 'Price on request');
  assert.match(enquiry.listingSubtitle({ location_text: '  Kilimani ', category: 'airbnb' }), /^Kilimani · /);
});

test('every "Chat" / "Message host" button opens the chat through the server, with the listing to ask about', async () => {
  const calls = [];
  const start = loadTs(path.join(root, 'lib', 'chat', 'startChat.ts'), {
    mocks: { '../api': { apiFetch: async (url, init) => { calls.push([url, init]); return { conversationId: 'c 9' }; } } },
  });
  assert.equal(await start.startListingChat('l 1'), '/chats?c=c%209&listing=l%201');
  assert.deepEqual(calls, [['/api/chat/conversations/start', { method: 'POST', body: { listingId: 'l 1' } }]]);
  for (const file of [['lib', 'hostHome', 'hostHome.ts'], ['lib', 'booking', 'bookingListing.ts'], ['lib', 'bookings', 'clientBookings.ts'], ['lib', 'profile', 'hostChat.ts'], ['pages', 'client-home.tsx']]) {
    const text = read(...file);
    assert.match(text, /startListingChat/, file.join('/'));
    assert.doesNotMatch(text, /from\('conversations'\)\s*\.upsert/, `${file.join('/')} no longer creates conversations itself`);
  }
});

test('Chats: the listing card waits above the composer, goes with the next message, and shows above it in the thread', () => {
  const { ListingEnquiryCard } = loadChats('components/chat/MessageMedia.tsx');
  const compact = render(ListingEnquiryCard, { listing, compact: true });
  assert.match(compact, /<div class="chat-enquiry-card is-compact" role="link" tabindex="0" aria-label="Listing: Garden flat">/);
  assert.match(compact, /<span class="chat-enquiry-text"><em>Asking about this listing<\/em><strong>Garden flat<\/strong><small>Kilimani · [^<]+ · KSh 5,000 \/ night<\/small><\/span>/);
  assert.doesNotMatch(compact, /chat-enquiry-overlay/);
  // ?c=…&listing=… loads the card; the next message carries it, then it is dropped (asked once).
  assert.match(source, /const routerQueryListing = typeof router\.query\.listing === 'string' \? router\.query\.listing : null;/);
  assert.match(source, /loadEnquiryListing\(getSupabaseClient\(\), routerQueryListing\)/);
  assert.match(source, /<ListingEnquiryCard listing=\{enquiryHere\.listing\} compact \/>/);
  assert.match(source, /aria-label="Don't ask about this listing"/);
  assert.match(source, /listingId: currentEnquiry \? currentEnquiry\.listing\.id : undefined,/);
  assert.match(source, /if \(currentEnquiry\) dropEnquiry\(\);/);
  assert.match(source, /\{m\.listing && <ListingEnquiryCard listing=\{m\.listing\} \/>\}\s*\{replyReference\}/);
  // Opening the card goes to the listing.
  assert.match(read('components', 'chat', 'MessageMedia.tsx'), /router\.push\(`\/booking\?id=\$\{encodeURIComponent\(listing\.id\)\}`\)/);
});

test('in the thread the listing fills the bubble in a thin frame, its price on the photo; only the message keeps padding', () => {
  const { ListingEnquiryCard } = loadChats('components/chat/MessageMedia.tsx');
  const card = render(ListingEnquiryCard, { listing });
  assert.match(card, /<span class="chat-enquiry-overlay"><strong>Garden flat<\/strong><small>Kilimani · [^<]+<\/small><span class="chat-enquiry-price">KSh 5,000 \/ night<\/span><\/span>/);
  assert.match(render(ListingEnquiryCard, { listing: { id: 'x' } }), /<strong>VaRoom listing<\/strong>/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.bubble\{ padding:12px 16px;/, 'the bubble padding the frame is measured from');
  assert.match(css, /\.bubble-text\.has-enquiry > \.chat-enquiry-card\{ margin:-9px -13px 10px; \}/, '3px frame on top and sides');
  assert.match(css, /\.chat-enquiry-price\{ display:block; margin-top:3px; font-size:0.8125rem; font-weight:700; \}/, 'no fill behind the price');
  assert.doesNotMatch(css, /\.chat-enquiry-card\{[^}]*background:rgba/, 'no fill behind the card');
  assert.match(source, /className=\{`bubble bubble-text\$\{m\.listing \? ' has-enquiry' : ''\}`\}/);
});
