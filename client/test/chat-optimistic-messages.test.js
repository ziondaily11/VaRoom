const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const om = loadTs(path.join(root, 'lib', 'chat', 'optimisticMessages.ts'));
const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');

const upload = { id: 'optimistic-1', sender_id: 'u1', created_at: 't0', message_type: 'photo', attachment_id: 'a1', _optimistic: true, _localUrl: 'blob:one' };
const sent = { id: 'm1', sender_id: 'u1', created_at: 't1', message_type: 'photo', attachment_id: 'a1' };
const other = { id: 'm0', sender_id: 'u2', created_at: 't-1', message_type: 'text' };

test('the sent photo takes the optimistic row\'s place with the same key and local image', () => {
  const thread = om.mergeServerMessages([other, upload], [sent]);
  assert.equal(thread.length, 2);
  assert.equal(thread[1].id, 'm1');
  assert.equal(thread[1]._optimistic, undefined, 'no longer sending: ticks show');
  assert.equal(thread[1]._localUrl, 'blob:one', 'no reload from the server');
  assert.equal(om.messageKey(thread[1]), 'optimistic-1', 'React keeps the same bubble');
  assert.deepEqual(om.mergeServerMessages(thread, [sent]), thread, 'the send response after Realtime changes nothing');
});

test('messages that are not our upload are appended; a failed upload is not adopted', () => {
  assert.deepEqual(om.mergeServerMessages([upload], [other]).map((m) => m.id), ['optimistic-1', 'm0']);
  const failed = { ...upload, _failed: true };
  assert.deepEqual(om.mergeServerMessages([failed], [sent]).map((m) => m.id), ['optimistic-1', 'm1']);
});

test('a full refresh keeps uploads in progress and the local image of a sent photo', () => {
  const during = om.reconcileThread([other, upload], [other]);
  assert.deepEqual(during.map((m) => m.id), ['m0', 'optimistic-1'], 'a delivered-tick refresh does not drop the upload');
  const after = om.reconcileThread([other, upload], [other, sent]);
  assert.deepEqual(after.map((m) => om.messageKey(m)), ['m0', 'optimistic-1']);
  assert.equal(after[1]._localUrl, 'blob:one');
  const later = om.reconcileThread(after, [other, { ...sent, delivered_at: 't2' }]);
  assert.equal(later[1].delivered_at, 't2', 'server fields update');
  assert.equal(om.messageKey(later[1]), 'optimistic-1');
  assert.deepEqual([...om.localUrls(later)], ['blob:one']);
  assert.deepEqual([...om.localUrls([other, sent])], []);
});

test('the page keys rows by messageKey and adopts copies on send, Realtime and refresh', () => {
  assert.match(source, /key=\{messageKey\(m as OptimisticChatMessage\)\}/);
  assert.match(source, /setMessagesState\(\(prev\) => prev\.map\(\(m\) => \(m\.id === tempId \? \{ \.\.\.m, attachment_id: initRes\.attachmentId \} : m\)\)\);/);
  assert.match(source, /if \(activeIdRef\.current === activeId\) setMessagesState\(\(prev\) => mergeServerMessages\(prev, \[sent\]\)\);/);
  assert.match(source, /setMessagesState\(\(prev\) => mergeServerMessages\(prev, incoming\)\);/);
  assert.match(source, /setMessagesState\(\(prev\) => reconcileThread\(prev, list\)\);/);
  assert.doesNotMatch(source, /URL\.revokeObjectURL\(localObjectUrl\)/, 'the local image is released only when no message shows it');
});

test('the photo preview renders its caption box and send button', () => {
  const file = path.join(root, 'components', 'chat', 'MediaPreviewComposer.tsx');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output)(module, module.exports, require);
  const html = renderToStaticMarkup(React.createElement(module.exports.default, { imageUrl: 'blob:x', sending: false, onCancel() {}, onSend() {} }));
  assert.match(html, /id="chatMediaPreviewCaption"[^>]*placeholder="Type a message"[^>]*value=""/);
  assert.match(html, /<img id="chatMediaPreviewImg" class="chat-media-preview-image" src="blob:x"/);
  assert.doesNotMatch(html, /id="chatMediaPreviewSend"[^>]*disabled/);
  const busy = renderToStaticMarkup(React.createElement(module.exports.default, { imageUrl: 'blob:x', sending: true, onCancel() {}, onSend() {} }));
  assert.match(busy, /id="chatMediaPreviewSend"[^>]*disabled=""/);
});
