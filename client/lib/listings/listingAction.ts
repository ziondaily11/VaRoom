// What a guest does with a listing, in the words people use: you rent a rental
// space, buy a house on sale, lease an office, reserve a table, and book a
// hotel room, an Airbnb or an event venue. The feed cards' action button and
// the booking card share this, so the wording never drifts between pages.

export type ListingAction = 'Book' | 'Rent' | 'Buy' | 'Rent or buy' | 'Lease' | 'Reserve';

export interface ActionListing {
  category?: string | null;
  listing_purpose?: string | null;
  supports_stay?: boolean | null;
  supports_table_reservation?: boolean | null;
  /** Older properties keep their purpose only in the booking details. */
  listing_booking_details?: unknown;
}

type ListingDetails = { listing_purpose?: string | null; units_available?: number | null } | null | undefined;

const detailsOf = (listing: ActionListing): ListingDetails => {
  const raw = listing.listing_booking_details as ListingDetails | ListingDetails[];
  return Array.isArray(raw) ? raw[0] : raw;
};

/** A property's purpose, as the booking widget reads it (the listing, then its details, else rent). */
export const propertyPurpose = (listing: ActionListing): 'rent' | 'sale' | 'both' =>
  (listing.listing_purpose || detailsOf(listing)?.listing_purpose || 'rent') as 'rent' | 'sale' | 'both';

export function listingAction(listing: ActionListing): ListingAction {
  if (listing.category === 'property') {
    const purpose = propertyPurpose(listing);
    return purpose === 'sale' ? 'Buy' : purpose === 'both' ? 'Rent or buy' : 'Rent';
  }
  if (listing.category === 'office') return 'Lease';
  if (listing.category === 'shop') return 'Rent';
  if (listing.category === 'hotel' && listing.supports_stay === false && listing.supports_table_reservation === true) return 'Reserve';
  return 'Book';
}

// ---------- When it changes hands (migration 000085) ----------

export type ListingOutcome = 'sold' | 'rented' | 'leased';

/** Statuses set by marking a listing sold, rented or leased: off the marketplace until relisted. */
export const isMarkedStatus = (status: string | null | undefined): boolean => status === 'sold' || status === 'rented' || status === 'leased';

/** What the host can mark it as: properties by purpose, offices leased, shops rented; stays have none. */
export function listingOutcomes(listing: ActionListing): ListingOutcome[] {
  if (listing.category === 'office') return ['leased'];
  if (listing.category === 'shop') return ['rented'];
  if (listing.category !== 'property') return [];
  const purpose = propertyPurpose(listing);
  return purpose === 'sale' ? ['sold'] : purpose === 'both' ? ['rented', 'sold'] : ['rented'];
}

/** How many units the host can still mark (properties only; offices and shops go as a whole). */
export const unitsLeft = (listing: ActionListing): number =>
  (listing.category === 'property' ? Math.max(1, Number(detailsOf(listing)?.units_available) || 1) : 1);

/** A listing's status in words, wherever it is shown. */
export const STATUS_LABELS: Record<string, string> = {
  available: 'Available', booked: 'Booked', unavailable: 'Unavailable', paused: 'Paused', draft: 'Draft',
  sold: 'Sold', rented: 'Rented', leased: 'Leased',
};
export const statusLabel = (status: string | null | undefined): string => STATUS_LABELS[status || 'available'] || String(status);
