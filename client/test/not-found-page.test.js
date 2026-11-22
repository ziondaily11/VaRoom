const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'pages', '404.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'components', 'notFound', 'notFoundStyles.ts'), 'utf8');

test('the 404 page is TypeScript; search goes to the marketplace without a full reload', () => {
  assert.equal(fs.existsSync(path.join(root, 'pages', '404.js')), false);
  for (const text of ['Page not found · VaRoom', 'drifted off the map', 'Search for your next stay or space...', 'OFF THE MAP']) {
    assert.ok(page.includes(text), text);
  }
  // /properties is the listing wizard; the marketplace searches.
  assert.match(page, /router\.push\(query \? `\/marketplace\?q=\$\{encodeURIComponent\(query\)\}` : '\/marketplace'\)/);
  assert.doesNotMatch(page, /`\/properties/);
  assert.doesNotMatch(page, /window\.location\.href/);
  // The search has a real button, and phones type in 16px (no iPhone zoom).
  assert.match(page, /<button type="submit" aria-label="Search"><SearchIcon \/><\/button>/);
  assert.doesNotMatch(styles, /\.nf-search button \{ display:none/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.nf-search input \{ font-size:max\(1rem, 16px\); \}/);
});

test('the categories are the Marketplace categories, filtered by category; none looks selected', () => {
  const { CATEGORY_LABELS } = loadTs(path.join(root, 'lib', 'marketplace', 'marketplace.ts'));
  assert.ok(Object.keys(CATEGORY_LABELS).length >= 5);
  assert.match(page, /Object\.entries\(CATEGORY_LABELS\)/);
  assert.match(page, /href=\{`\/marketplace\?category=\$\{category\.key\}`\}/);
  assert.doesNotMatch(page, /Vacation Rentals|Studios|Retail|category active/);
});

test('the way home and the way back', () => {
  assert.match(page, /role === 'host' \? '\/host-home' : role === 'client' \? '\/client-home' : '\/'/);
  assert.match(page, /<Link className="nf-btn nf-btn-primary" href=\{homeHref\}>Go to Home<\/Link>/);
  assert.match(page, /<Link className="nf-eyebrow" href=\{homeHref\}>VaRoom<\/Link>/);
  assert.match(page, /useEffect\(\(\) => \{ setCanGoBack\(window\.history\.length > 1\); \}, \[\]\);/);
  assert.match(page, /\{canGoBack && <button type="button" className="nf-btn" onClick=\{\(\) => router\.back\(\)\}>Go back<\/button>\}/);
});

test('kept out of search results; styles stay inside the page', () => {
  assert.match(page, /<meta name="robots" content="noindex" \/>/);
  assert.doesNotMatch(page, /<style jsx|fonts\.googleapis/);
  const css = styles.slice(styles.indexOf('= `') + 3, styles.lastIndexOf('`'));
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|\})\s*[^@{}]+\{/g) || [];
  for (const rule of rules) {
    const selectors = rule.replace(/^\}?\s*/, '').replace(/\{$/, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const selector of selectors) {
      if (/^(from|to|\d+%)$/.test(selector)) continue;
      assert.match(selector, /\.not-found-page/, `unscoped rule: ${selector}`);
    }
  }
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /html\[data-theme="dark"\] \.not-found-page \{/);
});
