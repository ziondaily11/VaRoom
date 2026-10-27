const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');
const start = source.indexOf('const requestVideoMedia = useCallback(');
const end = source.indexOf('useEffect(() => {', start);
const requestVideoMedia = source.slice(start, end);

test('video discovery divides queued listings into the server-supported batch limit', () => {
  assert.match(requestVideoMedia, /for \(let offset = 0; offset < ids\.length; offset \+= 24\)/);
  assert.match(requestVideoMedia, /const batch = ids\.slice\(offset, offset \+ 24\)/);
  assert.match(requestVideoMedia, /batch\.join\(','\)/);
});

test('compatibility media lookups are limited to an unavailable batch endpoint', () => {
  assert.match(requestVideoMedia, /response\.status === 404 \|\| response\.status === 405/);
  assert.match(requestVideoMedia, /await loadCompatibility\(batch\)/);
  assert.doesNotMatch(requestVideoMedia, /catch \(lookupError\) \{\s*console\.warn\([^)]*compatibility/);
  assert.doesNotMatch(requestVideoMedia, /response\.status === 400[\s\S]{0,80}loadCompatibility/);
  assert.doesNotMatch(requestVideoMedia, /response\.status === 429[\s\S]{0,80}loadCompatibility/);
});

test('batch failures and session initialization failures settle all affected cards', () => {
  assert.match(requestVideoMedia, /catch \(lookupError\) \{\s*console\.error\('Batched listing video lookup could not be completed:'/);
  assert.match(requestVideoMedia, /settle\(batch, 'unavailable'\)/);
  assert.match(requestVideoMedia, /catch \(lookupError\) \{\s*console\.error\('Listing video discovery could not be started:'/);
  assert.match(requestVideoMedia, /ids\.forEach\(\(id\) => \{ next\[id\] = 'unavailable'; \}\)/);
  assert.doesNotMatch(requestVideoMedia, /if \(!client\) return/);
});

test('video discovery and playback responses are validated and each card reaches a terminal state', () => {
  assert.match(requestVideoMedia, /typeof payload\.videoMedia !== 'object' \|\| Array\.isArray\(payload\.videoMedia\)/);
  assert.match(requestVideoMedia, /typeof mediaId !== 'string' \|\| !mediaId/);
  assert.match(requestVideoMedia, /settle\(\[id\], 'none'\)/);
  assert.match(requestVideoMedia, /settle\(\[id\], 'unavailable'\)/);
  assert.match(requestVideoMedia, /if \(!playback\?\.url\) throw new Error/);
});

test('video requests preserve the existing bearer session and protected playback endpoint', () => {
  assert.match(requestVideoMedia, /client\.auth\.getSession\(\)/);
  assert.match(requestVideoMedia, /Authorization: `Bearer \$\{sessionResult\.data\.session\.access_token\}`/);
  assert.match(requestVideoMedia, /\/api\/media\/\$\{encodeURIComponent\(mediaId\)\}\/playback/);
  assert.match(requestVideoMedia, /\/api\/properties\/\$\{encodeURIComponent\(id\)\}\/media/);
});
