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
