'use strict';

const crypto = require('crypto');
const express = require('express');
const supabaseDefault = require('../lib/supabaseClient');
const { ValidationError, assertAllowedKeys, assertPlainObject, text, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { actAsHost } = require('../lib/team');
const { ElieHostDenied, hostElieUsage, postToChatbot, withHostAction } = require('../lib/elieHost');

// Host Elie (lib/elieHost.js): the host's monthly Elie actions, and "Write
// with Elie" for a listing's summary highlight and description. The text is
// written by the chatbot service from the facts the host has filled in.

const WRITE_FIELDS = ['summary', 'description'];
const CATEGORIES = ['airbnb', 'hotel', 'venue', 'office', 'shop', 'property'];
const MAX_FACTS = 40;
const WRITE_TIMEOUT_MS = 60_000; // the chatbot may be waking up

function createElieHostRoutes({ supabaseAdmin = supabaseDefault } = {}) {
  const router = express.Router();

  // The account the host works as (a team member writes for their company).
  const requireHost = async (req, res, role) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const { data, error } = token ? await supabaseAdmin.auth.getUser(token) : { data: {}, error: true };
    if (error || !data || !data.user) { res.status(401).json({ error: 'Invalid or expired session' }); return null; }
    return (await actAsHost(req, data.user, role, supabaseAdmin)) || data.user;
  };

  router.get('/elie/host', async (req, res) => {
    const host = await requireHost(req, res, 'messaging'); if (!host) return;
    try {
      return res.json(await hostElieUsage(host.id, supabaseAdmin));
    } catch {
      return res.status(503).json({ error: 'Unable to load your Elie actions' });
    }
  });

  router.post('/elie/write', async (req, res) => {
    const host = await requireHost(req, res, 'manager'); if (!host) return;
    if (await rejectSuspendedActivity(res, host.id)) return;
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      assertAllowedKeys(body, ['field', 'category', 'facts', 'current']);
      const field = enumValue(body.field, 'field', WRITE_FIELDS);
      const category = enumValue(body.category, 'category', CATEGORIES);
      assertPlainObject(body.facts, 'facts');
      const entries = Object.entries(body.facts);
      if (entries.length > MAX_FACTS) throw new ValidationError('Too many listing details');
      const facts = {};
      for (const [label, value] of entries) {
        const clean = text(value, label.slice(0, 60), { required: false, max: 600 });
        if (clean) facts[text(label, 'detail name', { max: 60 })] = clean;
      }
      const current = text(body.current, 'current', { required: false, max: 6000 }) || '';
      if (!Object.keys(facts).length && !current) throw new ValidationError('Add a few details about the listing first');

      const written = await withHostAction(host.id, 'write', async () => {
        const result = await postToChatbot('/internal/listing/write', { field, category, facts, current }, {
          correlationId: `EW-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          timeoutMs: WRITE_TIMEOUT_MS,
        });
        if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('Elie returned no text');
        return result.text.trim();
      }, supabaseAdmin);
      return res.json({ text: written });
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof ElieHostDenied) return res.status(error.status).json(error.body());
      console.error('Write with Elie failed:', { stage: error.stage || null, error: error.message });
      return res.status(503).json({ error: 'Elie couldn’t write this right now. Please try again.' });
    }
  });

  return router;
}

module.exports = { createElieHostRoutes, WRITE_FIELDS };
