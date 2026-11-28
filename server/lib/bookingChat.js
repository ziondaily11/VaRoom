'use strict';

const { encryptMessage } = require('./messageEncryptionService');
const { deactivationState, isDeactivated } = require('./accountDeactivation');
const { PENDING_EXPIRY_MS } = require('./bookingExpiry');
const { conversationFor } = require('./chatStart');

// Chat around a booking: the host may message the guest of a request they can
// still answer (48 hours), or of an approved or completed booking, even when
// the guest takes no new messages ("Who can message you: No one"). Approving
// a request posts a message from the host in that chat.

const BOOKING_COLUMNS = 'id,host_id,client_id,listing_id,status,created_at,start_date,end_date,hours,start_time,end_time,lease_start_date,lease_months,guest_count';

function hostCanMessage(booking, now = Date.now()) {
  if (booking.status === 'approved' || booking.status === 'completed') return true;
  return booking.status === 'pending' && new Date(booking.created_at).getTime() >= now - PENDING_EXPIRY_MS;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "21 Nov 2026" for a date-only value (the calendar day as booked). */
function day(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
}

/** The guest's card wording (client/lib/bookings/format.ts describeDates), plus guests. */
function bookingDetails(b) {
  let when = '';
  if (b.hours && b.start_date) when = `${day(b.start_date)} · ${b.start_time && b.end_time ? `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}` : plural(b.hours, 'hour')}`;
  else if (b.start_date && b.end_date) when = `${day(b.start_date)} → ${day(b.end_date)}`;
  else if (b.lease_start_date) when = `from ${day(b.lease_start_date)}${b.lease_months ? ` · ${plural(b.lease_months, 'month')}` : ''}`;
  const guests = Number(b.guest_count) > 0 ? plural(Number(b.guest_count), 'guest') : '';
  return [when, guests].filter(Boolean).join(' · ');
}

function approvalText(booking) {
  const details = bookingDetails(booking);
  return `Your booking request${details ? ` (${details})` : ''} is approved. Message me here if you have any questions.`;
}

/**
 * The approval message, from the host (sent_by: the team member who approved
 * for a company), with the listing's card. Nothing for a deactivated guest.
 */
async function sendApprovalMessage(admin, booking, actorId = null) {
  if (isDeactivated(await deactivationState(admin, booking.client_id))) return null;
  const { conversationId } = await conversationFor(admin, { hostId: booking.host_id, clientId: booking.client_id, listingId: booking.listing_id });
  const { error } = await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: booking.host_id,
    sent_by: actorId,
    ...encryptMessage(approvalText(booking)),
    message_type: 'text',
    listing_id: booking.listing_id,
  });
  if (error) throw error;
  return conversationId;
}

module.exports = { BOOKING_COLUMNS, hostCanMessage, approvalText, sendApprovalMessage };
