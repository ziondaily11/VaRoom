'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('the legacy video player is retired; VideoPlayer keeps its blocked-autoplay events and styles', () => {
  for (const file of ['varoom-video-player.js', 'varoom-video-player.css']) assert.equal(fs.existsSync(path.join(root, 'public', 'js', file)), false, file);
  const player = read('components', 'media', 'VideoPlayer.tsx');
  const playerCss = read('components', 'media', 'videoPlayerStyles.ts');
  assert.match(player, /new CustomEvent\('varoomautoplayblocked', \{ bubbles: true \}\)/);
  assert.match(player, /new CustomEvent\('varoomvideoplaying', \{ bubbles: true \}\)/);
  assert.match(playerCss, /\.varoom-video-player\.is-autoplay-blocked \.varoom-video-play-retry\s*\{\s*display:\s*grid;/);
  assert.match(playerCss, /\.varoom-video-play-retry\s*\{[\s\S]*?pointer-events:\s*auto;/);
});

test('both feed loading overlays release on blocked autoplay and clear on playback or media errors', () => {
  const hostHomeCss = read('components', 'hostHome', 'hostHomeStyles.ts');
  const card = read('components', 'hostHome', 'FeedCard.tsx');
  const clientHomeCss = read('pages', 'ClientHome.module.css');
  assert.match(hostHomeCss, /\.card-video\.is-autoplay-blocked \.media-loading-indicator\{ display:none; pointer-events:none; \}/);
  assert.match(card, /addEventListener\('varoomautoplayblocked', blocked\)/);
  assert.match(card, /const playing = \(\) => setState\(\(current\) => \(current === 'blocked' \? 'loaded' : current\)\)/);
  assert.match(card, /state === 'failed' \? 'is-failed' : ''/);
  assert.match(clientHomeCss, /\.mediaAmbient\s*\{|\.mediaLoading\s*\{|\.photoUnavailable\s*\{/);
});

test('the phone viewer repeats the card\'s actions', () => {
  assert.match(read('lib', 'media', 'videoPlayback.ts'), /actions\?: ReactNode;/);
  assert.match(read('components', 'media', 'VideoPlayer.tsx'), /<div className="varoom-video-viewer-actions">\{details\.actions\}<\/div>/);
  assert.match(read('components', 'hostHome', 'FeedCard.tsx'), /extraClass=" varoom-video-viewer-action"/);
});
