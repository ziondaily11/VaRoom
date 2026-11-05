const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('native Client Home keeps widget containers mounted and settles their loading states', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'pages', 'ClientHome.module.css'), 'utf8');
  const rail = fs.readFileSync(path.join(root, 'components', 'hostHome', 'HostRail.tsx'), 'utf8');
  const hostPage = fs.readFileSync(path.join(root, 'pages', 'host-home.tsx'), 'utf8');

  assert.match(source, /WidgetLoader label="Loading popular destinations"/);
  assert.match(source, /WidgetLoader label="Loading VaRoom Updates"/);
  assert.match(source, /PropertyNewsList items=\{news\} loading=\{newsLoading\} failed=\{newsFailed\}/);
  assert.match(source, /No Property News is available right now\./);
  assert.match(styles, /\.skeletonCard|\.skeletonMedia|\.mediaAmbient|\.photoUnavailable/);
  assert.match(styles, /\.skeletonCard\s*\{[\s\S]*?animation: skeletonPulse/);
  assert.match(styles, /@keyframes skeletonPulse/);

  // Host Home's rail blocks stay mounted and start loading (data-loading="true" until settled).
  assert.match(rail, /id="listings-glance-grid" data-loading=\{listings === null \? 'true' : 'false'\}/);
  assert.match(rail, /id=\{`property-news\$\{idSuffix\}-list`\} aria-live="polite" data-loading=\{news === null \? 'true' : 'false'\}/);
  assert.match(rail, /className="home-widget-content" data-loading=\{updates === null \? 'true' : 'false'\}/);
  assert.match(rail, /className="home-widget-loader" role="status" aria-label=\{label\}/);
  // Host Home draws its tabs and rail at once; only the feed shows skeleton cards while the account loads.
  assert.doesNotMatch(hostPage, /PageSkeleton|host-home-skeleton|is-loading/);
  assert.match(hostPage, /if \(!ready\) feed = <><SkeletonCard \/><SkeletonCard \/><\/>;/);
  assert.match(hostPage, /<HostRail listings=\{glance\}/);
  assert.doesNotMatch(hostPage, /showRail/);
});
