import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, CheckCircle, Wifi, Car, Utensils, Tv, Sparkles } from 'lucide-react';
import { Listing } from './types';

interface PlacesSectionProps {
  listings: Listing[];
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Spaces' },
  { id: 'airbnb', label: 'Stays & Airbnbs' },
  { id: 'hotel', label: 'Hotels' },
  { id: 'venue', label: 'Venues' },
  { id: 'property', label: 'Properties' },
];

export const PlacesSection: React.FC<PlacesSectionProps> = ({ listings }) => {
  const [activeCategory, setActiveCategory] = useState('all');

  // Filter listings by active category tab
  const filteredListings = listings.filter((listing) => {
    if (activeCategory === 'all') return true;
    return listing.category?.toLowerCase() === activeCategory.toLowerCase();
  });

  // Always display exactly up to 6 real listings from the database
  const visibleListings = filteredListings.slice(0, 6);

  const getAmenityIcon = (amenity: string) => {
    switch (amenity.toLowerCase()) {
      case 'wifi':
        return <Wifi size={11} className="text-[#594f47]" />;
      case 'parking':
        return <Car size={11} className="text-[#594f47]" />;
      case 'kitchen':
        return <Utensils size={11} className="text-[#594f47]" />;
      case 'tv':
        return <Tv size={11} className="text-[#594f47]" />;
      default:
        return <Sparkles size={11} className="text-[#594f47]" />;
    }
  };

  return (
    <section
      id="places-section"
      className="relative z-30 w-full max-w-full box-border -mt-16 sm:-mt-24 md:-mt-32 lg:-mt-40 pt-4 sm:pt-6 md:pt-8 pb-10 sm:pb-14 px-5 sm:px-8 md:px-12 lg:px-16 bg-gradient-to-b from-transparent via-[#f7f3ec]/85 to-[#f7f3ec]"
    >
      <div className="max-w-6xl mx-auto">
        {/* Compact Header: title & link */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-4 sm:mb-6 gap-3">
          <div>
            <h2 className="font-sans font-bold text-2xl sm:text-3xl text-[#181513] tracking-tight">
              Places worth discovering.
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#594f47] max-w-md">
              Explore stays, spaces and experiences available on VaRoom.
            </p>
          </div>

          <Link
            href="/marketplace"
            className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#181513] hover:text-[#bd2337] transition-colors no-underline shrink-0"
            style={{ textDecoration: 'none' }}
          >
            <span>Browse full marketplace</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Compact Category Filter Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-3 mb-5 sm:mb-6 no-scrollbar">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#181513] text-[#faf8f5] shadow-xs'
                    : 'bg-[#eae3d7]/70 text-[#4a4038] hover:bg-[#eae3d7] hover:text-[#181513]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Compact Six Listing Cards Grid (Fits in ~1 viewport) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5">
          {visibleListings.map((listing) => {
            const href = `/booking?listing=${listing.id}`;
            const hasPrice = listing.price != null && !isNaN(Number(listing.price));
            const formattedPrice = hasPrice ? `KSh ${Number(listing.price).toLocaleString()}` : null;
            const priceUnit = listing.priceUnit ? ` / ${listing.priceUnit}` : '';
            const locationClean = listing.location && !/location to be added|not available/i.test(listing.location)
              ? listing.location.trim()
              : null;
            const displayAmenities = (listing.amenities || []).filter(Boolean).slice(0, 3);

            return (
              <Link
                key={listing.id}
                href={href}
                className="group flex flex-col bg-[#fffefc]/90 rounded-xl sm:rounded-2xl overflow-hidden border border-[#2d2724]/10 hover:border-[#181513]/30 transition-all duration-200 hover:shadow-md no-underline"
                style={{ textDecoration: 'none' }}
              >
                {/* Compact Card Image */}
                <div className="relative w-full h-36 sm:h-40 bg-[#eae2d6] overflow-hidden">
                  {listing.photoUrl ? (
                    <img
                      src={listing.photoUrl}
                      alt={listing.title || 'VaRoom Space'}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-104 transition-transform duration-300 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#eae2d6] text-[#786e64] text-xs font-semibold uppercase">
                      {listing.category || 'Property'}
                    </div>
                  )}

                  {/* Category Pill Tag */}
                  {listing.category && (
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#181513]/70 backdrop-blur-xs text-[#faf8f5] text-[10px] font-semibold uppercase tracking-wider">
                      {listing.category}
                    </div>
                  )}

                  {/* Verified Indicator Badge */}
                  {listing.verified && (
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-[#fffefc]/90 backdrop-blur-xs text-[#181513] text-[10px] font-medium inline-flex items-center gap-1 shadow-xs">
                      <CheckCircle size={11} className="text-[#bd2337]" />
                      <span>Verified</span>
                    </div>
                  )}
                </div>

                {/* Compact Card Content */}
                <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Location (only if genuine value present) */}
                    {locationClean && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[#786e64] mb-1">
                        <MapPin size={11} className="text-[#bd2337] shrink-0" />
                        <span className="truncate">{locationClean}</span>
                      </div>
                    )}

                    {/* Title */}
                    <h3 className="font-sans font-semibold text-sm text-[#181513] line-clamp-1 group-hover:text-[#bd2337] transition-colors leading-snug">
                      {listing.title || 'VaRoom Space'}
                    </h3>

                    {/* Room / Property details (only if genuine value present) */}
                    {listing.sizeOrType && (
                      <p className="text-[11px] text-[#594f47] line-clamp-1 mt-0.5">
                        {listing.sizeOrType}
                      </p>
                    )}
                  </div>

                  {/* Compact Bottom Row: Amenities & Price */}
                  <div className="mt-3 pt-2.5 border-t border-[#2d2724]/8 flex items-center justify-between">
                    {/* Amenities chips (only if present) */}
                    <div className="flex items-center gap-1.5 min-h-[20px]">
                      {displayAmenities.map((amenity, idx) => (
                        <span
                          key={idx}
                          className="w-5 h-5 rounded-full bg-[#faf7f2] border border-[#2d2724]/10 flex items-center justify-center"
                          title={amenity}
                        >
                          {getAmenityIcon(amenity)}
                        </span>
                      ))}
                    </div>

                    {/* Real Price */}
                    <div className="text-right">
                      {formattedPrice ? (
                        <>
                          <span className="font-sans font-bold text-xs sm:text-sm text-[#181513]">
                            {formattedPrice}
                          </span>
                          <span className="text-[10px] text-[#786e64] font-medium">{priceUnit}</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-[#786e64] font-medium">Inquire</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Compact Marketplace CTA */}
        <div className="mt-8 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#181513] hover:bg-black text-[#faf8f5] font-medium text-xs sm:text-sm transition-all duration-200 hover:scale-[1.02] shadow-xs no-underline"
            style={{ textDecoration: 'none' }}
          >
            <span>Explore all stays & spaces across Kenya</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
};
