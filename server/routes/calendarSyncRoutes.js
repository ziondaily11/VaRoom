'use strict';

// "Sync now" for one of a host's calendar links (the 30-minute job reads them
// all; see lib/calendarSync.js). The host's own links, or (team Managers) the
// links of the host they work for.

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { actingHostId } = require('../lib/team');
const { FEED_COLUMNS, syncFeed } = require('../lib/calendarSync');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT_MS = 30 * 1000;

function createCalendarSyncRoutes({ admin = supabaseAdmin, sync = syncFeed } = {}) {
  const router = express.Router();
  const lastRun = new Map();

  router.post('/calendar/feeds/:id/sync', async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token' });
    const { data: { user } = {}, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid link' });
    try {
      const hostId = await actingHostId(req, user.id, 'manager', admin);
      if (!hostId) return res.status(403).json({ error: 'Host access required' });
      const { data: feed, error } = await admin.from('calendar_feeds').select(FEED_COLUMNS).eq('id', req.params.id).eq('host_id', hostId).maybeSingle();
      if (error) throw error;
      if (!feed) return res.status(404).json({ error: 'Calendar link not found' });
      // One read per link every 30 seconds, however often the button is pressed.
      if (Date.now() - (lastRun.get(feed.id) || 0) < RECENT_MS) return res.status(429).json({ error: 'It was just synced. Try again in a moment.' });
      lastRun.set(feed.id, Date.now());
      return res.json(await sync(admin, feed));
    } catch (failure) {
      console.error('Calendar sync now failed:', failure && failure.message);
      return res.status(500).json({ error: 'The calendar couldn’t be synced. Please try again.' });
    }
  });

  return router;
}

module.exports = { createCalendarSyncRoutes };
