const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const cs = loadTs(path.join(root, 'lib', 'chat', 'chatSettings.ts'));
const bh = loadTs(path.join(root, 'lib', 'chat', 'businessHours.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function memory(initial) {
  const map = new Map(initial ? [[cs.STORAGE_KEY, JSON.stringify(initial)]] : []);
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('settings: this browser keeps a copy; the profile decides', () => {
  const stored = memory({ awayMode: true, readReceipts: false, awayMessage: '  Back at 5  ' });
  const settings = cs.resolveSettings(cs.readStored(stored), null);
  assert.deepEqual({ ...settings }, { awayMode: true, messageNotifications: true, messagePreviews: true, readReceipts: false, typingIndicators: true, awayMessage: 'Back at 5', chatTheme: 'charcoal', emailAlertMinutes: null, awaySchedule: bh.DEFAULT_BUSINESS_HOURS });
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
  const loaded = { awayMode: true, awayMessage: cs.DEFAULT_AWAY_MESSAGE, messageNotifications: true, messagePreviews: false, readReceipts: true, typingIndicators: true, chatTheme: 'charcoal', emailAlertMinutes: null, awaySchedule: bh.DEFAULT_BUSINESS_HOURS };
  const [first, second] = await Promise.all([cs.loadProfileSettings(client, 'h1'), cs.loadProfileSettings(client, 'h1')]);
  assert.deepEqual({ ...first }, loaded, 'unset switches are on; no away message shows the default');
  assert.equal(first, second, 'requests at the same time share one read');
  assert.deepEqual(calls.filter((c) => c[0] === 'select'), [['select', 'profiles', 'away_mode,away_message,message_notifications,message_previews,read_receipts,typing_indicators,chat_theme,email_alert_minutes,away_schedule']], 'one read per account');

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
  const { loadChats, render, fakeRouter } = require('./helpers/chatsPage');
  const ChatSettings = loadChats('components/chat/ChatSettings.tsx', { user: { id: 'h1' } }).default;
  const sections = (html) => [...html.matchAll(/<h2 class="cs-section__title"[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
  const host = render(ChatSettings, { role: 'host', onOpenArchived() {} });
  assert.deepEqual(sections(host), ['AWAY MODE', 'THEME', 'NOTIFICATIONS', 'QUICK REPLIES', 'PRIVACY &amp; MESSAGING', 'CONVERSATIONS']);
  for (const text of ['Away Mode', 'Away message', 'Message notifications', 'Message previews', 'Read receipts', 'Typing indicators', 'Archived conversations']) {
    assert.match(host, new RegExp(`<span class="cs-row__label"[^>]*>${text}</span>`), text);
  }
  assert.match(host, new RegExp(cs.DEFAULT_AWAY_MESSAGE.replace(/[.?]/g, '\\$&')), 'the default away message until one is set');
  // Defaults on the first paint (this browser's and the account's values follow once mounted).
  assert.equal((host.match(/role="switch" aria-checked="true"/g) || []).length, 4, 'notifications, previews, receipts, typing');
  assert.equal((host.match(/role="switch" aria-checked="false"/g) || []).length, 2, 'away mode and business hours off');
  const client = render(ChatSettings, { role: 'client', onOpenArchived() {} });
  assert.deepEqual(sections(client), ['THEME', 'NOTIFICATIONS', 'QUICK REPLIES', 'PRIVACY &amp; MESSAGING', 'CONVERSATIONS'], 'no away mode for clients');

  const page = loadChats('pages/chat-settings.tsx', { router: fakeRouter({ pathname: '/chat-settings', query: { role: 'client' } }) }).default;
  const html = render(page, {});
  assert.match(html, /<title>Chat Settings · VaRoom<\/title>/);
  assert.match(html, /<button type="button" class="cs-header__back" aria-label="Back">/);
  assert.match(html, /<h1 class="cs-header__title">Chat Settings<\/h1>/);
  assert.doesNotMatch(html, /AWAY MODE/, 'the ?role hint before the account is known');
  assert.match(render(loadChats('pages/chat-settings.tsx', { router: fakeRouter({ query: {} }) }).default, {}), /AWAY MODE/, 'hosts by default, as before');
  assert.equal(page.appNavigation, true);
  assert.match(read('pages', 'chat-settings.tsx'), /router\.push\(backDestination\(router\.query\.returnTo, origin\)\)/);

  assert.equal(fs.existsSync(path.join(root, 'legacy-pages', 'chat-settings.html')), false);
  assert.match(read('next.config.js'), /source: '\/chat-settings\.html',\s*destination: '\/chat-settings'/);
  const server = fs.readFileSync(path.join(root, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /app\.get\(\['\/chat-settings', '\/chat-settings\.html', '\/legacy-pages\/chat-settings\.html'\]/);
});

test('email about unread messages: hosts after 15 minutes and clients never unless they choose; saved to the account', () => {
  assert.equal(cs.effectiveEmailAlertMinutes(null, 'host'), 15);
  assert.equal(cs.effectiveEmailAlertMinutes(null, 'client'), 0);
  assert.equal(cs.effectiveEmailAlertMinutes(60, 'client'), 60);
  assert.equal(cs.profileSettingsFromRow({ email_alert_minutes: 60 }).emailAlertMinutes, 60);
  assert.equal(cs.profileSettingsFromRow({ email_alert_minutes: 7 }).emailAlertMinutes, null, 'unknown values fall back to the default');
  assert.deepEqual(cs.EMAIL_ALERT_CHOICES.map((c) => c.minutes), [15, 60, 0]);
  const component = read('components', 'chat', 'ChatSettings.tsx');
  assert.match(component, /label="Email me about unread messages"/);
  assert.match(component, /value=\{effectiveEmailAlertMinutes\(settings\.emailAlertMinutes, role\)\}/);
  assert.match(component, /saveProfileSetting\(getSupabaseClient\(\), userId, 'emailAlertMinutes', emailAlertMinutes, storage\(\)\)/);
});
