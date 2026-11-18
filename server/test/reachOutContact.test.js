const test = require('node:test');
const assert = require('node:assert/strict');
const { contactChannels } = require('../lib/reachOutContact');

test('no settings row: every channel follows the account', () => {
  assert.deepEqual(contactChannels(null, '+254700000001', 'host@example.com'), {
    whatsapp: '+254700000001', email: 'host@example.com', phone: '+254700000001',
  });
});

test('saved values win; WhatsApp follows the contact phone before the registration phone', () => {
  assert.deepEqual(contactChannels({ phone: '+254711111111', whatsapp: null, email: 'contact@example.com' }, '+254700000001', 'host@example.com'), {
    whatsapp: '+254711111111', email: 'contact@example.com', phone: '+254711111111',
  });
  assert.equal(contactChannels({ whatsapp: '+254722222222', phone: '+254711111111' }, null, null).whatsapp, '+254722222222');
});

test('a channel that is off, or has no value, is null', () => {
  const off = contactChannels({ whatsapp_enabled: false, email_enabled: false, phone_enabled: false }, '+254700000001', 'host@example.com');
  assert.deepEqual(off, { whatsapp: null, email: null, phone: null });
  assert.deepEqual(contactChannels({ phone: '  ', email: '' }, null, '  '), { whatsapp: null, email: null, phone: null });
});
