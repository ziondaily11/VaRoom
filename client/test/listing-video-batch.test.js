const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const load = () => loadTs(path.join(__dirname, '..', 'lib', 'media', 'listingVideo.ts'));
const json = (body, ok = true) => ({ ok, json: async () => body });

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [prefix, answer] of routes) if (url.startsWith(prefix)) return typeof answer === 'function' ? answer(url) : answer;
    throw new Error(`unexpected ${url}`);
  };
  return { fn, calls };
}

test('cards shown together share one lookup; only listings with a video ask for playback', async () => {
  const media = load();
  const { fn, calls } = fakeFetch([
    ['/api/discover/video-media', json({ videoMedia: { a: 'm-a' }, publishedIds: ['a', 'b', 'c'] })],
    ['/api/media/m-a/playback', json({ url: 'https://v/a.mp4', thumbnailUrl: 'https://v/a.jpg' })],
  ]);
  const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((id) => media.loadPublicListingVideo(id, 't', fn)));
  assert.deepEqual(a, { videoUrl: 'https://v/a.mp4', thumbnailUrl: 'https://v/a.jpg' });
  assert.equal(b, null);
  assert.equal(c, null);
  assert.deepEqual(calls, ['/api/discover/video-media?listingIds=a%2Cb%2Cc', '/api/media/m-a/playback']);
  // Answers are cached like loadListingVideo's.
  assert.equal(await media.loadPublicListingVideo('b', 't', fn), null);
  assert.equal(media.getCachedVideo('a').videoUrl, 'https://v/a.mp4');
  assert.equal(calls.length, 2);
});

test('listings the batch does not cover use the per-listing lookup', async () => {
  const media = load();
  const { fn, calls } = fakeFetch([
    ['/api/discover/video-media', json({ videoMedia: {}, publishedIds: ['a'] })],
    ['/api/properties/draft/media', json({ media: [{ id: 'm-d', type: 'video' }] })],
    ['/api/media/m-d/playback', json({ url: 'https://v/d.mp4' })],
  ]);
  const [a, d] = await Promise.all([media.loadPublicListingVideo('a', 't', fn), media.loadPublicListingVideo('draft', 't', fn)]);
  assert.equal(a, null);
  assert.deepEqual(d, { videoUrl: 'https://v/d.mp4', thumbnailUrl: null });
  assert.ok(calls.includes('/api/properties/draft/media'));
  assert.ok(!calls.includes('/api/properties/a/media'));
});

test('a failed batch (or an older server without publishedIds) falls back for every card', async () => {
  for (const batchAnswer of [json({ error: 'x' }, false), json({ videoMedia: { a: 'm-a' } })]) {
    const media = load();
    const { fn, calls } = fakeFetch([
      ['/api/discover/video-media', batchAnswer],
      ['/api/properties/a/media', json({ media: [] })],
    ]);
    assert.equal(await media.loadPublicListingVideo('a', null, fn), null);
    assert.ok(calls.includes('/api/properties/a/media'));
  }
});

test('more than 24 cards are split into batches of 24', async () => {
  const media = load();
  const ids = Array.from({ length: 30 }, (_, index) => `id${index}`);
  const { fn, calls } = fakeFetch([['/api/discover/video-media', (url) => {
    const listed = decodeURIComponent(url.split('=')[1]).split(',');
    return json({ videoMedia: {}, publishedIds: listed });
  }]]);
  await Promise.all(ids.map((id) => media.loadPublicListingVideo(id, null, fn)));
  assert.deepEqual(calls.map((url) => decodeURIComponent(url.split('=')[1]).split(',').length), [24, 6]);
});
