'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveChatsRedirect } = require('../lib/chatsRoute');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const base = { frontendBaseUrl: 'https://varoom.co.ke', requestHost: 'server-4jlx.onrender.com', nodeEnv: 'production' };

test('Chats Express paths redirect to the native frontend page; the legacy templates are gone', () => {
  const routeStart = serverSource.indexOf("app.get(['/chats', '/chat', '/chats.html'");
  assert.ok(routeStart >= 0);
  const route = serverSource.slice(routeStart, serverSource.indexOf("app.get('/forgot-password'", routeStart));
  assert.match(route, /resolveChatsRedirect\(\{/);
  assert.match(route, /'\/elie', '\/elie\.html', '\/legacy-pages\/elie\.html'/);
  assert.match(route, /res\.redirect\(redirect\.status, redirect\.location\)/);
  // No route serves the legacy templates or loads their scripts.\n  assert.doesNotMatch(serverSource, /:\s*'(?:chats|elie)\.html'|chat-data\.js|chat-cache\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', '..', 'client', 'legacy-pages', 'chats.html')), false);
});

test('Chats redirect keeps the query; Elie opens as the Elie conversation', () => {
  assert.deepEqual(resolveChatsRedirect({ ...base, requestUrl: '/chats?c=abc' }), { status: 302, location: 'https://varoom.co.ke/chats?c=abc' });
  assert.deepEqual(resolveChatsRedirect({ ...base, requestUrl: '/chat' }), { status: 302, location: 'https://varoom.co.ke/chats' });
  assert.deepEqual(resolveChatsRedirect({ ...base, requestUrl: '/elie', elie: true }), { status: 302, location: 'https://varoom.co.ke/chats?c=elie' });
  assert.deepEqual(resolveChatsRedirect({ ...base, requestUrl: '/elie.html?c=other', elie: true }), { status: 302, location: 'https://varoom.co.ke/chats?c=elie' });
});

test('Chats redirect is refused without a safe frontend URL', () => {
  assert.equal(resolveChatsRedirect({ ...base, frontendBaseUrl: undefined, requestUrl: '/chats' }).status, 503);
  assert.equal(resolveChatsRedirect({ ...base, frontendBaseUrl: 'http://varoom.co.ke', requestUrl: '/chats' }).status, 503);
  assert.equal(resolveChatsRedirect({ ...base, frontendBaseUrl: 'https://server-4jlx.onrender.com', requestUrl: '/chats' }).status, 503);
});
