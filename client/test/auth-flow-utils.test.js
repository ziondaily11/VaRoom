const assert = require('node:assert/strict');
const test = require('node:test');
const {
  accountTypeDescriptions,
  applyOtpInput,
  clearOtpCode,
  createEmptyOtpCode,
  createSubmissionGate,
  isCompleteOtpCode,
  notifyOtpCompletion,
  normalizeSignupRole,
  normalizeUsername,
} = require('../public/js/auth-flow-utils');

test('account type selection defaults to Client while retaining explicit Host selection', () => {
  assert.equal(normalizeSignupRole(), 'client');
  assert.equal(normalizeSignupRole('client'), 'client');
  assert.equal(normalizeSignupRole('host'), 'host');
  assert.equal(accountTypeDescriptions.client, 'Explore spaces in VaRoom.');
  assert.equal(accountTypeDescriptions.host, 'List spaces in VaRoom.');
});

test('OTP input supports individual digits and six-digit paste/autofill', () => {
  const empty = createEmptyOtpCode();
  const partial = applyOtpInput(empty, 0, '1');
  assert.deepEqual(partial, ['1', '', '', '', '', '']);
  assert.equal(isCompleteOtpCode(partial), false);

  const complete = applyOtpInput(empty, 0, '123456');
  assert.deepEqual(complete, ['1', '2', '3', '4', '5', '6']);
  assert.equal(isCompleteOtpCode(complete), true);
  const verifiedTokens = [];
  notifyOtpCompletion(partial, (token) => verifiedTokens.push(token));
  notifyOtpCompletion(complete, (token) => verifiedTokens.push(token));
  assert.deepEqual(verifiedTokens, ['123456']);
  assert.deepEqual(createEmptyOtpCode(), ['', '', '', '', '', '']);
});

test('OTP clearing resets every digit and returns focus to the first input', () => {
  let clearedCode;
  let focused = false;
  clearOtpCode((code) => { clearedCode = code; }, () => { focused = true; });
  assert.deepEqual(clearedCode, ['', '', '', '', '', '']);
  assert.equal(focused, true);
});

test('OTP submission gate blocks duplicate verification and allows retries after failure', async () => {
  const gate = createSubmissionGate();
  let release;
  let calls = 0;
  const pending = gate.run(() => new Promise((resolve) => {
    calls += 1;
    release = resolve;
  }));

  assert.equal(await gate.run(async () => { calls += 1; }), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await pending, true);
  assert.equal(await gate.run(async () => { calls += 1; }), true);
  assert.equal(calls, 2);

  await assert.rejects(gate.run(async () => { throw new Error('invalid code'); }), /invalid code/);
  assert.equal(await gate.run(async () => {}), true);
});

test('username normalization lowercases typed and pasted values without changing allowed characters', () => {
  assert.equal(normalizeUsername('VaRoom.User_01'), 'varoom.user_01');
  assert.equal(normalizeUsername('mixed CASE'), 'mixed case');
});
