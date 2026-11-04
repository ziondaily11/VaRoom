'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { clearedAtByConversation, visibleAfterClear, clearChat } = require('../lib/chatClears');

function fakeAdmin(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const filters = [];
      let op = 'select';
      let payload = null;
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        in(column, list) { filters.push((row) => list.includes(row[column])); return query; },
        or(expression) { calls.push(['or', table, expression]); return query; },
        upsert(rows) { op = 'upsert'; payload = rows; return query; },
        delete() { op = 'delete'; return query; },
        then(resolve) {
          const rows = tables[table] || (tables[table] = []);
          if (op === 'upsert') {
            payload.forEach((row) => {
              const index = rows.findIndex((r) => r.user_id === row.user_id && r.conversation_id === row.conversation_id);
              if (index >= 0) rows[index] = row; else rows.push(row);
            });
            calls.push(['upsert', table, payload.length]);
            return resolve({ error: null });
          }
          if (op === 'delete') {
            tables[table] = rows.filter((row) => !filters.every((f) => f(row)));
            calls.push(['delete', table]);
            return resolve({ error: null });
          }
          return resolve({ data: rows.filter((row) => filters.every((f) => f(row))), error: null });
        },
      };
      return query;
    },
  };
}

test('messages up to the clear are hidden; later ones show', () => {
  const clears = new Map([['c1', Date.parse('2026-11-04T10:00:00Z')]]);
  assert.equal(visibleAfterClear(clears, { conversation_id: 'c1', created_at: '2026-11-04T09:59:59Z' }), false);
  assert.equal(visibleAfterClear(clears, { conversation_id: 'c1', created_at: '2026-11-04T10:00:01Z' }), true);
  assert.equal(visibleAfterClear(clears, { conversation_id: 'c2', created_at: '2020-01-01T00:00:00Z' }), true, 'never cleared');
});

test('Delete chat clears every conversation with that person for this person only, and unarchives them', async () => {
  const tables = {
    conversations: [{ id: 'c1' }, { id: 'c2' }],
    conversation_clears: [{ user_id: 'u2', conversation_id: 'c1', cleared_at: '2026-01-01T00:00:00Z' }],
    conversation_archives: [{ user_id: 'u1', conversation_id: 'c1' }, { user_id: 'u2', conversation_id: 'c1' }],
  };
  const admin = fakeAdmin(tables);
  const ids = await clearChat(admin, 'u1', { id: 'c1', host_id: 'u1', client_id: 'u2' });
  assert.deepEqual(ids, ['c1', 'c2']);
  assert.ok(admin.calls.some((c) => c[0] === 'or' && c[2] === 'and(host_id.eq.u1,client_id.eq.u2),and(host_id.eq.u2,client_id.eq.u1)'), 'both directions');
  const mine = tables.conversation_clears.filter((row) => row.user_id === 'u1');
  assert.deepEqual(mine.map((row) => row.conversation_id), ['c1', 'c2']);
  assert.ok(tables.conversation_clears.some((row) => row.user_id === 'u2'), "the other person's records are untouched");
  assert.deepEqual(tables.conversation_archives, [{ user_id: 'u2', conversation_id: 'c1' }], 'unarchived for this person only');
  const clears = await clearedAtByConversation(fakeAdmin(tables), 'u1');
  assert.equal(clears.size, 2);
});

test('routes hide cleared messages in the inbox, the thread, reply quotes and the unread count; the delete endpoint exists', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/chat\/conversations\/:conversationId\/delete'/);
  assert.match(routes, /const conversationIds = await clearChat\(supabaseAdmin, user\.id, conversation\);/);
  assert.match(routes, /const listed = conversations\.filter\(\(conversation\) => !clears\.has\(conversation\.id\) \|\| previewByConversation\[conversation\.id\]\);/);
  assert.match(routes, /!hiddenMessageIds\.has\(message\.id\) && visibleAfterClear\(clears, message\)\)/);
  assert.match(routes, /if \(!hiddenMessageIds\.has\(replyMsg\.id\) && visibleAfterClear\(clears, replyMsg\)\) \{/);
  assert.match(routes, /\.filter\(\(message\) => visibleAfterClear\(clears, message\)\)\.forEach\(\(message\) => unreadConversationIds\.add/);
  const previews = fs.readFileSync(path.join(__dirname, '..', 'lib', 'chatPreviews.js'), 'utf8');
  assert.match(previews, /visibleAfterClear\(clears, message\)/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261104_000054_chat_clears.sql'), 'utf8');
  assert.match(migration, /create table if not exists public\.conversation_clears/);
  assert.match(migration, /alter table public\.conversation_clears enable row level security;/);
});
