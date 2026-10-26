const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('both Home initializers use an authenticated account-matched filter snapshot before awaiting profile refresh', () => {
  for (const [file, role] of [['host-home.html', 'host'], ['client-home.html', 'client']]) {
    const source = fs.readFileSync(path.join(root, 'legacy-pages', file), 'utf8');
    assert.match(source, new RegExp(`readHomeState\\(currentUser\\.id, '${role}'\\)`));
    assert.match(source, /const profileResult = cachedHomeProfile \? null : await profileRequest;/);
    assert.match(source, /profileRequest\.abortSignal\(pageLifecycle\.signal\)/);
    assert.match(source, /writeHomeState\(currentUser\.id/);
    assert.match(source, /if \(snapshot\.hasCachedPage\)[\s\S]*?renderFeedFromCache\(\{ key: key \}\)[\s\S]*?revalidate\(key, fetcher\)/);
    assert.match(source, /if \(!pageLifecycle\.isActive\(\)\) return;/);
  }
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

test('Home lifecycle is page-scoped while the shared legacy sidebar count service is not restarted', () => {
  const catchAll = fs.readFileSync(path.join(root, 'pages', '[...slug].js'), 'utf8');
  assert.match(catchAll, /\['property-news\.html', 'host-home\.html', 'client-home\.html'\]/);
  assert.match(catchAll, /!\['host-home\.html', 'client-home\.html'\]\.includes\(templateName\)[\s\S]*?VaroomSidebar\.initCounts\(\)/);
  assert.match(catchAll, /pageLifecycle\?\.dispose\(\)/);
});

test('host and client legacy inline scripts remain syntactically valid JavaScript', () => {
  for (const file of ['host-home.html', 'client-home.html']) {
    const source = fs.readFileSync(path.join(root, 'legacy-pages', file), 'utf8');
    const inlineScripts = Array.from(source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
      .filter((match) => !/\bsrc\s*=/.test(match[1]))
      .map((match) => match[2].trim())
      .filter(Boolean);
    assert.ok(inlineScripts.length > 0, `${file} should contain its inline page initializer`);
    inlineScripts.forEach((script, index) => {
      assert.doesNotThrow(() => new vm.Script(script, { filename: `${file} inline script ${index + 1}` }));
    });
  }
});
