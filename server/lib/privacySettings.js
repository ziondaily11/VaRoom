'use strict';

const { conversationsBetween } = require('./chatClears');

// The Privacy settings a person chooses in Settings → Privacy & Security
// (profiles.who_can_message, profiles.profile_visibility), enforced here so
// the server is the one place that decides.

const MESSAGES_OFF = 'messages_off';
const MESSAGES_OFF_ERROR = 'This host isn’t accepting new messages.';

/** Whether this person accepts new conversations ("Who can message you"). */
async function acceptsNewConversations(admin, userId) {
  const { data, error } = await admin.from('profiles').select('who_can_message').eq('id', userId).maybeSingle();
  if (error) throw error;
  return !data || data.who_can_message !== 'no_one';
}

/** Whether two people already know each other on VaRoom: a conversation or a booking between them. */
async function haveRelationship(admin, firstId, secondId) {
  if ((await conversationsBetween(admin, firstId, secondId)).length) return true;
  const { data, error } = await admin
    .from('bookings')
    .select('id')
    .or(`and(host_id.eq.${firstId},client_id.eq.${secondId}),and(host_id.eq.${secondId},client_id.eq.${firstId})`)
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length);
}

/**
 * Whether the viewer may see this profile ("Profile visibility"): a public
 * profile is for everyone; a private one for its owner and people who already
 * have a conversation or booking with them.
 */
async function canViewProfile(admin, viewerId, profile) {
  if (!profile) return false;
  if (profile.profile_visibility !== 'private') return true;
  if (!viewerId) return false;
  if (viewerId === profile.id) return true;
  return haveRelationship(admin, viewerId, profile.id);
}

module.exports = { MESSAGES_OFF, MESSAGES_OFF_ERROR, acceptsNewConversations, haveRelationship, canViewProfile };
