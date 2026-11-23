const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = source.slice(source.indexOf("app.post('/api/auth/sign-up'"), source.indexOf("app.post('/api/auth/resend-confirmation'"));

test('email sign-up requires a name only from clients; hosts name their account in onboarding', () => {
  assert.match(route, /const name = role === 'client' \? String\(fullName \|\| ''\)\.trim\(\) : '';/);
  assert.match(route, /\(role === 'client' && name\.length < 2\)/);
  assert.match(route, /fullName: name, role, redirect/);
  assert.match(source, /data: fullName \? \{ full_name: fullName, role \} : \{ role \},/);
});
