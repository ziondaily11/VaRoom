const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

// Listing photos: at least 5 (3 for a restaurant-only hotel), 8 photos and
// videos in all, and each photo checked as it is picked
// (lib/listWizard/photoQuality.ts). Also checked in a real browser on real
// photos: a real photo is kept; blurry, small and repeated ones are refused;
// a dark one is kept with a note; a 4200px PNG uploads as a 2560px JPEG.

const root = path.join(__dirname, '..');
const pq = loadTs(path.join(root, 'lib', 'listWizard', 'photoQuality.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

/** A greyscale test image: `pixel(x, y)` gives each value. */
function image(width, height, pixel, size = { width: 2400, height: 1600 }) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) gray[y * width + x] = pixel(x, y);
  return { width: size.width, height: size.height, gray, grayWidth: width, grayHeight: height };
}
// Detailed, mid-bright: fine stripes over a gradient.
const detailed = (x, y) => Math.max(0, Math.min(255, 60 + ((x * 3 + y * 7) % 140) + ((x % 3) * 18)));
const smooth = (x) => 100 + Math.round(x / 10);

test('the rules', () => {
  assert.equal(pq.PHOTO_RULES.minPhotos, 5);
  assert.equal(pq.minPhotosFor(true), 3, 'a hotel restaurant-only listing');
  assert.equal(pq.minPhotosFor(false), 5);
  assert.equal(pq.PHOTO_RULES.maxMedia, 8);
  assert.equal(pq.PHOTO_RULES.maxVideos, 2);
  assert.equal(pq.PHOTO_RULES.minLongSide, 1000, 'Instagram photos (1080px) pass');
});

test('a good photo is kept; too small, blurry or the same photo again is refused', () => {
  const good = image(256, 170, detailed);
  const kept = pq.judgePhoto('room.jpg', good, []);
  assert.equal(kept.refused, null);
  assert.deepEqual(kept.notes, []);
  assert.match(kept.hash, /^[0-9a-f]{16}$/);

  assert.match(pq.judgePhoto('tiny.jpg', image(256, 170, detailed, { width: 900, height: 600 }), []).refused, /"tiny\.jpg" is too small \(900×600\)/);
  assert.match(pq.judgePhoto('soup.jpg', image(256, 170, smooth), []).refused, /"soup\.jpg" is too blurry/);
  assert.match(pq.judgePhoto('again.jpg', good, [kept.hash]).refused, /"again\.jpg" is the same photo as one you've already added/);
  assert.equal(pq.judgePhoto('other.jpg', image(256, 170, (x, y) => detailed(y, x)), [kept.hash]).refused, null, 'a different photo');
});

test('borderline photos are kept with a note: dark, washed out, soft, an odd shape', () => {
  assert.deepEqual(pq.judgePhoto('night.jpg', image(256, 170, (x, y) => Math.round(detailed(x, y) / 4)), []).notes, ['looks dark']);
  assert.deepEqual(pq.judgePhoto('glare.jpg', image(256, 170, (x, y) => 240 + (detailed(x, y) % 15)), []).notes, ['looks washed out']);
  assert.deepEqual(pq.judgePhoto('strip.jpg', image(256, 100, detailed, { width: 3000, height: 1000 }), []).notes, ['looks like a screenshot or panorama']);
  const soft = image(256, 170, (x, y) => 128 + Math.round(40 * Math.sin(x / 2) + 40 * Math.cos(y / 3)));
  const softness = pq.sharpness(soft.gray, 256, 170);
  assert.ok(softness >= pq.PHOTO_RULES.blurry && softness < pq.PHOTO_RULES.soft, `test image is soft (${softness})`);
  assert.ok(pq.judgePhoto('soft.jpg', soft, []).notes.includes('looks a little soft'));
});

test('near-identical photos hash alike; different photos do not', () => {
  const a = image(256, 170, detailed);
  const brighter = image(256, 170, (x, y) => Math.min(255, detailed(x, y) + 6));
  const different = image(256, 170, (x, y) => detailed(255 - x, y));
  const hash = (img) => pq.differenceHash(img.gray, img.grayWidth, img.grayHeight);
  assert.ok(pq.hashDistance(hash(a), hash(brighter)) <= pq.PHOTO_RULES.sameDistance);
  assert.ok(pq.hashDistance(hash(a), hash(different)) > pq.PHOTO_RULES.sameDistance);
  assert.equal(pq.hashDistance('ff00ff00ff00ff00', '00ff00ff00ff00ff'), 64);
});

test('the wizard: checks on picking, the minimum on the Photos step, videos only where allowed, shrunk on upload', () => {
  const page = read('pages', 'list.tsx');
  assert.match(page, /const verdict = judgePhoto\(file\.name, await measurePhoto\(file\), hashes\);/);
  assert.match(page, /if \(verdict\.refused\) \{ refused\.push\(verdict\.refused\); continue; \}/);
  assert.match(page, /You can keep it or replace it\./);
  assert.match(page, /const needed = minPhotosFor\(cat === 'hotel' && state\.form\.hotelListingMode === 'table'\);/);
  assert.match(page, /`Add at least \$\{needed\} photos \(\$\{photos\} so far\)\. Videos don't count towards this\.`/);
  assert.match(page, /const videoNote = isPaidNiche\(category\) \? 'Silver and Gold listings use photos\./);
  assert.match(page, /allowVideo=\{!videoNote\}/);
  const picker = read('components', 'listWizard', 'MediaPicker.tsx');
  assert.match(picker, /accept=\{allowVideo \? "image\/png,image\/jpeg,image\/webp,video\/mp4,video\/quicktime,video\/webm" : "image\/png,image\/jpeg,image\/webp"\}/);
  assert.match(read('lib', 'listWizard', 'api.ts'), /const file = await shrinkPhoto\(picked\);/);
  const copy = read('lib', 'listWizard', 'copy.ts');
  assert.doesNotMatch(copy, /Up to 6|5MB max/);
  assert.match(copy, /At least 3 sharp photos of the restaurant/);
});

test('every plan card says how many listings can have video, matching the server', () => {
  const pricing = loadTs(path.join(root, 'lib', 'billing', 'pricing.ts'));
  const sql = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261127_000083_plan_video_listing_limits.sql'), 'utf8');
  const limits = Object.fromEntries([...sql.matchAll(/\('(\w+)', (\d+)\)/g)].map(([, id, n]) => [id, Number(n)]));
  const cards = [...Object.values(pricing.NICHE_PLAN_CARDS).flat(), ...pricing.DEFAULT_PLAN_CARDS];
  for (const card of cards) {
    const limit = card.perListing ? 0 : limits[card.id];
    const line = card.features.find((feature) => /^Video on |Photos only|photos only/.test(feature));
    assert.ok(line, `${card.id} says what it allows`);
    const expected = limit === 0 ? /Photos only|photos only/ : limit === 1 ? /^Video on 1 listing$/ : new RegExp(`^Video on up to ${limit} listings$`);
    assert.match(line, expected, card.id);
  }
});
