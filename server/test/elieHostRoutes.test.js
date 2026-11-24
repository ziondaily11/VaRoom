'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.CHATBOT_API_URL = 'https://chatbot.test';
process.env.CHATBOT_INTERNAL_API_KEY = 'test-internal-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { createElieHostRoutes } = require('../routes/elieHostRoutes');
const { ELIE_HOST_ACTION_LIMIT } = require('../lib/elieHost');

const HOST = '11111111-1111-4111-8111-111111111111';

// Supabase as these routes use it: auth, the account check and the Elie action functions.
function fakeSupabase({ elie = 'included', used = 12 } = {}) {
  const state = { actions: [], rpcCalls: [] };
  const empty = { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: null, error: null }), then: (resolve) => resolve({ data: [], error: null }) };
  return {
    state,
    auth: { getUser: async (token) => (token === 'host-token' ? { data: { user: { id: HOST } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }) },
    from: () => empty,
    rpc: async (name, params) => {
      state.rpcCalls.push([name, params]);
      if (name === 'elie_host_usage') return { data: { included: elie === 'included', used, limit: params.p_limit }, error: null };
      if (name === 'elie_use_host_action') {
        if (elie !== 'included') return { data: { allowed: false, reason: elie, used, limit: params.p_limit }, error: null };
        state.actions.push(params.p_kind);
        return { data: { allowed: true, action_id: state.actions.length, used: used + 1, limit: params.p_limit }, error: null };
      }
      if (name === 'elie_release_host_action') { state.actions.pop(); return { data: null, error: null }; }
      return { data: null, error: { message: 'unexpected' } };
    },
  };
}

async function withRoutes(fake, chatbot, run) {
  const saved = { from: supabaseAdmin.from, rpc: supabaseAdmin.rpc, getUser: supabaseAdmin.auth.getUser };
  Object.assign(supabaseAdmin, { from: fake.from, rpc: fake.rpc });
  supabaseAdmin.auth.getUser = fake.auth.getUser;
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://chatbot.test')) { calls.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) }); return chatbot(calls.length); }
    return realFetch(url, options);
  };
  const app = express();
  app.use(express.json());
  app.use('/api', createElieHostRoutes());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (method, path, token, body) => {
    const response = await realFetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    await run({ request, calls });
  } finally {
    global.fetch = realFetch;
    server.close();
    Object.assign(supabaseAdmin, { from: saved.from, rpc: saved.rpc });
    supabaseAdmin.auth.getUser = saved.getUser;
  }
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const WRITE = { field: 'summary', category: 'airbnb', facts: { Title: 'Garden flat', Amenities: 'Wi-Fi, Pool' }, current: '' };

test('the host sees whether Elie is included and the actions used this month', async () => {
  await withRoutes(fakeSupabase({ used: 37 }), () => json(500, {}), async ({ request }) => {
    assert.deepEqual((await request('GET', '/elie/host', 'host-token')).body, { included: true, used: 37, limit: ELIE_HOST_ACTION_LIMIT, plansUrl: '/pricing' });
    assert.equal((await request('GET', '/elie/host')).status, 401);
  });
  assert.equal(ELIE_HOST_ACTION_LIMIT, 300);
});

test('Write with Elie sends the listing details to the chatbot and uses one action', async () => {
  const fake = fakeSupabase();
  await withRoutes(fake, () => json(200, { text: '  A calm garden flat with a pool.  ' }), async ({ request, calls }) => {
    const result = await request('POST', '/elie/write', 'host-token', WRITE);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { text: 'A calm garden flat with a pool.' });
    assert.equal(calls[0].url, 'https://chatbot.test/internal/listing/write');
    assert.equal(calls[0].headers['X-Elie-Internal-Key'], 'test-internal-key');
    assert.deepEqual(calls[0].body, WRITE);
    assert.deepEqual(fake.state.actions, ['write']);
  });
});

test('Write with Elie: a plan without Elie, the monthly limit, a failure and bad input', async () => {
  for (const [elie, status] of [['plan', 403], ['limit', 429]]) {
    await withRoutes(fakeSupabase({ elie }), () => json(200, { text: 'unused' }), async ({ request, calls }) => {
      const result = await request('POST', '/elie/write', 'host-token', WRITE);
      assert.equal(result.status, status);
      assert.equal(result.body.elie.reason, elie);
      assert.equal(calls.length, 0);
    });
  }
  const fake = fakeSupabase();
  await withRoutes(fake, () => json(503, { detail: 'provider text' }), async ({ request }) => {
    const result = await request('POST', '/elie/write', 'host-token', WRITE);
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.body.error, /provider/);
    assert.deepEqual(fake.state.actions, [], 'the action is given back');
    assert.equal((await request('POST', '/elie/write', 'host-token', { ...WRITE, field: 'title' })).status, 400);
    assert.equal((await request('POST', '/elie/write', 'host-token', { ...WRITE, extra: 1 })).status, 400);
    assert.equal((await request('POST', '/elie/write', 'host-token', { ...WRITE, facts: {}, current: '' })).status, 400);
    assert.equal((await request('POST', '/elie/write', null, WRITE)).status, 401);
  });
});
