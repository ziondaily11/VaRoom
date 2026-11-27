'use strict';

// The Chats right column (information panel, Chat Settings): opens out of its
// trigger and closes back towards it (components/chat/usePanelMotion).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadChats } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('timings: 220 ms in (within 180–250), out 20% shorter, rows 30 ms apart', () => {
  const motion = loadChats('components/chat/usePanelMotion.ts');
  assert.equal(motion.PANEL_OPEN_MS, 220);
  assert.equal(motion.PANEL_CLOSE_MS, 176);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.info-col\.is-opening\{ animation:panel-from-trigger 220ms var\(--ease-out,ease-out\) both; \}/, 'ease-out entrance');
  assert.match(css, /\.info-col\.is-closing\{ animation:panel-to-trigger 176ms var\(--ease-in,ease-in\) both; pointer-events:none; \}/);
  assert.match(css, /\.info-col\.is-opening > :nth-child\(2\), \.info-col\.is-opening \.cs > \.cs-section:nth-child\(2\)\{ animation-delay:30ms; \}/);
  assert.match(css, /:nth-child\(n\+10\)\{ animation-delay:270ms; \}/, 'stagger capped at the tenth row');
  assert.match(css, /transform-origin:calc\(100% \+ var\(--panel-origin-x, 0px\)\) var\(--panel-origin-y, 0px\);/, 'towards the trigger');
  assert.match(css, /\.info-col\.is-opening, \.info-col\.is-closing, \.info-col\.is-opening > \*/, 'reduced motion');
});

test('every opener and closer goes through the motion; Chat Settings closes to what was there before', () => {
  const page = read('pages', 'chats.tsx');
  assert.match(page, /else if \(infoCollapsed\) panelMotion\.open\(e\.currentTarget, \(\) => setInfoCollapsed\(false\)\);\s*else panelMotion\.close\(e\.currentTarget,/);
  assert.match(page, /panelMotion\.open\(event \? event\.currentTarget : null, \(\) => \{\s*setInfoCollapsed\(false\);\s*setChatSettingsEmbedded\(true\);/);
  assert.match(page, /if \(!backToInfo\) setInfoCollapsed\(true\);/);
  assert.match(page, /onClick=\{\(\) => closeChatSettings\(\)\}/);
  assert.match(page, /onOpenArchived=\{\(\) => closeChatSettings\(\(\) => setInboxView\('archived'\)\)\}/);
  assert.match(page, /else panelMotion\.close\(null, \(\) => setInfoCollapsed\(true\)\);/);
  assert.match(page, /ref=\{infoPanelRef\} className=\{`\$\{layoutClasses\.info\}\$\{panelMotion\.phase === 'idle' \? '' : ` is-\$\{panelMotion\.phase\}`\}`\}/);
  const hook = read('components', 'chat', 'usePanelMotion.ts');
  assert.match(hook, /if \(prefersReducedMotion\(\)\) \{ apply\(\); return; \}/, 'reduced motion: closes at once');
});
