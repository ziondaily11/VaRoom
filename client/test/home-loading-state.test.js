const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Home side widgets keep their containers mounted and settle loading indicators', () => {
  const client = fs.readFileSync(path.join(root, 'legacy-pages', 'client-home.html'), 'utf8');
  const host = fs.readFileSync(path.join(root, 'legacy-pages', 'host-home.html'), 'utf8');

  for (const [source, targets] of [
    [client, ['dest-grid', 'mobile-dest-row', 'varoom-updates', 'client-property-news', 'client-property-news-mobile']],
    [host, ['listings-glance-grid', 'varoom-updates', 'property-news-list', 'property-news-mobile-list']],
  ]) {
    for (const id of targets) {
      const openingTag = source.match(new RegExp(`<[^>]+id="${id}"[^>]*>`));
      assert.ok(openingTag, `${id} should be present in the initial page shell`);
      assert.match(openingTag[0], /data-loading="true"/, `${id} should begin in a loading state`);
    }
    assert.match(source, /class="home-widget-loader" role="status"[^>]*aria-label="Loading/);
    assert.match(source, /setAttribute\('data-loading', 'false'\)/, 'widget loaders should settle after resolving');
  }

  assert.doesNotMatch(client, /skel-dest-card|skel-update-media|skel-news-media/);
  assert.doesNotMatch(host, /property-news-skeleton|skel-update-media/);
  assert.match(client, /skel-card" data-skeleton-layout="' \+ skeletonLayout/);
  assert.match(client, /skel-card\[data-skeleton-layout="mobile"\] \.skel-media[\s\S]*?height:clamp\(220px, 52vw, 460px\)/);
  assert.match(host, /homeSkeleton\.dataset\.skeletonLayout = window\.matchMedia\('\(max-width:860px\)'\)/);
  assert.match(host, /@media \(max-width:860px\)[\s\S]*?\.host-home-skeleton \.host-skel-media[\s\S]*?height:clamp\(220px, 52vw, 460px\)/);
  assert.match(client, /No Property News is available right now/);
  assert.match(host, /No Property News is available right now/);
});
