'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const playerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'varoom-video-player.js'), 'utf8');
const playerCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'varoom-video-player.css'), 'utf8');

function makeClassList(){
  const names = new Set();
  return {
    add: (...values) => values.forEach((value) => names.add(value)),
    remove: (...values) => values.forEach((value) => names.delete(value)),
    contains: (value) => names.has(value),
    toggle(value, force){
      const enabled = force === undefined ? !names.has(value) : Boolean(force);
      if (enabled) names.add(value); else names.delete(value);
      return enabled;
    },
  };
}

class FakeElement {
  constructor(){ this.listeners = {}; this.classList = makeClassList(); this.style = { setProperty(){} }; this.attributes = {}; }
  addEventListener(name, listener){ (this.listeners[name] ||= []).push(listener); }
  insertBefore(node){ node.parentNode = this; }
  dispatchEvent(event){
    event.target ||= this;
    (this.listeners[event.type] || []).forEach((listener) => listener(event));
    if (event.bubbles && this.parentNode && this.parentNode.dispatchEvent) this.parentNode.dispatchEvent(event);
    return true;
  }
  setAttribute(name, value){ this.attributes[name] = String(value); }
  getAttribute(name){ return this.attributes[name] ?? null; }
  removeAttribute(name){ delete this.attributes[name]; }
  click(){ this.dispatchEvent({ type: 'click', stopPropagation(){}, target: this }); }
}

class FakeVideo extends FakeElement {
  constructor(stage){
    super();
    this.parentNode = stage;
    this.dataset = { listingId: 'listing-1', videoUrl: 'https://media.example/video.mp4' };
    this.attributes.src = this.dataset.videoUrl;
    this.muted = true;
    this.paused = true;
    this.ended = false;
    this.readyState = 0;
    this.playCalls = 0;
  }
  closest(selector){
    if (selector === '.varoom-video-player') return this.parentNode && this.parentNode.classList.contains('varoom-video-player') ? this.parentNode : null;
    if (selector === '.card-video') return this.parentNode && this.parentNode.classList.contains('card-video') ? this.parentNode : null;
    return null;
  }
  load(){}
  pause(){ this.paused = true; this.dispatchEvent({ type: 'pause' }); }
  play(){
    this.playCalls += 1;
    if (this.playCalls === 1) return Promise.reject({ name: 'NotAllowedError', message: 'autoplay blocked' });
    this.paused = false;
    return Promise.resolve().then(() => this.dispatchEvent({ type: 'playing' }));
  }
}

class FakeWrapper extends FakeElement {
  constructor(stage){ super(); this.parentNode = stage; this.classList.add('varoom-video-player'); this.nodes = {}; }
  appendChild(node){ node.parentNode = this; this.video = node; }
  closest(){ return null; }
  insertAdjacentHTML(){
    [
      '.varoom-video-status', '.varoom-video-status-text', '.varoom-video-play-retry',
      '.varoom-video-error-retry', '[data-video-action="play"]', '[data-video-action="mute"]',
      '[data-video-action="mobile-mute"]', '[data-video-action="fullscreen"]',
      '.varoom-video-progress', '.varoom-video-time',
    ].forEach((selector) => { this.nodes[selector] = new FakeElement(); });
    this.nodes['.varoom-video-status'].setAttribute = FakeElement.prototype.setAttribute;
  }
  querySelector(selector){
    if (selector === 'video') return this.video;
    return this.nodes[selector] || null;
  }
  querySelectorAll(){ return []; }
}

async function bootMobilePlayer(){
  const stage = new FakeElement();
  stage.classList.add('card-video');
  const video = new FakeVideo(stage);
  const overlay = { visible: true };
  const initialOverlayVisible = overlay.visible;
  video.addEventListener('varoomautoplayblocked', () => { stage.classList.add('is-autoplay-blocked'); overlay.visible = false; });
  video.addEventListener('varoomvideoplaying', () => { stage.classList.remove('is-autoplay-blocked'); });
  video.addEventListener('error', () => { stage.classList.remove('is-autoplay-blocked'); stage.classList.add('is-failed'); overlay.visible = false; });
  const document = {
    body: new FakeElement(),
    fullscreenElement: null,
    querySelectorAll(selector){ return selector === 'video[data-listing-id], .listing-thumb video' ? [video] : [video]; },
    createElement(){ return new FakeWrapper(stage); },
    addEventListener(){},
  };
  const window = {
    matchMedia: () => ({ matches: true }),
    scrollX: 0, scrollY: 0, setTimeout: () => 1, clearTimeout(){}, scrollTo(){},
  };
  window.IntersectionObserver = class {
    constructor(callback){ this.callback = callback; }
    observe(target){ this.callback([{ target, isIntersecting: true }]); }
    disconnect(){}
  };
  const context = {
    window, document,
    IntersectionObserver: window.IntersectionObserver,
    sessionStorage: { getItem: () => 'false', setItem(){} },
    MutationObserver: class { constructor(){} observe(){} },
    CustomEvent: class { constructor(type, options){ this.type = type; this.bubbles = options && options.bubbles; } },
    console: { warn(){}, error(){} },
    setTimeout: () => 1, clearTimeout(){},
  };
  vm.runInNewContext(playerSource, context, { filename: 'varoom-video-player.js' });
  await new Promise((resolve) => setImmediate(resolve));
  return { video, stage, overlay, initialOverlayVisible, wrapper: video.parentNode };
}

test('mobile user can tap play after unmuted autoplay is rejected and retries playback', async () => {
  const { video, stage, overlay, initialOverlayVisible, wrapper } = await bootMobilePlayer();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(initialOverlayVisible, true, 'the feed loading overlay starts present');
  assert.equal(video.muted, false, 'the saved unmuted preference is preserved');
  assert.equal(video.playCalls, 1, 'feed autoplay was attempted once');
  assert.equal(stage.classList.contains('is-autoplay-blocked'), true);
  assert.equal(wrapper.classList.contains('is-buffering'), false, 'blocked autoplay exits the loading state');
  assert.equal(overlay.visible, false, 'feed loading overlay no longer covers the player');
  const playTapTarget = wrapper.querySelector('.varoom-video-play-retry');
  assert.ok(playTapTarget, 'a dedicated play tap target is present');
  assert.match(playerCss, /\.varoom-video-player\.is-autoplay-blocked \.varoom-video-play-retry\s*\{\s*display:\s*grid;/);
  assert.match(playerCss, /\.varoom-video-play-retry\s*\{[\s\S]*?pointer-events:\s*auto;/);

  playTapTarget.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(video.playCalls, 2, 'tapping the visible play target calls the existing playback path again');
  assert.equal(video.paused, false);
  assert.equal(wrapper.classList.contains('is-autoplay-blocked'), false, 'successful playback leaves the blocked state');
});

test('a second rejected play attempt remains reachable without restoring the blocking overlay', async () => {
  const { video, stage, overlay, wrapper } = await bootMobilePlayer();
  video.play = function(){
    this.playCalls += 1;
    return Promise.reject({ name: 'NotAllowedError', message: 'play still blocked' });
  };
  wrapper.querySelector('.varoom-video-play-retry').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(video.playCalls, 2);
  assert.equal(wrapper.classList.contains('is-autoplay-blocked'), true);
  assert.equal(wrapper.classList.contains('is-buffering'), false);
  assert.equal(stage.classList.contains('is-autoplay-blocked'), true);
  assert.equal(overlay.visible, false);
  assert.ok(wrapper.querySelector('.varoom-video-play-retry'));
});

test('media errors leave blocked autoplay and enter the existing error state', async () => {
  const { video, stage, wrapper } = await bootMobilePlayer();
  video.dispatchEvent({ type: 'error' });

  assert.equal(wrapper.classList.contains('is-autoplay-blocked'), false);
  assert.equal(wrapper.classList.contains('is-error'), true);
  assert.equal(stage.classList.contains('is-autoplay-blocked'), false);
  assert.equal(stage.classList.contains('is-failed'), true);
});

test('both feed loading overlays release on blocked autoplay and clear on playback or media errors', () => {
  for (const page of ['client-home.html', 'host-home.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'legacy-pages', page), 'utf8');
    assert.match(html, /\.card-video\.is-autoplay-blocked \.media-loading-indicator\{ display:none; pointer-events:none; \}/);
    assert.match(html, /varoomautoplayblocked[\s\S]*?is-autoplay-blocked/);
    assert.match(html, /varoomvideoplaying[\s\S]*?remove\('is-autoplay-blocked'\)/);
    assert.match(html, /function failVideoLoad\(\)\{ if \(stage\) \{ stage\.classList\.remove\('is-autoplay-blocked'\); stage\.classList\.add\('is-failed'\); \} \}/);
  }
});
