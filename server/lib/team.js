'use strict';

const supabaseAdmin = require('./supabaseClient');

// Team access: a request can act for a host the user works for. The page sends
// the host's id in X-VaRoom-Host; the user must be an active member with the
// role. Without the header the user acts for themselves.

const HOST_HEADER = 'x-varoom-host';

/** The host this request acts for, or null when the user may not act for them. */
async function actingHostId(req, userId, role, admin = supabaseAdmin) {
  const requested = req.headers[HOST_HEADER];
  if (!requested || requested === userId) return userId;
  const { data, error } = await admin.from('host_team_members').select('roles')
    .eq('host_id', requested).eq('member_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  return data && Array.isArray(data.roles) && data.roles.includes(role) ? requested : null;
}

module.exports = { HOST_HEADER, actingHostId };
