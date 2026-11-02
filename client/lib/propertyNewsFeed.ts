import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/config';

// Server-side reader for published Property News. It reads the public
// Supabase view property_news_public_items with the public anon key, so
// readers never depend on the Python pipeline service being awake.
// The JSON shape matches the Python API's _public_item, which the Property
// News page, Client Home and host-home's property-news-api.js consume.

const VIEW_URL = `${SUPABASE_URL}/rest/v1/property_news_public_items`;
const LIST_COLUMNS = [
  'id', 'title', 'summary', 'category', 'topics', 'counties', 'towns', 'regulatory_status',
  'affected_groups', 'risk_level', 'source_url', 'image_url', 'source_published_at', 'published_at',
  'source_name', 'source_tier',
].join(',');
const ARTICLE_COLUMNS = `${LIST_COLUMNS},body`;
const ORDER = 'published_at.desc.nullslast,source_published_at.desc.nullslast';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_LOCATIONS_BEFORE_NATIONAL = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_FEED_LIMIT = 50;

export interface PublicNewsRow {
  id: string;
  title: string | null;
  summary: string | null;
  body?: string | null;
  category: string | null;
  topics: string[] | null;
  counties: string[] | null;
  towns: string[] | null;
  regulatory_status: string;
  affected_groups: string[] | null;
  risk_level: string;
  source_url: string;
  image_url: string | null;
  source_published_at: string | null;
  published_at: string | null;
  source_name: string | null;
  source_tier: number | null;
}

export interface PublicNewsSource {
  name: string;
  url: string;
  tier: number | null;
  published_at: string | null;
}

export interface PublicNewsItem {
  id: string;
  title: string | null;
  summary: string | null;
  body: string | null;
  category: string | null;
  topics: string[];
  counties: string[];
  towns: string[];
  location_summary: string;
  regulatory_status: string;
  affected_groups: string[];
  risk_level: string;
  source: PublicNewsSource | null;
  image_url: string | null;
  published_at: string | null;
}

export class PropertyNewsFeedUnavailable extends Error {}

// Mirrors format_location_display in property-news/app/analysis.py.
export function formatLocationDisplay(counties: string[] | null, towns: string[] | null): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of [...(counties || []), ...(towns || [])]) {
    const location = (value || '').trim();
    if (location && !seen.has(location.toLowerCase())) {
      seen.add(location.toLowerCase());
      unique.push(location);
    }
  }
  if (unique.length > MAX_LOCATIONS_BEFORE_NATIONAL) return 'National · Kenya';
  return unique.length ? unique.join(' · ') : 'Kenya';
}

export function toPublicNewsItem(row: PublicNewsRow): PublicNewsItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body ?? null,
    category: row.category,
    topics: row.topics || [],
    counties: row.counties || [],
    towns: row.towns || [],
    location_summary: formatLocationDisplay(row.counties, row.towns),
    regulatory_status: row.regulatory_status,
    affected_groups: row.affected_groups || [],
    risk_level: row.risk_level,
    source: row.source_name
      ? { name: row.source_name, url: row.source_url, tier: row.source_tier, published_at: row.source_published_at }
      : null,
    image_url: row.image_url,
    published_at: row.published_at,
  };
}

export function isNewsId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function parseLimit(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= MAX_FEED_LIMIT ? limit : null;
}

async function readView(params: Record<string, string>): Promise<PublicNewsRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${VIEW_URL}?${new URLSearchParams(params)}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new PropertyNewsFeedUnavailable(`Property News view returned ${response.status}`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new PropertyNewsFeedUnavailable('Property News view returned an invalid response');
    return rows as PublicNewsRow[];
  } catch (error) {
    if (error instanceof PropertyNewsFeedUnavailable) throw error;
    throw new PropertyNewsFeedUnavailable(error instanceof Error ? error.message : 'Property News view request failed');
  } finally {
    clearTimeout(timeout);
  }
}

// List entries leave out the article body, as the Python list endpoints do;
// the article page fetches it by id.
export async function listPublishedNews(limit: number): Promise<PublicNewsItem[]> {
  const rows = await readView({ select: LIST_COLUMNS, order: ORDER, limit: String(limit) });
  return rows.map(toPublicNewsItem);
}

export async function getPublishedNews(id: string): Promise<PublicNewsItem | null> {
  const rows = await readView({ select: ARTICLE_COLUMNS, id: `eq.${id}`, limit: '1' });
  return rows.length ? toPublicNewsItem(rows[0]) : null;
}
