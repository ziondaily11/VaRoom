'use strict';

// Client Home listing videos: discovery batching, the compatibility route,
// response validation, terminal card states and frame sizing
// (lib/clientHome/video.ts, used by pages/client-home.tsx).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const quietConsole = { warn() {}, error() {}, log() {} };
const video = loadTs(path.join(__dirname, '..', 'lib', 'clientHome', 'video.ts'), { globals: { console: quietConsole } });

const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'client-home.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ClientHome.module.css'), 'utf8');
const gallery = source.slice(source.indexOf('function Gallery('), source.indexOf('function ListingCard('));
const requestVideoMedia = source.slice(source.indexOf('const requestVideoMedia = useCallback('), source.indexOf('}, [videoStates, videos]);'));

const ids = (count, prefix = 'listing') => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('video discovery divides queued listings into the server-supported batch limit', async () => {
  assert.equal(video.VIDEO_DISCOVERY_BATCH_SIZE, 24);
  assert.deepEqual(video.chunkListingIds(ids(50)).map((batch) => batch.length), [24, 24, 2]);
  assert.deepEqual(video.chunkListingIds([]), []);

  const requested = [];
  await video.discoverVideoMetadata(ids(30), {
    requestBatch: async (batch) => { requested.push(batch); return response(200, { videoMedia: {} }); },
    loadCompatibility: async () => assert.fail('the batch endpoint is available'),
  });
  assert.deepEqual(requested.map((batch) => batch.length), [24, 6]);
  assert.deepEqual(requested[1], ids(30).slice(24));
});

test('successful discovery maps each listing to its media id and dimensions; listings without video get none', async () => {
  const metadata = await video.discoverVideoMetadata(['a', 'b', 'c', 'd'], {
    requestBatch: async () => response(200, {
      videoMedia: { a: 'media-a', b: null, c: '' },
      videoDimensions: { a: { width: 1080, height: 1920 } },
    }),
    loadCompatibility: async () => assert.fail('not needed'),
  });
  assert.deepEqual(metadata, {
    a: { mediaId: 'media-a', width: 1080, height: 1920 },
    b: { mediaId: null },
    c: { mediaId: null },
    d: { mediaId: null },
  });
});

test('only an unavailable batch endpoint (404/405) falls back to per-listing compatibility lookups', async () => {
  for (const status of [404, 405]) {
    const fallbackBatches = [];
    const metadata = await video.discoverVideoMetadata(['a', 'b'], {
      requestBatch: async () => response(status, null),
      loadCompatibility: async (batch) => { fallbackBatches.push(batch); return { a: { mediaId: 'm-a' }, b: { mediaId: null } }; },
    });
    assert.deepEqual(fallbackBatches, [['a', 'b']], `status ${status}`);
    assert.deepEqual(metadata, { a: { mediaId: 'm-a' }, b: { mediaId: null } });
  }
  for (const status of [400, 401, 429, 500]) {
    let fallbackCalled = false;
    await assert.rejects(video.discoverVideoMetadata(['a'], {
      requestBatch: async () => response(status, null),
      loadCompatibility: async () => { fallbackCalled = true; return {}; },
    }), new RegExp(`returned ${status}`));
    assert.equal(fallbackCalled, false, `status ${status} must not use the compatibility route`);
  }
});

test('malformed discovery responses fail the batch instead of being read as "no video"', async () => {
  for (const body of [null, {}, { videoMedia: null }, { videoMedia: [] }, { videoMedia: 'media' }]) {
    await assert.rejects(video.discoverVideoMetadata(['a'], {
      requestBatch: async () => response(200, body),
      loadCompatibility: async () => ({}),
    }), /Video media response was invalid\./);
  }
});

test('the compatibility route picks the listing video, reports none without one, and rejects malformed media', async () => {
  assert.deepEqual(video.parseCompatibilityMediaResponse({ media: [
    { id: 'photo-1', type: 'photo' },
    { id: 'video-1', type: 'video', width: 640, height: 640 },
  ] }), { mediaId: 'video-1', width: 640, height: 640 });
  assert.deepEqual(video.parseCompatibilityMediaResponse({ media: [{ id: 'photo-1', type: 'photo' }, null] }), { mediaId: null });
  assert.throws(() => video.parseCompatibilityMediaResponse({ media: 'nope' }), /Video media response was invalid\./);
  assert.throws(() => video.parseCompatibilityMediaResponse(null), /Video media response was invalid\./);

  const requested = [];
  const metadata = await video.loadCompatibilityVideoMetadata(['a', 'b'], async (id) => {
    requested.push(id);
    return response(200, { media: id === 'a' ? [{ id: 'va', type: 'video' }] : [] });
  });
  assert.deepEqual(requested, ['a', 'b']);
  assert.deepEqual(metadata, { a: { mediaId: 'va', width: undefined, height: undefined }, b: { mediaId: null } });
  await assert.rejects(video.loadCompatibilityVideoMetadata(['a', 'b'], async (id) => response(id === 'b' ? 500 : 200, { media: [] })), /returned 500/);
});

function runBatches(batchIds, { discover, playback = async () => {}, isCurrent = () => true }) {
  const settled = [];
  const played = [];
  const discovered = [];
  return video.settleVideoBatches(batchIds, {
    isCurrent,
    settle: (listingIds, state) => settled.push([listingIds, state]),
    loadPlayback: async (id, mediaId, dimensions) => { played.push([id, mediaId, dimensions]); await playback(id); },
    discover: async (batch) => { discovered.push(batch); return discover(batch); },
  }).then(() => ({ settled, played, discovered }));
}

test('listings without a video settle as none while listings with one load playback', async () => {
  const { settled, played } = await runBatches(['a', 'b', 'c'], {
    discover: async () => ({ a: { mediaId: 'ma', width: 300, height: 400 }, b: { mediaId: null } }),
  });
  assert.deepEqual(played, [['a', 'ma', { mediaId: 'ma', width: 300, height: 400 }]]);
  assert.deepEqual(settled, [[['b'], 'none'], [['c'], 'none']]);
});

test('a failed batch settles every card in it as unavailable, without retrying, and later batches still run', async () => {
  const listingIds = ids(30);
  const { settled, discovered } = await runBatches(listingIds, {
    discover: async (batch) => {
      if (batch[0] === 'listing-0') throw new Error('lookup failed');
      return {};
    },
  });
  assert.equal(discovered.length, 2, 'one discovery per batch, no retry');
  assert.deepEqual(settled[0], [listingIds.slice(0, 24), 'unavailable']);
  assert.deepEqual(settled.slice(1).map(([batch, state]) => [batch[0], state]), listingIds.slice(24).map((id) => [id, 'none']));
});

test('discovery results for a replaced account or session are dropped', async () => {
  const { settled, played, discovered } = await runBatches(ids(30), {
    isCurrent: () => false,
    discover: async () => ({ 'listing-0': { mediaId: 'm' } }),
  });
  assert.equal(discovered.length, 1, 'stops after the first stale batch');
  assert.deepEqual(settled, []);
  assert.deepEqual(played, []);
});

test('card states change only for the listings named', () => {
  const current = { a: 'loading', b: 'none' };
  const next = video.markVideoStates(current, ['a', 'c'], 'unavailable');
  assert.deepEqual(next, { a: 'unavailable', b: 'none', c: 'unavailable' });
  assert.deepEqual(current, { a: 'loading', b: 'none' }, 'the previous state is not mutated');
});

test('playback responses map to the card video and a response without a URL is a failure', () => {
  assert.deepEqual(
    video.toListingVideo({ url: 'https://cdn/v.mp4', thumbnailUrl: 'https://cdn/t.jpg' }, { width: 720, height: 1280 }),
    { url: 'https://cdn/v.mp4', thumbnailUrl: 'https://cdn/t.jpg', width: 720, height: 1280 },
  );
  assert.deepEqual(video.toListingVideo({ url: 'u' }, { width: null, height: 0 }), { url: 'u', thumbnailUrl: null, width: undefined, height: undefined });
  assert.throws(() => video.toListingVideo({ url: '' }, {}), /did not include a URL/);
  assert.throws(() => video.toListingVideo(null, {}), /did not include a URL/);
});

test('video frames use intrinsic size for the current URL, else supplied metadata, keeping portrait, landscape and square ratios', () => {
  const portrait = { url: 'v1', width: 1080, height: 1920 };
  assert.deepEqual(video.resolveVideoFrameSize(portrait, null), { width: 1080, height: 1920, hasDimensions: true });
  assert.deepEqual(video.resolveVideoFrameSize(portrait, { url: 'v1', width: 1920, height: 1080 }), { width: 1920, height: 1080, hasDimensions: true });
  assert.deepEqual(video.resolveVideoFrameSize(portrait, { url: 'old', width: 500, height: 500 }), { width: 1080, height: 1920, hasDimensions: true }, 'a previous source size is ignored');
  assert.deepEqual(video.resolveVideoFrameSize({ url: 'v2' }, null), { width: 0, height: 0, hasDimensions: false });
  assert.deepEqual(video.resolveVideoFrameSize({ url: 'v3' }, { url: 'v3', width: 600, height: 600 }), { width: 600, height: 600, hasDimensions: true });
});

// Wiring and rendering kept as source checks: the session/epoch guard, the
// authenticated endpoints and the <video> element are exercised only in the
// browser.

test('video requests use the active account session and stop when the account changes', () => {
  assert.match(requestVideoMedia, /const sessionResult = await client\.auth\.getSession\(\)/);
  assert.match(requestVideoMedia, /Authorization: `Bearer \$\{sessionResult\.data\.session\.access_token\}`/);
  assert.match(requestVideoMedia, /\/api\/properties\/\$\{encodeURIComponent\(id\)\}\/media/);
  assert.match(requestVideoMedia, /settleVideoBatches\(ids, \{/);
  assert.match(requestVideoMedia, /catch \(lookupError\) \{[\s\S]*?setVideoStates\(\(current\) => markVideoStates\(current, ids, 'unavailable'\)\)/);
  assert.doesNotMatch(requestVideoMedia, /if \(!client\) return|while\s*\(|setTimeout\([^)]*requestVideoMedia/);
  assert.match(source, /targets\.forEach\(\(target\) => observer\.observe\(target\)\)/);
});

test('video loading permits playback interaction and listens for real readiness events', () => {
  assert.match(gallery, /preload="auto"/);
  for (const handler of ['onLoadedData={markVideoReady}', 'onCanPlay={markVideoReady}', 'onPlaying={markVideoReady}', 'onError={markVideoFailed}']) {
    assert.ok(gallery.includes(handler), handler);
  }
  assert.match(gallery, /onLoadedMetadata=\{[\s\S]*?element\.videoWidth > 0 && element\.videoHeight > 0[\s\S]*?setVideoNaturalSize/);
  assert.match(gallery, /!\s*videoReady && <span className=\{styles\.videoLoadingOverlay\}/);
  assert.match(styles, /\.videoLoadingOverlay \{[\s\S]*?pointer-events: none/);
  assert.match(styles, /background: rgba\(255, 255, 255, 0\.28\)/);
});

test('videos that never become ready reach unavailable, and the timer is cleared on listing or source changes', () => {
  const lifecycle = gallery.match(/useEffect\(\(\) => \{\s*setVideoReady\(false\);[\s\S]*?\}, \[listing\.id, video\?\.url\]\);/);
  assert.ok(lifecycle);
  assert.match(lifecycle[0], /setTimeout\(\(\) => \{\s*videoLoadTimeout\.current = null;\s*setVideoFailed\(true\);\s*\}, 20000\)/);
  assert.match(lifecycle[0], /return \(\) => \{[\s\S]*?clearTimeout\(videoLoadTimeout\.current\)/);
  assert.match(gallery, /if \(videoFailed\) return <div[^>]*>Video unavailable<\/div>/);
});

test('video sizing does not force a 4:3 stage or crop media', () => {
  const videoBranch = gallery.slice(gallery.indexOf('if (video) {'), gallery.indexOf('if (media.length === 0)'));
  const videoStyles = styles.slice(styles.indexOf('.videoStage {'), styles.indexOf('.actions {'));
  assert.match(videoBranch, /resolveVideoFrameSize\(video, videoNaturalSize\)/);
  assert.match(videoBranch, /height: hasVideoDimensions \? frame\.height : undefined/);
  assert.match(videoBranch, /style=\{\{ maxHeight: maxVideoHeight \}\}/);
  assert.doesNotMatch(videoBranch, /4\s*\/\s*3|aspectRatio:\s*['"]4\s*\/\s*3/);
  assert.doesNotMatch(videoStyles, /aspect-ratio:\s*4\s*\/\s*3|object-fit:\s*cover/);
  assert.match(videoStyles, /height:\s*auto/);
  assert.match(videoStyles, /object-fit:\s*contain/);
});
