'use strict';

// The dialogs over a conversation: Report (components/chat/ReportSheet)
// and Share listings (components/chat/ShareListingSheet), rendered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, renderChatsPage, render, section } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('the chat header has no ⋮ button; reporting stays in the information panel', () => {
  const header = section(renderChatsPage({ initialConversationId: 'c1' }).html, '<header class="chat-header">', '</header>');
  assert.ok(header);
  assert.doesNotMatch(header, /More actions|i-more/);
  assert.match(read('pages', 'chats.tsx'), /onReport=\{\(\) => setReportSheetOpen\(true\)\}/);
});

test('report dialog: closed renders nothing; open shows the four reasons as choices and a disabled submit', () => {
  const Report = loadChats('components/chat/ReportSheet.tsx').default;
  const props = { personName: 'Billionaire ZION', onClose() {}, onSubmit: async () => {} };
  assert.equal(render(Report, { ...props, open: false }), '');
  const html = render(Report, { ...props, open: true });
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /Report Billionaire ZION/);
  assert.deepEqual([...html.matchAll(/type="radio" name="chatReportReason" value="([^"]+)"/g)].map((m) => m[1]), ['Spam or scam', 'Harassment', 'Inappropriate content', 'Other']);
  assert.match(html, /Spam or scam[\s\S]*Fake listings, payment requests or suspicious links/);
  assert.match(html, /<button class="chat-btn chat-btn-primary" type="submit" disabled="">Submit report<\/button>/);
  assert.match(html, /placeholder="What happened with Billionaire ZION\?"/);
  assert.match(render(Report, { ...props, personName: '', open: true }), /Report this user/);
});

test('dialogs use VaRoom brand colours only: warm white, black actions, VaRoom red accents', () => {
  const css = read('public', 'js', 'chats.css');
  const block = css.slice(css.indexOf('/* Dialogs over the conversation'), css.indexOf('@media (hover:none){ .chat-share-check'));
  assert.match(block, /--modal-surface:#fffdfb;/);
  assert.match(block, /--modal-accent:#bd2337;/);
  assert.match(block, /--modal-cta:#111111;/);
  assert.doesNotMatch(block, /#4ec1a0|#25876e|#2563EB|mint/i, 'no chat mint or old blue');
});

test('share dialog: explorer-like tiles with a hover/selected tick, title and place over the photo, search and a count', () => {
  const { default: Sheet, ListingTile } = loadChats('components/chat/ShareListingSheet.tsx');
  const api = async () => ({ listings: [] });
  const html = render(Sheet, { open: true, userId: 'h1', api, onClose() {}, onShare: async () => {} });
  assert.match(html, /role="listbox" aria-multiselectable="true" aria-label="Your listings"/);
  assert.match(html, /placeholder="Search your listings"/);
  assert.match(html, /<span class="chat-share-selected" aria-live="polite">Nothing selected<\/span>/);
  assert.match(html, /aria-label="Loading listings"/, 'while the listings load');

  const tile = (selected) => render(ListingTile, { listing: { id: 'l1', title: 'Garden flat', location_text: 'Kilimani', listing_photos: [] }, selected, api, onToggle() {} });
  assert.match(tile(true), /<button type="button" role="option" aria-selected="true" class="chat-share-tile is-selected">/);
  assert.match(tile(false), /aria-selected="false" class="chat-share-tile"/);
  assert.match(tile(false), /<span class="chat-share-info"><strong>Garden flat<\/strong><small>Kilimani<\/small><\/span>/);
  assert.match(render(ListingTile, { listing: { id: 'l2', listing_photos: [] }, selected: false, api, onToggle() {} }), /<strong>Untitled listing<\/strong>/);
  // A listing's video plays muted on hover, without player controls.
  const source = read('components', 'chat', 'ShareListingSheet.tsx');
  assert.match(source, /<video ref=\{videoRef\} src=\{video\.url\} poster=\{[^}]*\} muted loop playsInline preload="none" \/>/);
  assert.doesNotMatch(source, /\bcontrols\b/);
  assert.match(source, /\{count \? `\$\{count\} selected` : 'Nothing selected'\}/);

  const sheets = loadTs(path.join(root, 'lib', 'chat', 'sheets.ts'));
  assert.equal(sheets.canSubmitReport('', false), false);
  assert.equal(sheets.canSubmitReport('Harassment', false), true, 'enabled once a reason is chosen');
  assert.equal(sheets.canSubmitReport('Harassment', true), false, 'not twice');

  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-share-info\{ position:absolute; left:14px; right:14px; bottom:12px;/, 'info over the card');
  assert.match(css, /\.chat-share-tile\.is-selected \.chat-share-check\{ border-color:var\(--modal-accent\); background:var\(--modal-accent\);/);
});
