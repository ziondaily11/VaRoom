'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendRecoveryOtp, sendConfirmationOtp } = require('../lib/authEmail');

test('OTP emails use the dedicated sender and do not include reply-to headers', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.RESEND_FROM_EMAIL;
  const requests = [];

  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM_EMAIL = 'VaRoom <general@example.test>';
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: `test-${requests.length}` }) };
  };

  try {
    await sendRecoveryOtp('person@example.test', '123456');
    await sendConfirmationOtp('person@example.test', '654321');
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFromEmail;
  }

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.from, 'VaRoom <otp@varoom.co.ke>');
    assert.equal(request.to, 'person@example.test');
    assert.equal(Object.hasOwn(request, 'headers'), false);
  }
});
