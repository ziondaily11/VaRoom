const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, render } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const elie = loadTs(path.join(root, 'lib', 'chat', 'elie.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const LOFT = { id: 'l1', title: 'Kilimani Loft', category: 'airbnb', amenities: ['wifi', 'pool', 'mystery_thing'] };
const OFFICE = { id: 'o1', title: 'Westlands Office', category: 'office', amenities: ['fibre', 'backup_generator'] };

test('Elie is told which listings the thread shows: latest search first, each in its order, once, at most 12', async () => {
  const entries = [
    { id: 'a', kind: 'listings', items: [{ id: 'x' }, { id: 'y' }] },
    { id: 'b', kind: 'elie', text: 'hi' },
    { id: 'c', kind: 'listings', items: [{ id: 'z' }, { id: 'x' }] },
  ];
  assert.deepEqual(elie.elieShownListingIds(entries), ['z', 'x', 'y']);
  const many = [{ id: 'm', kind: 'listings', items: Array.from({ length: 20 }, (_, i) => ({ id: `id${i}` })) }];
  assert.equal(elie.elieShownListingIds(many).length, elie.ELIE_SHOWN_LISTINGS);

  let body;
  const fetchFn = async (url, init) => { body = JSON.parse(init.body); return jsonResponse(200, { reply: 'ok' }); };
  await elie.askElie({ message: 'pool?', history: [], token: 't', listingIds: ['x', 'z'], fetchFn });
  assert.deepEqual(body.listing_ids, ['x', 'z']);
  await elie.askElie({ message: 'hi', history: [], token: 't', fetchFn });
  assert.equal('listing_ids' in body, false);
});

test('an answer about amenities keeps its grid, live and after a reload', async () => {
  const live = elie.elieResponseEntries({ reply: 'Yes', listings: [LOFT], show_amenities: true, highlight_amenities: ['pool'] });
  assert.deepEqual(live[1].amenities, { highlight: ['pool'] });
  assert.equal('amenities' in elie.elieResponseEntries({ reply: 'Found', listings: [LOFT] })[1], false, 'a plain search shows cards only');

  const saved = elie.elieTurnEntries([{ role: 'elie', text: 'Yes', results: { listings: [LOFT], amenities: { highlight: ['pool'] } } }]);
  assert.deepEqual(saved[1].amenities, { highlight: ['pool'] });

  let rows;
  const client = { from: () => ({ insert: async (value) => { rows = value; return { error: null }; }, update: () => ({ eq: async () => ({}) }) }) };
  await elie.saveElieTurns(client, { sessionId: 's', userId: 'u', question: 'pool?', data: { reply: 'Yes', listings: [LOFT], show_amenities: true, highlight_amenities: ['pool'] }, now: 1 });
  assert.deepEqual(rows[1].results.amenities, { highlight: ['pool'] });
});

test('amenities use the booking page labels and icons, the asked ones first', () => {
  const { elieAmenities } = loadChats('components/chat/ElieAmenities.tsx');
  const icons = loadTs(path.join(root, 'lib', 'booking', 'bookingIcons.ts'));
  const home = elieAmenities(LOFT, ['pool']);
  assert.deepEqual(home.map((item) => [item.key, item.label, item.asked]), [
    ['pool', icons.AMENITY_LABEL.pool || 'Pool', true], ['wifi', icons.AMENITY_LABEL.wifi, false], ['mystery_thing', 'Mystery thing', false],
  ]);
  assert.equal(home[1].icon, icons.AMENITY_ICON.wifi);
  assert.equal(home[2].icon, icons.ICON_GENERIC_AMENITY);
  const office = elieAmenities(OFFICE, []);
  assert.deepEqual(office.map((item) => item.label), ['Fibre available', 'Backup generator']);
  assert.ok(office.every((item) => item.icon === icons.ICON_GENERIC_AMENITY));
});

test('the thread shows the card, then the amenity grid with the asked amenity highlighted', () => {
  const { ElieThread } = loadChats('components/chat/ElieThread.tsx');
  const html = render(ElieThread, {
    entries: [{ id: 'e', kind: 'listings', items: [LOFT], amenities: { highlight: ['pool'] } }],
    thinking: false, onRetry() {},
  });
  assert.match(html, /<div class="elie-listing-detail">.*chat-enquiry-card.*<div class="elie-amenities"><p class="elie-amenities-title">Top amenities<\/p><div class="amenity-grid"><div class="amenity-item is-asked"><svg/s);
  const office = render(ElieThread, { entries: [{ id: 'e', kind: 'listings', items: [{ ...OFFICE, amenities: [] }], amenities: { highlight: [] } }], thinking: false, onRetry() {} });
  assert.match(office, /Amenities and building services<\/p><p class="elie-amenities-empty">No amenities have been listed for this space yet\.<\/p>/);
  const plain = render(ElieThread, { entries: [{ id: 'e', kind: 'listings', items: [LOFT] }], thinking: false, onRetry() {} });
  assert.doesNotMatch(plain, /elie-amenities/);
});

test('the V-Coin meter says it buys coins, and each pack has a Buy button', () => {
  const VCoinMeter = loadChats('components/chat/VCoinMeter.tsx').default;
  const button = (wallet) => render(VCoinMeter, { wallet, onWallet() {}, openSignal: 0 });
  assert.match(button({ balance: 60, included: false }), /<span class="vcoin-count">60<\/span><span class="vcoin-topup" aria-hidden="true">\+<\/span>/);
  assert.match(button({ balance: 10, included: false }), /<span class="vcoin-topup" aria-hidden="true">Top up<\/span>/);
  assert.doesNotMatch(button({ balance: 0, included: true }), /class="vcoin-topup"/, 'a plan with Elie buys nothing');
  const source = read('components', 'chat', 'VCoinMeter.tsx');
  assert.match(source, /<span className="vcoin-pack-note">About \{Math\.floor\(pack\.coins \/ VCOIN_SEARCH_COST\)\} searches<\/span>/);
  assert.match(source, /<span className="vcoin-pack-buy">Buy<\/span>/);
});

test('Elie\'s first-screen composer is compact until the text needs a second line, then full size', () => {
  const page = read('pages', 'chats.tsx');
  assert.match(page, /useEffect\(\(\) => \{ if \(!composerText\.trim\(\)\) setElieWide\(false\); \}, \[composerText\]\);/);
  assert.match(page, /const elieCompact = elieFresh && !elieWide;/);
  assert.match(page, /if \(elieCompact && e\.currentTarget\.scrollHeight > 30\) setElieWide\(true\);/);
  assert.match(page, /\$\{elieCompact \? ' elie-compact' : ''\}/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-input-area\.is-elie\{ width:calc\(100% - 56px\); margin-left:auto; margin-right:auto; border-radius:24px;/);
  assert.match(css, /\.chat-input-area\.is-elie\.elie-compact\{ display:flex; align-items:center; gap:10px; width:min\(560px, calc\(100% - 56px\)\);/);
});
