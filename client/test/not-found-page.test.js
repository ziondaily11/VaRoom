const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('the 404 page is TypeScript; search goes to the marketplace without a full reload', () => {
  assert.equal(fs.existsSync(path.join(root, 'pages', '404.js')), false);
  const page = fs.readFileSync(path.join(root, 'pages', '404.tsx'), 'utf8');
  for (const text of ['Page not found — VaRoom', 'drifted off the map', 'Search for your next stay or space...', 'OFF THE MAP', 'Vacation Rentals']) {
    assert.ok(page.includes(text), text);
  }
  // /properties is the listing wizard; the marketplace searches.
  assert.match(page, /router\.push\(query \? `\/marketplace\?q=\$\{encodeURIComponent\(query\)\}` : '\/marketplace'\)/);
  assert.match(page, /href=\{`\/marketplace\?q=\$\{encodeURIComponent\(category\.query\)\}`\}/);
  assert.doesNotMatch(page, /`\/properties/);
  assert.doesNotMatch(page, /window\.location\.href/);
});
