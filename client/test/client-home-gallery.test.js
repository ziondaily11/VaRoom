const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.join(__dirname, '..', 'pages', 'client-home.tsx');
const source = fs.readFileSync(pagePath, 'utf8');
const galleryStart = source.indexOf('function Gallery(');
const galleryEnd = source.indexOf('function ListingCard(', galleryStart);
const gallery = source.slice(galleryStart, galleryEnd);

test('Gallery reveals successful images already complete after commit without a replayed load event', () => {
  assert.match(gallery, /useEffect\(\(\) => \{[\s\S]*?image\.complete && image\.naturalWidth > 0/);
  assert.match(gallery, /image\.dataset\.photoUrl/);
  assert.match(gallery, /successfulImages\.forEach\([\s\S]*?next\[url\] = true/);
  assert.match(gallery, /data-photo-url=\{photo\.url\}/);
});

test('Gallery retains the normal load event path and scopes loaded state to the photo URL', () => {
  assert.match(gallery, /useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(gallery, /onLoad=\{\(event\) => \{[\s\S]*?setLoaded\(\(current\) => current\[photo\.url\]/);
  assert.match(gallery, /opacity: loaded\[photo\.url\] \? 1 : 0/);
  assert.match(gallery, /!\s*loaded\[photo\.url\].*imageSkeleton/);
});

test('Gallery preserves photo error handling by URL identity', () => {
  assert.match(gallery, /failed\[photo\.url\]/);
  assert.match(gallery, /onError=\{\(\) => setFailed\(\(current\) => current\[photo\.url\]/);
  assert.match(gallery, /className=\{styles\.photoUnavailable\}/);
});

test('switching listings resets carousel/video state without clearing successful photo state after reconciliation', () => {
  const listingReset = gallery.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[listing\.id\]\);/);
  assert.ok(listingReset);
  assert.match(listingReset[1], /setActiveIndex\(0\)/);
  assert.match(listingReset[1], /setVideoReady\(false\)/);
  assert.doesNotMatch(listingReset[1], /setLoaded|setFailed|setNaturalSizes/);
  assert.match(gallery, /const photoUrls = new Set\(media\.map\(\(photo\) => photo\.url\)\)/);
  assert.match(gallery, /Object\.entries\(current\)\.filter\(\(\[url\]\) => photoUrls\.has\(url\)\)/);
});

test('replacing or reordering media keeps each image status and natural size attached to its URL', () => {
  assert.match(gallery, /<div className=\{styles\.slide\} key=\{photo\.url\}>/);
  assert.match(gallery, /loaded\[photo\.url\]/);
  assert.match(gallery, /failed\[photo\.url\]/);
  assert.match(source, /const natural = naturalSizes\[item\.url \|\| ''\]/);
  assert.match(gallery, /\}, \[listing\.id, media, video\]\);/);
});

test('returning to Client Home reconciles cached images from their committed DOM state', () => {
  const reconciliationEffect = gallery.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[listing\.id, media, video\]\);/);
  assert.ok(reconciliationEffect);
  assert.match(reconciliationEffect[1], /stage\.current\?\.querySelectorAll/);
  assert.match(reconciliationEffect[1], /image\.complete && image\.naturalWidth > 0/);
  assert.doesNotMatch(reconciliationEffect[1], /dispatchEvent|load\.event/);
});
