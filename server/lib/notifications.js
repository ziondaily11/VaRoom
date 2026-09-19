const supabaseAdmin = require('./supabaseClient');

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

function buildEventKey({ type, relatedEntityType, relatedEntityId, recipientUserId, actorUserId }) {
  if (!type) return null;
  const parts = [type];
  if (relatedEntityType) parts.push(String(relatedEntityType));
  if (relatedEntityId) parts.push(String(relatedEntityId));
  if (recipientUserId) parts.push(String(recipientUserId));
  if (actorUserId) parts.push(String(actorUserId));
  return parts.join(':');
}

async function createNotification({
  recipientUserId,
  actorUserId = null,
  type,
  title,
  message,
  relatedEntityType = null,
  relatedEntityId = null,
  metadata = {},
  bookingId = null,
  eventKey = null,
}) {
  if (!recipientUserId) throw new Error('Notification recipient is required');
  if (!type || !title || !message) throw new Error('Notification type, title and message are required');

  const payload = {
    recipient_user_id: recipientUserId,
    actor_user_id: actorUserId,
    type,
    title,
    message,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    booking_id: bookingId || null,
    metadata: normalizeMetadata(metadata),
    read: false,
    event_key: eventKey || buildEventKey({
      type,
      relatedEntityType,
      relatedEntityId,
      recipientUserId,
      actorUserId,
    }),
  };

  console.info('Notification persistence attempted:', {
    table: 'notifications',
    conflictTarget: 'event_key',
    eventKey: payload.event_key,
    type: payload.type,
  });
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .upsert(payload, { onConflict: 'event_key' })
    .select('id,recipient_user_id,actor_user_id,type,title,message,related_entity_type,related_entity_id,booking_id,metadata,read,created_at,event_key')
    .single();

  if (error) {
    console.error('Notification persistence failed:', {
      table: 'notifications',
      conflictTarget: 'event_key',
      code: error.code,
      message: error.message,
    });
    throw error;
  }
  console.info('Notification persisted:', {
    table: 'notifications',
    id: data.id,
    eventKey: data.event_key,
    type: data.type,
  });
  return data;
}

module.exports = { createNotification };
