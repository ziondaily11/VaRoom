import type { NextApiRequest, NextApiResponse } from 'next';
import { sendInvalidInput, sendPropertyNews } from '../../../lib/propertyNewsApi';
import { getPublishedNews, isNewsId } from '../../../lib/propertyNewsFeed';

// GET /api/news/:id: one published story with its body.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!isNewsId(id)) return sendInvalidInput(res);
  await sendPropertyNews(req, res, 'article', () => getPublishedNews(id));
}
