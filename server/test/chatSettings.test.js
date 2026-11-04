'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.VA_ROOM_ENCRYPTION_KEY = process.env.VA_ROOM_ENCRYPTION_KEY || require('crypto').randomBytes(32).toString('base64');
process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION = process.env.VA_ROOM_ENCRYPTION_ACTIVE_VERSION || '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { encryptMessage } = require('../lib/messageEncryptionService');
const { plainPreview, messagePreview, previewsFor } = require('../lib/chatPreviews');
const { notifyNewMessage } = require('../lib/chatNotifications');

// A read-only in-memory table store for the preview and notification helpers.
function fakeAdmin(tables) {
  return {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        in(column, list) { filters.push((row) => list.includes(row[column])); return query; },
        maybeSingle: async () => ({ data: (tables[table] || []).find((row) => filters.every((f) => f(row))) || null, error: null }),
        then(resolve) { resolve({ data: (tables[table] || []).filter((row) => filters.every((f) => f(row))), error: null }); },
      };
      return query;
    },
  };
}

const ME = 'u-me';
const message = (id, conversationId, text, extra = {}) => ({ id, conversation_id: conversationId, sender_id: 'u-other', message_type: 'text', deleted_at: null, attachment_id: null, ...encryptMessage(text), ...extra });

test('previews are one line of plain text, cut at 100 characters', () => {
  assert.equal(plainPreview('<b>Hi</b>&nbsp;there<br>see you'), 'Hi there see you');
  assert.equal(plainPreview('x'.repeat(150)).length, 100);
  assert.ok(plainPreview('x'.repeat(150)).endsWith('…'));
  assert.equal(messagePreview(message('m', 'c', 'IMG_1.jpg', { message_type: 'photo' }), { original_filename: 'IMG_1.jpg' }), 'Photo');
  assert.equal(messagePreview(message('m', 'c', 'The view', { message_type: 'photo' }), { original_filename: 'IMG_1.jpg' }), 'The view');
  assert.equal(messagePreview(message('m', 'c', 'Shared listing: Flat', { message_type: 'listing' })), 'Shared a listing');
  assert.equal(messagePreview(message('m', 'c', 'lease.pdf', { message_type: 'file' })), 'File');
});

test('previews are decrypted only for messages in the person\'s conversations, not deleted, and only with previews on', async () => {
  const tables = {
    profiles: [{ id: ME, message_previews: true }],
    conversations: [{ id: 'c-mine', host_id: ME, client_id: 'u-other' }, { id: 'c-theirs', host_id: 'u-x', client_id: 'u-other' }],
    messages: [
      message('m1', 'c-mine', 'Is it free on Friday?'),
      message('m2', 'c-theirs', 'Not yours'),
      message('m3', 'c-mine', 'Deleted', { deleted_at: '2026-11-04T00:00:00Z' }),
      message('m4', 'c-mine', 'Hidden for me'),
    ],
    message_user_deletions: [{ message_id: 'm4', user_id: ME }],
    message_attachments: [],
  };
  assert.deepEqual(await previewsFor(fakeAdmin(tables), ME, ['m1', 'm2', 'm3', 'm4']), { enabled: true, previews: { m1: 'Is it free on Friday?' } });
  tables.profiles[0].message_previews = false;
  assert.deepEqual(await previewsFor(fakeAdmin(tables), ME, ['m1']), { enabled: false, previews: {} });
});

test('"New message" notifications are skipped for people who turned them off', async () => {
  const created = [];
  const create = async (notification) => { created.push(notification); };
  const admin = fakeAdmin({ profiles: [{ id: 'on', message_notifications: true }, { id: 'off', message_notifications: false }, { id: 'unset' }] });
  assert.equal(await notifyNewMessage({ recipientUserId: 'on', admin, create, message: 'A sent you a message.' }), true);
  assert.equal(await notifyNewMessage({ recipientUserId: 'unset', admin, create, message: 'A sent you a message.' }), true, 'unset means on');
  assert.equal(await notifyNewMessage({ recipientUserId: 'off', admin, create, message: 'A sent you a message.' }), false);
  assert.deepEqual(created.map((n) => [n.recipientUserId, n.type, n.title]), [['on', 'new_message', 'New message'], ['unset', 'new_message', 'New message']]);
});

test('chat routes: archive endpoint, archived flag, unread count without archived chats, notification setting on send', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/chat\/conversations\/:conversationId\/archive'/);
  assert.match(routes, /if \(typeof req\.body\.archived !== 'boolean'\) throw new ValidationError/);
  assert.match(routes, /archived: archivedIds\.has\(conversation\.id\),/);
  assert.match(routes, /\.filter\(\(id\) => !archivedIds\.has\(id\)\)/);
  assert.match(routes, /await notifyNewMessage\(\{\s*recipientUserId,/);
  assert.match(routes, /router\.get\('\/chat\/message-previews'/);
  assert.match(routes, /if \(raw\.length > 50\) throw new ValidationError/);
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261104_000053_chat_settings.sql'), 'utf8');
  for (const column of ['away_message text', 'message_notifications boolean not null default true', 'message_previews boolean not null default true', 'typing_indicators boolean not null default true']) {
    assert.ok(migration.includes(column), column);
  }
  assert.match(migration, /create table if not exists public\.conversation_archives/);
  assert.match(migration, /alter table public\.conversation_archives enable row level security;/);
});
