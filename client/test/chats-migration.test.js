const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chatsPagePath = path.join(root, 'pages', 'chats.tsx');
const slugPath = path.join(root, 'pages', '[...slug].js');
const clientLayoutPath = path.join(root, 'components', 'ClientLayout.jsx');
const hostLayoutPath = path.join(root, 'components', 'HostLayout.jsx');
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

test('Phase 2: Catch-all route [...slug].js excludes chats.html', () => {
  const slugSource = fs.readFileSync(slugPath, 'utf8');

  // chats.html excluded from static template discovery
  assert.match(slugSource, /'chats\.html'/);
  assert.match(slugSource, /!\[.*?chats\.html.*?\]\.includes\(file\)/);

  // chats and chat routes return notFound: true in getStaticProps
  assert.match(slugSource, /'chats',\s*'chats\.html',\s*'chat'/);
  assert.doesNotMatch(slugSource, /chat:\s*'chats\.html'/);
});

test('Phase 2: Chats route resolves to none layout, preserving full-screen dashboard app shell', () => {
  assert.equal(getAccountLayout('/chats', '/chats', null), 'none');
  assert.equal(getAccountLayout('/chats', '/chats', 'client'), 'none');
  assert.equal(getAccountLayout('/chats', '/chats', 'host'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/chats', 'client'), 'none');
  assert.equal(getAccountLayout('/[...slug]', '/chats', 'host'), 'none');
});

test('Phase 2: ClientLayout and HostLayout include /chats in internalRoutes for client-side navigation', () => {
  const clientLayoutSource = fs.readFileSync(clientLayoutPath, 'utf8');
  const hostLayoutSource = fs.readFileSync(hostLayoutPath, 'utf8');

  assert.match(clientLayoutSource, /'\/chats'/);
  assert.match(clientLayoutSource, /router\.push\(href\)/);

  assert.match(hostLayoutSource, /'\/chats'/);
  assert.match(hostLayoutSource, /router\.push\(href\)/);
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
  assert.match(source, /requested !== activeIdRef\.current[\s\S]*?selectConversation\(requested,\s*false\)[\s\S]*?\}\s*,\s*\[userId,\s*routerQueryC,\s*routerQueryConversation,\s*routerPathname,\s*selectConversation\]\);/);

  // selectConversation guards against duplicate subscription if already active
  assert.match(source, /const isSameConversation = activeIdRef\.current === id;/);

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
  assert.match(source, /<div className="profile-block"[\s\S]*?<ConversationAvatar\s+url=\{activeConversation\?\.participant\?\.avatar_url\}/);
});

test('Phase 4: Attachments and Elie workflows preserved in chats.tsx', () => {
  const source = fs.readFileSync(chatsPagePath, 'utf8');

  // Attachment upload init, R2 PUT, and complete
  assert.match(source, /\/api\/chat\/conversations\/.*?\/attachments\/upload-init/);
  assert.match(source, /\/api\/chat\/conversations\/.*?\/attachments\/.*?\/complete/);

  // Elie assistant mode & composer beam
  assert.match(source, /ELIE_API_URL/);
  assert.match(source, /<ElieComposerBeam isElie=\{isElie\}/);
  assert.match(source, /ThinkingOrb/);
});
