'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const photoRoutes = require('../routes/photoRoutes');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const photoRouteSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'photoRoutes.js'), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'vercel.json'), 'utf8'));

test('the deployed API exposes the signed R2 photo initialization route through the web proxy', () => {
  assert.match(photoRouteSource, /router\.post\('\/photos\/upload-init'/);
  assert.match(serverSource, /const photoRoutes = require\('\.\/routes\/photoRoutes'\)/);
  assert.match(serverSource, /app\.use\('\/api', photoRoutes\)/);
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === '/api/:path*'
    && rule.destination === 'https://server-4jlx.onrender.com/api/:path*'));
});

test('the mounted photo upload initializer responds instead of falling through as a 404', async () => {
  const layer = photoRoutes.stack.find((candidate) => candidate.route
    && candidate.route.path === '/photos/upload-init'
    && candidate.route.methods.post);
  assert.ok(layer, 'the POST initializer route must be registered');

  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await layer.route.stack[0].handle({ headers: {}, body: {} }, response);
  assert.equal(response.statusCode, 401, 'the route must reject an anonymous upload, never be absent');
  assert.equal(response.body.error, 'Invalid or expired session');
});
