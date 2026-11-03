const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chatsPagePath = path.join(root, 'pages', 'chats.tsx');
const slugPath = path.join(root, 'pages', '[...slug].js');
const clientLayoutPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const hostLayoutPath = path.join(root, 'components', 'shell', 'shellStyles.ts');
const { getAccountLayout } = require('../lib/accountRoleLayout');

test('Phase 1 & 2: Chats is a native React page in client/pages/chats.tsx', () => {
  assert.ok(fs.existsSync(chatsPagePath), 'chats.tsx must exist');
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Default export
  assert.match(source, /export default function ChatsPage/);
  // Self-contained layout assignment bypassing ClientLayout/HostLayout
  assert.match(source, /ChatsPage\.getLayout\s*=/);
  // Next.js Head usage
  assert.match(source, /import Head from 'next\/head'/);
  assert.match(source, /import \{ useRouter \} from 'next\/router'/);
  // Cache integration
  assert.match(source, /import chatCache/);
  // Component integrations
  assert.match(source, /import ChatComposerActions from '\.\.\/components\/ChatComposerActions'/);
  assert.match(source, /import ElieComposerBeam from '\.\.\/components\/ElieComposerBeam'/);
  assert.match(source, /import ElieIcon from '\.\.\/components\/ElieIcon'/);
});

test('CH5: chats.html, elie.html and chat-data.js are retired; old URLs redirect to native Chats', () => {
  const slugSource = fs.readFileSync(slugPath, 'utf8');
  for (const file of ['legacy-pages/chats.html', 'legacy-pages/elie.html', 'public/js/chat-data.js', 'public/js/chat-cache.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, `${file} is deleted`);
  }
  assert.doesNotMatch(slugSource, /chats\.html|elie\.html|chat-data\.js|chat-cache\.js|Messenger Dashboard|ChatComposerActions|ElieComposerBeam/);
  // The catch-all never serves these URLs.
  assert.match(slugSource, /\['notifications', 'property-news', 'chats', 'chat', 'elie'\]\.includes\(slugKey\)/);
  const config = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');
  assert.match(config, /source: '\/elie',\s*destination: '\/chats\?c=elie'/);
  assert.match(config, /source: '\/chat',\s*destination: '\/chats'/);
  assert.match(config, /source: '\/chats\.html',\s*destination: '\/chats'/);
  assert.match(config, /source: '\/elie\.html',\s*destination: '\/chats\?c=elie'/);
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(vercel.redirects.some((r) => r.source === '/:page.html' && r.destination === '/:page'), '/chats.html and /elie.html reach the routes above');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'pages', 'profile.tsx'), 'utf8'), /chats\.html/);
});

test('Phase 2: Chats route resolves to none layout, preserving full-screen dashboard app shell', () => {
  assert.equal(getAccountLayout('/chats', '/chats', null), 'none');
  assert.equal(getAccountLayout('/chats', '/chats', 'client'), 'none');
  assert.equal(getAccountLayout('/chats', '/chats', 'host'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/chats', 'client'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/chats', 'host'), 'none');
});

test('Phase 2: both shells navigate to /chats client-side through the shared link handler', () => {
  const { HOST_INTERNAL_ROUTES, CLIENT_INTERNAL_ROUTES, isInternalHref } = require('./helpers/loadTs').loadTs(
    path.join(__dirname, '..', 'lib', 'navigation', 'appLinks.ts'),
  );
  assert.equal(isInternalHref('/chats', HOST_INTERNAL_ROUTES), true);
  assert.equal(isInternalHref('/chats?id=1', CLIENT_INTERNAL_ROUTES), true);
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'pages', '_app.tsx'), 'utf8');
  assert.match(appSource, /installAppLinks\(\{ doc: document, push: \(href\) => Router\.push\(href\)/);
});

test('Phase 3: Lifecycle and Realtime safety patterns in chats.tsx', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Page-owned channel ref and cleanup on unmount or selection switch
  assert.match(source, /activeChannelRef\.current/);
  assert.match(source, /client\.removeChannel\(activeChannelRef\.current\)/);

  // Selection generation counter guarding against rapid conversation switching
  assert.match(source, /selectionGenerationRef\.current/);

  // Instant cache read from chatCache
  assert.match(source, /getInbox/);
  assert.match(source, /getMessages/);

  // Presence and online status tracking
  assert.match(source, /channel\.presenceState\(\)/);
  assert.match(source, /channel\.track\(\{ user_id:/);

  // Multi-account switcher isolation
  assert.match(source, /varoom_active_account_changed/);
});

test('Stage 1: Lifecycle and routing separation protects against freeze and duplicate subscriptions', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Auth initialization effect runs independently with empty dependency array
  assert.match(source, /initAuth\(\);[\s\S]*?\}\s*,\s*\[\]\);/);

  // Inbox loading runs separately on userId change
  assert.match(source, /getInbox\(userId\)[\s\S]*?loadConversations\(userId[\s\S]*?\}\s*,\s*\[userId,\s*loadConversations\]\);/);

  // Deep-link selection runs on primitive query changes without router in dependencies
  assert.match(source, /requested !== activeIdRef\.current[\s\S]*?selectConversation\(requested,\s*false\)[\s\S]*?\}\s*,\s*\[userId,\s*routerQueryC,\s*routerQueryConversation,\s*selectConversation\]\);/);

  // selectConversation guards against duplicate subscription if already active
  assert.match(source, /const previousConversationId = activeIdRef\.current;\s*const isSameConversation = previousConversationId === id;/);

  // URL updating only triggers when query actually differs
  assert.match(source, /currentQuery\.c !== id && currentQuery\.conversation !== id/);
});

test('Stage 2: Avatar wrapper is strictly constrained to 46x46px with overflow hidden', () => {
  const cssPath = path.join(root, 'public', 'js', 'chats.css');
  assert.ok(fs.existsSync(cssPath), 'chats.css must exist');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  // .avatar-wrap explicit dimensions and containment
  assert.match(cssSource, /\.avatar-wrap\s*\{[\s\S]*?width:\s*46px;/);
  assert.match(cssSource, /\.avatar-wrap\s*\{[\s\S]*?height:\s*46px;/);
  assert.match(cssSource, /\.avatar-wrap\s*\{[\s\S]*?flex-shrink:\s*0;/);
  assert.match(cssSource, /\.avatar-wrap\s*\{[\s\S]*?border-radius:\s*50%;/);
  assert.match(cssSource, /\.avatar-wrap\s*\{[\s\S]*?overflow:\s*hidden;/);

  // .avatar-wrap img containment
  assert.match(cssSource, /\.avatar-wrap\s+img\s*\{[\s\S]*?width:\s*100%;/);
  assert.match(cssSource, /\.avatar-wrap\s+img\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(cssSource, /\.avatar-wrap\s+img\s*\{[\s\S]*?object-fit:\s*cover;/);
  assert.match(cssSource, /\.avatar-wrap\s+img\s*\{[\s\S]*?display:\s*block;/);

  // chats.tsx conversation item img properties in ConversationAvatar
  const pageSource = fs.readFileSync(chatsPagePath, 'utf8');
  assert.match(pageSource, /<ConversationAvatar\s+url=\{participant\?\.avatar_url\}/);
  assert.match(pageSource, /objectFit:\s*'cover'/);
  assert.match(pageSource, /display:\s*'block'/);
});

test('Stage 3: Avatar URL resolution and error fallback in chats.tsx', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Integrates existing resolveStoredPhotoUrl module
  assert.match(source, /resolveAvatarUrl/);
  assert.match(source, /components\/resolveStoredPhotoUrl/);

  // Handles data, blob, and storage keys through existing resolution mechanism
  assert.match(source, /resolveChatAvatarUrl/);
  assert.match(source, /\/\^\(data:\|blob:\)\/i/);

  // ConversationAvatar provides reliable onError fallback preventing broken-image icons
  assert.match(source, /function ConversationAvatar/);
  assert.match(source, /onError=\{[\s\S]*?setHasError\(true\)/);

  // Applied consistently to all three avatar locations
  // 1. Conversation list
  assert.match(source, /<div className="avatar-wrap">[\s\S]*?<ConversationAvatar\s+url=\{participant\?\.avatar_url\}/);
  // 2. Chat header
  assert.match(source, /<div className="chat-header-avatar-wrap">[\s\S]*?<ConversationAvatar\s+url=\{activeConversation\?\.participant\?\.avatar_url\}/);
  // 3. Conversation info panel
  // The information column's avatar is passed to ConversationInfo (components/chat).
  assert.match(source, /<ConversationInfo[\s\S]*?avatar=\{\(\s*<ConversationAvatar\s+url=\{activeConversation\.participant\?\.avatar_url\}/);
});

test('Stage 4: CSS parity class names and mobile view toggling in chats.tsx', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Correct class names
  assert.match(source, /className="contact-body"/);
  assert.match(source, /className="contact-time"/);
  assert.match(source, /className="contact-preview"/);
  assert.doesNotMatch(source, /className="contact-info"/);
  assert.doesNotMatch(source, /className="msg-time"/);
  assert.doesNotMatch(source, /className="last-msg"/);

  // The unread badge (the server sends no count) and the conversation menu
  // stubs ("Mark as read" was local only, "Delete" deleted nothing) are removed.
  assert.doesNotMatch(source, /unread_count/);
  assert.doesNotMatch(source, /className="conversation-menu"/);

  // Mobile class toggling
  assert.match(source, /contacts-col.*mobile-hidden/);
  assert.match(source, /chat-col.*mobile-visible/);

  // Mobile back button updates URL
  assert.match(source, /setMobileView\('inbox'\)/);
  assert.match(source, /routerRef\.current\?\.replace\(\{ pathname: '\/chats' \}/);
});


test('Stage 4 extension: Compact mobile chat header layout and avatar sizing', () => {
  const cssPath = path.join(root, 'public', 'js', 'chats.css');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  // Mobile chat-header-identity is horizontal flex with alignment
  assert.match(cssSource, /\.chat-header-identity\s*\{[\s\S]*?flex-direction:\s*row;/);
  assert.match(cssSource, /\.chat-header-identity\s*\{[\s\S]*?align-items:\s*center;/);

  // Mobile chat-header-avatar-wrap is explicitly constrained to 38px
  assert.match(cssSource, /\.chat-header-avatar-wrap\s*\{[\s\S]*?width:\s*38px;/);
  assert.match(cssSource, /\.chat-header-avatar-wrap\s*\{[\s\S]*?height:\s*38px;/);
  assert.match(cssSource, /\.chat-header-avatar-wrap\s*\{[\s\S]*?border-radius:\s*50%;/);
  assert.match(cssSource, /\.chat-header-avatar-wrap\s*\{[\s\S]*?overflow:\s*hidden;/);

  // Mobile chat-header-avatar-wrap img is contained
  assert.match(cssSource, /\.chat-header-avatar-wrap\s+img\s*\{[\s\S]*?object-fit:\s*cover;/);
});
test('Phase 4: Attachments and Elie workflows preserved in chats.tsx', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Attachment upload init, R2 PUT, and complete
  assert.match(source, /\/api\/chat\/conversations\/.*?\/attachments\/upload-init/);
  assert.match(source, /\/api\/chat\/conversations\/.*?\/attachments\/.*?\/complete/);

  // Elie assistant mode & composer beam
  // Elie's request and thread live in lib/chat/elie.ts and components/chat (test/chat-elie.test.js).
  assert.match(source, /<ElieThread entries=\{elie\.entries\}/);
  assert.match(source, /<ElieComposerBeam isElie=\{isElie\}/);
  assert.match(fs.readFileSync(path.join(root, 'components', 'chat', 'ElieThread.tsx'), 'utf8'), /ThinkingOrb/);
});

test('Stage 5A: Composer send wiring, attachment actions, and formatting controls', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');
  const actionsSource = fs.readFileSync(path.join(root, 'components', 'ChatComposerActions.jsx'), 'utf8');

  // Send button wired via onSend prop
  // The click event must not be passed as the message text.
  assert.match(source, /onSend=\{\(\) => \{ void handleSendMessage\(\); \}\}/);
  assert.match(source, /canSend=\{!!/);

  // Attachment callbacks passed
  assert.match(source, /onPhotoClick=/);
  assert.match(source, /onFileClick=/);
  assert.match(source, /onMobileAttach=/);

  // Mobile attach menu rendered in JSX
  assert.match(source, /className="mobile-attach-menu"/);
  assert.match(source, /className="mobile-attach-item"/);

  // SVG symbols present
  assert.match(source, /id="i-list-dot"/);
  assert.match(source, /id="i-list-sq"/);

  // Format buttons restored
  assert.match(source, /className="fmt-ul"/);
  assert.match(source, /className="fmt-ol"/);
  assert.match(source, /className="divider"/);

  // mobileAttachMenuOpen state present
  assert.match(source, /mobileAttachMenuOpen/);

  // ChatComposerActions has onSend and canSend props wired
  assert.match(actionsSource, /onSend/);
  assert.match(actionsSource, /canSend/);

  // No hardcoded aria-disabled="true" remains
  assert.doesNotMatch(actionsSource, /aria-disabled="true"/);

  // Attachment callbacks consumed in ChatComposerActions
  assert.match(actionsSource, /onPhotoClick/);
  assert.match(actionsSource, /onFileClick/);
  assert.match(actionsSource, /onMobileAttach/);
});

test('Stage 5B: Message rendering, context actions, and mobile nav suppression', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');
  const cssSource = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');

  // Uses correct CSS class msg-row (not message-row)
  assert.match(source, /className=\{rowClass\}/);
  assert.match(source, /'msg-row'/);

  // Uses correct bubble class (not message-bubble)
  assert.match(source, /className="bubble"/);

  // renderMessageBody handles HTML safely
  assert.match(source, /renderMessageBody/);
  // Rebuilt from allowlisted elements; never injected as HTML (test/chat-message-body.test.js).
  assert.match(source, /parseMessageBody\(body\)/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /allowlist|hasMarkup/);

  // Message menu: right-click, long-press and the ⋯ button open one menu
  // (test/chat-message-actions.test.js covers the items and behaviour).
  assert.match(source, /onContextMenu=\{actionable \? \(e\) => onMessageContextMenu\(e, m\) : undefined\}/);
  assert.match(source, /onTouchStart=\{actionable \? \(e\) => onMessageTouchStart\(e, m\) : undefined\}/);
  assert.match(source, /<MessageActionMenu/);

  // Phones: the app's bottom navigation hides inside a conversation only (legacy).
  assert.match(source, /document\.body\.classList\.toggle\('chat-page-context', inConversation\);/);
  assert.match(source, /classList\.remove\('chat-page-context'\)/);
});

test('Stage 5B.1: Clean inbox previews, opaque composer background, and in-conversation media preview layout', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');
  const cssSource = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');

  // formatConversationPreview helper cleanly strips HTML tags and avoids literal HTML
  assert.match(source, /formatConversationPreview/);
  assert.match(source, /formatConversationPreview\(c\.lastMessage\)/);

  // In-conversation media preview is inside chat-col (before </main>)
  assert.match(source, /className="chat-media-preview-composer"[\s\S]*?<\/main>/);

  // Does not use full-screen fixed positioning covering sidebar/inbox
  assert.doesNotMatch(source, /className="chat-media-preview-composer"[^>]*?position:\s*'fixed'/);

  // Composer has opaque background rules in both light and dark modes
  assert.match(cssSource, /html:not\(\[data-theme="dark"\]\)\s+\.chat-input-area\s*\{[\s\S]*?background/);
  assert.match(cssSource, /\[data-theme="dark"\]\s+\.chat-input-area\s*\{[\s\S]*?background/);
});

