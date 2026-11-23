const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, renderChatsPage, render, section } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const elie = loadTs(path.join(root, 'lib', 'chat', 'elie.ts'));

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('askElie: bearer token, correlation id, and the last six turns including the question', async () => {
  let request;
  const history = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? 'elie' : 'user', text: `t${i}` }));
  const data = await elie.askElie({
    message: 't8',
    history,
    token: 'tok',
    fetchFn: async (url, init) => { request = { url, init }; return jsonResponse(200, { reply: 'hi' }); },
  });
  assert.deepEqual(data, { reply: 'hi' });
  assert.equal(request.url, 'https://elie1-0.onrender.com/elie/search');
  assert.equal(request.init.headers.Authorization, 'Bearer tok');
  assert.match(request.init.headers['X-Correlation-ID'], /^CLIENT-[0-9A-Z]+$/);
  const body = JSON.parse(request.init.body);
  assert.equal(body.message, 't8');
  assert.deepEqual(body.history.map((turn) => turn.text), ['t3', 't4', 't5', 't6', 't7', 't8']);
  assert.equal('session_id' in body, false, 'no session: nothing for the service to save to');
  await elie.askElie({
    message: 'x', history: [], token: 'tok', sessionId: 's-1',
    fetchFn: async (url, init) => { request = { url, init }; return jsonResponse(200, { reply: 'hi', saved: true }); },
  });
  assert.equal(JSON.parse(request.init.body).session_id, 's-1');
});

test('askElie errors use the legacy wording', async () => {
  await assert.rejects(elie.askElie({ message: 'x', history: [], token: null }), { message: 'Please log in again to use Elie.' });
  await assert.rejects(
    elie.askElie({ message: 'x', history: [], token: 't', fetchFn: async () => jsonResponse(500, { detail: 'Search index offline' }) }),
    { message: 'Search index offline' },
  );
  await assert.rejects(
    elie.askElie({ message: 'x', history: [], token: 't', fetchFn: async () => jsonResponse(502, {}) }),
    { message: 'Something went wrong reaching Elie. Please try again.' },
  );
  await assert.rejects(
    elie.askElie({ message: 'x', history: [], token: 't', fetchFn: async () => { throw new TypeError('Failed to fetch'); } }),
    { message: 'Could not reach Elie. Please check your connection and try again.' },
  );
});

test('askElie gives up after the timeout', async () => {
  const fetchFn = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(
    elie.askElie({ message: 'x', history: [], token: 't', fetchFn, timeoutMs: 20 }),
    { message: 'Elie is taking longer than expected. Please try again.' },
  );
});

test('a response becomes reply, news, listings, then suggestion (legacy order)', () => {
  const entries = elie.elieResponseEntries({
    suggestion: 'Try Kilimani too',
    listings: [{ id: 'l1', title: 'Flat' }],
    news: [{ title: 'Rates rise' }],
    reply: 'Here is what I found',
  });
  assert.deepEqual(entries.map((entry) => entry.kind), ['elie', 'news', 'listings', 'elie']);
  assert.equal(entries[0].text, 'Here is what I found');
  assert.equal(entries[3].text, 'Try Kilimani too');
  assert.deepEqual(elie.elieResponseEntries({}), []);
});

test('an Elie listing becomes the chat card: photo by path, Marketplace price fields', () => {
  assert.deepEqual(elie.elieListingSummary({
    id: 'l1', title: 'Loft', location_text: 'Kilimani', category: 'airbnb', price_amount: 5000, price_unit: 'night', photo_path: 'h/l1/a.jpg', verified: true,
  }), {
    id: 'l1', title: 'Loft', location_text: 'Kilimani', category: 'airbnb', listing_photos: [{ storage_path: 'h/l1/a.jpg' }],
    listing_booking_details: { price_amount: 5000, price_unit: 'night', listing_purpose: null, sale_price_amount: null, sale_price_mode: null },
  });
  // An older Elie service sends only the public URL: the path is read from it.
  const fromUrl = elie.elieListingSummary({ id: 'l2', photo_url: 'https://x.supabase.co/storage/v1/object/public/listing-photos/h/l2/b%20c.jpg' });
  assert.deepEqual(fromUrl.listing_photos, [{ storage_path: 'h/l2/b c.jpg' }]);
  assert.equal(fromUrl.listing_booking_details, null, 'no price: "Price on request"');
  assert.deepEqual(elie.elieListingSummary({ id: 'l3' }).listing_photos, []);
  const enquiry = loadTs(path.join(root, 'lib', 'chat', 'listingEnquiry.ts'));
  assert.equal(enquiry.listingPriceText(elie.elieListingSummary({ id: 'p', category: 'property', price_amount: 9000000, listing_purpose: 'sale', sale_price_amount: 9000000, sale_price_mode: 'starting' })), 'From KSh 9,000,000');
  assert.equal(enquiry.listingPriceText(elie.elieListingSummary({ id: 'o', category: 'office', price_amount: 350, price_unit: 'day' })), 'KSh 350 / day');
});

test('history dates', () => {
  const now = new Date('2026-11-02T15:00:00');
  assert.match(elie.formatElieHistoryDate('2026-11-02T09:14:00', now), /^Today, /);
  assert.match(elie.formatElieHistoryDate('2026-11-01T09:14:00', now), /^Yesterday, /);
  assert.match(elie.formatElieHistoryDate('2026-10-20T09:14:00', now), /^Oct 20, 2026, /);
  assert.equal(elie.formatElieHistoryDate(null, now), '');
});


test('the page in Elie mode: Elie thread, history from the header, the Elie information panel', () => {
  const { html } = renderChatsPage({ initialConversationId: 'elie' });
  const header = section(html, '<header class="chat-header">', '</header>');
  assert.match(header, /id="elieHistoryToggle" aria-label="Search history" title="Search history" aria-expanded="false"/);
  assert.match(header, /id="elieHistoryToggle"[^>]*><svg class="icon"><use href="#i-clock"><\/use><\/svg><\/button>/);
  assert.doesNotMatch(header, /elieHistoryMore|#i-menu/, 'one history button, the clock on the left');
  // Before the first question: intro, then the composer, then the suggestions below it.
  assert.match(html, /<main class="chat-col is-elie[^"]*elie-fresh">/);
  assert.ok(html.indexOf('chat-input-area is-elie') < html.indexOf('elie-start-suggestions'), 'suggestions below the composer');
  assert.match(header, /<span id="statusText">Your VaRoom search assistant<\/span>/);
  assert.match(html, /<h2>Ask Elie to find you a space\.<\/h2>/);
  const info = section(html, '<aside class="info-col', '</aside>');
  assert.match(info, /<div class="p-name">Elie<\/div><div class="p-line">Your VaRoom search assistant<\/div>/);
  assert.match(info, /<span class="label">About Elie<\/span>/);
  assert.doesNotMatch(html, /Recent search history is preserved on this device/);
  assert.match(html, /<div class="contact-name">Elie<\/div><\/div><div class="contact-bottom"><div class="contact-preview">Your VaRoom search assistant<\/div>/, 'its permanent inbox row');
  // Opening Elie again keeps its open search (and an answer on its way); the information column stays closed.
  const page = read('pages', 'chats.tsx');
  assert.doesNotMatch(page, /elieResetRef|elie\.reset/);
  assert.match(page, /if \(id === ELIE_ID\) \{\s*\/\/[^\n]*\n\s*setElieHistoryOpen\(false\);\s*setInfoCollapsed\(true\);/);
});

test('the Elie thread: questions, replies, news and listings (GPS verified), errors with Retry, thinking', () => {
  const { ElieThread, ElieHistoryPanel } = loadChats('components/chat/ElieThread.tsx');
  const html = render(ElieThread, {
    entries: [
      { id: '1', kind: 'user', text: 'Two bedroom in Kilimani' },
      { id: '2', kind: 'elie', text: 'Here is what I found' },
      { id: '3', kind: 'news', items: [{ title: 'Rates rise', source_url: 'https://news.example/a' }] },
      { id: '4', kind: 'listings', items: [{ id: 'l 1', title: 'Garden flat', location_text: 'Kilimani', verified: true }, { id: 'l2', title: 'Loft' }] },
      { id: '5', kind: 'error', text: 'Search index offline', retryText: 'Two bedroom in Kilimani' },
    ],
    thinking: true, onPrompt() {}, onRetry() {},
  });
  assert.doesNotMatch(html, /Ask Elie to find you a space/);
  assert.match(html, /<div class="msg-row out elie-message"><div class="bubble">Two bedroom in Kilimani<\/div><\/div>/);
  assert.match(html, /<div class="bubble"><div class="elie-text"><p>Here is what I found<\/p><\/div><\/div>/);
  assert.match(html, /<a class="elie-result-card" href="https:\/\/news\.example\/a" target="_blank" rel="noopener noreferrer"><strong>Rates rise<\/strong>/);
  // Listings use the chat's listing card (photo, title, place · kind, price), GPS-verified ones labelled.
  assert.match(html, /<div class="elie-results elie-listing-results"><div class="chat-enquiry-card" role="link" tabindex="0" aria-label="Listing: Garden flat">/);
  assert.match(html, /<span class="chat-enquiry-badge">GPS verified<\/span><span class="chat-enquiry-overlay"><strong>Garden flat<\/strong><small>Kilimani · [^<]+<\/small><span class="chat-enquiry-price">Price on request<\/span>/);
  assert.match(html, /aria-label="Listing: Loft"><span class="chat-enquiry-media"><span class="chat-enquiry-empty" aria-hidden="true"><\/span><span class="chat-enquiry-overlay">/, 'no badge when not verified');
  assert.doesNotMatch(html, /elie-listing-card/);
  assert.match(html, /<div>Search index offline<\/div><button type="button" class="elie-retry-btn" aria-label="Retry searching with Elie"/);
  assert.match(html, /role="status" aria-label="Elie is thinking"/);
  const intro = render(ElieThread, { entries: [], thinking: false, onRetry() {} });
  assert.match(intro, /<h2>Ask Elie to find you a space\.<\/h2>/);
  assert.doesNotMatch(intro, /<button/, 'the suggestions are below the composer');
  const { ElieSuggestions } = loadChats('components/chat/ElieThread.tsx');
  assert.match(render(ElieSuggestions, { onPrompt() {} }), /<div class="elie-suggestions elie-start-suggestions"><button type="button">Airbnbs in Nairobi<\/button>/);
  assert.equal(render(ElieHistoryPanel, { open: false, onClose() {}, listSessions: async () => [], onOpenSession() {}, onNewSearch() {}, ignoreSelector: '' }), '');
  const panel = render(ElieHistoryPanel, { open: true, onClose() {}, listSessions: async () => [], onOpenSession() {}, onNewSearch() {}, ignoreSelector: '' });
  assert.match(panel, /Loading past searches…/);
  assert.match(panel, /class="elie-history-item elie-history-new"><span class="elie-history-item-title">New search<\/span>/);
});

