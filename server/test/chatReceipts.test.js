'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { markDelivered, readReceiptsShared, withVisibleReceipts } = require('../lib/chatReceipts');

function fakeAdmin(result) {
  const calls = [];
  const chain = {
    from(table) { calls.push(['from', table]); return chain; },
    update(row) { calls.push(['update', Object.keys(row)]); return chain; },
    select(cols) { calls.push(['select', cols]); return chain; },
    in(col, values) { calls.push(['in', col, values]); return chain; },
    neq(col, value) { calls.push(['neq', col, value]); return chain; },
    is(col, value) { calls.push(['is', col, value]); return chain; },
    then(resolve) { resolve(result); },
  };
  return { admin: chain, calls };
}

test('markDelivered marks only undelivered messages sent to this person', async () => {
  const { admin, calls } = fakeAdmin({ error: null });
  await markDelivered(admin, 'u1', ['c1', 'c2']);
  assert.deepEqual(calls, [
    ['from', 'messages'],
    ['update', ['delivered_at']],
    ['in', 'conversation_id', ['c1', 'c2']],
    ['neq', 'sender_id', 'u1'],
    ['is', 'delivered_at', null],
  ]);
  const idle = fakeAdmin({ error: null });
  await markDelivered(idle.admin, 'u1', []);
  assert.equal(idle.calls.length, 0, 'no conversations: no request');
  await assert.rejects(markDelivered(fakeAdmin({ error: new Error('boom') }).admin, 'u1', ['c1']), /boom/);
});

test('read receipts are shared only when neither person has turned them off', async () => {
  const conversation = { host_id: 'h', client_id: 'c' };
  assert.equal(await readReceiptsShared(fakeAdmin({ data: [{ id: 'h', read_receipts: true }, { id: 'c', read_receipts: true }], error: null }).admin, conversation), true);
  assert.equal(await readReceiptsShared(fakeAdmin({ data: [{ id: 'h', read_receipts: true }, { id: 'c', read_receipts: false }], error: null }).admin, conversation), false);
  assert.equal(await readReceiptsShared(fakeAdmin({ data: [{ id: 'h', read_receipts: null }], error: null }).admin, conversation), true, 'unset means on');
});

test('the sender sees read_at only when receipts are shared; the reader keeps their own', () => {
  const mine = { id: 'm1', sender_id: 'u1', delivered_at: 't1', read_at: 't2' };
  const theirs = { id: 'm2', sender_id: 'u2', delivered_at: 't1', read_at: 't2' };
  assert.equal(withVisibleReceipts(mine, 'u1', true), mine);
  assert.deepEqual(withVisibleReceipts(mine, 'u1', false), { ...mine, read_at: null }, 'shown as delivered');
  assert.equal(withVisibleReceipts(theirs, 'u1', false), theirs);
});

test('chat routes mark delivery on inbox load, message fetch and read', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assert.equal((routes.match(/markDelivered\(supabaseAdmin, user\.id,/g) || []).length, 3);
  assert.match(routes, /withVisibleReceipts\(withDecryptedBody\(row\), user\.id, receiptsShared\)/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261104_000051_chat_delivery_receipts.sql'), 'utf8');
  assert.match(migration, /add column if not exists delivered_at timestamptz/);
  assert.match(migration, /add column if not exists read_receipts boolean not null default true/);
});
