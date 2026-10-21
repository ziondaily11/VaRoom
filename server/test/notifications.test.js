'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotification } = require('../lib/notifications');

function notificationDb({ insertError = null, existing = null } = {}) {
  const writes = [];
  const row = {
    id: 'notification-1', recipient_user_id: 'host-1', actor_user_id: null,
    type: 'payment_success', title: 'Payment successful', message: 'Verified', read: false,
    related_entity_type: 'listing', related_entity_id: 'listing-1', metadata: {}, event_key: 'billing:payment-1:succeeded',
  };
  return {
    writes,
    from(table) {
      assert.equal(table, 'notifications');
      return {
        insert(payload) {
          writes.push(payload);
          return { select: () => ({ single: async () => ({ data: insertError ? null : row, error: insertError }) }) };
        },
        select() {
          const query = { eq: () => query, maybeSingle: async () => ({ data: existing, error: null }) };
          return query;
        },
      };
    },
  };
}

test('notification writes satisfy both canonical and legacy recipient columns', async () => {
  const db = notificationDb();
  const created = await createNotification({
    supabase: db, recipientUserId: 'host-1', type: 'payment_success', title: 'Payment successful',
    message: 'Verified', relatedEntityType: 'listing', relatedEntityId: 'listing-1',
    metadata: { payment_kind: 'listing' }, eventKey: 'billing:payment-1:succeeded',
  });
  assert.equal(created.id, 'notification-1');
  assert.equal(db.writes[0].recipient_user_id, 'host-1');
  assert.equal(db.writes[0].user_id, 'host-1');
  assert.equal(db.writes[0].read, false);
});

test('duplicate notification delivery returns the existing row without resetting its read state', async () => {
  const existing = { id: 'notification-1', event_key: 'billing:payment-1:succeeded', read: true };
  const db = notificationDb({ insertError: { code: '23505', message: 'duplicate event' }, existing });
  const result = await createNotification({
    supabase: db, recipientUserId: 'host-1', type: 'payment_success', title: 'Payment successful',
    message: 'Verified', eventKey: 'billing:payment-1:succeeded',
  });
  assert.equal(result, existing);
  assert.equal(result.read, true);
  assert.equal(db.writes.length, 1);
});
