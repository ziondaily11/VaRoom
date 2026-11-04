const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const cs = loadTs(path.join(root, 'lib', 'chat', 'chatSettings.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function memory(initial) {
  const map = new Map(initial ? [[cs.STORAGE_KEY, JSON.stringify(initial)]] : []);
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('settings: this browser keeps a copy; the profile decides', () => {
  const stored = memory({ awayMode: true, readReceipts: false, awayMessage: '  Back at 5  ' });
  const settings = cs.resolveSettings(cs.readStored(stored), null);
  assert.deepEqual({ ...settings }, { awayMode: true, messageNotifications: true, messagePreviews: true, readReceipts: false, typingIndicators: true, awayMessage: 'Back at 5', chatTheme: 'charcoal' });
  const fromProfile = cs.resolveSettings(cs.readStored(stored), { awayMode: false, readReceipts: true });
  assert.equal(fromProfile.awayMode, false, 'the profile wins');
  assert.equal(fromProfile.readReceipts, true, 'the profile wins');
  assert.equal(cs.resolveSettings({}, null).awayMessage, cs.DEFAULT_AWAY_MESSAGE);
  assert.equal(cs.cleanAwayMessage('   '), cs.DEFAULT_AWAY_MESSAGE);
  cs.writeStored(stored, 'typingIndicators', false);
  assert.equal(JSON.parse(stored.map.get(cs.STORAGE_KEY)).typingIndicators, false);
  assert.equal(JSON.parse(stored.map.get(cs.STORAGE_KEY)).readReceipts, false, 'other values are kept');
  const broken = { getItem: () => '{oops', setItem: () => { throw new Error('full'); } };
  assert.deepEqual({ ...cs.readStored(broken) }, {});
  cs.writeStored(broken, 'readReceipts', true);
});

test('profile settings: every Chat Setting is read once per account in one query and saved to the profile and this browser', async () => {
  cs.clearChatSettingsCache();
  const calls = [];
  let row = { away_mode: true, read_receipts: null, away_message: null, message_notifications: null, message_previews: false, typing_indicators: null };
  const client = {
    from(table) {
      const chain = {
        select(cols) { calls.push(['select', table, cols]); return chain; },
        update(update) { calls.push(['update', table, update]); return chain; },
        eq(col, val) { calls.push(['eq', col, val]); return chain; },
        maybeSingle: async () => ({ data: row, error: null }),
        then(resolve) { resolve({ error: null }); },
      };
      return chain;
    },
  };
  const loaded = { awayMode: true, awayMessage: cs.DEFAULT_AWAY_MESSAGE, messageNotifications: true, messagePreviews: false, readReceipts: true, typingIndicators: true, chatTheme: 'charcoal' };
  const [first, second] = await Promise.all([cs.loadProfileSettings(client, 'h1'), cs.loadProfileSettings(client, 'h1')]);
  assert.deepEqual({ ...first }, loaded, 'unset switches are on; no away message shows the default');
  assert.equal(first, second, 'requests at the same time share one read');
  assert.deepEqual(calls.filter((c) => c[0] === 'select'), [['select', 'profiles', 'away_mode,away_message,message_notifications,message_previews,read_receipts,typing_indicators,chat_theme']], 'one read per account');

  const seen = [];
  const unsubscribe = cs.subscribeProfileSettings('h1', (settings) => seen.push(settings.typingIndicators));
  const storage = memory();
  await cs.saveProfileSetting(client, 'h1', 'typingIndicators', false, storage);
  await cs.saveProfileSetting(client, 'h1', 'messageNotifications', false, storage);
  await cs.saveProfileSetting(client, 'h1', 'awayMessage', 'Back at 5', storage);
  unsubscribe();
  await cs.saveProfileSetting(client, 'h1', 'typingIndicators', true, storage);
  assert.deepEqual(seen, [false, false, false], 'pages following the settings hear each save until they unsubscribe');
  assert.deepEqual(calls.filter((c) => c[0] === 'update').map((c) => c[2]), [{ typing_indicators: false }, { message_notifications: false }, { away_message: 'Back at 5' }, { typing_indicators: true }]);
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'h1'));
  assert.equal(JSON.parse(storage.map.get(cs.STORAGE_KEY)).awayMessage, 'Back at 5');
  assert.equal(cs.cachedProfileSettings('h1').messageNotifications, false, 'the saved values are reused');
  assert.equal(cs.resolveSettings({ typingIndicators: false }, cs.cachedProfileSettings('h1')).typingIndicators, true, 'the profile wins over this browser');

  cs.clearChatSettingsCache();
  row = null;
  assert.equal(await cs.loadProfileSettings(client, 'c1'), null, "no profile: this browser's copy is shown");
  assert.equal(cs.cleanAwayMessage('x'.repeat(600)).length, cs.AWAY_MESSAGE_MAX, 'the profile keeps at most 500 characters');
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearChatSettingsCache\(\);/);
  const component = read('components', 'chat', 'ChatSettings.tsx');
  assert.match(component, /void saveProfileSetting\(getSupabaseClient\(\), userId, key, value, storage\(\)\);/, 'every switch is saved to the account');
  assert.match(component, /void saveProfileSetting\(getSupabaseClient\(\), userId, 'awayMessage', clean, storage\(\)\);/);
  assert.match(read('pages', 'chat-settings.tsx'), /onOpenArchived=\{\(\) => router\.push\('\/chats\?archived=1'\)\}/);
});

test('back from the phone page stays on this site and never loops to the settings page', () => {
  const origin = 'https://varoom.example';
  assert.equal(cs.backDestination('/chats?c=abc', origin), '/chats?c=abc');
  assert.equal(cs.backDestination('https://evil.example/x', origin), '/chats');
  assert.equal(cs.backDestination('/chat-settings?returnTo=x', origin), '/chats');
  assert.equal(cs.backDestination(undefined, origin), '/chats');
});

test('component: legacy sections and wording; away mode only for hosts; legacy page retired', () => {
  const component = read('components', 'chat', 'ChatSettings.tsx');
  for (const text of ['AWAY MODE', 'NOTIFICATIONS', 'PRIVACY & MESSAGING', 'CONVERSATIONS', 'Away message', 'Message notifications', 'Message previews', 'Read receipts', 'Typing indicators', 'Archived conversations', 'Edit away message']) {
    assert.ok(component.includes(text), text);
  }
  assert.match(component, /\{role === 'host' && \(/);
  const page = read('pages', 'chat-settings.tsx');
  assert.match(page, /Chat Settings · VaRoom/);
  assert.match(page, /router\.push\(backDestination\(router\.query\.returnTo, origin\)\)/);
  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'chat-settings.html')), false);
  assert.match(read('next.config.js'), /source: '\/chat-settings\.html',\s*destination: '\/chat-settings'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/chat-settings', '\/chat-settings\.html', '\/legacy-pages\/chat-settings\.html'\]/);
});
