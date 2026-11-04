import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatListingSummary } from '../chatCache';
import { categoryLabel, formatPrice, sanitizeLocationText, type MarketplaceListing } from '../marketplace/marketplace';

// The listing a chat message asks about ("Chat" on a listing): shown as a
// card above the message, with what the Marketplace card shows.

/** The fields the card needs (as the chat API returns them). */
export const ENQUIRY_LISTING_SELECT = 'id,host_id,title,location_text,category,listing_photos(storage_path),'
  + 'listing_booking_details(price_amount,price_unit,listing_purpose,sale_price_amount,sale_price_mode)';

/** "KSh 5,000 / night", "From KSh 9,000,000", or "Price on request", as the Marketplace card. */
export function listingPriceText(listing: ChatListingSummary): string {
  const details = listing.listing_booking_details as MarketplaceListing['listing_booking_details'];
  const price = formatPrice(details, listing.category || null);
  if (!price) return 'Price on request';
  if (price.isSale) return `${price.isStarting ? 'From ' : ''}KSh ${price.amount.toLocaleString()}`;
  return `KSh ${price.amount.toLocaleString()} / ${price.unit}`;
}

/** "Kilimani · Stay": where it is and what kind of listing. */
export function listingSubtitle(listing: ChatListingSummary): string {
  return [sanitizeLocationText(listing.location_text), categoryLabel(listing.category)].filter(Boolean).join(' · ');
}

/** The listing to ask about, from the Marketplace's public listing data (null when unavailable). */
export async function loadEnquiryListing(client: SupabaseClient | null, listingId: string): Promise<ChatListingSummary | null> {
  if (!client) return null;
  const { data, error } = await client.from('listings').select(ENQUIRY_LISTING_SELECT).eq('id', listingId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as ChatListingSummary;
}
