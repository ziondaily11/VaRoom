'use strict';

// Admin sign-in security (migration 20261129_000100): authenticator-app codes
// (TOTP, RFC 6238: 6 digits, 30 seconds, SHA-1, as Google Authenticator and
// similar apps expect) and a lockout kept on the admin row, so it survives
// restarts and is shared by every server instance.

const crypto = require('crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += BASE32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The 6-digit code for a base32 secret at a moment. */
function totp(secret, now = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(value).padStart(6, '0');
}

/** A code is accepted for the current 30 seconds and one step either side (clock drift). */
function verifyTotp(secret, code, now = Date.now()) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  return [-1, 0, 1].some((step) => crypto.timingSafeEqual(Buffer.from(totp(secret, now + step * 30000)), Buffer.from(given)));
}

const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

const otpauthUri = (secret, email) =>
  `otpauth://totp/${encodeURIComponent(`VaRoom Admin:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('VaRoom Admin')}&algorithm=SHA1&digits=6&period=30`;

// The secret is stored encrypted (AES-256-GCM) under a key derived from
// ADMIN_SESSION_SECRET. Changing that secret means admins set up two-step
// sign-in again (a super admin can reset it for them).
function secretKey() {
  if (!process.env.ADMIN_SESSION_SECRET) throw new Error('ADMIN_SESSION_SECRET is not configured');
  return crypto.createHash('sha256').update(`${process.env.ADMIN_SESSION_SECRET}:admin-totp`).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}

function decryptSecret(stored) {
  const [iv, tag, data] = String(stored || '').split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Whether the admin row is locked out now; { waitSeconds } when it is. */
function lockout(admin, now = Date.now()) {
  const until = admin && admin.locked_until ? new Date(admin.locked_until).getTime() : 0;
  return until > now ? { waitSeconds: Math.ceil((until - now) / 1000) } : null;
}

/** The row update after a failed password or code: the fifth in a row locks it for 15 minutes. */
function failedAttempt(admin, now = Date.now()) {
  const count = Number(admin.failed_logins || 0) + 1;
  return count >= MAX_ATTEMPTS
    ? { failed_logins: 0, locked_until: new Date(now + LOCKOUT_MS).toISOString() }
    : { failed_logins: count };
}

module.exports = { totp, verifyTotp, newTotpSecret, otpauthUri, encryptSecret, decryptSecret, lockout, failedAttempt, MAX_ATTEMPTS, base32Encode };
