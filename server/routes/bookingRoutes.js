'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { ValidationError, assertAllowedKeys, uuid, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { actAsHost } = require('../lib/team');
const { BOOKING_COLUMNS, sendApprovalMessage } = require('../lib/bookingChat');

const router = express.Router();

// A host approves or declines a pending request: the host's own, or a
// company's for its Managers (the conditions the bookings RLS policy applied
// when the browser did this). The database triggers still apply the booking
// rules and tell the guest; "booking_rule: …" refusals pass through as 409.
// Approving also posts a message from the host in the chat with the guest.
router.post('/bookings/:bookingId/respond', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const { data: { user } = {}, error: authError } = token ? await supabaseAdmin.auth.getUser(token) : { data: {} };
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });
    // The person signed in (the database's suspension check used auth.uid()).
    if (await rejectSuspendedActivity(res, user.id)) return;
    const host = await actAsHost(req, user, 'manager');
    if (!host) return res.status(403).json({ error: 'You can’t answer this company’s bookings.' });
    const bookingId = uuid(req.params.bookingId, 'booking id');
    assertAllowedKeys(req.body, ['decision']);
    const status = enumValue(req.body.decision, 'decision', ['approve', 'decline']) === 'approve' ? 'approved' : 'declined';

    const { data: booking, error } = await supabaseAdmin.from('bookings')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', bookingId).eq('host_id', host.id).eq('status', 'pending')
      .select(BOOKING_COLUMNS).maybeSingle();
    if (error) {
      if (/^booking_rule: /.test(error.message || '')) return res.status(409).json({ error: error.message });
      throw error;
    }
    if (!booking) return res.status(409).json({ error: 'This booking request has already been processed.' });

    // Once only: no other request can move it out of pending. The booking stays approved if this fails.
    if (status === 'approved') {
      await sendApprovalMessage(supabaseAdmin, booking, host.actorId || null)
        .catch((messageError) => console.error('Booking approval message failed:', { bookingId, error: messageError.message }));
    }
    return res.json({ status });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Booking response failed:', error);
    return res.status(502).json({ error: 'Unable to answer the booking request' });
  }
});

module.exports = router;
