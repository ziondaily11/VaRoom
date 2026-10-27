const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ClientHome.module.css'), 'utf8');
const start = source.indexOf('const requestVideoMedia = useCallback(');
const end = source.indexOf('useEffect(() => {', start);
const requestVideoMedia = source.slice(start, end);
const galleryStart = source.indexOf('function Gallery(');
const galleryEnd = source.indexOf('function ListingCard(', galleryStart);
const gallery = source.slice(galleryStart, galleryEnd);

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

test('successful discovery maps each listing to its media id and playback URL', () => {
  assert.match(requestVideoMedia, /const mediaId = payload\.videoMedia\[id\]/);
  assert.match(requestVideoMedia, /payload\.videoDimensions\?\.\[id\]/);
  assert.match(requestVideoMedia, /\[id\]: \{ url: playback\.url/);
  assert.match(requestVideoMedia, /settle\(\[id\], 'none'\)/);
});

test('missing metadata settles as no video while malformed metadata is unavailable', () => {
  assert.match(requestVideoMedia, /if \(!payload\?\.videoMedia[\s\S]*?throw new Error\('Video media response was invalid\.'\)/);
  assert.match(requestVideoMedia, /if \(typeof mediaId !== 'string' \|\| !mediaId\) \{\s*settle\(\[id\], 'none'\)/);
  assert.match(requestVideoMedia, /if \(!Array\.isArray\(result\?\.media\)\) throw new Error\('Video media response was invalid\.'\)/);
});

test('playback URL failures settle the video card as unavailable without retry loops', () => {
  assert.match(requestVideoMedia, /catch \(playbackError\)[\s\S]*?settle\(\[id\], 'unavailable'\)/);
  assert.doesNotMatch(requestVideoMedia, /while\s*\(|setTimeout\([^)]*requestVideoMedia/);
});

test('video requests preserve the existing bearer session and protected playback endpoint', () => {
  assert.match(requestVideoMedia, /client\.auth\.getSession\(\)/);
  assert.match(requestVideoMedia, /Authorization: `Bearer \$\{sessionResult\.data\.session\.access_token\}`/);
  assert.match(requestVideoMedia, /\/api\/media\/\$\{encodeURIComponent\(mediaId\)\}\/playback/);
  assert.match(requestVideoMedia, /\/api\/properties\/\$\{encodeURIComponent\(id\)\}\/media/);
});

test('video loading permits playback interaction and requests media for real readiness events', () => {
  assert.match(gallery, /preload="auto"/);
  assert.match(gallery, /onLoadedData=\{markVideoReady\}/);
  assert.match(gallery, /onCanPlay=\{markVideoReady\}/);
  assert.match(gallery, /onPlaying=\{markVideoReady\}/);
  assert.match(gallery, /onError=\{markVideoFailed\}/);
  assert.match(gallery, /!\s*videoReady && <span className=\{styles\.videoLoadingOverlay\}/);
  assert.match(styles, /\.videoLoadingOverlay \{[\s\S]*?pointer-events: none/);
  assert.match(styles, /background: rgba\(255, 255, 255, 0\.28\)/);
});

test('videos that never become ready reach unavailable and timers are cleared on navigation or source changes', () => {
  const lifecycle = gallery.match(/useEffect\(\(\) => \{\s*setVideoReady\(false\);[\s\S]*?\}, \[listing\.id, video\?\.url\]\);/);
  assert.ok(lifecycle);
  assert.match(lifecycle[0], /setTimeout\(\(\) => \{\s*videoLoadTimeout\.current = null;\s*setVideoFailed\(true\)/);
  assert.match(lifecycle[0], /clearTimeout\(videoLoadTimeout\.current\)/);
  assert.match(lifecycle[0], /return \(\) => \{/);
  assert.match(gallery, /if \(videoFailed\) return <div[^>]*>Video unavailable<\/div>/);
  assert.match(gallery, /const markVideoReady = \(\) => \{[\s\S]*?setVideoReady\(true\)/);
  assert.match(gallery, /const markVideoFailed = \(\) => \{[\s\S]*?setVideoFailed\(true\)/);
});

test('returning to Client Home rediscovers videos for the newly mounted feed cards', () => {
  assert.match(source, /const \[videos, setVideos\] = useState<Record<string, Video>>\(\{\}\)/);
  assert.match(source, /const \[videoStates, setVideoStates\] = useState<Record<string, 'loading' \| 'none' \| 'unavailable'>>\(\{\}\)/);
  assert.match(source, /targets\.forEach\(\(target\) => requestVideoMedia\(target\.dataset\.media \|\| ''\)\)/);
  assert.match(source, /observer\.observe\(target\)/);
  assert.match(gallery, /\}, \[listing\.id, video\?\.url\]\);/);
});

test('video dimensions use supplied or intrinsic metadata and retain portrait, landscape, and square ratios', () => {
  assert.match(gallery, /const naturalSize = videoNaturalSize\?\.url === video\.url/);
  assert.match(gallery, /const videoWidth = naturalSize\?\.width \|\| video\.width \|\| 0/);
  assert.match(gallery, /const videoHeight = naturalSize\?\.height \|\| video\.height \|\| 0/);
  assert.match(gallery, /element\.videoWidth > 0 && element\.videoHeight > 0/);
  assert.match(gallery, /width: element\.videoWidth,[\s\S]*?height: element\.videoHeight/);
  assert.match(source, /const ratio = width \/ height/);
  assert.match(gallery, /height: hasVideoDimensions \? frame\.height : undefined/);
  assert.match(gallery, /style=\{\{ maxHeight: maxVideoHeight \}\}/);
});

test('video sizing does not force a 4:3 stage or crop media', () => {
  const videoBranch = gallery.slice(gallery.indexOf('if (video) {'), gallery.indexOf('if (media.length === 0)'));
  const videoStyles = styles.slice(styles.indexOf('.videoStage {'), styles.indexOf('.actions {'));
  assert.doesNotMatch(videoBranch, /4\s*\/\s*3|aspectRatio:\s*['"]4\s*\/\s*3/);
  assert.doesNotMatch(videoStyles, /aspect-ratio:\s*4\s*\/\s*3|object-fit:\s*cover/);
  assert.match(videoStyles, /height:\s*auto/);
  assert.match(videoStyles, /object-fit:\s*contain/);
});
