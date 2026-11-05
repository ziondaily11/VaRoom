'use strict';

// Chats (pages/chats.tsx): the page's first paint, its layout and routing.
// The page is rendered on the server with Next and Supabase faked
// (helpers/chatsPage); the rules it applies live in lib/chat/ and are tested
// directly. What remains as a source check is wiring inside effects that a
// first paint cannot show (Realtime channel lifecycle, effect dependencies).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, renderChatsPage, render, section } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const { getAccountLayout } = loadTs(path.join(root, 'lib', 'accountRoleLayout.ts'));
const thread = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));
const inbox = loadTs(path.join(root, 'lib', 'chat', 'inbox.ts'));

test('Chats is a native React page with its own full-screen shell and the app navigation', () => {
  const { html, page } = renderChatsPage();
  assert.equal(typeof page.default, 'function');
  const element = { marker: true };
  assert.equal(page.default.getLayout(element), element, 'outside ClientLayout and HostLayout');
  assert.equal(page.default.appNavigation, true, 'the mobile navigation shows on the inbox');
  assert.match(html, /<title>Messenger Dashboard<\/title>/);
  assert.match(html, /<div class="app-shell view-inbox" style="--bubble-out-l:/);
  assert.match(html, /<nav class="icon-rail" id="chatRoleNavigation" data-role="client" aria-label="Client navigation">/);
  assert.match(html, /<aside class="contacts-col">[\s\S]*<main class="chat-col empty-conversation">[\s\S]*<aside class="info-col collapsed" id="infoCol">/);
});

test('CH5: chats.html, elie.html and chat-data.js are retired; old URLs redirect to native Chats', () => {
  assert.equal(fs.existsSync(path.join(root, 'pages', '[...slug].js')), false, 'the legacy catch-all is retired (E1)');
  for (const file of ['legacy-pages/chats.html', 'legacy-pages/elie.html', 'public/js/chat-data.js', 'public/js/chat-cache.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} is deleted`);
  }
  const config = read('next.config.js');
  assert.match(config, /source: '\/elie',\s*destination: '\/chats\?c=elie'/);
  assert.match(config, /source: '\/chat',\s*destination: '\/chats'/);
  assert.match(config, /source: '\/chats\.html',\s*destination: '\/chats'/);
  assert.match(config, /source: '\/elie\.html',\s*destination: '\/chats\?c=elie'/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.redirects.some((r) => r.source === '/:page.html' && r.destination === '/:page'), '/chats.html and /elie.html reach the routes above');
  assert.doesNotMatch(read('pages', 'profile.tsx'), /chats\.html/);
});

test('Chats route resolves to none layout, preserving full-screen dashboard app shell', () => {
  assert.equal(getAccountLayout('/chats', '/chats', null), 'none');
  assert.equal(getAccountLayout('/chats', '/chats', 'client'), 'none');
  assert.equal(getAccountLayout('/chats', '/chats', 'host'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/chats', 'client'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/chats', 'host'), 'none');
});

test('both shells navigate to /chats client-side through the shared link handler', () => {
  const { HOST_INTERNAL_ROUTES, CLIENT_INTERNAL_ROUTES, isInternalHref } = loadTs(path.join(root, 'lib', 'navigation', 'appLinks.ts'));
  assert.equal(isInternalHref('/chats', HOST_INTERNAL_ROUTES), true);
  assert.equal(isInternalHref('/chats?id=1', CLIENT_INTERNAL_ROUTES), true);
  assert.match(read('pages', '_app.tsx'), /installAppLinks\(\{ doc: document, push: \(href\) => Router\.push\(href\)/);
});

test('deep links open the requested conversation once; opening one puts it in the URL without reloading', () => {
  assert.equal(inbox.requestedConversation('c1', undefined, null), 'c1');
  assert.equal(inbox.requestedConversation(undefined, 'c2', null), 'c2', 'legacy ?conversation=');
  assert.equal(inbox.requestedConversation('c1', 'c2', null), 'c1');
  assert.equal(inbox.requestedConversation('c1', undefined, 'c1'), null, 'already open: not selected (or subscribed) again');
  assert.equal(inbox.requestedConversation(undefined, undefined, 'c1'), null);

  assert.deepEqual(inbox.conversationRouteQuery({ archived: '1', conversation: 'old' }, 'c9'), { archived: '1', c: 'c9' });
  assert.equal(inbox.conversationRouteQuery({ c: 'c9' }, 'c9'), null, 'the URL already names it: no navigation');
  assert.equal(inbox.conversationRouteQuery({ conversation: 'c9' }, 'c9'), null);
  assert.doesNotMatch(read('pages', 'chats.tsx'), /Record<string, any>/);
});

test('effects: auth once, the inbox per account, deep links on the query; Realtime channels are released', () => {
  // Wiring inside effects (not visible in a first paint).
  const source = read('pages', 'chats.tsx');
  assert.match(source, /initAuth\(\);[\s\S]*?\}\s*,\s*\[\]\);/, 'auth runs once');
  assert.match(source, /getInbox\(userId\)[\s\S]*?loadConversations\(userId[\s\S]*?\}\s*,\s*\[userId,\s*loadConversations\]\);/, 'cached inbox, then a sync');
  assert.match(source, /\}\s*,\s*\[userId,\s*routerQueryC,\s*routerQueryConversation,\s*selectConversation\]\);/, 'no router object in the dependencies');
  assert.match(source, /client\.removeChannel\(activeChannelRef\.current\)/);
  assert.match(source, /selectionGen !== selectionGenerationRef\.current/, 'a newer selection makes older results stale');
  assert.match(source, /channel\.track\(\{ user_id: currentUserId \}\)/, 'presence');
  assert.match(source, /addEventListener\('varoom_active_account_changed', handleAccountChange\)/, 'account switches reset the page');
});

test('avatars: the photo fills its 46px circle; data and blob URLs as they are; initials otherwise', () => {
  const css = read('public', 'js', 'chats.css');
  for (const rule of [/width:\s*46px;/, /height:\s*46px;/, /flex-shrink:\s*0;/, /border-radius:\s*50%;/, /overflow:\s*hidden;/]) {
    assert.match(css, new RegExp(`\\.avatar-wrap\\s*\\{[\\s\\S]*?${rule.source}`));
  }
  for (const rule of [/width:\s*100%;/, /height:\s*100%;/, /object-fit:\s*cover;/, /display:\s*block;/]) {
    assert.match(css, new RegExp(`\\.avatar-wrap\\s+img\\s*\\{[\\s\\S]*?${rule.source}`));
  }

  const resolved = [];
  const avatar = loadChats('components/chat/ConversationAvatar.tsx', {
    mocks: { '../resolveStoredPhotoUrl': { resolveAvatarUrl: (url) => { resolved.push(url); return url === 'avatars/u1.jpg' ? 'https://cdn/avatars/u1.jpg' : null; } } },
  });
  assert.equal(avatar.resolveChatAvatarUrl(null), null);
  assert.equal(avatar.resolveChatAvatarUrl('data:image/png;base64,xx'), 'data:image/png;base64,xx');
  assert.equal(avatar.resolveChatAvatarUrl('blob:abc'), 'blob:abc');
  assert.deepEqual(resolved, [], 'never resolved through storage');
  assert.equal(avatar.resolveChatAvatarUrl('avatars/u1.jpg', {}), 'https://cdn/avatars/u1.jpg');
  assert.equal(avatar.resolveChatAvatarUrl('https://x/y.png', {}), 'https://x/y.png', 'unresolvable: as given');
  assert.equal(avatar.avatarInitials('Billionaire Zion'), 'BZ');
  assert.equal(avatar.avatarInitials('zion'), 'ZI');
  assert.equal(avatar.avatarInitials(''), 'VA');

  const img = render(avatar.default, { url: 'blob:abc', name: 'Zion' });
  assert.match(img, /<img src="blob:abc" alt="Zion" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block"\/>/);
  const fallback = render(avatar.default, { url: null, name: 'Billionaire Zion', fontSize: 12 });
  assert.match(fallback, /<div class="avatar-fallback" style="[^"]*font-size:12px[^"]*">BZ<\/div>/);
  // A photo that fails to load falls back to the initials (no broken-image icon).
  assert.match(read('components', 'chat', 'ConversationAvatar.tsx'), /onError=\{\(\) => setHasError\(true\)\}/);
});

test('avatars appear in the inbox, the chat header and the information column', () => {
  const header = section(renderChatsPage({ initialConversationId: 'c1' }).html, '<div class="chat-header-avatar-wrap">', '</div></div>');
  assert.match(header, /<div class="avatar-fallback" style="[^"]*font-size:12px[^"]*">US<\/div>/, 'the header, before the conversation loads');
  const source = read('pages', 'chats.tsx');
  assert.match(source, /<div className="avatar-wrap">\s*<ConversationAvatar url=\{participant\?\.avatar_url\}/, 'inbox rows');
  assert.match(source, /<ConversationInfo[\s\S]*?avatar=\{\(\s*<ConversationAvatar\s+url=\{activeConversation\.participant\?\.avatar_url\}/, 'information column');
});

test('columns: phones show one screen at a time; the shell marks an open conversation', () => {
  const classes = (overrides) => thread.chatLayoutClasses({ mobileView: 'inbox', activeId: null, isElie: false, infoCollapsed: true, chatSettingsEmbedded: false, ...overrides });
  assert.deepEqual({ ...classes() }, { shell: 'app-shell view-inbox', contacts: 'contacts-col', chat: 'chat-col empty-conversation', info: 'info-col collapsed' });
  assert.deepEqual({ ...classes({ mobileView: 'conversation', activeId: 'c1', infoCollapsed: false }) }, {
    shell: 'app-shell view-chat has-conversation', contacts: 'contacts-col mobile-hidden', chat: 'chat-col mobile-visible', info: 'info-col ',
  });
  assert.deepEqual({ ...classes({ mobileView: 'info', activeId: 'elie', isElie: true, chatSettingsEmbedded: true }) }, {
    shell: 'app-shell view-info has-conversation', contacts: 'contacts-col mobile-hidden', chat: 'chat-col is-elie', info: 'info-col collapsed chat-settings-open mobile-visible',
  });
  // Back from a conversation returns to the inbox and drops ?c= from the URL.
  assert.match(read('pages', 'chats.tsx'), /setMobileView\('inbox'\);\s*routerRef\.current\?\.replace\(\{ pathname: '\/chats' \}, undefined, \{ shallow: true \}\);/);
  // The unread badge (the server sends no count) and the conversation menu stubs stay removed.
  assert.doesNotMatch(read('pages', 'chats.tsx'), /unread_count|className="conversation-menu"/);
});

test('compact phone chat header: identity in a row, 38px avatar', () => {
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-header-identity\s*\{[\s\S]*?flex-direction:\s*row;/);
  assert.match(css, /\.chat-header-identity\s*\{[\s\S]*?align-items:\s*center;/);
  assert.match(css, /\.chat-header-avatar-wrap\s*\{[\s\S]*?width:\s*38px;/);
  assert.match(css, /\.chat-header-avatar-wrap\s*\{[\s\S]*?height:\s*38px;/);
  assert.match(css, /\.chat-header-avatar-wrap\s*\{[\s\S]*?border-radius:\s*50%;/);
  assert.match(css, /\.chat-header-avatar-wrap\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.chat-header-avatar-wrap\s+img\s*\{[\s\S]*?object-fit:\s*cover;/);
});

test('Elie: its thread, the composer beam and the header in Elie mode', () => {
  const { html } = renderChatsPage({ initialConversationId: 'elie' });
  assert.match(html, /<main class="chat-col is-elie">/);
  assert.match(html, /<h2>Ask Elie to find you a space\.<\/h2>/, 'ElieThread, empty');
  assert.match(html, /<div class="chat-header-name" id="chatName">Elie<\/div>/);
  assert.match(html, /data-placeholder="Ask Elie about spaces, prices, amenities\.\.\."/);
  assert.match(html, /<textarea placeholder="Ask Elie\.\.\."><\/textarea>/);
  assert.doesNotMatch(html, /id="mobileAttachMenu"/, 'no attachments for Elie');
  const { ElieThread } = loadChats('components/chat/ElieThread.tsx');
  assert.doesNotMatch(render(ElieThread, { entries: [], thinking: true, onPrompt() {}, onRetry() {} }), /Ask Elie to find you a space/, 'the intro gives way while Elie thinks');
});

test('composer: the formatting buttons, the attachment menu and its icons', () => {
  const { html } = renderChatsPage({ initialConversationId: 'c1' });
  const composer = section(html, '<div class="chat-input-area', '<input type="file"');
  assert.match(composer, /<button type="button" class="fmt-b" aria-label="Bold">B<\/button><button type="button" class="fmt-i" aria-label="Italic">I<\/button><button type="button" class="fmt-u" aria-label="Underline">U<\/button><span class="divider"><\/span><button type="button" class="fmt-ul" aria-label="Bulleted list"><svg class="icon"><use href="#i-list-dot"><\/use><\/svg><\/button><button type="button" class="fmt-ol" aria-label="Numbered list"><svg class="icon"><use href="#i-list-sq"><\/use><\/svg><\/button>/);
  assert.match(composer, /<div class="mobile-attach-menu" id="mobileAttachMenu" role="menu" aria-label="Attach" hidden="">/, 'closed until the + is tapped');
  assert.equal((composer.match(/class="mobile-attach-item"/g) || []).length, 3);
  assert.match(composer, /class="send-message" type="button" title="Send message" aria-label="Send message" aria-disabled="true"/, 'nothing to send yet');
  for (const icon of ['i-list-dot', 'i-list-sq', 'i-image', 'i-file-text', 'i-store']) assert.match(html, new RegExp(`<symbol id="${icon}"`), icon);
  // The send button's click event is never sent as the message text.
  assert.match(read('pages', 'chats.tsx'), /onSend=\{\(\) => \{ void handleSendMessage\(\); \}\}/);
});

test('message rows: classes by side and state', () => {
  const row = (overrides) => thread.messageRowClass({ isSystem: false, isOut: false, isElieMessage: false, sameSender: false, isDeleted: false, highlighted: false, ...overrides });
  assert.equal(row(), 'msg-row in');
  assert.equal(row({ isOut: true, sameSender: true }), 'msg-row out same-sender');
  assert.equal(row({ isSystem: true, isOut: true }), 'msg-row system');
  assert.equal(row({ isElieMessage: true }), 'msg-row in elie-message');
  assert.equal(row({ isElieMessage: true, isOut: true }), 'msg-row out', 'only Elie\'s replies');
  assert.equal(row({ isDeleted: true, highlighted: true }), 'msg-row in msg-deleted reply-target-highlight');
  const source = read('pages', 'chats.tsx');
  assert.match(source, /className=\{rowClass\}/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'bodies are rebuilt, never injected');
  assert.match(source, /onContextMenu=\{actionable \? \(e\) => onMessageContextMenu\(e, m\) : undefined\}/, 'rows without actions have no menu');
  assert.match(source, /onTouchStart=\{actionable \? \(e\) => onMessageTouchStart\(e, m\) : undefined\}/);
});

test('the bottom navigation shows with the inbox only, rechecked on rotation and released on leaving', () => {
  assert.equal(thread.conversationShowing(true, 'inbox', 'c1'), false, 'phones: the inbox screen');
  assert.equal(thread.conversationShowing(true, 'conversation', 'c1'), true);
  assert.equal(thread.conversationShowing(true, 'info', 'c1'), true);
  assert.equal(thread.conversationShowing(false, 'inbox', 'c1'), true, '761–860px: side by side, a conversation is open');
  assert.equal(thread.conversationShowing(false, 'inbox', null), false);

  const listeners = [];
  const media = { matches: true, addEventListener: (type, fn) => listeners.push([type, fn]), removeEventListener: (type, fn) => listeners.splice(listeners.findIndex((l) => l[1] === fn), 1) };
  const classes = new Set();
  const body = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
  const stop = thread.followConversationScreen({ matchMedia: (query) => { assert.equal(query, '(max-width: 760px)'); return media; } }, body, 'conversation', 'c1');
  assert.ok(classes.has('chat-page-context'));
  media.matches = false;
  listeners[0][1]();
  assert.ok(classes.has('chat-page-context'), 'rotated wider: still open beside the inbox');
  stop();
  assert.equal(listeners.length, 0);
  const source = read('pages', 'chats.tsx');
  assert.match(source, /useEffect\(\(\) => followConversationScreen\(window, document\.body, mobileView, activeId\), \[mobileView, activeId\]\);/);
  assert.match(source, /useEffect\(\(\) => \(\) => document\.body\.classList\.remove\('chat-page-context'\), \[\]\);/);
});

test('inbox previews are plain text; the media preview sits in the chat column; the composer is opaque', () => {
  const preview = inbox.conversationPreview;
  assert.equal(preview(null), '');
  assert.equal(preview({ deleted_at: 't', body: 'x' }), 'This message was deleted');
  assert.equal(preview({ body: '<b>Hello</b><br>there <script>x</script>' }), 'Hello there x', 'tags removed (server rendering has no DOMParser)');
  assert.equal(preview({ body: '', message_type: 'photo' }), 'Photo');
  assert.equal(preview({ body: '', message_type: 'file', attachment: { kind: 'file', original_filename: 'lease.pdf' } }), 'lease.pdf');
  assert.equal(preview({ body: '', message_type: 'file' }), 'Attachment');
  assert.equal(preview({ body: '', attachment: { kind: 'voice', original_filename: '' } }), 'Attachment');
  assert.equal(preview({ body: '', message_type: 'text' }), '');

  assert.match(read('pages', 'chats.tsx'), /<MediaPreviewComposer[\s\S]*?<\/main>/, 'inside the chat column');
  const MediaPreviewComposer = loadChats('components/chat/MediaPreviewComposer.tsx').default;
  const html = render(MediaPreviewComposer, { images: ['blob:x'], maxImages: 4, sending: false, onCancel() {}, onSend() {}, onRemove() {}, onAdd() {} });
  assert.match(html, /class="chat-media-preview-composer"/);
  assert.doesNotMatch(html, /position:fixed/, 'never covers the sidebar or inbox');
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /html:not\(\[data-theme="dark"\]\)\s+\.chat-input-area\s*\{[\s\S]*?background/);
  assert.match(css, /\[data-theme="dark"\]\s+\.chat-input-area\s*\{[\s\S]*?background/);
});

test('the bottom navigation never covers a conversation: CSS hides it after the chat page as well as the body class', () => {
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /@media \(max-width:760px\)\{\s*\.app-shell\.view-chat ~ \.varoom-mobile-nav,\s*\.app-shell\.view-info ~ \.varoom-mobile-nav\{ display:none !important; \}\s*\}/);
  assert.match(css, /@media \(min-width:761px\) and \(max-width:860px\)\{\s*\.app-shell\.has-conversation ~ \.varoom-mobile-nav\{ display:none !important; \}\s*\}/);
  assert.match(renderChatsPage({ initialConversationId: 'c1' }).html, /<div class="app-shell view-inbox has-conversation"/);
  assert.match(read('pages', '_app.tsx'), /\{layout\}\s*<MobileNav enabled=/, 'the navigation follows the page, so the sibling rule reaches it');
});
