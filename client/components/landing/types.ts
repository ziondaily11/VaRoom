export interface Listing {
  id: string;
  title: string;
  category: string;
  location: string;
  photoUrl: string | null;
  price: number | null;
  priceUnit: string;
  guests: number | null;
  sizeOrType: string | null;
  amenities: string[];
  verified: boolean;
  hostName: string;
}

/** A `listings` row as the landing page selects it. */
export interface LandingListingRow {
  id: string;
  title?: string | null;
  category?: string | null;
  location_text?: string | null;
  verified?: boolean | null;
  listing_photos?: Array<{ storage_path?: string | null } | null> | null;
  listing_booking_details?: LandingListingDetails | LandingListingDetails[] | null;
  host?: { full_name?: string | null; username?: string | null; verified?: boolean | null } | null;
}

export interface LandingListingDetails {
  price_amount?: number | null;
  price_unit?: string | null;
  max_guests?: number | null;
  size_or_type?: string | null;
  amenities?: unknown;
}

export interface TrustItem {
  id: string;
  label: string;
}

export interface NavLink {
  label: string;
  href: string;
  isAnchor?: boolean;
}
