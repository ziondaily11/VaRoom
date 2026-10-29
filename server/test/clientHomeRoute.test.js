'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveClientHomeRedirect } = require('../lib/clientHomeRoute');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('legacy server hosting redirects both Client Home URLs through one native frontend handler', () => {
  const redirectStart = serverSource.indexOf("app.get(['/client-home', '/client-home.html']");
  const redirectEnd = serverSource.indexOf('Object.entries(pageTemplates)', redirectStart);
  const redirect = serverSource.slice(redirectStart, redirectEnd);
  const templateStart = serverSource.indexOf('const pageTemplates = {');
  const templateEnd = serverSource.indexOf('\n};', templateStart);
  const templates = serverSource.slice(templateStart, templateEnd);

  assert.ok(redirectStart >= 0 && redirectEnd > redirectStart);
  assert.match(redirect, /resolveClientHomeRedirect\(\{/);
  assert.match(redirect, /process\.env\.PUBLIC_BASE_URL \|\| process\.env\.CLIENT_BASE_URL/);
  assert.match(redirect, /res\.redirect\(redirect\.status, redirect\.location\)/);
  assert.doesNotMatch(templates, /client-home\.html/);
});

test('Client Home redirect preserves the incoming query string', () => {
  const redirect = resolveClientHomeRedirect({
    frontendBaseUrl: 'https://varoom.co.ke/',
    requestHost: 'server-4jlx.onrender.com',
    requestUrl: '/client-home.html?return=%2Fmessages&filter=a%20b',
    nodeEnv: 'production',
  });

  assert.deepEqual(redirect, {
    status: 302,
    location: 'https://varoom.co.ke/client-home?return=%2Fmessages&filter=a%20b',
  });
});

test('missing, malformed, unsafe, or same-host frontend origins fail closed without redirect loops', () => {
  const cases = [
    { frontendBaseUrl: undefined, nodeEnv: 'production' },
    { frontendBaseUrl: 'not a URL', nodeEnv: 'production' },
    { frontendBaseUrl: 'javascript:alert(1)', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://user:pass@varoom.co.ke', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://varoom.co.ke/path', nodeEnv: 'production' },
    { frontendBaseUrl: 'http://varoom.co.ke', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://localhost', nodeEnv: 'production' },
    { frontendBaseUrl: 'https://varoom.co.ke', requestHost: 'VAROOM.CO.KE', nodeEnv: 'production' },
  ];

  for (const { frontendBaseUrl, requestHost = 'server-4jlx.onrender.com', nodeEnv } of cases) {
    const result = resolveClientHomeRedirect({
      frontendBaseUrl,
      requestHost,
      requestUrl: '/client-home',
      nodeEnv,
    });
    assert.equal(result.status, 503, `${frontendBaseUrl} should not redirect`);
    assert.equal(result.location, undefined);
  }
});
