const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function component(file) {
  const output = ts.transpileModule(read(...file.split('/')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, require);
  return module.exports.default;
}

test('the chat header has no ⋮ button; reporting stays in the information panel', () => {
  const source = read('pages', 'chats.tsx');
  assert.doesNotMatch(source, /title="More actions"/);
  assert.match(source, /onReport=\{\(\) => setReportSheetOpen\(true\)\}/);
});

test('report dialog: closed renders nothing; open shows the four reasons as choices and a disabled submit', () => {
  const Report = component('components/chat/ReportSheet.tsx');
  const props = { personName: 'Billionaire ZION', onClose() {}, onSubmit: async () => {} };
  assert.equal(renderToStaticMarkup(React.createElement(Report, { ...props, open: false })), '');
  const html = renderToStaticMarkup(React.createElement(Report, { ...props, open: true }));
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /Report Billionaire ZION/);
  assert.equal((html.match(/type="radio" name="chatReportReason"/g) || []).length, 4);
  assert.match(html, /Spam or scam[\s\S]*Fake listings, payment requests or suspicious links/);
  assert.match(html, /<button class="chat-btn chat-btn-primary" type="submit" disabled="">Submit report<\/button>/);
  assert.match(html, /What happened with Billionaire ZION\?/);
});

test('dialogs use VaRoom brand colours only: warm white, black actions, VaRoom red accents', () => {
  const css = read('public', 'js', 'chats.css');
  const block = css.slice(css.indexOf('/* Dialogs over the conversation'), css.indexOf('@media (hover:none){ .chat-share-check'));
  assert.match(block, /--modal-surface:#fffdfb;/);
  assert.match(block, /--modal-accent:#bd2337;/);
  assert.match(block, /--modal-cta:#111111;/);
  assert.doesNotMatch(block, /#4ec1a0|#25876e|#2563EB|mint/i, 'no chat mint or old blue');
});

test('share dialog: explorer-like tiles with a hover/selected tick, title and place over the photo, search and a count', () => {
  const sheet = read('components', 'chat', 'ShareListingSheet.tsx');
  assert.match(sheet, /role="listbox" aria-multiselectable="true"/);
  assert.match(sheet, /role="option"\s*aria-selected=\{selected\}/);
  assert.match(sheet, /<span className="chat-share-info">\s*<strong>\{title\}<\/strong>/);
  assert.match(sheet, /<video ref=\{videoRef\} src=\{video\.url\} poster=\{[^}]*\} muted loop playsInline preload="none" \/>/, 'no player controls; plays on hover');
  assert.doesNotMatch(sheet, /\bcontrols\b/);
  assert.match(sheet, /placeholder="Search your listings"/);
  assert.match(sheet, /\{count \? `\$\{count\} selected` : 'Nothing selected'\}/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-share-info\{ position:absolute; left:14px; right:14px; bottom:12px;/, 'info over the card');
  assert.match(css, /\.chat-share-tile\.is-selected \.chat-share-check\{ border-color:var\(--modal-accent\); background:var\(--modal-accent\);/);
});
