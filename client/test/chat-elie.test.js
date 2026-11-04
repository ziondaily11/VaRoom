const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
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

test('the page: Elie thread, history from the header, Elie info panel, new search on selection', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
  assert.match(source, /<ElieThread entries=\{elie\.entries\} thinking=\{elie\.thinking\}/);
  assert.match(source, /if \(!isSameConversation\) elieResetRef\.current\(\);/);
  assert.match(source, /id="elieHistoryMore"\s*title="Search history"/);
  assert.match(source, /<ElieHistoryPanel/);
  assert.match(source, /'Your VaRoom search assistant' : typingInConversation === activeId \? 'typing…' : presenceKnownId/);
  assert.match(source, /<span className="label">About Elie<\/span>/);
  assert.doesNotMatch(source, /Recent search history is preserved on this device/);
  const thread = fs.readFileSync(path.join(root, 'components', 'chat', 'ElieThread.tsx'), 'utf8');
  assert.match(thread, /Ask Elie to find you a space\./);
  assert.match(thread, /href=\{`\/booking\?listing=\$\{encodeURIComponent\(listing\.id\)\}`\}/);
  assert.match(thread, /target="_blank" rel="noopener noreferrer"/);
  assert.match(thread, /\{listing\.verified && <em>GPS verified<\/em>\}/);
});

test('Retry asks again without repeating the question in the thread, history or saved session', () => {
  const hook = fs.readFileSync(path.join(root, 'components', 'chat', 'useElie.ts'), 'utf8');
  assert.match(hook, /if \(!retry\) \{\s*setEntries\(\(prev\) => \[\.\.\.prev, \{ id: elieEntryId\(\), kind: 'user', text: question \}\]\);\s*historyRef\.current\.push\(\{ role: 'user', text: question \}\);\s*void recorder\.record\('user', question\);\s*\}/);
  assert.match(hook, /void send\(entry\.retryText, \{ retry: true \}\);/);
});
