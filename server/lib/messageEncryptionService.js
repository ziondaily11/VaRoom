'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;
const DEFAULT_KEY_VERSION = 1;

function decodeKey(value, name) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is not configured`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error(`${name} must be base64 encoded`);
  }
  let key;
  try {
    key = Buffer.from(value, 'base64');
  } catch {
    throw new Error(`${name} must be base64 encoded`);
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must contain a 256-bit key`);
  }
  return key;
}

function configuredKey(version) {
  const versionedName = `VA_ROOM_ENCRYPTION_KEY_V${version}`;
  return decodeKey(
    process.env[versionedName] || (version === DEFAULT_KEY_VERSION ? process.env.VA_ROOM_ENCRYPTION_KEY : null),
    versionedName
  );
}

function activeVersion() {
  const value = process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION || String(DEFAULT_KEY_VERSION);
  if (!/^[1-9]\d*$/.test(value)) throw new Error('VA_ROOM_ENCRYPTION_ACTIVE_VERSION must be a positive integer');
  return Number(value);
}

function encryptMessage(plaintext) {
  if (typeof plaintext !== 'string') throw new TypeError('Message plaintext must be a string');
  const keyVersion = activeVersion();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, configuredKey(keyVersion), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    key_version: keyVersion,
  };
}

function decryptMessage(ciphertext, iv, keyVersion) {
  if (typeof ciphertext !== 'string' || typeof iv !== 'string' || !Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error('Invalid encrypted message');
  }
  let encrypted;
  let nonce;
  try {
    encrypted = Buffer.from(ciphertext, 'base64');
    nonce = Buffer.from(iv, 'base64');
  } catch {
    throw new Error('Invalid encrypted message');
  }
  if (nonce.length !== IV_BYTES || encrypted.length < AUTH_TAG_BYTES) {
    throw new Error('Invalid encrypted message');
  }
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, configuredKey(keyVersion), nonce);
    decipher.setAuthTag(encrypted.subarray(-AUTH_TAG_BYTES));
    return Buffer.concat([
      decipher.update(encrypted.subarray(0, -AUTH_TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt message');
  }
}

module.exports = {
  encryptMessage,
  decryptMessage,
};
