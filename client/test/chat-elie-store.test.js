const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const elie = loadTs(path.join(root, 'lib', 'chat', 'elie.ts'));
// The store shares this copy of elie.ts, so the errors the tests throw are its own.
const { createElieStore, elieStorageKey, ELIE_PENDING_MS } = loadTs(path.join(root, 'lib', 'chat', 'elieStore.ts'), { mocks: { './elie': elie } });

// Supabase as the store uses it: sessions, messages (with or without the results column).
function fakeClient({ rows = [], missingResults = false } = {}) {
  const calls = [];
  const db = { rows: rows.slice() };
  const from = (table) => ({
    insert(value) {
      calls.push(['insert', table, value]);
      const failed = table === 'elie_messages' && missingResults && JSON.stringify(value).includes('"results"');
      const result = table === 'elie_sessions' ? { data: { id: 'sess-1' }, error: null } : { data: null, error: failed ? { code: '42703', message: 'column "results" does not exist' } : null };
      const done = Promise.resolve(result);
      done.select = () => ({ single: async () => result });
      return done;
    },
    select(columns) {
      calls.push(['select', table, columns]);
      const query = {
        eq: () => query,
        order: async () => (missingResults && columns.includes('results')
          ? { data: null, error: { code: '42703', message: 'column "results" does not exist' } }
          : { data: db.rows.slice(), error: null }),
      };
      return query;
    },
    update(value) { calls.push(['update', table, value]); return { eq: async () => ({ error: null }) }; },
  });
  return { calls, db, client: { from } };
}

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key), items };
}

function makeStore({ client = fakeClient().client, storage = memoryStorage(), ask, now = () => 1000, wait = async () => {}, wake = () => {}, fetchWallet = async () => ({ balance: 50, included: false }) } = {}) {
  return createElieStore({ getClient: () => client, getStorage: () => storage, getToken: async () => 'tok', ask, now, wait, wake, fetchWallet });
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('asking creates the session once, sends it, and leaves saving to the Elie service', async () => {
  const { calls, client } = fakeClient();
  const storage = memoryStorage();
  const asked = [];
  const store = makeStore({ client, storage, ask: async (request) => { asked.push(request); return { reply: 'Here you go.', saved: true, vcoins: { balance: 40, included: false } }; } });
  store.setUser('u1');
  await settle();
  await store.send('Airbnbs in Kilimani');
  await store.send('cheaper ones');
  assert.equal(calls.filter(([op, table]) => op === 'insert' && table === 'elie_sessions').length, 1);
  assert.deepEqual(asked.map((request) => request.sessionId), ['sess-1', 'sess-1']);
  assert.deepEqual(asked[1].history.map((turn) => turn.text), ['Airbnbs in Kilimani', 'Here you go.', 'cheaper ones']);
  assert.equal(calls.some(([op, table]) => op === 'insert' && table === 'elie_messages'), false, 'the service saved both turns');
  const state = store.getState();
  assert.deepEqual(state.entries.map((entry) => entry.kind), ['user', 'elie', 'user', 'elie']);
  assert.equal(state.thinking, false);
  assert.equal(state.wallet.balance, 40);
  // The open search is remembered with no question waiting.
  assert.deepEqual(JSON.parse(storage.getItem(elieStorageKey('u1'))), { sessionId: 'sess-1', savedAt: 1000, pending: null });
});

test('when the service could not save, the page saves the question and answer, answer last', async () => {
  const { calls, client } = fakeClient({ missingResults: true });
  const store = makeStore({ client, ask: async () => ({ reply: 'Found two.', listings: [{ id: 'l1' }], saved: false }) });
  store.setUser('u1');
  await settle();
  await store.send('lofts');
  await settle();
  const inserts = calls.filter(([op, table]) => op === 'insert' && table === 'elie_messages').map(([, , rows]) => rows);
  assert.equal(inserts.length, 2, 'retried without the results column (before migration 000080)');
  assert.deepEqual(inserts[0].map((row) => [row.role, row.body]), [['user', 'lofts'], ['elie', 'Found two.']]);
  assert.deepEqual(inserts[0][1].results, { listings: [{ id: 'l1' }] });
  assert.equal('results' in inserts[1][1], false);
  assert.ok(inserts[0][0].created_at < inserts[0][1].created_at);
});

test('the answer lands even when nobody is watching (Elie left, chat or page switched)', async () => {
  let answer;
  const store = makeStore({ ask: () => new Promise((resolve) => { answer = resolve; }) });
  store.setUser('u1');
  await settle();
  const unsubscribe = store.subscribe(() => {});
  const asking = store.send('venues in Nakuru');
  await settle();
  unsubscribe();
  assert.equal(store.getState().thinking, true);
  answer({ reply: 'Here are venues.', saved: true });
  await asking;
  assert.deepEqual(store.getState().entries.map((entry) => entry.kind), ['user', 'elie']);
  assert.equal(store.getState().thinking, false);
});

test('another account starts empty and never receives the first account\'s answer or coins', async () => {
  let answer;
  const store = makeStore({ ask: () => new Promise((resolve) => { answer = resolve; }) });
  store.setUser('u1');
  await settle();
  const asking = store.send('offices');
  await settle();
  store.setUser('u2');
  await settle();
  answer({ reply: 'For u1 only', saved: true, vcoins: { balance: 7, included: false } });
  await asking;
  const state = store.getState();
  assert.equal(state.userId, 'u2');
  assert.deepEqual(state.entries, []);
  assert.equal(state.wallet, null);
  assert.equal(state.thinking, false);
});

test('after a reload the open search comes back, and an answer still on its way is waited for', async () => {
  const { client, db } = fakeClient({ rows: [{ role: 'user', body: 'hotels', results: null }, { role: 'elie', body: 'Two hotels.', results: { listings: [{ id: 'h1' }] } }] });
  const storage = memoryStorage({ [elieStorageKey('u1')]: JSON.stringify({ sessionId: 'sess-9', savedAt: 900, pending: { question: 'cheaper?', askedAt: 950 } }) });
  let waits = 0;
  const store = makeStore({
    client, storage,
    wait: async () => {
      waits += 1;
      if (waits === 2) db.rows.push({ role: 'user', body: 'cheaper?', results: null }, { role: 'elie', body: 'One under 5k.', results: null });
    },
  });
  store.setUser('u1');
  await settle(); await settle();
  for (let i = 0; i < 10 && store.getState().thinking; i += 1) await settle();
  const state = store.getState();
  assert.deepEqual(state.entries.map((entry) => entry.kind), ['user', 'elie', 'listings', 'user', 'elie'], 'listing cards come back from results');
  assert.equal(state.entries[4].text, 'One under 5k.');
  assert.equal(state.thinking, false);
  assert.equal(JSON.parse(storage.getItem(elieStorageKey('u1'))).pending, null);
});

test('an answer that never arrives ends with Ask again, and the open search is forgotten after a day', async () => {
  const { client } = fakeClient({ rows: [] });
  let time = 1000;
  const storage = memoryStorage({ [elieStorageKey('u1')]: JSON.stringify({ sessionId: 'sess-9', savedAt: 1000, pending: { question: 'venues', askedAt: 1000 } }) });
  const store = makeStore({ client, storage, now: () => time, wait: async () => { time += ELIE_PENDING_MS; } });
  store.setUser('u1');
  for (let i = 0; i < 10; i += 1) await settle();
  const last = store.getState().entries.at(-1);
  assert.equal(last.kind, 'error');
  assert.equal(last.retryText, 'venues');

  const stale = memoryStorage({ [elieStorageKey('u3')]: JSON.stringify({ sessionId: 'old', savedAt: 0, pending: null }) });
  const fresh = makeStore({ client, storage: stale, now: () => 2 * 24 * 60 * 60 * 1000 });
  fresh.setUser('u3');
  await settle();
  assert.deepEqual(fresh.getState().entries, []);
});

test('New search empties the thread and forgets the open search', async () => {
  const storage = memoryStorage();
  const store = makeStore({ storage, ask: async () => ({ reply: 'ok', saved: true }) });
  store.setUser('u1');
  await settle();
  await store.send('hi');
  assert.ok(storage.getItem(elieStorageKey('u1')));
  store.newSearch();
  assert.deepEqual(store.getState().entries, []);
  assert.equal(storage.getItem(elieStorageKey('u1')), null);
});

test('saved turns become the thread: questions, answers, news and listing cards', () => {
  const entries = elie.elieTurnEntries([
    { role: 'user', text: 'news on land rates', results: null },
    { role: 'elie', text: 'Rates rose.', results: { news: [{ title: 'Rates' }] } },
    { role: 'elie', text: 'Plain answer', results: null },
  ]);
  assert.deepEqual(entries.map((entry) => entry.kind), ['user', 'elie', 'news', 'elie']);
});


// --- Phase 3: the Elie service sleeps when idle -----------------------------------

test('signing in wakes the Elie service, at most every five minutes', async () => {
  let time = 0;
  let wakes = 0;
  const store = makeStore({ now: () => time, wake: () => { wakes += 1; } });
  store.setUser('u1');
  store.setUser('u2');
  assert.equal(wakes, 1);
  time += 5 * 60 * 1000 + 1;
  store.setUser('u1');
  assert.equal(wakes, 2);
  store.setUser(null);
  assert.equal(wakes, 2, 'signing out wakes nothing');
});

test('a question that never reached Elie is asked once more, with a longer wait, while Elie wakes up', async () => {
  const asked = [];
  let store;
  const ask = async (request) => {
    asked.push(request);
    if (asked.length === 1) throw new elie.ElieRequestError('Could not reach Elie.', 'waking');
    assert.equal(store.getState().waking, true, 'shown as waking up');
    return { reply: 'Here you go.', saved: true };
  };
  store = makeStore({ ask });
  store.setUser('u1');
  await settle();
  await store.send('lofts');
  assert.equal(asked.length, 2);
  assert.equal(asked[1].timeoutMs, elie.ELIE_WAKING_TIMEOUT_MS);
  assert.equal(asked[1].message, 'lofts');
  assert.deepEqual(store.getState().entries.map((entry) => entry.kind), ['user', 'elie']);
  assert.equal(store.getState().waking, false);
});

test('a question that timed out is never asked (or paid for) twice: the saved answer is awaited', async () => {
  const { client, db } = fakeClient();
  let asks = 0;
  let wallets = 0;
  const store = makeStore({
    client,
    ask: async () => { asks += 1; throw new elie.ElieRequestError('Elie is taking longer than expected.', 'timeout'); },
    wait: async () => { db.rows.push({ role: 'user', body: 'venues', results: null }, { role: 'elie', body: 'Two venues.', results: null }); },
    fetchWallet: async () => { wallets += 1; return { balance: 40, included: false }; },
  });
  store.setUser('u1');
  await settle();
  await store.send('venues');
  await settle();
  assert.equal(asks, 1);
  assert.deepEqual(store.getState().entries.map((entry) => entry.kind), ['user', 'elie']);
  assert.equal(store.getState().entries[1].text, 'Two venues.');
  assert.equal(store.getState().wallet.balance, 40, 'the balance is refreshed after the charge');
  assert.equal(wallets, 1);
  assert.equal(store.getState().thinking, false);
});

test('a timed-out answer that never arrives, and an error from Elie, end with Ask again', async () => {
  let time = 1000;
  const late = makeStore({
    client: fakeClient().client,
    now: () => time,
    wait: async () => { time += ELIE_PENDING_MS; },
    ask: async () => { throw new elie.ElieRequestError('Elie is taking longer than expected.', 'timeout'); },
  });
  late.setUser('u1');
  await settle();
  await late.send('venues');
  const last = late.getState().entries.at(-1);
  assert.equal(last.kind, 'error');
  assert.equal(last.retryText, 'venues');

  let asks = 0;
  const failing = makeStore({ ask: async () => { asks += 1; throw new elie.ElieRequestError('Elie is temporarily unavailable.'); } });
  failing.setUser('u1');
  await settle();
  await failing.send('offices');
  assert.equal(asks, 1, 'an error Elie gave is not retried');
  assert.equal(failing.getState().entries.at(-1).text, 'Elie is temporarily unavailable.');
});

test('askElie says why a question failed', async () => {
  const reason = async (fetchFn) => {
    try { await elie.askElie({ message: 'x', history: [], token: 't', fetchFn, timeoutMs: 5 }); } catch (error) { return error.reason; }
    return 'ok';
  };
  const abort = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.equal(await reason(async () => { throw abort(); }), 'timeout');
  assert.equal(await reason(async () => { throw new TypeError('fetch failed'); }), 'waking');
  assert.equal(await reason(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })), 'waking');
  assert.equal(await reason(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Elie is temporarily unavailable.' }) })), 'error');
  assert.equal(elie.ELIE_HEALTH_URL, 'https://elie1-0.onrender.com/health');
  let woke;
  elie.wakeElie(async (url) => { woke = url; return {}; });
  assert.equal(woke, elie.ELIE_HEALTH_URL);
});
