import type { NextApiRequest, NextApiResponse } from 'next';
import { sendInvalidInput, sendPropertyNews } from '../../../lib/propertyNewsApi';
import { listPublishedNews, parseLimit } from '../../../lib/propertyNewsFeed';

// GET /api/news?limit=1..50 (default 20): newest published stories, no body.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const limit = parseLimit(req.query.limit, 20);
  if (limit === null) return sendInvalidInput(res);
  await sendPropertyNews(req, res, 'list', () => listPublishedNews(limit));
}
