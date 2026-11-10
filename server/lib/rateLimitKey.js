'use strict';

const crypto = require('crypto');

// Who a request counts against in the /api rate limit (server.js).
//
// Browsers reach this server through Vercel, which forwards /api here
// (client/vercel.json) and names the visitor in `x-real-ip`. Express is not
// told to trust proxies, so `req.ip` is the proxy in front of the server: on
// its own it would put every visitor in one shared allowance, and a few busy
// feeds would lock everyone out.
//
// `x-real-ip` can also be sent by someone calling this server directly. When
// VERCEL_ORIGIN_SECRET is set (and Vercel sends it as `x-origin-secret`, see
// Vercel's "restricting your origin to Vercel traffic"), the header is
// trusted only on requests that carry the secret; until then it is trusted
// as given, which is still far safer than one allowance for everyone.

const ORIGIN_SECRET_HEADER = 'x-origin-secret';

function secretMatches(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function visitorIp(req, originSecret = process.env.VERCEL_ORIGIN_SECRET) {
  const header = req.headers['x-real-ip'];
  const realIp = typeof header === 'string' ? header.trim() : '';
  const trusted = !originSecret || secretMatches(req.headers[ORIGIN_SECRET_HEADER], originSecret);
  if (realIp && trusted && realIp.length <= 64) return realIp;
  return req.ip || 'unknown';
}

// Photo redirects are read-only, answered from caches (lib/photoRedirectCache.js
// and Vercel's CDN), and a single feed asks for dozens: they are not counted.
function isRateLimitExempt(req) {
  return (req.method === 'GET' || req.method === 'HEAD') && req.path.startsWith('/photos/');
}

module.exports = { visitorIp, isRateLimitExempt, ORIGIN_SECRET_HEADER };
