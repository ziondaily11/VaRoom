'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.VA_ROOM_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = '1';

const { encryptMessage, decryptMessage } = require('../lib/messageEncryptionService');

test('encrypts and decrypts messages with unique authenticated nonces', () => {
  const first = encryptMessage('Hello, is the apartment available?');
  const second = encryptMessage('Hello, is the apartment available?');

  assert.equal(decryptMessage(first.ciphertext, first.iv, first.key_version), 'Hello, is the apartment available?');
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test('rejects tampered ciphertext and malformed encrypted values', () => {
  const encrypted = encryptMessage('authenticated content');
  const bytes = Buffer.from(encrypted.ciphertext, 'base64');
  bytes[0] ^= 1;
  assert.throws(
    () => decryptMessage(bytes.toString('base64'), encrypted.iv, encrypted.key_version),
    /Unable to decrypt message/
  );
  assert.throws(
    () => decryptMessage('not-valid', encrypted.iv, encrypted.key_version),
    /Invalid encrypted message/
  );
});

test('decrypts messages using their recorded key version during rotation', () => {
  const oldKey = process.env.VA_ROOM_ENCRYPTION_KEY;
  const oldMessage = encryptMessage('before rotation');
  process.env.VA_ROOM_ENCRYPTION_KEY_V2 = crypto.randomBytes(32).toString('base64');
  process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = '2';
  const newMessage = encryptMessage('after rotation');

  assert.equal(decryptMessage(oldMessage.ciphertext, oldMessage.iv, 1), 'before rotation');
  assert.equal(decryptMessage(newMessage.ciphertext, newMessage.iv, 2), 'after rotation');
  process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = '1';
  process.env.VA_ROOM_ENCRYPTION_KEY = oldKey;
});
