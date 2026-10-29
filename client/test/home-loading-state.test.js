const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('native Client Home keeps widget containers mounted and settles their loading states', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'pages', 'ClientHome.module.css'), 'utf8');
  const host = fs.readFileSync(path.join(root, 'legacy-pages', 'host-home.html'), 'utf8');

  assert.match(source, /WidgetLoader label="Loading popular destinations"/);
  assert.match(source, /WidgetLoader label="Loading VaRoom Updates"/);
  assert.match(source, /PropertyNewsList items=\{news\} loading=\{newsLoading\} failed=\{newsFailed\}/);
  assert.match(source, /No Property News is available right now\./);
  assert.match(styles, /\.skeletonCard|\.skeletonMedia|\.mediaAmbient|\.photoUnavailable/);
  assert.match(styles, /\.skeletonCard\s*\{[\s\S]*?animation: skeletonPulse/);
  assert.match(styles, /@keyframes skeletonPulse/);

  for (const id of ['listings-glance-grid', 'varoom-updates', 'property-news-list', 'property-news-mobile-list']) {
    const openingTag = host.match(new RegExp(`<[^>]+id="${id}"[^>]*>`));
    assert.ok(openingTag, `${id} should be present in the Host Home shell`);
    assert.match(openingTag[0], /data-loading="true"/, `${id} should begin in a loading state`);
  }
  assert.match(host, /class="home-widget-loader" role="status"[^>]*aria-label="Loading/);
  assert.match(host, /setAttribute\('data-loading', 'false'\)/);
  assert.match(host, /homeSkeleton\.dataset\.skeletonLayout = window\.matchMedia\('\(max-width:860px\)'\)/);
});
