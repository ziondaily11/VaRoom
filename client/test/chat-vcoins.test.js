const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const vcoins = loadTs(path.join(root, 'lib', 'chat', 'vcoins.ts'));
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('the meter is green from 50 coins, yellow from 20, red below; a plan with Elie is always green and full', () => {
  const level = (balance, included = false) => vcoins.vcoinLevel({ balance, included });
  assert.equal(level(100), 'green');
  assert.equal(level(50), 'green');
  assert.equal(level(49), 'yellow');
  assert.equal(level(20), 'yellow');
  assert.equal(level(19), 'red');
  assert.equal(level(0), 'red');
  assert.equal(level(0, true), 'green');
  assert.equal(vcoins.vcoinFill({ balance: 50, included: false }), 0.5);
  assert.equal(vcoins.vcoinFill({ balance: 400, included: false }), 1);
  assert.equal(vcoins.vcoinFill({ balance: 0, included: true }), 1);
});

test('checkout sends only the pack and the payment method, never a price', async () => {
  let request;
  const started = await vcoins.startVcoinCheckout('tok', 'plus', { channel: 'mpesa', phone: '0712345678' }, async (url, init) => {
    request = { url, init };
    return jsonResponse(201, { reference: 'r1', channel: 'mpesa', display_text: 'Enter PIN' });
  });
  assert.equal(request.url, '/api/vcoins/checkout');
  assert.deepEqual(JSON.parse(request.init.body), { pack: 'plus', channel: 'mpesa', phone: '0712345678' });
  assert.equal(request.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(started, { channel: 'mpesa', reference: 'r1', displayText: 'Enter PIN' });
  await assert.rejects(() => vcoins.startVcoinCheckout('tok', 'plus', { channel: 'card' }, async () => jsonResponse(400, { error: 'Choose a V-Coin pack' })), /Choose a V-Coin pack/);
});

test('a payment check returns its state and the wallet after it', async () => {
  const check = (status, waiting) => vcoins.checkVcoinPayment('tok', 'r 1', waiting, async (url) => {
    assert.equal(url, '/api/vcoins/payments/r%201');
    return jsonResponse(200, { payment: { status }, balance: 375, included: false });
  });
  assert.deepEqual(await check('succeeded', false), { state: 'paid', wallet: { balance: 375, included: false } });
  assert.equal((await check('abandoned', true)).state, 'pending');
  assert.equal((await check('abandoned', false)).state, 'failed');
  assert.equal((await check('initialized', false)).state, 'pending');
});

test('the Elie composer shows the meter, and answers keep the balance current for the asking account only', () => {
  const page = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
  assert.match(page, /\{isElie && <VCoinMeter wallet=\{elie\.wallet\} onWallet=\{elie\.setWallet\} openSignal=\{elie\.topupSignal\} \/>\}/);
  const store = fs.readFileSync(path.join(root, 'lib', 'chat', 'elieStore.ts'), 'utf8');
  assert.match(store, /if \(state\.userId !== userId\) return;\s*if \(data\.vcoins\) set\(/);
  assert.match(store, /data\.needs_topup/);
});
