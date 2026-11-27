'use strict';

process.env.VA_ROOM_ENCRYPTION_KEY = process.env.VA_ROOM_ENCRYPTION_KEY || require('crypto').randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION || '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { saveElieDraft, readElieDraft, discardElieDraft } = require('../lib/elieDrafts');

function memoryAdmin() {
  const rows = [];
  return {
    rows,
    from() {
      const filters = [];
      let op = 'select';
      let value = null;
      const q = {
        select() { return q; },
        eq(column, v) { filters.push((row) => row[column] === v); return q; },
        upsert(row) { op = 'upsert'; value = row; return q; },
        delete() { op = 'delete'; return q; },
        maybeSingle: async () => ({ data: rows.find((row) => filters.every((f) => f(row))) || null, error: null }),
        then(resolve) {
          if (op === 'upsert') {
            const at = rows.findIndex((row) => row.conversation_id === value.conversation_id);
            if (at >= 0) rows[at] = value; else rows.push(value);
          }
          if (op === 'delete') {
            for (let i = rows.length - 1; i >= 0; i -= 1) if (filters.every((f) => f(rows[i]))) rows.splice(i, 1);
          }
          resolve({ error: null });
        },
      };
      return q;
    },
  };
}

test('one encrypted draft per conversation, readable and dismissable only by its host', async () => {
  const admin = memoryAdmin();
  const conversation = { id: 'c1', host_id: 'h1' };
  await saveElieDraft(admin, conversation, 'First answer');
  await saveElieDraft(admin, conversation, 'Latest answer');
  assert.equal(admin.rows.length, 1, 'the latest replaces it');
  assert.equal(admin.rows[0].reply, undefined);
  assert.doesNotMatch(JSON.stringify(admin.rows[0]), /Latest answer/, 'stored encrypted');
  assert.equal((await readElieDraft(admin, 'c1', 'h1')).reply, 'Latest answer');
  assert.equal(await readElieDraft(admin, 'c1', 'someone-else'), null);
  await discardElieDraft(admin, 'c1', 'someone-else');
  assert.equal(admin.rows.length, 1, 'only the host can dismiss it');
  await discardElieDraft(admin, 'c1', 'h1');
  assert.equal(await readElieDraft(admin, 'c1', 'h1'), null);
});

test('routes and migration: host-only draft endpoints; settings columns and a private drafts table', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assert.match(routes, /if \(!conversation \|\| conversation\.host_id !== user\.id\) return res\.status\(403\)/);
  assert.match(routes, /router\.get\('\/chat\/conversations\/:conversationId\/elie-draft'/);
  assert.match(routes, /router\.delete\('\/chat\/conversations\/:conversationId\/elie-draft'/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261127_000084_elie_host_settings.sql'), 'utf8');
  for (const column of ['elie_away_replies boolean not null default true', 'elie_away_drafts boolean not null default false', 'elie_new_enquiries boolean not null default false', 'elie_suggest_listings boolean not null default true']) {
    assert.ok(migration.includes(column), column);
  }
  assert.match(migration, /alter table public\.elie_away_drafts enable row level security;/);
  assert.match(migration, /-- Undo:/);
});
