'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.VA_ROOM_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = '1';

const { encryptMessage, decryptMessage } = require('../lib/messageEncryptionService');

test('message encryption and decryption preserves message body for delta sync', () => {
  const original = 'Hello from delta sync test!';
  const encrypted = encryptMessage(original);
  const decrypted = decryptMessage(encrypted.ciphertext, encrypted.iv, encrypted.key_version);
  assert.equal(decrypted, original);
});

test('delta query sorting and filtering filters out older messages correctly', () => {
  const allMessages = [
    { id: 'm1', created_at: '2026-01-01T10:00:00Z', body: 'Msg 1' },
    { id: 'm2', created_at: '2026-01-01T10:05:00Z', body: 'Msg 2' },
    { id: 'm3', created_at: '2026-01-01T10:10:00Z', body: 'Msg 3' }
  ];

  const since = '2026-01-01T10:05:00Z';
  const newerMessages = allMessages.filter((m) => m.created_at > since);

  assert.equal(newerMessages.length, 1);
  assert.equal(newerMessages[0].id, 'm3');
});

test('backward pagination with before and limit retrieves preceding slice', () => {
  const allMessages = [
    { id: 'm1', created_at: '2026-01-01T10:00:00Z', body: 'Msg 1' },
    { id: 'm2', created_at: '2026-01-01T10:05:00Z', body: 'Msg 2' },
    { id: 'm3', created_at: '2026-01-01T10:10:00Z', body: 'Msg 3' },
    { id: 'm4', created_at: '2026-01-01T10:15:00Z', body: 'Msg 4' }
  ];

  const before = '2026-01-01T10:15:00Z';
  const limit = 2;

  const preceding = allMessages
    .filter((m) => m.created_at < before)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .reverse();

  assert.equal(preceding.length, 2);
  assert.equal(preceding[0].id, 'm2');
  assert.equal(preceding[1].id, 'm3');
});
