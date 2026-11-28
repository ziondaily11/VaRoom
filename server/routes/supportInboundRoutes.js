'use strict';

const express = require('express');
const { fetchReceivedEmail } = require('../lib/email');
const { verifyWebhook, handleReceived } = require('../lib/supportInbox');

// POST /api/support/inbound-email: Resend's `email.received` webhook (Resend
// dashboard → Webhooks, signing secret in RESEND_WEBHOOK_SECRET). Mounted
// with express.raw before JSON parsing: the signature covers the exact bytes.
// A failure answers 500 so Resend retries; a repeat is recognised by its email id.
function createSupportInboundRoutes(admin, { secret = process.env.RESEND_WEBHOOK_SECRET, fetchEmail = fetchReceivedEmail, send } = {}) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    if (!secret) return res.status(503).json({ error: 'Inbound email is not configured' });
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!verifyWebhook(raw, req.headers, secret)) return res.status(401).json({ error: 'Invalid signature' });
    let event;
    try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Malformed webhook payload' }); }
    if (!event || event.type !== 'email.received') return res.json({ ignored: true });
    try {
      return res.json(await handleReceived(admin, event, send ? { fetchEmail, send } : { fetchEmail }));
    } catch (error) {
      console.error('Inbound support email failed:', error.message);
      return res.status(500).json({ error: 'Unable to record the email' });
    }
  });
  return router;
}

module.exports = createSupportInboundRoutes;
