'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { createPaystackClient } = require('../lib/paystackClient');
const { sendError } = require('../lib/apiResponse');
const { deactivateAccount, reactivateAccount } = require('../lib/accountDeactivation');

// Settings → Your Account → Account Status. "Delete account" deactivates the
// account for 30 days before it is permanently deleted; "Deactivate account"
// has no deadline. Signing in again reactivates either (POST
// /account/reactivate, called by the app once the new session's profile
// shows the account is deactivated).

/** As Settings offers them (client/lib/settings/settings.ts DELETE_REASONS). */
const DELETE_REASONS = [
  'I no longer use VaRoom',
  'I created another account',
  'Privacy concerns',
  "I'm unhappy with the service",
  'Technical issues',
  'Other',
];

function createAccountRoutes({ supabaseAdmin = supabaseDefault, paystack = createPaystackClient() } = {}) {
  const router = express.Router();

  async function authenticated(req, res) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) { sendError(res, 401, 'Missing access token'); return null; }
    const { data: { user } = {}, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) { sendError(res, 401, 'Invalid or expired session'); return null; }
    return { user, token };
  }

  router.post('/delete-account', async (req, res) => {
    const auth = await authenticated(req, res); if (!auth) return;
    const reason = String((req.body && req.body.reason) || '').trim();
    const reasonDetails = String((req.body && req.body.reason_details) || '').trim();
    if (!DELETE_REASONS.includes(reason)) return sendError(res, 400, 'A valid deletion reason is required');
    if (reason === 'Other' && !reasonDetails) return sendError(res, 400, 'Please explain your reason for deleting the account');
    try {
      const result = await deactivateAccount(supabaseAdmin, paystack, { userId: auth.user.id, accessToken: auth.token, scheduleDeletion: true });
      return res.json({ success: true, deactivated_at: result.deactivatedAt, deletion_scheduled_for: result.deletionScheduledFor });
    } catch (error) {
      console.error('Account deletion (deactivation) failed:', error);
      return sendError(res, 500, 'Unable to delete the account');
    }
  });

  router.post('/account/deactivate', async (req, res) => {
    const auth = await authenticated(req, res); if (!auth) return;
    try {
      const result = await deactivateAccount(supabaseAdmin, paystack, { userId: auth.user.id, accessToken: auth.token, scheduleDeletion: false });
      return res.json({ success: true, deactivated_at: result.deactivatedAt });
    } catch (error) {
      console.error('Account deactivation failed:', error);
      return sendError(res, 500, 'Unable to deactivate the account');
    }
  });

  router.post('/account/reactivate', async (req, res) => {
    const auth = await authenticated(req, res); if (!auth) return;
    try {
      const result = await reactivateAccount(supabaseAdmin, auth.user);
      if (!result.reactivated && result.reason === 'sign_in_required') {
        return res.status(403).json({ error: 'Sign in again to reactivate this account.', code: 'sign_in_required' });
      }
      return res.json(result);
    } catch (error) {
      console.error('Account reactivation failed:', error);
      return sendError(res, 500, 'Unable to reactivate the account');
    }
  });

  return router;
}

module.exports = { createAccountRoutes, DELETE_REASONS };
