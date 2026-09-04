'use strict';

const { URL } = require('url');

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DANGEROUS_URL_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, field = 'body') {
  if (!isPlainObject(value)) throw new ValidationError(`${field} must be an object`);
  return value;
}

function assertAllowedKeys(value, allowedKeys) {
  assertPlainObject(value);
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) throw new ValidationError(`Unexpected field: ${unexpected}`);
}

function text(value, field, { required = true, max = MAX_TEXT_LENGTH } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const normalized = value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (required && !normalized.trim()) throw new ValidationError(`${field} must not be empty`);
  if (normalized.length > max) throw new ValidationError(`${field} is too long`);
  if (/<\s*(script|iframe|object|embed|style)|\bon[a-z]+\s*=|javascript\s*:/i.test(normalized)) {
    throw new ValidationError(`${field} contains executable markup`);
  }
  return normalized;
}

function uuid(value, field) {
  const normalized = text(value, field, { max: 36 });
  if (!UUID_PATTERN.test(normalized)) throw new ValidationError(`${field} is invalid`);
  return normalized;
}

function number(value, field, { integer = false, min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new ValidationError(`${field} must be a valid number`);
  }
  if (value < min || value > max) throw new ValidationError(`${field} is out of range`);
  return value;
}

function enumValue(value, field, allowed) {
  const normalized = text(value, field, { max: 50 }).toLowerCase();
  if (!allowed.includes(normalized)) throw new ValidationError(`${field} is invalid`);
  return normalized;
}

function safeUrl(value, field, { required = false } = {}) {
  const normalized = text(value, field, { required, max: 2048 });
  if (normalized === undefined) return undefined;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ValidationError(`${field} is invalid`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || DANGEROUS_URL_SCHEMES.has(parsed.protocol)) {
    throw new ValidationError(`${field} scheme is not allowed`);
  }
  if (parsed.username || parsed.password) throw new ValidationError(`${field} must not contain credentials`);
  return parsed.toString();
}

function validateJsonPayload(req, res, next) {
  if (!isPlainObject(req.body)) return res.status(400).json({ error: 'Invalid input' });
  return next();
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

module.exports = {
  MAX_JSON_BYTES,
  ValidationError,
  assertPlainObject,
  assertAllowedKeys,
  text,
  uuid,
  number,
  enumValue,
  safeUrl,
  validateJsonPayload,
  isPlainObject,
};
