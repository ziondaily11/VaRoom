'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ERROR_CODES, sendError } = require('../lib/apiResponse');

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('sendError returns a stable error message and status-derived code', () => {
  const response = responseDouble();

  sendError(response, 404, 'Listing not found');

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    error: 'Listing not found',
    code: ERROR_CODES.NOT_FOUND,
  });
});

test('sendError allows explicit codes for errors with non-standard statuses', () => {
  const response = responseDouble();

  sendError(response, 503, 'Property news is not configured yet.', ERROR_CODES.INTERNAL_ERROR);

  assert.equal(response.body.code, ERROR_CODES.INTERNAL_ERROR);
});
