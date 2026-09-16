const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { ValidationError, assertAllowedKeys, text, uuid, enumValue } = require('../lib/inputValidation');
const { createNotification } = require('../lib/notifications');

const router = express.Router();

const VALID_NOTIFICATION_TYPES = new Set([
  'booking_request',
  'booking_approved',
  'booking_declined',
  'booking_cancelled',
  'booking_modified',
  'booking_upcoming',
  'check_in_reminder',
  'check_out_reminder',
  'stay_completed',
  'new_message',
  'listing_shared',
  'missed_call',
  'incoming_call',
  'listing_saved',
  'listing_price_changed',
  'listing_availability_changed',
  'listing_updated',
  'listing_approved',
  'listing_rejected',
  'listing_reported',
  'listing_hidden',
  'listing_removed',
  'new_review',
  'review_published',
  'review_response',
  'payment_success',
  'payment_failed',
  'payment_pending',
  'refund_initiated',
  'refund_completed',
  'payout_pending',
  'payout_completed',
  'payout_failed',
  'verification_completed',
  'verification_failed',
  'verification_required',
  'security_alert',
  'support_received',
  'support_replied',
  'support_updated',
  'support_resolved',
  'property_news',
  'new_matching_listing',
  'saved_search_match',
  'system',
]);

async function authenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error || !user ? null : user;
}

router.post('/notifications', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });

    assertAllowedKeys(req.body || {}, ['recipient_user_id', 'actor_user_id', 'type', 'title', 'message', 'related_entity_type', 'related_entity_id', 'metadata', 'event_key', 'booking_id']);

    const payload = req.body || {};
    const recipientUserId = uuid(payload.recipient_user_id, 'recipient_user_id');
    const actorUserId = payload.actor_user_id === undefined ? user.id : uuid(payload.actor_user_id, 'actor_user_id');
    const type = enumValue(payload.type, 'type', [...VALID_NOTIFICATION_TYPES]);
    const title = text(payload.title, 'title', { max: 200 });
    const message = text(payload.message, 'message', { max: 1000 });
    const relatedEntityType = payload.related_entity_type === undefined || payload.related_entity_type === null
      ? null
      : text(payload.related_entity_type, 'related_entity_type', { max: 60 });
    const relatedEntityId = payload.related_entity_id === undefined || payload.related_entity_id === null
      ? null
      : uuid(payload.related_entity_id, 'related_entity_id');
    const eventKey = payload.event_key === undefined || payload.event_key === null ? null : text(payload.event_key, 'event_key', { max: 255 });
    const bookingId = payload.booking_id === undefined || payload.booking_id === null ? null : uuid(payload.booking_id, 'booking_id');

    if (actorUserId !== user.id) {
      return res.status(403).json({ error: 'You can only create notifications for your own actions' });
    }

    const notification = await createNotification({
      recipientUserId,
      actorUserId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      metadata: payload.metadata || {},
      bookingId,
      eventKey,
    });

    return res.status(201).json({ notification });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Notification creation failed:', error);
    return res.status(502).json({ error: 'Unable to create notification' });
  }
});

module.exports = router;
