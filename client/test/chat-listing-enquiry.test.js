const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const enquiry = loadTs(path.join(root, 'lib', 'chat', 'listingEnquiry.ts'));
const source = read('pages', 'chats.tsx');

test('the card shows the price as the Marketplace does, and where and what the listing is', () => {
  assert.equal(enquiry.listingPriceText({ category: 'airbnb', listing_booking_details: [{ price_amount: 5000, price_unit: 'night' }] }), 'KSh 5,000 / night');
  assert.equal(enquiry.listingPriceText({ category: 'property', listing_booking_details: { listing_purpose: 'sale', sale_price_amount: 9000000, sale_price_mode: 'starting' } }), 'From KSh 9,000,000');
  assert.equal(enquiry.listingPriceText({ category: 'airbnb', listing_booking_details: null }), 'Price on request');
  assert.match(enquiry.listingSubtitle({ location_text: '  Kilimani ', category: 'airbnb' }), /^Kilimani · /);
});

test('every "Chat" / "Message host" button opens the chat through the server, with the listing to ask about', () => {
  const start = read('lib', 'chat', 'startChat.ts');
  assert.match(start, /apiFetch<\{ conversationId: string \}>\('\/api\/chat\/conversations\/start', \{\s*method: 'POST',\s*body: \{ listingId \},/);
  assert.match(start, /`\/chats\?c=\$\{encodeURIComponent\(conversationId\)\}&listing=\$\{encodeURIComponent\(listingId\)\}`/);
  for (const file of [['lib', 'hostHome', 'hostHome.ts'], ['lib', 'booking', 'bookingListing.ts'], ['lib', 'bookings', 'clientBookings.ts'], ['lib', 'profile', 'hostChat.ts'], ['pages', 'client-home.tsx']]) {
    const text = read(...file);
    assert.match(text, /startListingChat/, file.join('/'));
    assert.doesNotMatch(text, /from\('conversations'\)\s*\.upsert/, `${file.join('/')} no longer creates conversations itself`);
  }
});

test('Chats: the listing card waits above the composer, goes with the next message, and shows above it in the thread', () => {
  assert.match(source, /const routerQueryListing = typeof router\.query\.listing === 'string' \? router\.query\.listing : null;/);
  assert.match(source, /loadEnquiryListing\(getSupabaseClient\(\), routerQueryListing\)/);
  assert.match(source, /<ListingEnquiryCard listing=\{enquiryHere\.listing\} compact \/>/);
  assert.match(source, /aria-label="Don't ask about this listing"/);
  assert.match(source, /listingId: currentEnquiry \? currentEnquiry\.listing\.id : undefined,/);
  assert.match(source, /if \(currentEnquiry\) dropEnquiry\(\);/, 'asked once: the next messages are ordinary');
  assert.match(source, /\{m\.listing && <ListingEnquiryCard listing=\{m\.listing\} \/>\}\s*\{replyReference\}/);
  const media = read('components', 'chat', 'MessageMedia.tsx');
  assert.match(media, /<em>Asking about this listing<\/em>/);
  assert.match(media, /router\.push\(`\/booking\?id=\$\{encodeURIComponent\(listing\.id\)\}`\)/);
});

test('in the thread the listing fills the bubble in a thin frame, its price on the photo; only the message keeps padding', () => {
  const media = read('components', 'chat', 'MessageMedia.tsx');
  assert.match(media, /<span className="chat-enquiry-overlay">\s*<strong>\{title\}<\/strong>\s*<small>\{listingSubtitle\(listing\)\}<\/small>\s*<span className="chat-enquiry-price">\{listingPriceText\(listing\)\}<\/span>\s*<\/span>/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.bubble\{ padding:12px 16px;/, 'the bubble padding the frame is measured from');
  assert.match(css, /\.bubble-text\.has-enquiry > \.chat-enquiry-card\{ margin:-9px -13px 10px; \}/, '3px frame on top and sides');
  assert.match(css, /\.chat-enquiry-price\{ display:block; margin-top:3px; font-size:13px; font-weight:700; \}/, 'no fill behind the price');
  assert.doesNotMatch(css, /\.chat-enquiry-card\{[^}]*background:rgba/, 'no fill behind the card');
});
