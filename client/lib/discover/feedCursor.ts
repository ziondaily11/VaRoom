// Keyset ("seek") pagination for the Discover feeds. Both feeds are ordered
// newest first (created_at desc, id desc). Asking for the rows after the last
// listing already shown, instead of "skip N rows", means a listing published
// while someone scrolls does not push already-loaded rows into the next page
// (fetched twice) or push unseen rows out of it (skipped), and the database
// does not have to walk past every earlier row on deep pages.

export interface FeedCursorRow {
  id?: unknown;
  created_at?: unknown;
}

// PostgREST reserves , . : ( ) inside or=(...) values; quoted values may hold them.
const quote = (value: string) => `"${value.replace(/["\\]/g, '')}"`;

/**
 * The PostgREST `or` filter for rows strictly after `after` in
 * (created_at desc, id desc) order; null when `after` cannot be used, in
 * which case the caller falls back to the offset.
 */
export function feedCursorFilter(after: FeedCursorRow | null | undefined): string | null {
  if (!after || typeof after.created_at !== 'string' || !after.created_at || typeof after.id !== 'string' || !after.id) return null;
  const createdAt = quote(after.created_at);
  const id = quote(after.id);
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

interface PageableQuery<Q> {
  or(filter: string): Q;
  limit(count: number): Q;
  range(from: number, to: number): Q;
}

/**
 * One page of an already filtered and ordered query: after `after` when it
 * is known, else by offset (the first page, or an older cache entry).
 */
export function pageAfter<Q extends PageableQuery<Q>>(query: Q, offset: number, limit: number, after: FeedCursorRow | null | undefined): Q {
  const filter = offset > 0 ? feedCursorFilter(after) : null;
  return filter ? query.or(filter).limit(limit) : query.range(offset, offset + limit - 1);
}
