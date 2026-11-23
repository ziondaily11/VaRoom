'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyVerifiedTransaction } = require('../lib/billingService');
const { VCOIN_PACKS, vcoinWallet } = require('../lib/vcoins');
const { createVcoinRoutes, packList } = require('../routes/vcoinRoutes');

// A Supabase fake that records every insert and update by table.
function fakeDb({ payment = null, user = { id: 'client-1', email: 'c@example.test' }, wallet = { balance: 50, included: false }, ledgerError = null } = {}) {
  const writes = [];
  const db = {
    writes,
    auth: { getUser: async (token) => ({ data: { user: token === 'good' ? user : null }, error: token === 'good' ? null : new Error('bad') }) },
    rpc: async (name, args) => { writes.push({ table: `rpc:${name}`, value: args }); return { data: wallet, error: null }; },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, neq() { return query; },
        maybeSingle: async () => ({ data: payment, error: null }),
        single: async () => ({ data: { id: 'notification-1' }, error: null }),
        upsert(value) { writes.push({ table, value, op: 'upsert' }); return query; },
        insert(value) {
          writes.push({ table, value, op: 'insert' });
          if (table === 'elie_ledger' && ledgerError) return Promise.resolve({ error: ledgerError });
          return Object.assign(Promise.resolve({ error: null }), query);
        },
        update(value) {
          writes.push({ table, value, op: 'update' });
          const builder = { eq: () => builder, neq: () => builder, select: async () => ({ data: [{ id: payment && payment.id }], error: null }) };
          return builder;
        },
      };
      return query;
    },
  };
  return db;
}

const vcoinPayment = () => ({ id: 'pay-1', host_id: 'client-1', payment_kind: 'vcoins', vcoins: 275, amount_minor: 25000, currency: 'KES', status: 'initialized', niche: 'legacy', billing_interval: 'one_time', provider_payload: {} });
const paidTransaction = (metadata = {}) => ({ id: 9, reference: 'ref-1', status: 'success', amount: 25000, currency: 'KES',
  metadata: { host_id: 'client-1', payment_kind: 'vcoins', vcoins: 275, ...metadata } });

test('packs are priced by the server: more coins per shilling for bigger packs', () => {
  assert.deepEqual(packList(), [
    { id: 'starter', coins: 100, price_kes: 100 },
    { id: 'plus', coins: 275, price_kes: 250 },
    { id: 'pro', coins: 600, price_kes: 500 },
    { id: 'max', coins: 1300, price_kes: 1000 },
  ]);
  assert.ok(Object.isFrozen(VCOIN_PACKS.starter));
});

test('a verified V-Coin payment credits its coins once and never touches a subscription', async () => {
  const db = fakeDb({ payment: vcoinPayment() });
  const result = await applyVerifiedTransaction(db, paidTransaction());
  assert.equal(result.payment.status, 'succeeded');
  const credit = db.writes.filter((write) => write.table === 'elie_ledger');
  assert.deepEqual(credit.map((write) => write.value), [{ user_id: 'client-1', delta: 275, kind: 'purchase', payment_id: 'pay-1' }]);
  assert.equal(db.writes.some((write) => write.table === 'host_subscriptions'), false);
  const notification = db.writes.find((write) => write.table === 'notifications');
  assert.match(notification.value.title, /V-Coins added/);
  assert.match(notification.value.message, /275 V-Coins/);
});

test('a repeated verification adds nothing more (the ledger has one row per payment)', async () => {
  const db = fakeDb({ payment: { ...vcoinPayment(), status: 'succeeded' }, ledgerError: { code: '23505' } });
  await applyVerifiedTransaction(db, paidTransaction());
  assert.equal(db.writes.filter((write) => write.table === 'elie_ledger').length, 1);
});

test('a transaction whose coins, amount or owner differ from the payment is rejected', async () => {
  await assert.rejects(() => applyVerifiedTransaction(fakeDb({ payment: vcoinPayment() }), paidTransaction({ vcoins: 1300 })), /does not match/);
  await assert.rejects(() => applyVerifiedTransaction(fakeDb({ payment: vcoinPayment() }), paidTransaction({ host_id: 'someone-else' })), /does not match/);
  await assert.rejects(() => applyVerifiedTransaction(fakeDb({ payment: vcoinPayment() }), { ...paidTransaction(), amount: 100 }), /does not match/);
  await assert.rejects(() => applyVerifiedTransaction(fakeDb({ payment: vcoinPayment() }), paidTransaction({ payment_kind: 'subscription' })), /does not match/);
});

test('a failed V-Coin payment credits nothing', async () => {
  const db = fakeDb({ payment: vcoinPayment() });
  await applyVerifiedTransaction(db, { ...paidTransaction(), status: 'failed' });
  assert.equal(db.writes.some((write) => write.table === 'elie_ledger'), false);
  assert.equal(db.writes.some((write) => write.table === 'host_subscriptions'), false);
});

test('the wallet reads balance and plan from the database function', async () => {
  const db = fakeDb({ wallet: { balance: 120, included: true } });
  assert.deepEqual(await vcoinWallet(db, 'host-1'), { balance: 120, included: true });
  assert.deepEqual(db.writes[0], { table: 'rpc:elie_vcoin_wallet', value: { p_user_id: 'host-1' } });
});

function route(router, method, path) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods[method]);
  return layer.route.stack[0].handle;
}

async function call(handler, req) {
  let statusCode = 200; let body;
  const res = { status(code) { statusCode = code; return res; }, json(value) { body = value; return res; } };
  await handler({ headers: {}, params: {}, body: {}, ...req }, res);
  return { statusCode, body };
}

const paystack = {
  generateReference: () => 'ref-new',
  charge: async () => ({ display_text: 'Enter your PIN' }),
  initializeTransaction: async () => ({ authorization_url: 'https://checkout.paystack.com/x', access_code: 'ac' }),
  verifyTransaction: async () => paidTransaction(),
};

test('any signed-in account can buy a pack; the server sets the coins and price', async () => {
  const db = fakeDb({ user: { id: 'host-without-plan', email: 'h@example.test' } });
  const router = createVcoinRoutes({ supabaseAdmin: db, paystack, baseUrl: 'http://localhost:3000', nodeEnv: 'development' });
  const checkout = route(router, 'post', '/vcoins/checkout');
  const mpesa = await call(checkout, { headers: { authorization: 'Bearer good' }, body: { pack: 'plus', channel: 'mpesa', phone: '0712 345 678' } });
  assert.equal(mpesa.statusCode, 201);
  assert.equal(mpesa.body.channel, 'mpesa');
  const row = db.writes.find((write) => write.table === 'billing_payments').value;
  assert.equal(row.host_id, 'host-without-plan');
  assert.equal(row.payment_kind, 'vcoins');
  assert.equal(row.vcoins, 275);
  assert.equal(row.amount_minor, 25000);

  assert.equal((await call(checkout, { headers: { authorization: 'Bearer good' }, body: { pack: 'free', channel: 'card' } })).statusCode, 400);
  assert.equal((await call(checkout, { headers: { authorization: 'Bearer good' }, body: { pack: 'plus', channel: 'card', amount: 1 } })).statusCode, 400);
  assert.equal((await call(checkout, { headers: { authorization: 'Bearer good' }, body: { pack: 'plus', channel: 'mpesa', phone: '123' } })).statusCode, 400);
  assert.equal((await call(checkout, { headers: {}, body: { pack: 'plus', channel: 'card' } })).statusCode, 401);

  const card = await call(checkout, { headers: { authorization: 'Bearer good' }, body: { pack: 'starter', channel: 'card' } });
  assert.equal(card.statusCode, 201);
  assert.equal(card.body.access_code, 'ac');
});

test('the balance route returns the wallet and packs; the payment route verifies an unfinished payment', async () => {
  const db = fakeDb({ payment: vcoinPayment(), wallet: { balance: 325, included: false } });
  const router = createVcoinRoutes({ supabaseAdmin: db, paystack, baseUrl: 'http://localhost:3000', nodeEnv: 'development' });
  const wallet = await call(route(router, 'get', '/vcoins'), { headers: { authorization: 'Bearer good' } });
  assert.equal(wallet.body.balance, 325);
  assert.equal(wallet.body.packs.length, 4);
  const status = await call(route(router, 'get', '/vcoins/payments/:reference'), { headers: { authorization: 'Bearer good' }, params: { reference: 'ref-1' } });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.payment.status, 'succeeded');
  assert.equal(status.body.balance, 325);
  assert.equal(db.writes.filter((write) => write.table === 'elie_ledger').length, 1);
});
