'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ValidationError, assertAllowedKeys, text, uuid, number, safeUrl,
} = require('../lib/inputValidation');

test('preserves ordinary text while removing non-printable control characters', () => {
  assert.equal(text('A listing <description> \u0000', 'description'), 'A listing <description> ');
});

test('rejects oversized text and unexpected object properties', () => {
  assert.throws(() => text('x'.repeat(10001), 'message'), ValidationError);
  assert.throws(() => text('<script>alert(1)</script>', 'message'), ValidationError);
  assert.throws(() => assertAllowedKeys({ role: 'admin' }, ['message']), ValidationError);
});

test('rejects invalid ids, non-finite numbers, and out-of-range coordinates', () => {
  assert.throws(() => uuid('not-an-id', 'listing id'), ValidationError);
  assert.throws(() => number(Number.NaN, 'price'), ValidationError);
  assert.throws(() => number(181, 'longitude', { min: -180, max: 180 }), ValidationError);
});

test('allows web URLs but rejects executable URL schemes and credentials', () => {
  assert.match(safeUrl('https://example.com/path', 'url'), /^https:/);
  assert.throws(() => safeUrl('javascript:alert(1)', 'url'), ValidationError);
  assert.throws(() => safeUrl('https://user:pass@example.com', 'url'), ValidationError);
});
