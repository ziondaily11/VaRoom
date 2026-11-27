// What a guest does with a listing, in the words people use: you rent a rental
// space, buy a house on sale, lease an office, reserve a table, and book a
// hotel room, an Airbnb or an event venue. The feed cards' action button and
// the booking card share this, so the wording never drifts between pages.

export type ListingAction = 'Book' | 'Rent' | 'Buy' | 'Rent or buy' | 'Lease' | 'Reserve';

type PurposeDetails = { listing_purpose?: string | null } | null | undefined;

export interface ActionListing {
  category?: string | null;
  listing_purpose?: string | null;
  supports_stay?: boolean | null;
  supports_table_reservation?: boolean | null;
  /** Older properties keep their purpose only in the booking details. */
  listing_booking_details?: unknown;
}

export function listingAction(listing: ActionListing): ListingAction {
  if (listing.category === 'property') {
    const raw = listing.listing_booking_details as PurposeDetails | PurposeDetails[];
    const details = Array.isArray(raw) ? raw[0] : raw;
    const purpose = listing.listing_purpose || details?.listing_purpose || 'rent';
    return purpose === 'sale' ? 'Buy' : purpose === 'both' ? 'Rent or buy' : 'Rent';
  }
  if (listing.category === 'office') return 'Lease';
  if (listing.category === 'shop') return 'Rent';
  if (listing.category === 'hotel' && listing.supports_stay === false && listing.supports_table_reservation === true) return 'Reserve';
  return 'Book';
}
