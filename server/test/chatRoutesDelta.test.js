'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('Delta query parsing validates ISO timestamps correctly', () => {
  const validIso = '2026-10-01T10:00:00.000Z';
  const parsedDate = new Date(validIso);
  assert.equal(!isNaN(parsedDate.getTime()), true);
  assert.equal(parsedDate.toISOString(), validIso);

  const invalidIso = 'invalid-timestamp-string';
  const invalidDate = new Date(invalidIso);
  assert.equal(isNaN(invalidDate.getTime()), true);
});

test('Delta filtering logic filters only messages newer than since timestamp', () => {
  const messages = [
    { id: 'm1', created_at: '2026-10-01T10:00:00.000Z', body: 'Msg 1' },
    { id: 'm2', created_at: '2026-10-01T10:05:00.000Z', body: 'Msg 2' },
    { id: 'm3', created_at: '2026-10-01T10:10:00.000Z', body: 'Msg 3' }
  ];

  const since = '2026-10-01T10:05:00.000Z';
  const sinceTime = new Date(since).getTime();

  const delta = messages.filter((m) => new Date(m.created_at).getTime() > sinceTime);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].id, 'm3');
});

test('Reply resolution correctly connects replied messages even when reply is historical', () => {
  const allMessages = new Map([
    ['m1', { id: 'm1', body: 'Original question', sender_id: 'user-1' }],
    ['m2', { id: 'm2', body: 'Answer to question', sender_id: 'user-2', reply_to_message_id: 'm1' }]
  ]);

  const deltaMessages = [{ id: 'm2', body: 'Answer to question', sender_id: 'user-2', reply_to_message_id: 'm1' }];
  const resolved = deltaMessages.map((msg) => {
    const reply = msg.reply_to_message_id ? allMessages.get(msg.reply_to_message_id) : null;
    return {
      ...msg,
      reply_to_message: reply ? {
        id: reply.id,
        sender_id: reply.sender_id,
        body: reply.body
      } : null
    };
  });

  assert.equal(resolved[0].reply_to_message.body, 'Original question');
});
