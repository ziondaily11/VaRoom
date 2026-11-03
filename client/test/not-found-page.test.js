const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('the 404 page is TypeScript; search goes to the listings without a full reload', () => {
  assert.equal(fs.existsSync(path.join(root, 'pages', '404.js')), false);
  const page = fs.readFileSync(path.join(root, 'pages', '404.tsx'), 'utf8');
  for (const text of ['Page not found — VaRoom', 'drifted off the map', 'Search for your next stay or space...', 'OFF THE MAP', 'Vacation Rentals']) {
    assert.ok(page.includes(text), text);
  }
  assert.match(page, /router\.push\(query \? `\/properties\?search=\$\{encodeURIComponent\(query\)\}` : '\/properties'\)/);
  assert.match(page, /href=\{`\/properties\?type=\$\{encodeURIComponent\(category\.query\)\}`\}/);
  assert.doesNotMatch(page, /window\.location\.href/);
});
