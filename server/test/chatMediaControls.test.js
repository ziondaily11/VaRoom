'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { removeChatAttachment } = require('../lib/chatAttachmentCleanup');

function fakeAdmin(row) {
  const calls = [];
  const chain = {
    from(table) { calls.push(['from', table]); return chain; },
    select(cols) { calls.push(['select', cols]); return chain; },
    update(update) { calls.push(['update', update]); return chain; },
    eq(col, value) { calls.push(['eq', col, value]); return chain; },
    maybeSingle: async () => ({ data: row, error: null }),
    then(resolve) { resolve({ error: null }); },
  };
  return { admin: chain, calls };
}

test('deleting a photo, file or voice note for everyone marks its attachment deleted, then removes the file', async () => {
  const removed = [];
  const storage = { deleteR2Object: async (key) => { removed.push(key); } };
  const { admin, calls } = fakeAdmin({ id: 'a1', storage_key: 'chat/c1/a1.jpg' });
  await removeChatAttachment(admin, storage, 'a1');
  assert.deepEqual(calls.find((c) => c[0] === 'update'), ['update', { status: 'deleted' }]);
  assert.deepEqual(removed, ['chat/c1/a1.jpg']);

  const none = fakeAdmin(null);
  await removeChatAttachment(none.admin, storage, 'missing');
  assert.equal(none.calls.some((c) => c[0] === 'update'), false);
  const idle = fakeAdmin(null);
  await removeChatAttachment(idle.admin, storage, null);
  assert.equal(idle.calls.length, 0, 'text and listing messages have no attachment');
});

test('actions and reply targets accept every kind of message; replies themselves stay text', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assert.doesNotMatch(routes, /message_type !== 'text'/);
  assert.match(routes, /if \(!message \|\| message\.deleted_at\) \{/);
  assert.match(routes, /if \(!repliedMessage \|\| repliedMessage\.deleted_at\) \{/);
  assert.match(routes, /throw new ValidationError\('Replies must be text messages'\)/);
  assert.match(routes, /await removeChatAttachment\(supabaseAdmin, mediaStorageService, message\.attachment_id\)/);
  assert.match(routes, /attachment: reply\.deleted_at \? null : quotedAttachment\(attachmentsById\[reply\.attachment_id\]\)/);
});
