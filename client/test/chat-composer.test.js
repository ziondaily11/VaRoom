const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('pages', 'chats.tsx');
const actions = read('components', 'ChatComposerActions.tsx');
const sheet = read('components', 'chat', 'ShareListingSheet.tsx');
const viewport = read('components', 'chat', 'useChatViewport.ts');

function sendBody() {
  const start = source.indexOf('// Standard conversation message send (legacy sendText)');
  return source.slice(start, source.indexOf('// Empty the desktop editor', start));
}

test('sending: one at a time; the composer clears only after the server accepts', () => {
  const body = sendBody();
  assert.match(body, /if \(sendingRef\.current\) return;\s*sendingRef\.current = true;/);
  assert.match(body, /finally \{\s*sendingRef\.current = false;/);
  const accepted = body.indexOf('// Accepted: clear the composer');
  assert.ok(accepted > body.indexOf("res = await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`"), 'cleared after the request');
  assert.ok(body.indexOf("setComposerText('')") > accepted && body.indexOf('resetDesktopComposer();') > accepted);
  assert.match(body, /showStatusNote\('Message not sent\. Please try again\.', 3500\)/);
});

test('@reply runs the chatbot command; a sent reply shows its quote at once', () => {
  const body = sendBody();
  assert.match(body, /!currentReply && plainText\.toLowerCase\(\) === '@reply'/);
  assert.match(body, /\/reply`, \{\s*method: 'POST',\s*body: JSON\.stringify\(\{ command: '@reply' \}\)/);
  assert.match(body, /res\.message\.reply_to_message = \{\s*id: currentReply\.id,/);
  assert.match(body, /res\.messages \|\| \(res\.message \? \[res\.message\] : \[\]\)/);
});

test('after a send the desktop editor is emptied and formatting turned off (legacy)', () => {
  assert.match(source, /\['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'\]\.forEach\(\(command\) => \{\s*if \(document\.queryCommandState\(command\)\) document\.execCommand\(command, false\);/);
});

test('role gating: clients share photos only; hosts also files and listings', () => {
  assert.match(actions, /className="share-file"\s*type="button"\s*hidden=\{!isHost\}/);
  assert.match(actions, /title="Share listing"[\s\S]*?hidden=\{!isHost\}[\s\S]*?onClick=\{\(\) => \{ onShareListing\(\); closeShareMenu\(\); \}\}/);
  assert.match(actions, /aria-label=\{isHost \? 'Attach photos, files or a listing' : 'Add photos'\}/);
  assert.match(source, /hidden=\{!isHost\} data-attach="files"/);
  assert.match(source, /hidden=\{!isHost\} data-attach="listing"\s*onClick=\{\(\) => \{ setMobileAttachMenuOpen\(false\); setShareSheetOpen\(true\); \}\}/);
  assert.doesNotMatch(source, /Listing sharing coming soon/);
  assert.match(source, /const onFileChosen = \(file: File\) => \{\s*if \(!isHost\) return;/);
});

test('files: images go to the photo preview, phones hold other files for the send button, desktop uploads at once', () => {
  assert.match(source, /addPreviewImages\(\[file\]\);\s*\} else if \(window\.matchMedia\('\(max-width: 760px\)'\)\.matches\) \{\s*setPendingFile\(file\);\s*\} else \{\s*void handleUploadAttachment\(file, 'file'\);/);
  assert.match(source, /`File: \$\{pendingFile\.name\}`/);
  assert.match(source, /void handleUploadAttachment\(fileToSend, 'file', plainText \? content : fileToSend\.name\);/);
  assert.doesNotMatch(source, /accept="\.pdf,\.doc/, 'any file type, as legacy');
});

test('share-listing sheet: account-scoped listings, multi-select, one message per listing, stays open on failure', () => {
  assert.match(sheet, /const listingsByUser = new Map<string, Promise<ChatListingSummary\[\]>>\(\);/);
  assert.match(sheet, /api(?:<[^>]+>)?\('\/api\/chat\/listings'\)/);
  assert.match(sheet, /You have no listings to share yet\./);
  assert.match(sheet, /disabled=\{!count \|\| sharing\}/);
  assert.match(sheet, /catch \{\s*\/\/ The page reports the failure; the dialog stays open to retry\./);
  assert.match(source, /body: JSON\.stringify\(\{ content: listing\.title, listingId: listing\.id, messageType: 'listing' \}\)/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-share\{ max-width:760px;/);
});

test('photo preview: one object URL released on change, caption focused, Escape closes', () => {
  // One object URL per chosen photo, released when it leaves the preview or the page closes.
  assert.match(source, /const known = previewUrlsRef\.current\.get\(file\);\s*if \(known\) return known;\s*const url = URL\.createObjectURL\(file\);/);
  assert.match(source, /if \(!pendingPreviewFiles\.includes\(file\)\) \{ URL\.revokeObjectURL\(url\); previewUrlsRef\.current\.delete\(file\); \}/);
  assert.doesNotMatch(source, /src=\{URL\.createObjectURL\(/);
  // The caption lives in the preview, so typing does not re-render the conversation.
  assert.doesNotMatch(source, /previewCaption/);
  const preview = read('components', 'chat', 'MediaPreviewComposer.tsx');
  assert.match(preview, /const \[caption, setCaption\] = useState\(''\);/);
  assert.match(preview, /value=\{caption\}\s*autoFocus\s*onChange=\{\(e\) => setCaption\(e\.target\.value\)\}/);
  assert.match(source, /onSend=\{\(caption\) => \{ void sendAttachments\(pendingPreviewFiles, 'photo', caption\); \}\}/);
});

test('Elie: Ctrl/Cmd+B/I/U do nothing (legacy)', () => {
  assert.match(source, /if \(isElie && \(e\.ctrlKey \|\| e\.metaKey\) && \['b', 'i', 'u'\]\.includes\(e\.key\.toLowerCase\(\)\)\) \{\s*e\.preventDefault\(\);/);
});

test('phone viewport: shell follows the visual viewport, keyboard state, list pinned to the bottom, listeners released', () => {
  assert.match(viewport, /root\.style\.setProperty\('--vvh'/);
  assert.match(viewport, /shell\.classList\.toggle\('kb-open', document\.activeElement === textarea && \(window\.innerHeight - height\) > 100\)/);
  assert.match(viewport, /< 80;/);
  assert.match(viewport, /vv && vv\.scale > 1\.05/);
  for (const name of ['resize', 'scroll', 'orientationchange', 'focus', 'blur']) assert.match(viewport, new RegExp(`removeEventListener\\('${name}'`));
  assert.match(viewport, /observer\?\.disconnect\(\);/);
  assert.match(source, /useChatViewport\(\{ shellRef: appShellRef, messagesRef, composerRef, textareaRef: mobileTextareaRef \}\);/);
  assert.match(source, /\(e\.target as Element\)\.closest\(KEEP_FOCUS_SELECTOR\)\) e\.preventDefault\(\);/);
});

test('uploads in progress or failed show their state for files as well as photos', () => {
  // In progress: the clock in the meta (every message type has one). Failed: Failed + Dismiss.
  assert.match(source, /const sending = Boolean\(optimistic\._optimistic && !optimistic\._failed\);/);
  assert.match(source, /const uploadState = optimistic\._optimistic && optimistic\._failed \? \(/);
  assert.match(source, /\{renderMessageBody\(m\.body \|\| ''\)\}\s*\{uploadState\}/);
  // Photos: with a caption, uploadState follows it; without one, it is the footer.
  assert.match(source, /<div className="chat-message-caption">\{renderMessageBody\(m\.body \|\| ''\)\}\{meta\}<\/div>\s*\{uploadState\}/);
  assert.match(source, /\) : uploadState \|\| undefined\}/);
});

test('a photo without a caption carries its time and ticks over the image in a thin frame', () => {
  assert.match(source, /overlay=\{photoCaption\(m\) \? undefined : meta\}/);
  const media = fs.readFileSync(path.join(root, 'components', 'chat', 'MessageMedia.tsx'), 'utf8');
  assert.match(media, /\{overlay\}\s*<\/div>\s*\{footer\}/, 'inside the image wrapper');
  const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
  assert.match(css, /\.bubble\.bubble-media\{\s*padding:3px;/);
  assert.match(css, /\.chat-media-wrap > \.msg-meta\{\s*position:absolute;/);
});
