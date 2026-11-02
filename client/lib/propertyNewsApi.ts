import type { NextApiRequest, NextApiResponse } from 'next';
import { PropertyNewsFeedUnavailable } from './propertyNewsFeed';

// Vercel's CDN serves a cached copy for s-maxage seconds and keeps serving
// the last good copy while it refreshes in the background, so readers get
// news instantly even when Supabase is slow. A newly published story is
// visible within s-maxage seconds.
const LIST_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=86400';
const ARTICLE_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=86400';

export type FeedKind = 'list' | 'article';

export async function sendPropertyNews(
  req: NextApiRequest,
  res: NextApiResponse,
  kind: FeedKind,
  load: () => Promise<unknown>,
): Promise<void> {
  // Lets a deployment be checked for which backend served the request.
  res.setHeader('X-Property-News-Source', 'supabase-view');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ detail: 'Method not allowed.' });
    return;
  }
  try {
    const body = await load();
    if (body === null) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ detail: 'Published news item not found.' });
      return;
    }
    res.setHeader('Cache-Control', kind === 'list' ? LIST_CACHE_CONTROL : ARTICLE_CACHE_CONTROL);
    res.status(200).json(body);
  } catch (error) {
    if (!(error instanceof PropertyNewsFeedUnavailable)) throw error;
    console.error('Property News feed unavailable:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ detail: 'Published property news is temporarily unavailable. Please retry shortly.' });
  }
}

export function sendInvalidInput(res: NextApiResponse): void {
  res.setHeader('X-Property-News-Source', 'supabase-view');
  res.setHeader('Cache-Control', 'no-store');
  res.status(422).json({ error: 'Invalid input' });
}
