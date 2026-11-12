'use strict';

// Quick replies (lib/chat/quickReplies, Chat Settings, the composer picker)
// and the animated menu they share with Chat Settings' email timing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, render } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const qr = loadTs(path.join(root, 'lib', 'chat', 'quickReplies.ts'));

const replies = [
  { id: 'r1', title: 'Check-in time', body: 'Check-in is from 2pm.' },
  { id: 'r2', title: 'Directions', body: 'We are off Ngong Road, next to the mall.' },
];

test('"/" at the start of a message searches quick replies by title or text', () => {
  assert.equal(qr.slashQuery('/'), '');
  assert.equal(qr.slashQuery('  /Check '), 'check');
  assert.equal(qr.slashQuery('Hello /check'), null, 'only at the start');
  assert.equal(qr.slashQuery('/check\nmore'), null, 'one line');
  assert.deepEqual(qr.matchQuickReplies(replies, 'check').map((r) => r.id), ['r1']);
  assert.deepEqual(qr.matchQuickReplies(replies, 'ngong').map((r) => r.id), ['r2'], 'by the text too');
  assert.equal(qr.matchQuickReplies(replies, '').length, 2);
});

test('a quick reply needs a title and text within their limits', () => {
  assert.equal(qr.quickReplyProblem(' ', 'x'), 'Give it a short title.');
  assert.equal(qr.quickReplyProblem('x', ' '), 'Write the reply.');
  assert.match(qr.quickReplyProblem('x'.repeat(61), 'x'), /under 60/);
  assert.match(qr.quickReplyProblem('x', 'x'.repeat(1001)), /under 1000/);
  assert.equal(qr.quickReplyProblem('Check-in', 'From 2pm'), null);
  assert.equal(qr.QUICK_REPLY_MAX, 20);
});

test('saved replies are read once per account, and saving or deleting updates every screen', async () => {
  qr.clearQuickRepliesCache();
  const calls = [];
  let rows = [...replies];
  const client = {
    from(table) {
      const q = {
        select(cols) { calls.push(['select', table, cols]); return q; },
        eq(col, val) { calls.push(['eq', col, val]); return q; },
        order() { return q; },
        insert(row) { calls.push(['insert', row]); rows = [...rows, { id: 'r3', ...row }]; return q; },
        update(row) { calls.push(['update', row]); return q; },
        delete() { calls.push(['delete']); return q; },
        single: async () => ({ data: rows[rows.length - 1], error: null }),
        then(resolve) { resolve({ data: rows, error: null }); },
      };
      return q;
    },
  };
  const [a, b] = await Promise.all([qr.loadQuickReplies(client, 'u1'), qr.loadQuickReplies(client, 'u1')]);
  assert.equal(a, b);
  assert.equal(calls.filter((c) => c[0] === 'select').length, 1, 'one read');
  const seen = [];
  qr.subscribeQuickReplies('u1', (list) => seen.push(list.length));
  await qr.saveQuickReply(client, 'u1', { title: ' Wi-Fi ', body: ' Password on the fridge ' });
  assert.deepEqual(calls.find((c) => c[0] === 'insert'), ['insert', { title: 'Wi-Fi', body: 'Password on the fridge', user_id: 'u1' }]);
  await qr.deleteQuickReply(client, 'u1', 'r1');
  assert.deepEqual(seen, [3, 2]);
  assert.match(read('lib', 'auth', 'clearUserData.ts'), /clearQuickRepliesCache\(\);/, 'cleared on sign-out');
});

test('menus open in 200 ms and close in 150 ms from their trigger, rows 30 ms apart, still for reduced motion', () => {
  const menu = loadChats('components/chat/AnimatedMenu.tsx');
  assert.equal(menu.MENU_OPEN_MS, 200);
  assert.equal(menu.MENU_CLOSE_MS, 150);
  assert.equal(menu.MENU_STAGGER_MS, 30);
  assert.match(menu.MENU_STYLES, /\.vr-menu--below-end \{[^}]*transform-origin:top right;/, 'grows from a trigger above it');
  assert.match(menu.MENU_STYLES, /\.vr-menu--above-start \{[^}]*transform-origin:bottom left;/, 'grows from a trigger below it');
  assert.match(menu.MENU_STYLES, /animation-delay:calc\(var\(--i, 0\) \* 30ms\)/);
  assert.match(menu.MENU_STYLES, /prefers-reduced-motion: reduce/);
  assert.equal(render(menu.default, { open: false, placement: 'below-end', children: 'x' }), '', 'closed: nothing');
  assert.match(render(menu.default, { open: true, placement: 'below-end', role: 'listbox', children: 'x' }), /class="vr-menu vr-menu--below-end /);
});

test('the composer picker lists matches as options, or invites to add replies', () => {
  const Picker = loadChats('components/chat/QuickReplyPicker.tsx').default;
  const props = { open: true, hasAny: true, activeIndex: 1, onPick() {}, onHover() {}, onManage() {} };
  const html = render(Picker, { ...props, items: replies });
  assert.match(html, /role="listbox" aria-label="Quick replies"/);
  assert.match(html, /aria-selected="false" class="qr-item vr-menu-item" style="--i:0"><strong>Check-in time<\/strong><small>Check-in is from 2pm\.<\/small>/);
  assert.match(html, /aria-selected="true" class="qr-item vr-menu-item" style="--i:1"/);
  assert.match(render(Picker, { ...props, items: [], hasAny: false }), /No quick replies yet\.[\s\S]*Add them in Chat Settings/);
  assert.match(render(Picker, { ...props, items: [], hasAny: true }), /No quick replies match\./);
});

test('wiring: "/" or the ⚡ button opens the picker; ↑ ↓ Enter Escape work; Chat Settings has the section and the animated timing menu', () => {
  const page = read('pages', 'chats.tsx');
  assert.match(page, /const quickOpen = Boolean\(activeId && !isElie && \(quickPickerOpen \|\| \(slash !== null && !slashDismissed\)\)\);/);
  assert.equal((page.match(/if \(quickReplyKey\(e\)\) return;/g) || []).length, 2, 'desktop editor and phone textarea');
  assert.match(page, /className="fmt-qr" aria-label="Quick replies"/);
  const settings = read('components', 'chat', 'ChatSettings.tsx');
  assert.match(settings, /<Section title="QUICK REPLIES">\s*<QuickRepliesEditor userId=\{userId\} \/>/);
  assert.match(settings, /<AnimatedMenu open=\{open\} placement="below-end" className="cs-choice-menu" role="listbox"/);
  assert.doesNotMatch(settings, /<select/, 'the timing menu is animated, not the browser\'s');
  const migration = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261112_000058_quick_replies.sql'), 'utf8');
  assert.match(migration, /alter table public\.quick_replies enable row level security;/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)\s*with check \(user_id = auth\.uid\(\)\);/, 'private to their owner');
  assert.match(migration, />= 20 then/);
});
