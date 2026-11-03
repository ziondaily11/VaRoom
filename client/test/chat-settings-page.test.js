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

test('settings: this browser keeps the toggles and message; the profile decides away mode', () => {
  const stored = memory({ awayMode: true, readReceipts: false, awayMessage: '  Back at 5  ' });
  const settings = cs.resolveSettings(cs.readStored(stored), null);
  assert.deepEqual({ ...settings }, { awayMode: true, messageNotifications: true, messagePreviews: true, readReceipts: false, typingIndicators: true, awayMessage: 'Back at 5' });
  assert.equal(cs.resolveSettings(cs.readStored(stored), false).awayMode, false, 'the profile wins');
  assert.equal(cs.resolveSettings({}, null).awayMessage, cs.DEFAULT_AWAY_MESSAGE);
  assert.equal(cs.cleanAwayMessage('   '), cs.DEFAULT_AWAY_MESSAGE);
  cs.writeStored(stored, 'typingIndicators', false);
  assert.equal(JSON.parse(stored.map.get(cs.STORAGE_KEY)).typingIndicators, false);
  assert.equal(JSON.parse(stored.map.get(cs.STORAGE_KEY)).readReceipts, false, 'other values are kept');
  const broken = { getItem: () => '{oops', setItem: () => { throw new Error('full'); } };
  assert.deepEqual({ ...cs.readStored(broken) }, {});
  cs.writeStored(broken, 'readReceipts', true);
});

test('away mode: read once per account, saved to the profile and this browser, never the missing away_message column', async () => {
  cs.clearChatSettingsCache();
  const calls = [];
  const client = {
    from(table) {
      const chain = {
        select(cols) { calls.push(['select', table, cols]); return chain; },
        update(row) { calls.push(['update', table, row]); return chain; },
        eq(col, val) { calls.push(['eq', col, val]); return chain; },
        maybeSingle: async () => ({ data: { away_mode: true }, error: null }),
        then(resolve) { resolve({ error: null }); },
      };
      return chain;
    },
  };
  assert.equal(await cs.loadAwayMode(client, 'h1'), true);
  assert.equal(await cs.loadAwayMode(client, 'h1'), true);
  assert.equal(calls.filter((c) => c[0] === 'select').length, 1, 'one read per account');
  const storage = memory();
  await cs.saveAwayMode(client, 'h1', false, storage);
  assert.deepEqual(calls.find((c) => c[0] === 'update'), ['update', 'profiles', { away_mode: false }]);
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'h1'));
  assert.equal(JSON.parse(storage.map.get(cs.STORAGE_KEY)).awayMode, false);
  assert.equal(await cs.loadAwayMode(client, 'h1'), false, 'the saved value is reused');
  assert.ok(!JSON.stringify(calls).includes('away_message'));
  assert.doesNotMatch(read('lib', 'chat', 'chatSettings.ts') + read('components', 'chat', 'ChatSettings.tsx'), /select\([^)]*away_message|away_message:/, 'no query or write uses that column');
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearChatSettingsCache\(\);/);
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
