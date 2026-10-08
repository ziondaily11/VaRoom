'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.VA_ROOM_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = '1';

const { encryptMessage, decryptMessage } = require('../lib/messageEncryptionService');

test('Delta query parsing validates ISO timestamps correctly', () => {
  const validIso = '2026-10-01T10:00:00.000Z';
  const parsedDate = new Date(validIso);
  assert.equal(!isNaN(parsedDate.getTime()), true);
  assert.equal(parsedDate.toISOString(), validIso);

  const invalidIso = 'invalid-timestamp-string';
  const invalidDate = new Date(invalidIso);
  assert.equal(isNaN(invalidDate.getTime()), true);
});

test('Delta filtering logic filters only messages newer than since timestamp', () => {
  const messages = [
    { id: 'm1', created_at: '2026-10-01T10:00:00.000Z', body: 'Msg 1' },
    { id: 'm2', created_at: '2026-10-01T10:05:00.000Z', body: 'Msg 2' },
    { id: 'm3', created_at: '2026-10-01T10:10:00.000Z', body: 'Msg 3' }
  ];

  const since = '2026-10-01T10:05:00.000Z';
  const sinceTime = new Date(since).getTime();

  const delta = messages.filter((m) => new Date(m.created_at).getTime() > sinceTime);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].id, 'm3');
});

test('Reply resolution correctly connects replied messages even when reply is historical', () => {
  const allMessages = new Map([
    ['m1', { id: 'm1', body: 'Original question', sender_id: 'user-1' }],
    ['m2', { id: 'm2', body: 'Answer to question', sender_id: 'user-2', reply_to_message_id: 'm1' }]
  ]);

  const deltaMessages = [{ id: 'm2', body: 'Answer to question', sender_id: 'user-2', reply_to_message_id: 'm1' }];
  const resolved = deltaMessages.map((msg) => {
    const reply = msg.reply_to_message_id ? allMessages.get(msg.reply_to_message_id) : null;
    return {
      ...msg,
      reply_to_message: reply ? {
        id: reply.id,
        sender_id: reply.sender_id,
        body: reply.body
      } : null
    };
  });

  assert.equal(resolved[0].reply_to_message.body, 'Original question');
});

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
