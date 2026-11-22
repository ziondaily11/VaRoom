'use strict';

const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { createPaystackClient } = require('../lib/paystackClient');
const { sendError } = require('../lib/apiResponse');
const { deactivateAccount, reactivateAccount } = require('../lib/accountDeactivation');
const { createClient } = require('@supabase/supabase-js');
const { verifiedTokenClaims, securityStatus, recordStepUp, passwordMatches, createAttemptLimiter } = require('../lib/stepUp');

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

/** A client that checks a password without keeping (or replacing) any session. */
function defaultAnonClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is not configured');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

function createAccountRoutes({ supabaseAdmin = supabaseDefault, paystack = createPaystackClient(), createAnonClient = defaultAnonClient, attempts = createAttemptLimiter() } = {}) {
  const router = express.Router();
  setInterval(() => attempts.prune(), 15 * 60 * 1000).unref();

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

  // Settings → Your Account: locked only when there is a risk (lib/stepUp.js).
  router.get('/account/security-status', async (req, res) => {
    const auth = await authenticated(req, res); if (!auth) return;
    res.set('Cache-Control', 'private, no-store');
    try {
      return res.json(await securityStatus(supabaseAdmin, { userId: auth.user.id, claims: verifiedTokenClaims(auth.token) }));
    } catch (error) {
      console.error('Account security status failed:', error.message);
      return sendError(res, 502, 'Unable to check your account security right now');
    }
  });

  // Verify with the account password; this session then stays unlocked.
  router.post('/account/verify-password', async (req, res) => {
    const auth = await authenticated(req, res); if (!auth) return;
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    if (!password || password.length > 200) return sendError(res, 400, 'Enter your password');
    if (!auth.user.email) return sendError(res, 400, 'This account has no password to verify with');
    if (attempts.blocked(auth.user.id)) return sendError(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
    try {
      const check = await passwordMatches(createAnonClient, supabaseAdmin, { email: auth.user.email, password, userId: auth.user.id });
      if (check.unavailable) return sendError(res, 503, 'Password verification is temporarily unavailable');
      if (!check.ok) {
        attempts.fail(auth.user.id);
        return sendError(res, 401, 'Incorrect password. Please try again.');
      }
      attempts.reset(auth.user.id);
      return res.json(await recordStepUp(supabaseAdmin, { userId: auth.user.id, claims: verifiedTokenClaims(auth.token), method: 'password' }));
    } catch (error) {
      console.error('Password verification failed:', error.message);
      return sendError(res, 502, 'Unable to verify your password right now');
    }
  });

  // Become a Host: this client account becomes a host account in place (same
  // sign-in, same profile). Changes the username, phone and name, so it needs
  // the same unlocked session as Settings → Your Account; one update makes it
  // a host with its niche, and a retry after a lost response succeeds.
  router.post('/account/become-host', async (req, res) => {
    const auth = await authenticated(req, res); if (!auth) return;
    const input = parseHostSetup(req.body, auth.user.id);
    if (input.error) return sendError(res, 400, input.error);
    try {
      const status = await securityStatus(supabaseAdmin, { userId: auth.user.id, claims: verifiedTokenClaims(auth.token) });
      if (!status.unlocked) return res.status(403).json({ error: 'Verify your identity to continue.', code: 'step_up_required' });

      const { data: current, error: readError } = await supabaseAdmin.from('profiles')
        .select('role,onboarding_completed,listing_categories').eq('id', auth.user.id).maybeSingle();
      if (readError) throw readError;
      if (!current) return sendError(res, 404, 'Your profile could not be found');
      if (current.role === 'host') return res.json({ success: true, role: 'host' });
      if (current.role !== 'client' || !current.onboarding_completed) return sendError(res, 409, 'Finish setting up your account first');

      const { data: taken, error: takenError } = await supabaseAdmin.from('profiles')
        .select('id').ilike('username', input.username.replace(/[\\%_]/g, (c) => `\\${c}`)).neq('id', auth.user.id).limit(1);
      if (takenError) throw takenError;
      if (taken && taken.length) return res.status(409).json({ error: `Username "${input.username}" is already taken. Try another.`, code: 'username_taken' });

      const patch = {
        role: 'host', username: input.username, phone: input.phone, city: input.city,
        listing_categories: [input.niche], full_name: input.discoverName, onboarding_completed: true,
        ...(input.avatarPath !== undefined ? { avatar_url: input.avatarPath } : {}),
      };
      const { data: updated, error: updateError } = await supabaseAdmin.from('profiles')
        .update(patch).eq('id', auth.user.id).eq('role', 'client').select('id').maybeSingle();
      if (updateError) {
        if (updateError.code === '23505') return res.status(409).json({ error: `Username "${input.username}" is already taken. Try another.`, code: 'username_taken' });
        if (updateError.code === '23514') return sendError(res, 400, 'That username is not available. Try another.');
        throw updateError;
      }
      if (!updated) return res.json({ success: true, role: 'host' });

      // The sign-up role is only a fallback for a missing profile role; keep it in step.
      const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(auth.user.id, { user_metadata: { ...(auth.user.user_metadata || {}), role: 'host' } });
      if (metaError) console.error('Become a host: the sign-up role was not updated:', metaError.message);
      return res.json({ success: true, role: 'host' });
    } catch (error) {
      console.error('Become a host failed:', error.message || error);
      return sendError(res, 502, 'Your host account could not be set up. Please try again.');
    }
  });

  return router;
}

const HOST_NICHES = ['airbnb', 'hotel', 'property', 'office', 'venue'];

/** The Become a Host form, checked as onboarding checks it (client/lib/onboarding/onboarding.ts). */
function parseHostSetup(body, userId) {
  const value = (key) => (body && typeof body[key] === 'string' ? body[key].trim() : '');
  const username = value('username').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { error: 'Usernames are 3 to 20 lowercase letters, numbers or underscores.' };
  const digits = value('phone').replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return { error: 'Please enter a valid phone number.' };
  const phone = digits.startsWith('254') ? `+${digits}` : digits.startsWith('0') ? `+254${digits.slice(1)}` : digits.length === 9 ? `+254${digits}` : `+${digits}`;
  const city = value('city');
  if (city.length < 2 || city.length > 120) return { error: 'Please enter or select your city/area.' };
  const niche = value('niche');
  if (!HOST_NICHES.includes(niche)) return { error: 'Please select exactly one listing category.' };
  const discoverName = value('discoverName');
  if (discoverName.length < 2 || discoverName.length > 40) return { error: 'Please enter a name between 2 and 40 characters.' };
  // A photo uploaded to the account's own avatars folder, or null to remove it.
  let avatarPath;
  if (body && body.avatarPath === null) avatarPath = null;
  else if (body && body.avatarPath !== undefined) {
    const path = value('avatarPath');
    if (!new RegExp(`^${userId}/avatar_\\d+\\.jpg$`).test(path)) return { error: 'That photo could not be used.' };
    avatarPath = path;
  }
  return { username, phone, city, niche, discoverName, avatarPath };
}

module.exports = { createAccountRoutes, DELETE_REASONS, parseHostSetup };
