import type { NextApiRequest, NextApiResponse } from 'next';
import { sendInvalidInput, sendPropertyNews } from '../../../lib/propertyNewsApi';
import { listPublishedNews, parseLimit } from '../../../lib/propertyNewsFeed';

// GET /api/news/latest?limit=1..50 (default 2): dashboard previews.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const limit = parseLimit(req.query.limit, 2);
  if (limit === null) return sendInvalidInput(res);
  await sendPropertyNews(req, res, 'list', () => listPublishedNews(limit));
}
