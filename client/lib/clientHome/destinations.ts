// Client Home's "Popular destinations" counts, from the server's shared,
// cached answer (GET /api/destination-counts, server/lib/destinationCounts.js)
// instead of five count queries from every browser.

export type DestinationCounts = Record<string, number | null>;

/** Each city's count from the response; null for a city the server does not count. */
export function parseDestinationCounts(body: unknown, cities: readonly string[]): DestinationCounts {
  const counts = body && typeof body === 'object' ? (body as { counts?: unknown }).counts : null;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    throw new Error('Destination counts returned an invalid response.');
  }
  const values = counts as Record<string, unknown>;
  return Object.fromEntries(cities.map((city) => {
    const count = values[city];
    return [city, Number.isSafeInteger(count) && (count as number) >= 0 ? (count as number) : null];
  }));
}

export async function fetchDestinationCounts(cities: readonly string[], fetchFn: typeof fetch = fetch): Promise<DestinationCounts> {
  const response = await fetchFn('/api/destination-counts', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Destination counts request failed (${response.status}).`);
  return parseDestinationCounts(await response.json(), cities);
}
