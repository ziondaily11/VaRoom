const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const ss = loadTs(path.join(root, 'lib', 'settings', 'settingsSearch.ts'));
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const host = { isHost: true, showPlans: true };
const client = { isHost: false, showPlans: false };
const labels = (query, access) => ss.searchSettings(query, access).map((entry) => entry.label);

test('settings search: finds settings inside sections, not just section names', () => {
  assert.deepEqual(labels('', host), [], 'nothing typed, no results');
  assert.equal(labels('password', host)[0], 'Change password');
  assert.ok(labels('dark', host).includes('Appearance'), 'keywords: dark mode is under Appearance');
  assert.ok(labels('whatsapp', host).includes('Reach Out'));
  assert.ok(labels('away', host).includes('Away Mode'));
  assert.equal(labels('NOTIF', host)[0], 'Notifications', 'case-insensitive; the section ranks first');
  assert.deepEqual(labels('read receipts', host), ['Read receipts'], 'every word must match');
  assert.deepEqual(labels('zzzz', host), []);
});

test('settings search: only what this account can open', () => {
  assert.deepEqual(labels('instant', client), [], 'Bookings is for hosts');
  assert.deepEqual(labels('invoices', client), [], 'Plans & Billing is for hosts and Finance');
  assert.ok(labels('invoices', { isHost: false, showPlans: true }).includes('Invoices'), 'Finance members see Plans');
  assert.ok(!labels('whatsapp', client).includes('Reach Out'));
  assert.ok(!labels('away', client).includes('Away Mode'), 'Away Mode is for hosts');
  assert.ok(labels('typing', client).includes('Typing indicators'), 'every account has Chats');
});

test('settings search: every target exists in the section that renders it', () => {
  const sources = {
    account: read('components', 'settings', 'AccountSection.tsx') + read('components', 'settings', 'ReachOutSection.tsx'),
    plans: read('components', 'settings', 'PlansSection.tsx'),
    bookings: read('components', 'settings', 'BookingsSection.tsx'),
    team: read('components', 'settings', 'TeamSection.tsx'),
    chats: read('components', 'chat', 'ChatSettings.tsx'),
    other: read('components', 'settings', 'SettingsSections.tsx'),
  };
  for (const entry of ss.SEARCH_ENTRIES) {
    if (!entry.target) {
      assert.ok(entry.label === ss.SECTION_TITLES[entry.section] || entry.href, `${entry.label}: a section, a link or a target`);
      continue;
    }
    const source = sources[entry.section] || sources.other;
    const id = entry.target;
    const found = source.includes(`"${id}"`)
      || (id.startsWith('notify-') && source.includes('id={`notify-${row.key}`}'))
      || (id.endsWith('-row') && source.includes('id={`${field.replace(\'_\', \'-\')}-row`}'));
    assert.ok(found, `${entry.section} → #${id}`);
  }
});

test('settings page: Chats opens the shared Chat Settings; ?section=chats deep-links', () => {
  const page = read('pages', 'settings.tsx');
  const sections = read('components', 'settings', 'SettingsSections.tsx');
  assert.match(page, /wanted === 'chats'/);
  assert.match(page, /view === 'chats'\) section = <ChatsSection/);
  assert.match(sections, /<ChatSettings key=\{role\} role=\{role\} onOpenArchived=\{\(\) => \{ void router\.push\('\/chats\?archived=1'\); \}\} \/>/);
  assert.match(sections, /\{ key: 'chats', title: 'Chats' \}/);
});
