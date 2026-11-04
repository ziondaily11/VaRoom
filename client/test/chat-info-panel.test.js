const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('pages', 'chats.tsx');
const info = read('components', 'chat', 'ConversationInfo.tsx');
const report = read('components', 'chat', 'ReportSheet.tsx');

test('information column: profile, details, latest six photos, files, actions (legacy)', () => {
  assert.match(info, /export const INFO_MEDIA_LIMIT = 6;/);
  assert.match(info, /\.slice\(-INFO_MEDIA_LIMIT\)/);
  assert.match(info, /m\.message_type !== 'voice'/);
  assert.match(info, /<span>Phone<\/span>/);
  assert.match(info, /<span>Member since<\/span>/);
  assert.match(info, /<span>Local time<\/span>/);
  assert.match(info, /\{photos\.length > 0 && \(/, 'media hidden when empty');
  assert.match(info, /\{files\.length > 0 && \(/, 'files hidden when empty');
  assert.match(info, /\{online !== null && \(/, 'status only once presence is known');
  assert.match(source, /online=\{presenceKnownId === activeId \? isCurrentOnline : null\}/);
  assert.match(source, /onOpenFile=\{\(attachmentId\) => \{ void openAttachment\(attachmentId\); \}\}/);
  assert.match(source, /Blocking \$\{person\?\.full_name \|\| person\?\.username \|\| 'this user'\} is not available yet\./);
});

test('report: a small dialog with the fixed reasons as choices; submit enabled once a reason is chosen', () => {
  assert.match(report, /\['Spam or scam', 'Harassment', 'Inappropriate content', 'Other'\]/);
  assert.match(report, /<input type="radio" name="chatReportReason" value=\{item\} checked=\{reason === item\} onChange=\{\(\) => setReason\(item\)\} \/>/);
  assert.match(report, /disabled=\{!reason \|\| submitting\}/);
  assert.match(report, /placeholder=\{`What happened with \$\{name\}\?`\}/);
  assert.match(source, /body: JSON\.stringify\(\{ conversationId, reason, details: details \|\| undefined \}\)/);
  assert.doesNotMatch(source, /User Report Modal/);
});

test('chat settings: rendered in the desktop information column with its own close; phones return to this conversation', () => {
  assert.match(source, /className="chat-settings-panel-head"/);
  assert.match(source, /\$\{chatSettingsEmbedded \? ' chat-settings-open' : ''\}/);
  assert.match(source, /<div className="cs-embedded">\s*<ChatSettings key=\{role\} role=\{role\} onOpenArchived=\{\(\) => \{ setChatSettingsEmbedded\(false\); setInboxView\('archived'\); \}\} \/>/);
  assert.doesNotMatch(source, /<iframe|chat-settings\?embedded=1/, 'no second copy of the app in a frame');
  assert.match(source, /\/chat-settings\?returnTo=\$\{encodeURIComponent\(router\.asPath \|\| '\/chats'\)\}/);
  assert.doesNotMatch(source, /returnTo=\/chats'/);
});

test('selecting a person opens the information column on desktop; Elie keeps it closed', () => {
  assert.match(source, /if \(window\.matchMedia\('\(min-width: 761px\)'\)\.matches\) setInfoCollapsed\(false\);/);
  assert.match(source, /if \(!isSameConversation\) elieResetRef\.current\(\);\s*setElieHistoryOpen\(false\);\s*setInfoCollapsed\(true\);/);
});

test('rail: links with unread badges for messages and bookings', () => {
  assert.match(source, /\{ label: 'Messages', href: '\/chats', icon: 'i-chat', count: 'chats' \}/);
  assert.match(source, /\{ label: 'Calendar', href: '\/bookings', icon: 'i-calendar', count: 'bookings' \}/);
  assert.match(source, /className="varoom-count-badge" data-count-kind=\{item\.count\}/);
  assert.match(source, /if \(item\.href === '\/chats' \|\| isModifiedClick\(e\)\)/);
  assert.match(read('public', 'js', 'chats.css'), /\.varoom-count-badge\{position:absolute/);
});

test('phones: the app navigation shows on the inbox and hides inside a conversation; identity opens information by keyboard too', () => {
  assert.match(source, /const inConversation = mobileView !== 'inbox' && window\.matchMedia\('\(max-width: 760px\)'\)\.matches;/);
  assert.match(source, /\(ChatsPage as unknown as \{ appNavigation: boolean \}\)\.appNavigation = true;/);
  assert.match(source, /aria-label="Open conversation information"/);
  assert.match(source, /\(e\.key === 'Enter' \|\| e\.key === ' '\) && window\.matchMedia/);
});

test('the profile photo sits in the legacy 76px circle; the report form is a labelled column', () => {
  assert.match(info, /<div className="avatar-fallback" style=\{\{ background: '#14161c', overflow: 'hidden' \}\}>\s*\{avatar \|\| initials\(name\)\}/);
  assert.match(report, /<form className="chat-report-form"/);
  assert.match(report, /<legend className="chat-report-label">Why are you reporting\?<\/legend>/);
  assert.match(report, /<label className="chat-report-label" htmlFor="chatReportDetails">Details \(optional\)<\/label>/);
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.chat-report-form\{ display:flex; flex-direction:column;/);
  assert.match(css, /\.chat-report\{ max-width:420px; \}/, 'small');
  assert.match(css, /\.chat-modal\{[^}]*position:absolute; inset:0;[^}]*align-items:center; justify-content:center;/, 'centred over the conversation');
  assert.match(css, /\.profile-block \.avatar-fallback\{ width:76px; height:76px;/);
  // Icons used by the information column exist in the page's icon set.
  for (const icon of ['i-phone', 'i-calendar', 'i-clock', 'i-download', 'i-file-text', 'i-flag', 'i-ban']) {
    assert.match(source, new RegExp(`<symbol id="${icon}"`), icon);
  }
});
