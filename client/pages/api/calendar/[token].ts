import type { NextApiRequest, NextApiResponse } from 'next';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../../lib/supabase/config';
import { buildIcs, type IcalSource } from '../../../lib/calendar/icalExport';

// GET /api/calendar/<secret>.ics: a listing's calendar link for Airbnb.com,
// Booking.com or Google Calendar to read. Served by Vercel (never asleep) and
// cached at the edge for 5 minutes; the secret is the only key, and the
// file holds "Not available" dates only (lib/calendar/icalExport.ts).

const TOKEN = /^[0-9a-f]{64}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).end();
    return;
  }
  const token = String(req.query.token || '').replace(/\.ics$/i, '');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!TOKEN.test(token)) { res.status(404).end(); return; }
  let source: IcalSource | null = null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/listing_ical`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_token: token }),
    });
    if (!response.ok) throw new Error(`listing_ical answered ${response.status}`);
    source = (await response.json()) as IcalSource | null;
  } catch (error) {
    console.error('Calendar link failed:', error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).end();
    return;
  }
  if (!source) { res.setHeader('Cache-Control', 'no-store'); res.status(404).end(); return; }
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="varoom.ics"');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(buildIcs(source));
}
