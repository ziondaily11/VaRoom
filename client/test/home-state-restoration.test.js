const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('native Client Home uses account-scoped feed caches before revalidation', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  assert.match(source, /loadListingFeedCache\(\)/);
  assert.match(source, /cache\.current\.snapshot/);
  assert.match(source, /cache\.current\.revalidate\(key, fetcher\)/);
  assert.match(source, /\['client', user\.id, view, category/);
  assert.match(source, /feedContextKey\.current !== key/);
});

test('both sidebars hydrate only after the session identifies a matching cached account', () => {
  for (const file of ['SharedHostSidebar.jsx', 'SharedClientSidebar.jsx']) {
    const source = fs.readFileSync(path.join(root, 'components', file), 'utf8');
    const sessionIndex = source.indexOf('const userId = session.user.id;');
    const cacheIndex = source.indexOf('readForAccount(userId);', sessionIndex);
    const profileRefreshIndex = source.indexOf(".select('id,full_name,username,avatar_url,role')", sessionIndex);
    assert.ok(sessionIndex >= 0 && cacheIndex > sessionIndex && profileRefreshIndex > cacheIndex);
    assert.match(source, /VaRoomAccountProfileCache\.write\(userData\)/);
  }
});

test('native Client Home keeps lifecycle work page-scoped and avoids stale state races', () => {
  const pageSource = fs.readFileSync(path.join(root, 'pages', 'client-home.tsx'), 'utf8');
  assert.match(pageSource, /if \(!active\) return;/);
  assert.match(pageSource, /epoch !== authEpoch\.current/);
  assert.match(pageSource, /feedContextVersion\.current/);
  assert.match(pageSource, /if \(contextVersion !== feedContextVersion\.current \|\| feedContextKey\.current !== key\) return;/);
});

test('Host Home retains its page lifecycle and valid inline initializer scripts', () => {
  const catchAll = fs.readFileSync(path.join(root, 'pages', '[...slug].js'), 'utf8');
  assert.match(catchAll, /\['property-news\.html', 'host-home\.html', 'client-home\.html'\]/);
  assert.match(catchAll, /!\['host-home\.html', 'client-home\.html'\]\.includes\(templateName\)[\s\S]*?VaroomSidebar\.initCounts\(\)/);
  assert.match(catchAll, /pageLifecycle\?\.dispose\(\)/);

  const source = fs.readFileSync(path.join(root, 'legacy-pages', 'host-home.html'), 'utf8');
  const inlineScripts = Array.from(source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => match[2].trim())
    .filter(Boolean);
  assert.ok(inlineScripts.length > 0, 'Host Home should contain its inline page initializer');
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new vm.Script(script, { filename: `host-home.html inline script ${index + 1}` }));
  });
});
