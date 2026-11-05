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

test('listing meta and history dates', () => {
  assert.equal(elie.elieListingMeta({ id: 'x', location_text: 'Kilimani', size_or_type: '2 bed', price_amount: 85000 }), `Kilimani · 2 bed · KSh ${Number(85000).toLocaleString()}`);
  assert.equal(elie.elieListingMeta({ id: 'x', location_text: 'Westlands' }), 'Westlands');
  const now = new Date('2026-11-02T15:00:00');
  assert.match(elie.formatElieHistoryDate('2026-11-02T09:14:00', now), /^Today, /);
  assert.match(elie.formatElieHistoryDate('2026-11-01T09:14:00', now), /^Yesterday, /);
  assert.match(elie.formatElieHistoryDate('2026-10-20T09:14:00', now), /^Oct 20, 2026, /);
  assert.equal(elie.formatElieHistoryDate(null, now), '');
});

function fakeClient() {
  const calls = [];
  let sessions = 0;
  const table = (name) => ({
    insert(row) {
      calls.push(['insert', name, row]);
      const result = name === 'elie_sessions' ? { data: { id: `s${++sessions}` }, error: null } : { data: null, error: null };
      const thenable = Promise.resolve(result);
      thenable.select = () => ({ single: () => new Promise((resolve) => setTimeout(() => resolve(result), 5)) });
      return thenable;
    },
    update(row) { calls.push(['update', name, row]); return { eq: async () => ({ error: null }) }; },
  });
  return { calls, client: { from: table } };
}

test('the recorder creates one session even when a reply is saved before the first save finishes', async () => {
  const { calls, client } = fakeClient();
  const recorder = elie.createElieRecorder(client, 'u1');
  const first = recorder.record('user', 'Two bedroom in Kilimani under 90k');
  const second = recorder.record('elie', 'Here are three options');
  await Promise.all([first, second]);
  const sessionInserts = calls.filter(([op, name]) => op === 'insert' && name === 'elie_sessions');
  assert.equal(sessionInserts.length, 1);
  assert.equal(sessionInserts[0][2].title, 'Two bedroom in Kilimani under 90k'.slice(0, 60));
  const messages = calls.filter(([op, name]) => op === 'insert' && name === 'elie_messages').map(([, , row]) => [row.session_id, row.role]);
  assert.deepEqual(messages, [['s1', 'user'], ['s1', 'elie']]);
  assert.equal(recorder.sessionId, 's1');
});

test('a resumed session gets new turns without creating another', async () => {
  const { calls, client } = fakeClient();
  const recorder = elie.createElieRecorder(client, 'u1');
  recorder.resume('old');
  await recorder.record('user', 'more please');
  assert.equal(calls.filter(([op, name]) => op === 'insert' && name === 'elie_sessions').length, 0);
  assert.equal(calls.find(([op, name]) => op === 'insert' && name === 'elie_messages')[2].session_id, 'old');
});

test('the page in Elie mode: Elie thread, history from the header, the Elie information panel', () => {
  const { html } = renderChatsPage({ initialConversationId: 'elie' });
  const header = section(html, '<header class="chat-header">', '</header>');
  assert.match(header, /id="elieHistoryToggle" aria-label="Search history" title="Search history" aria-expanded="false"/);
  assert.match(header, /id="elieHistoryMore" title="Search history" aria-label="Search history" aria-expanded="false"/);
  assert.match(header, /<span id="statusText">Your VaRoom search assistant<\/span>/);
  assert.match(html, /<h2>Ask Elie to find you a space\.<\/h2>/);
  const info = section(html, '<aside class="info-col', '</aside>');
  assert.match(info, /<div class="p-name">Elie<\/div><div class="p-line">Your VaRoom search assistant<\/div>/);
  assert.match(info, /<span class="label">About Elie<\/span>/);
  assert.doesNotMatch(html, /Recent search history is preserved on this device/);
  assert.match(html, /<div class="contact-name">Elie<\/div><\/div><div class="contact-bottom"><div class="contact-preview">Your VaRoom search assistant<\/div>/, 'its permanent inbox row');
  // A new search each time Elie is opened from another conversation; the information column stays closed.
  assert.match(read('pages', 'chats.tsx'), /if \(!isSameConversation\) elieResetRef\.current\(\);\s*setElieHistoryOpen\(false\);\s*setInfoCollapsed\(true\);/);
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
  assert.match(html, /<a class="elie-result-card" href="https:\/\/news\.example\/a" target="_blank" rel="noopener noreferrer"><strong>Rates rise<\/strong>/);
  assert.match(html, /<a class="elie-result-card elie-listing-card" href="\/booking\?listing=l%201"><strong>Garden flat<\/strong><span>Kilimani<\/span><em>GPS verified<\/em><\/a>/);
  assert.match(html, /href="\/booking\?listing=l2"><strong>Loft<\/strong><span><\/span><\/a>/, 'no badge when not verified');
  assert.match(html, /<div>Search index offline<\/div><button type="button" class="elie-retry-btn" aria-label="Retry searching with Elie"/);
  assert.match(html, /role="status" aria-label="Elie is thinking"/);
  const intro = render(ElieThread, { entries: [], thinking: false, onPrompt() {}, onRetry() {} });
  assert.match(intro, /<button type="button">Airbnbs in Nairobi<\/button>/);
  assert.equal(render(ElieHistoryPanel, { open: false, onClose() {}, listSessions: async () => [], onOpenSession() {}, ignoreSelector: '' }), '');
  assert.match(render(ElieHistoryPanel, { open: true, onClose() {}, listSessions: async () => [], onOpenSession() {}, ignoreSelector: '' }), /Loading past searches…/);
});

test('Retry asks again without repeating the question in the thread, history or saved session', () => {
  const recorded = [];
  const recorder = { record: async (role, text) => { recorded.push([role, text]); } };
  const history = [{ role: 'elie', text: 'Hi' }];
  const entry = elie.beginElieQuestion('Offices in Westlands', { retry: false, history, recorder });
  assert.equal(entry.kind, 'user');
  assert.equal(entry.text, 'Offices in Westlands');
  assert.deepEqual(history.map((turn) => turn.role), ['elie', 'user']);
  assert.deepEqual(recorded, [['user', 'Offices in Westlands']]);
  assert.equal(elie.beginElieQuestion('Offices in Westlands', { retry: true, history, recorder }), null);
  assert.equal(history.length, 2);
  assert.equal(recorded.length, 1);
  assert.match(read('components', 'chat', 'useElie.ts'), /void send\(entry\.retryText, \{ retry: true \}\);/);
});
