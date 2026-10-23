'use strict';

const express = require('express');

async function authenticatedUser(admin, req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data && data.user;
  } catch (_error) {
    return null;
  }
}

async function groupSnapshot(admin, user) {
    const ownMembership = await admin.from('account_group_members')
      .select('group_id').eq('user_id', user.id).maybeSingle();
    if (ownMembership.error) throw ownMembership.error;

    const groupId = ownMembership.data && ownMembership.data.group_id;
    let userIds = [user.id];
    if (groupId) {
      const result = await admin.from('account_group_members')
        .select('user_id,joined_at').eq('group_id', groupId)
        .order('joined_at', { ascending: true }).order('user_id', { ascending: true });
      if (result.error) throw result.error;
      userIds = (result.data || []).map((row) => row.user_id);
    }
    if (!userIds.includes(user.id)) userIds.unshift(user.id);
    if (userIds.length > 3) throw new Error('Account group data exceeds the configured limit.');

    const profilesResult = await admin.from('profiles')
      .select('id,full_name,username,avatar_url,role').in('id', userIds);
    if (profilesResult.error) throw profilesResult.error;
    const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
    const members = userIds.map((id) => {
      const profile = profiles.get(id) || {};
      return {
        id,
        full_name: profile.full_name || (id === user.id && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || 'VaRoom Member',
        username: profile.username || (id === user.id && user.email ? user.email.split('@')[0] : 'member'),
        avatar_url: profile.avatar_url || null,
        role: profile.role || (id === user.id && user.user_metadata && user.user_metadata.role) || 'client',
        email: id === user.id ? (user.email || '') : ''
      };
    });
    return { group_id: groupId || null, current_user_id: user.id, members };
}

async function linkAccountGroupUsers(admin, currentUser, additionalUser) {
  if (!currentUser || !additionalUser || !currentUser.id || !additionalUser.id || currentUser.id === additionalUser.id) {
    const error = new Error('invalid_account_group_members');
    error.code = 'invalid_account_group_members';
    throw error;
  }
  const { error } = await admin.rpc('varoom_link_account_group_users', {
    p_user_a: currentUser.id,
    p_user_b: additionalUser.id
  });
  if (error) throw error;
  return groupSnapshot(admin, currentUser);
}

function linkFailure(error) {
  const message = String(error && error.message || '');
  if (message.includes('account_group_limit_reached')) {
    return { status: 409, error: 'Account limit reached (3/3). This group cannot include another account.' };
  }
  if (message.includes('invalid_account_group_members')) {
    return { status: 400, error: 'Choose two different authenticated accounts.' };
  }
  return { status: 500, error: 'Unable to link this account right now.' };
}

function createAccountGroupRoutes(admin) {
  const router = express.Router();

  router.get('/account-groups/current', async (req, res) => {
    const user = await authenticatedUser(admin, req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    try {
      return res.set('Cache-Control', 'no-store').json(await groupSnapshot(admin, user));
    } catch (error) {
      console.error('Account group lookup failed:', error.message);
      return res.status(500).json({ error: 'Unable to load linked accounts' });
    }
  });

  router.post('/account-groups/link', async (req, res) => {
    const currentUser = await authenticatedUser(admin, req);
    if (!currentUser) return res.status(401).json({ error: 'Invalid or expired session' });

    const additionalToken = typeof req.body?.additional_access_token === 'string'
      ? req.body.additional_access_token.trim()
      : '';
    if (!additionalToken || additionalToken.length > 8192) {
      return res.status(400).json({ error: 'Sign in to the account you want to link and try again.' });
    }

    let additionalUser;
    try {
      const { data, error } = await admin.auth.getUser(additionalToken);
      if (error || !data || !data.user) {
        console.error('Additional account token validation failed:', {
          status: error && error.status,
          code: error && error.code,
          name: error && error.name
        });
        return res.status(401).json({ error: 'The account being added needs to sign in again.' });
      }
      additionalUser = data.user;
    } catch (error) {
      console.error('Additional account token validation failed:', {
        status: error && error.status,
        code: error && error.code,
        name: error && error.name
      });
      return res.status(401).json({ error: 'The account being added needs to sign in again.' });
    }
    if (additionalUser.id === currentUser.id) {
      return res.status(409).json({ error: 'This account is already active.' });
    }

    try {
      return res.set('Cache-Control', 'no-store').json(await linkAccountGroupUsers(admin, currentUser, additionalUser));
    } catch (error) {
      console.error('Account group link failed:', error.message);
      const failure = linkFailure(error);
      return res.status(failure.status).json({ error: failure.error });
    }
  });

  return router;
}

module.exports = createAccountGroupRoutes;
module.exports.authenticatedUser = authenticatedUser;
module.exports.groupSnapshot = groupSnapshot;
module.exports.linkAccountGroupUsers = linkAccountGroupUsers;
module.exports.linkFailure = linkFailure;
