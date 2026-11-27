'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { photoProblem, sharpness, MIN_LONG_SIDE, BLURRY } = require('../lib/photoQuality');

// The server's check of an uploaded listing photo: too small or too blurry is
// refused, with the same measures and limits as the browser's check.

const client = path.join(__dirname, '..', '..', 'client');
const realPhoto = path.join(client, 'public', 'assets', 'apartment-interior.png');

test('a real photo passes; too small, too blurry or not a photo is refused', async () => {
  const photo = await sharp(realPhoto).resize(2000).jpeg().toBuffer();
  assert.equal(await photoProblem(photo), null);
  assert.match(await photoProblem(await sharp(photo).resize(800).toBuffer()), /too small \(800×450\)\. Use a photo at least 1000 pixels/);
  assert.match(await photoProblem(await sharp(photo).blur(16).toBuffer()), /too blurry/);
  assert.match(await photoProblem(Buffer.from('not a photo')), /not a photo we can read/);
  // A portrait phone photo is judged on its longest side.
  assert.equal(await photoProblem(await sharp(photo).rotate(90).toBuffer()), null);
});

test('the server and the browser use the same measure and limits', () => {
  const browser = fs.readFileSync(path.join(client, 'lib', 'listWizard', 'photoQuality.ts'), 'utf8');
  assert.match(browser, new RegExp(`minLongSide: ${MIN_LONG_SIDE},`));
  assert.match(browser, new RegExp(`blurry: ${BLURRY},`));
  // A flat image has no edges; a checkerboard is all edges.
  assert.equal(sharpness(new Uint8Array(100).fill(128), 10, 10), 0);
  const checker = Uint8Array.from({ length: 100 }, (_, i) => ((i % 10) + Math.floor(i / 10)) % 2 ? 255 : 0);
  assert.ok(sharpness(checker, 10, 10) > 100000);
});

test('the upload refuses a poor listing photo and removes it; listings need 5 photos (3 for a restaurant) on first publication', () => {
  const photoRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'photoRoutes.js'), 'utf8');
  assert.match(photoRoutes, /if \(category === 'listing-photos'\) \{\s*const problem = await photoProblem\(await mediaStorageService\.downloadR2Object\(key\)\);/);
  assert.match(photoRoutes, /await mediaStorageService\.deleteR2Object\(key\)[\s\S]{0,200}return res\.status\(422\)\.json\(\{ error: problem, code: 'PHOTO_QUALITY' \}\);/);
  const listingRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'listingRoutes.js'), 'utf8');
  assert.match(listingRoutes, /const MIN_PHOTOS = 5;\s*const MIN_PHOTOS_RESTAURANT = 3;/);
  assert.match(listingRoutes, /if \(status === 'available' && listing\.publication_state !== 'published'\) \{\s*const needed = listing\.category === 'hotel' && listing\.supports_stay === false \? MIN_PHOTOS_RESTAURANT : MIN_PHOTOS;/);
  assert.match(listingRoutes, /code: 'PHOTOS_REQUIRED'/);
  // A listing with a video goes online only with a free video place on the plan.
  assert.match(listingRoutes, /const videoCount = await getPropertyVideoCount\(supabaseAdmin, req\.params\.id\);[\s\S]*if \(allowance\.used >= allowance\.limit\)[\s\S]*code: 'VIDEO_LIMIT_REACHED'/);
});
