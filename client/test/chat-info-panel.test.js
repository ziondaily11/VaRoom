'use strict';

// The information column (components/chat/ConversationInfo), the Report
// dialog, embedded Chat Settings and the icon rail.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, renderChatsPage, render, section } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('pages', 'chats.tsx');
const thread = loadTs(path.join(root, 'lib', 'chat', 'thread.ts'));
const { default: ConversationInfo, infoAttachments, INFO_MEDIA_LIMIT } = loadChats('components/chat/ConversationInfo.tsx');

const info = (props) => render(ConversationInfo, {
  conversation: { id: 'c1', participant: { full_name: 'Billionaire Zion', username: 'zion' } },
  avatar: null, online: null, messages: [], api: async () => ({}),
  onOpenImage() {}, onOpenFile() {}, archived: false, onArchive() {}, onReport() {}, onBlock() {},
  ...props,
});

test('information column: profile, details, latest six photos, files, actions (legacy)', () => {
  assert.equal(INFO_MEDIA_LIMIT, 6);
  const photo = (id, extra = {}) => ({ id, message_type: 'photo', attachment_id: `a${id}`, attachment: { id: `a${id}`, kind: 'photo' }, ...extra });
  const messages = [
    ...Array.from({ length: 8 }, (_, i) => photo(`p${i}`)),
    photo('gone', { deleted_at: 't' }),
    { id: 'optimistic-1', message_type: 'photo', attachment: { id: 'x', kind: 'photo' } },
    { id: 'v1', message_type: 'voice', attachment_id: 'av' },
    { id: 'f1', message_type: 'file', attachment: { id: 'af1', kind: 'file', original_filename: 'lease.pdf', file_size_bytes: 2048 } },
    { id: 'f2', message_type: 'file', attachment: { id: 'af2', kind: 'file', original_filename: 'id.pdf' } },
  ];
  const { photos, files } = infoAttachments(messages);
  assert.deepEqual(photos.map((m) => m.id), ['p7', 'p6', 'p5', 'p4', 'p3', 'p2'], 'the latest six, newest first; no deleted or uploading ones');
  assert.deepEqual(files.map((m) => m.id), ['f2', 'f1'], 'voice notes are not listed');

  const empty = info({ conversation: { id: 'c1', created_at: '2025-03-01T00:00:00Z', participant: { full_name: 'Billionaire Zion', username: 'zion', phone: '+254 700 000000' } } });
  assert.match(empty, /<div class="p-name">Billionaire Zion<\/div><div class="p-line">@zion<\/div>/);
  assert.match(empty, /<span>Phone<\/span><span class="detail-value">\+254 700 000000<\/span>/);
  assert.match(empty, /<span>Member since<\/span>/);
  assert.match(empty, /<span>Local time<\/span>/);
  assert.doesNotMatch(empty, /info-media-section|info-files-section/, 'media and files hidden when empty');
  assert.doesNotMatch(empty, /profile-status/, 'status only once presence is known');
  assert.doesNotMatch(info(), /<span>Phone<\/span>|<span>Member since<\/span>/);
  const full = info({ messages, online: true });
  assert.match(full, /<div class="profile-status online"><span class="dot"><\/span><span>Online<\/span><\/div>/);
  assert.match(info({ online: false }), /<div class="profile-status"><span class="dot"><\/span><span>Offline<\/span><\/div>/);
  assert.equal((full.match(/class="thumb"/g) || []).length, 6);
  assert.match(full, /<div class="f-name">lease\.pdf<\/div><div class="f-sub">2 KB<\/div>/);
  assert.match(full, /Archive chat[\s\S]*Report User[\s\S]*Block User/);
  assert.match(info({ archived: true }), /Unarchive chat/);

  // The page passes presence once synced, opens files, and explains blocking.
  assert.match(source, /online=\{presenceKnownId === activeId \? isCurrentOnline : null\}/);
  assert.match(source, /onOpenFile=\{\(attachmentId\) => \{ void openAttachment\(attachmentId\); \}\}/);
  assert.match(source, /Blocking \$\{person\?\.full_name \|\| person\?\.username \|\| 'this user'\} is not available yet\./);
});

test('report: posted with the reason and optional details', async () => {
  const calls = [];
  const api = async (url, init) => { calls.push([url, init.method, JSON.parse(init.body)]); return {}; };
  await thread.postChatReport(api, 'c1', 'Harassment', 'Threats');
  await thread.postChatReport(api, 'c1', 'Other', '');
  assert.deepEqual(calls, [
    ['/api/chat/reports', 'POST', { conversationId: 'c1', reason: 'Harassment', details: 'Threats' }],
    ['/api/chat/reports', 'POST', { conversationId: 'c1', reason: 'Other' }],
  ]);
  const Report = loadChats('components/chat/ReportSheet.tsx').default;
  assert.match(render(Report, { open: true, personName: 'Zion', onClose() {}, onSubmit: async () => {} }), /<input type="radio" name="chatReportReason" value="Harassment"\/>/);
});

test('chat settings: rendered in the desktop information column with its own close; phones return to this conversation', () => {
  assert.match(thread.chatLayoutClasses({ mobileView: 'inbox', activeId: 'c1', isElie: false, infoCollapsed: false, chatSettingsEmbedded: true }).info, /chat-settings-open/);
  assert.equal(thread.chatSettingsHref('/chats?c=a b'), '/chat-settings?returnTo=%2Fchats%3Fc%3Da%20b');
  assert.equal(thread.chatSettingsHref(undefined), '/chat-settings?returnTo=%2Fchats');
  assert.match(source, /className="chat-settings-panel-head"/);
  assert.match(source, /<div className="cs-embedded">\s*<ChatSettings key=\{role\} role=\{role\} onOpenArchived=\{\(\) => \{ setChatSettingsEmbedded\(false\); setInboxView\('archived'\); \}\} \/>/);
  assert.doesNotMatch(source, /<iframe|chat-settings\?embedded=1/, 'no second copy of the app in a frame');
});

test('selecting a person opens the information column on desktop; Elie keeps it closed', () => {
  assert.match(source, /if \(window\.matchMedia\('\(min-width: 761px\)'\)\.matches\) setInfoCollapsed\(false\);/);
  assert.match(source, /if \(!isSameConversation\) elieResetRef\.current\(\);\s*setElieHistoryOpen\(false\);\s*setInfoCollapsed\(true\);/);
});

test('rail: Home, Messages, Calendar (Analytics for hosts) with unread badges for messages and bookings', () => {
  assert.deepEqual(thread.railItems('client').map((i) => [i.label, i.href, i.count || null]), [
    ['Home', '/client-home', null], ['Messages', '/chats', 'chats'], ['Calendar', '/bookings', 'bookings'],
  ]);
  assert.deepEqual(thread.railItems('host').map((i) => i.href), ['/host-home', '/chats', '/bookings', '/analytics']);
  assert.equal(thread.railClick('/chats', false), 'stay');
  assert.equal(thread.railClick('/chats', true), 'stay');
  assert.equal(thread.railClick('/bookings', true), 'native', 'new tab');
  assert.equal(thread.railClick('/bookings', false), 'navigate', 'client-side');

  const rail = section(renderChatsPage({}, { counts: { chats: 3, bookings: 0 } }).html, '<div class="rail-top">', '</div>');
  assert.match(rail, /<a class="rail-btn active" href="\/chats" title="Messages" aria-label="Messages" aria-current="page"><svg class="icon"><use href="#i-chat"><\/use><\/svg><span class="varoom-count-badge" data-count-kind="chats" aria-label="3 unread conversations">3<\/span><\/a>/);
  assert.match(rail, /<a class="rail-btn" href="\/bookings" title="Calendar" aria-label="Calendar"><svg class="icon"><use href="#i-calendar"><\/use><\/svg><\/a>/, 'no badge at zero');
  assert.match(read('public', 'js', 'chats.css'), /\.varoom-count-badge\{position:absolute/);
});

test('phones: the app navigation shows on the inbox and hides inside a conversation; identity opens information by keyboard too', () => {
  assert.equal(thread.conversationShowing(true, 'conversation', 'c1'), true);
  assert.equal(loadChats('pages/chats.tsx').default.appNavigation, true);
  assert.match(renderChatsPage({ initialConversationId: 'c1' }).html, /<div class="chat-header-identity" role="button" tabindex="0" aria-label="Open conversation information">/);
  assert.match(source, /\(e\.key === 'Enter' \|\| e\.key === ' '\) && window\.matchMedia/);
});

test('the profile photo sits in the legacy 76px circle; the report form is a labelled column', () => {
  const avatar = info({ avatar: React.createElement('img', { src: 'blob:a', alt: '' }) });
  assert.match(avatar, /<div class="avatar-fallback" style="background:#14161c;overflow:hidden"><img src="blob:a" alt=""\/><\/div>/);
  assert.match(info(), /<div class="avatar-fallback" style="background:#14161c;overflow:hidden">BZ<\/div>/, 'initials without a photo');
  const Report = loadChats('components/chat/ReportSheet.tsx').default;
  const form = render(Report, { open: true, personName: 'Zion', onClose() {}, onSubmit: async () => {} });
  assert.match(form, /<form class="chat-report-form">/);
  assert.match(form, /<legend class="chat-report-label">Why are you reporting\?<\/legend>/);
  assert.match(form, /<label class="chat-report-label" for="chatReportDetails">Details \(optional\)<\/label>/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-report-form\{ display:flex; flex-direction:column;/);
  assert.match(css, /\.chat-report\{ max-width:420px; \}/, 'small');
  assert.match(css, /\.chat-modal\{[^}]*position:absolute; inset:0;[^}]*align-items:center; justify-content:center;/, 'centred over the conversation');
  assert.match(css, /\.profile-block \.avatar-fallback\{ width:76px; height:76px;/);
  // Icons used by the information column exist in the page's icon set.
  const page = renderChatsPage().html;
  for (const icon of ['i-phone', 'i-calendar', 'i-clock', 'i-download', 'i-file-text', 'i-flag', 'i-ban', 'i-archive']) {
    assert.match(page, new RegExp(`<symbol id="${icon}"`), icon);
  }
});
