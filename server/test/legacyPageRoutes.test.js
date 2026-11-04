'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveFrontendRouteRedirect } = require('../lib/frontendRoute');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const legacyDir = path.join(__dirname, '..', '..', 'client', 'legacy-pages');

test('this server serves no legacy-pages templates; the wizard URLs redirect to the frontend', () => {
  assert.doesNotMatch(serverSource, /pageTemplates|legacyPagesDirectory|legacy-pages'\)/);
  assert.equal(fs.existsSync(path.join(legacyDir, 'list.html')), false, 'list.html is retired');
  assert.match(serverSource, /\['\/list', \['\/list', '\/list\.html', '\/legacy-pages\/list\.html'\]\], \['\/properties', \['\/properties', '\/properties\.html'\]\]/);
  const redirect = resolveFrontendRouteRedirect({
    frontendBaseUrl: 'https://varoom.co.ke', requestHost: 'server-4jlx.onrender.com', requestUrl: '/list?payment=return&reference=abc',
    destinationPath: '/list', unavailableMessage: 'x', nodeEnv: 'production',
  });
  assert.equal(redirect.location, 'https://varoom.co.ke/list?payment=return&reference=abc');
});

test('the landing page and its sign-in / sign-up redirect to the frontend', () => {
  // Sign-in is the landing auth panel (components/landing/AuthPanel.tsx).
  assert.equal(fs.existsSync(path.join(legacyDir, 'login.html')), false, 'login.html is retired');
  assert.match(serverSource, /\{ paths: \['\/login', '\/login\.html'\], query: \{ auth: 'login' \} \}/);
  assert.match(serverSource, /\{ paths: \['\/register', '\/signup-client', '\/signup-client\.html'\], query: \{ auth: 'signup', role: 'client' \} \}/);
  assert.match(serverSource, /\{ paths: \['\/signup-host', '\/signup-host\.html'\], query: \{ auth: 'signup', role: 'host' \} \}/);
  assert.match(serverSource, /req\.path === '\/' \? res\.status\(200\)\.send\('VaRoom API'\)/, 'the root still answers without a frontend');
  const base = { frontendBaseUrl: 'https://varoom.co.ke', requestHost: 'api.varoom.co.ke', destinationPath: '/', unavailableMessage: 'x', nodeEnv: 'production' };
  assert.equal(resolveFrontendRouteRedirect({ ...base, requestUrl: '/login?redirect=%2Fbookings', query: { auth: 'login' } }).location, 'https://varoom.co.ke/?redirect=%2Fbookings&auth=login');
  assert.equal(resolveFrontendRouteRedirect({ ...base, requestUrl: '/signup-host', query: { auth: 'signup', role: 'host' } }).location, 'https://varoom.co.ke/?auth=signup&role=host');
  assert.equal(resolveFrontendRouteRedirect({ ...base, requestUrl: '/?auth=signup', query: { auth: 'login' } }).location, 'https://varoom.co.ke/?auth=login', 'the route decides the auth mode');
  assert.equal(resolveFrontendRouteRedirect({ ...base, requestUrl: '/' }).location, 'https://varoom.co.ke/');
});

test('the legacy admin page is retired; /admin is the React dashboard and its APIs stay', () => {
  assert.equal(fs.existsSync(path.join(legacyDir, 'varoomadmin.html')), false);
  const adminRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminRoutes.js'), 'utf8');
  assert.doesNotMatch(adminRoutes, /sendFile\([^)]*varoomadmin/, 'the legacy page is no longer served');
  assert.match(adminRoutes, /destinationPath: '\/admin'/, 'a direct visit to the API host goes to the frontend page');
  for (const route of ["router.get('/session'", "router.post('/login'", "router.get('/overview'", "router.get('/users'"]) assert.ok(adminRoutes.includes(route), route);
  const config = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'next.config.js'), 'utf8');
  assert.match(config, /source: '\/varoomadmin',\s*destination: '\/admin'/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'client', 'pages', 'admin.tsx')));
});
