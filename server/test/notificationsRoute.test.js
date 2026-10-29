'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveNotificationsRedirect } = require('../lib/notificationsRoute');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Notifications Express paths redirect to the configured native frontend route', () => {
  const routeStart = serverSource.indexOf("app.get(['/notifications', '/notifications.html', '/legacy-pages/notifications.html']");
  const routeEnd = serverSource.indexOf('Object.entries(pageTemplates)', routeStart);
  const route = serverSource.slice(routeStart, routeEnd);
  const templateStart = serverSource.indexOf('const pageTemplates = {');
  const templateEnd = serverSource.indexOf('\n};', templateStart);
  const templates = serverSource.slice(templateStart, templateEnd);

  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.match(route, /resolveNotificationsRedirect\(\{/);
  assert.match(route, /process\.env\.PUBLIC_BASE_URL \|\| process\.env\.CLIENT_BASE_URL/);
  assert.match(route, /requestUrl: req\.originalUrl/);
  assert.match(route, /res\.redirect\(redirect\.status, redirect\.location\)/);
  assert.doesNotMatch(templates, /notifications\.html/);
  assert.doesNotMatch(route, /sendFile|readFile/);
});

test('Notifications redirect preserves the incoming query string', () => {
  for (const requestUrl of [
    '/notifications?notification_id=notice-1&return=%2Fbookings',
    '/notifications.html?notification_id=notice-1&return=%2Fbookings',
    '/legacy-pages/notifications.html?notification_id=notice-1&return=%2Fbookings',
  ]) {
    const redirect = resolveNotificationsRedirect({
      frontendBaseUrl: 'https://varoom.co.ke/',
      requestHost: 'server-4jlx.onrender.com',
      requestUrl,
      nodeEnv: 'production',
    });

    assert.deepEqual(redirect, {
      status: 302,
      location: 'https://varoom.co.ke/notifications?notification_id=notice-1&return=%2Fbookings',
    });
  }
});

test('Notifications redirect fails closed for missing, unsafe, or same-origin frontend configuration', () => {
  const cases = [
    { frontendBaseUrl: undefined, nodeEnv: 'production' },
    { frontendBaseUrl: 'not a URL', nodeEnv: 'production' },
    { frontendBaseUrl: 'javascript:alert(1)', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://varoom.co.ke/path', nodeEnv: 'production' },
    { frontendBaseUrl: 'http://varoom.co.ke', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://localhost', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://varoom.co.ke', requestHost: 'VAROOM.CO.KE', nodeEnv: 'production' },
  ];

  for (const { frontendBaseUrl, requestHost = 'server-4jlx.onrender.com', nodeEnv } of cases) {
    const redirect = resolveNotificationsRedirect({
      frontendBaseUrl,
      requestHost,
      requestUrl: '/notifications',
      nodeEnv,
    });
    assert.equal(redirect.status, 503);
    assert.equal(redirect.location, undefined);
  }
});

test('Notifications redirect uses the local frontend origin only outside production', () => {
  assert.deepEqual(
    resolveNotificationsRedirect({
      requestHost: 'api.localhost:4000',
      requestUrl: '/notifications',
      nodeEnv: 'development',
      port: 3000,
    }),
    { status: 302, location: 'http://localhost:3000/notifications' }
  );
});
