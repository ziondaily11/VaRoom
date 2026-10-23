'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/account-switcher.js'), 'utf8');

function createAccount(id) {
  return {
    id,
    email: id + '@example.test',
    full_name: id.toUpperCase(),
    username: id,
    role: 'client',
    access_token: 'access-' + id,
    refresh_token: 'refresh-' + id,
    expires_at: 2_000_000_000
  };
}

function createSession(id) {
  return {
    user: { id, email: id + '@example.test', user_metadata: {} },
    access_token: 'access-' + id,
    refresh_token: 'refresh-' + id,
    expires_at: 2_000_000_000
  };
}

function createContext({ groupByUser, storage = new Map(), failLink = false }) {
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const requests = [];
  const window = {
    localStorage,
    dispatchEvent() {},
    async fetch(url, options = {}) {
      requests.push({ url, options });
      const authToken = (options.headers && options.headers.Authorization || '').replace(/^Bearer /, '');
      const userId = authToken.replace(/^access-/, '');
      if (url === '/api/account-groups/current') {
        const members = groupByUser[userId] || [userId];
        return { ok: true, async json() { return { current_user_id: userId, members: members.map((id) => ({ id, full_name: id.toUpperCase(), username: id, email: id === userId ? id + '@example.test' : '' })) }; } };
      }
      if (url === '/api/account-groups/link') {
        if (failLink) return { ok: false, status: 409, async json() { return { error: 'Account limit reached (3/3).' }; } };
        const additionalToken = JSON.parse(options.body).additional_access_token;
        const additionalId = additionalToken.replace(/^access-/, '');
        const members = Array.from(new Set([...(groupByUser[userId] || [userId]), additionalId]));
        groupByUser[userId] = members;
        groupByUser[additionalId] = members;
        return { ok: true, async json() { return { current_user_id: userId, members: members.map((id) => ({ id, full_name: id.toUpperCase(), username: id, email: id === userId ? id + '@example.test' : '' })) }; } };
      }
      throw new Error('Unexpected account-group endpoint: ' + url);
    }
  };
  const events = [];
  vm.runInNewContext(source, {
    window,
    localStorage,
    document: {},
    alert() {},
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  return { api: window.VaRoomAccountSwitcher, storage, localStorage, requests, events };
}

function createClient(session) {
  let currentSession = session;
  return {
    auth: {
      async getSession() { return { data: { session: currentSession }, error: null }; },
      async setSession(tokens) {
        if (tokens.refresh_token !== currentSession.refresh_token) return { data: { session: null }, error: new Error('Invalid Refresh Token') };
        return { data: { session: currentSession }, error: null };
      }
    },
    from() {
      return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
    },
    setSession(next) { currentSession = next; }
  };
}

test('X, Y, and Z resolve the same authorized group regardless of which member signs in', async () => {
  const groupByUser = { x: ['x', 'y', 'z'], y: ['x', 'y', 'z'], z: ['x', 'y', 'z'] };
  const resolved = [];
  for (const id of ['x', 'y', 'z']) {
    const context = createContext({ groupByUser });
    await context.api.loadLinkedAccounts(createClient(createSession(id)), createSession(id));
    resolved.push(context.api.getLinkedAccounts().map((member) => member.id).sort().join(','));
  }
  assert.deepEqual(resolved, ['x,y,z', 'x,y,z', 'x,y,z']);
});

test('the authenticated current account counts toward the three-member limit', async () => {
  const context = createContext({ groupByUser: { x: ['x', 'y', 'z'] } });
  await context.api.loadLinkedAccounts(createClient(createSession('x')), createSession('x'));
  assert.equal(context.api.getLinkedAccounts().length, 3);
  assert.equal(context.api.getLinkedAccounts().some((member) => member.id === 'x'), true);
  assert.equal(context.api.canAddAccount(), false);
});

test('unrelated account F sees only F and old browser-only account tokens are not imported', async () => {
  const storage = new Map([['varoom_linked_accounts', JSON.stringify([createAccount('x'), createAccount('y'), createAccount('z')])]]);
  const context = createContext({ groupByUser: { f: ['f'] }, storage });
  await context.api.loadLinkedAccounts(createClient(createSession('f')), createSession('f'));
  assert.deepEqual(context.api.getLinkedAccounts().map((member) => member.id), ['f']);
  const cached = JSON.parse(storage.get('varoom_linked_accounts'));
  assert.deepEqual(cached, []);
});

test('explicitly adding Y links through the authenticated API and keeps X as the active session', async () => {
  const context = createContext({ groupByUser: { x: ['x'] } });
  const client = createClient(createSession('x'));
  await context.api.loadLinkedAccounts(client, createSession('x'));
  const result = await context.api.linkAdditionalSession(client, createSession('y'));
  assert.equal(result.session_cached, true);
  assert.deepEqual(context.api.getLinkedAccounts().map((member) => member.id), ['x', 'y']);
  assert.equal(context.api.getLinkedAccounts().find((member) => member.id === 'y').refresh_token, 'refresh-y');
  assert.equal((await client.auth.getSession()).data.session.user.id, 'x');
  const linkRequest = context.requests.find((request) => request.url === '/api/account-groups/link');
  assert.equal(linkRequest.options.headers.Authorization, 'Bearer access-x');
  assert.deepEqual(JSON.parse(linkRequest.options.body), { additional_access_token: 'access-y' });
  assert.equal(linkRequest.options.body.includes('refresh-y'), false);
});

test('a rejected membership operation does not add the account to the displayed group or local session cache', async () => {
  const context = createContext({ groupByUser: { x: ['x'] }, failLink: true });
  const client = createClient(createSession('x'));
  await context.api.loadLinkedAccounts(client, createSession('x'));
  await assert.rejects(context.api.linkAdditionalSession(client, createSession('y')), /limit reached/i);
  assert.deepEqual(context.api.getLinkedAccounts().map((member) => member.id), ['x']);
  assert.deepEqual(JSON.parse(context.storage.get('varoom_linked_accounts')), []);
});

test('a second browser receives group profiles but not another member refresh tokens', async () => {
  const context = createContext({ groupByUser: { x: ['x', 'y', 'z'] } });
  await context.api.loadLinkedAccounts(createClient(createSession('x')), createSession('x'));
  const members = context.api.getLinkedAccounts();
  assert.deepEqual(members.map((member) => member.id), ['x', 'y', 'z']);
  assert.equal(members.find((member) => member.id === 'y').refresh_token, undefined);
  assert.equal(members.find((member) => member.id === 'y').email, '');
});
