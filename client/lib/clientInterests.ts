// A client's saved interests (profiles.interested_categories): listing
// categories, plus 'buy' and 'rent' for property (chosen as two separate
// tiles in onboarding). Older accounts may have saved 'property' for both.
// Import-free, so Marketplace, Client Home and onboarding share one rule.

export type PropertyInterest = 'buy' | 'rent';

const PROPERTY_INTERESTS: readonly string[] = ['buy', 'rent', 'property'];

/** Trimmed, lower-case, without blanks or repeats. */
export function normalizeInterests(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const key = String(value ?? '').trim().toLowerCase();
    if (key) seen.add(key);
  });
  return Array.from(seen);
}

/** The listing categories the interests point to ('buy' and 'rent' are property). */
export function interestCategories(values: readonly unknown[] | null | undefined): string[] {
  const categories = normalizeInterests(values).map((key) => (PROPERTY_INTERESTS.includes(key) ? 'property' : key));
  return Array.from(new Set(categories));
}

/**
 * Whether a listing matches the interests. Property matches 'buy' when it is
 * for sale, 'rent' when it is to let ('both' matches either), and the older
 * 'property' always.
 */
export function listingMatchesInterests(
  listing: { category?: string | null; purpose?: string | null },
  interests: readonly string[],
): boolean {
  const category = listing.category || '';
  if (category !== 'property') return interests.includes(category);
  if (interests.includes('property')) return true;
  const purpose = listing.purpose || 'rent';
  return (interests.includes('buy') && (purpose === 'sale' || purpose === 'both'))
    || (interests.includes('rent') && (purpose === 'rent' || purpose === 'both'));
}
