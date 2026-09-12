'use strict';

const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

function sendError(res, status, message, code) {
  return res.status(status).json({
    error: message,
    code: code || codeForStatus(status),
  });
}

function codeForStatus(status) {
  switch (status) {
    case 400: return ERROR_CODES.BAD_REQUEST;
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.FORBIDDEN;
    case 404: return ERROR_CODES.NOT_FOUND;
    case 413: return ERROR_CODES.PAYLOAD_TOO_LARGE;
    case 429: return ERROR_CODES.RATE_LIMITED;
    default: return ERROR_CODES.INTERNAL_ERROR;
  }
}

module.exports = {
  ERROR_CODES,
  sendError,
  codeForStatus,
};
