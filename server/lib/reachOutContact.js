// Reach Out for a host's public profile: the same channels the booking page
// gets from listing_contact (server/migrations/20261104_000052), but for a
// person instead of a listing. A channel that is off, or has no value, is
// null and never leaves the server. WhatsApp follows the contact phone, then
// the registration phone; email follows the login email.

const clean = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};

/**
 * @param {object|null} settings profile_contact_settings row (null: every default)
 * @param {string|null} registrationPhone profiles.phone
 * @param {string|null} loginEmail auth.users.email
 * @returns {{ whatsapp: string|null, email: string|null, phone: string|null }}
 */
function contactChannels(settings, registrationPhone, loginEmail) {
  const s = settings || {};
  const enabled = (flag) => flag !== false;
  return {
    whatsapp: enabled(s.whatsapp_enabled) ? (clean(s.whatsapp) || clean(s.phone) || clean(registrationPhone)) : null,
    email: enabled(s.email_enabled) ? (clean(s.email) || clean(loginEmail)) : null,
    phone: enabled(s.phone_enabled) ? (clean(s.phone) || clean(registrationPhone)) : null,
  };
}

module.exports = { contactChannels };
