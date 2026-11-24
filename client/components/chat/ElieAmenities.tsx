import React from 'react';
import Svg from '../booking/Svg';
import { AMENITY_ICON, AMENITY_LABEL, HOTEL_AMENITY_ICON, HOTEL_AMENITY_LABEL, ICON_GENERIC_AMENITY } from '../../lib/booking/bookingIcons';
import { COMMERCIAL_AMENITY_LABELS } from '../../lib/booking/commercial';
import type { ElieListingResult } from '../../lib/chat/elie';

// A listing's amenities in Elie's answer, as the booking page shows them (same
// icons and labels; offices and shops use the generic tick), the ones the
// guest asked about first and highlighted.

export interface ElieAmenity { key: string; label: string; icon: string; asked: boolean }

const readable = (key: string) => { const words = key.replace(/_/g, ' '); return words.charAt(0).toUpperCase() + words.slice(1); };

export function elieAmenities(listing: ElieListingResult, highlight: string[]): ElieAmenity[] {
  const commercial = listing.category === 'office' || listing.category === 'shop';
  const hotel = listing.category === 'hotel';
  const items = (listing.amenities || []).map((key) => ({
    key,
    label: (commercial ? COMMERCIAL_AMENITY_LABELS[key] : (hotel && HOTEL_AMENITY_LABEL[key]) || AMENITY_LABEL[key]) || readable(key),
    icon: (!commercial && ((hotel && HOTEL_AMENITY_ICON[key]) || AMENITY_ICON[key])) || ICON_GENERIC_AMENITY,
    asked: highlight.includes(key),
  }));
  return [...items.filter((item) => item.asked), ...items.filter((item) => !item.asked)];
}

export default function ElieAmenities({ listing, highlight }: { listing: ElieListingResult; highlight: string[] }) {
  const items = elieAmenities(listing, highlight);
  const commercial = listing.category === 'office' || listing.category === 'shop';
  const hotel = listing.category === 'hotel';
  return (
    <div className="elie-amenities">
      <p className="elie-amenities-title">{commercial ? 'Amenities and building services' : hotel ? 'Room & hotel amenities' : 'Top amenities'}</p>
      {items.length ? (
        <div className="amenity-grid">
          {items.map((item) => (
            <div className={`amenity-item${item.asked ? ' is-asked' : ''}`} key={item.key}><Svg markup={item.icon} /><span>{item.label}</span></div>
          ))}
        </div>
      ) : <p className="elie-amenities-empty">No amenities have been listed for this {hotel ? 'hotel room' : 'space'} yet.</p>}
    </div>
  );
}
