import React from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, CheckCircle, Wifi, Car, Utensils, Tv, Sparkles } from 'lucide-react';
import { Listing } from './types';

interface PlacesSectionProps {
  listings: Listing[];
}

export const PlacesSection: React.FC<PlacesSectionProps> = ({ listings }) => {
  // Always display exactly up to 6 real listings from the database
  const visibleListings = (listings || []).slice(0, 6);

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
      className="relative z-20 w-full max-w-full min-h-screen sm:h-screen box-border flex flex-col justify-center items-center px-4 sm:px-8 md:px-12 lg:px-16 snap-page bg-[#f7f3ec]/85 backdrop-blur-[2px] py-6 sm:py-0 overflow-y-auto sm:overflow-hidden places-animated-content"
    >
      <div className="w-full max-w-6xl mx-auto flex flex-col justify-center">
        {/* Header: title & link (moves naturally directly into the listing grid) */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-3 sm:mb-4 gap-2">
          <div>
            <h2 className="font-sans font-bold text-2xl sm:text-3xl text-[#181513] tracking-tight">
              Places worth discovering.
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-[#594f47] max-w-md">
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

        {/* Dense Six Listing Cards Grid (Image-dominant subject, compact caption) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-3.5">
          {visibleListings.map((listing) => {
            const href = `/booking?listing=${listing.id}`;
            const hasPrice = listing.price != null && !isNaN(Number(listing.price));
            const formattedPrice = hasPrice ? `KSh ${Number(listing.price).toLocaleString()}` : null;
            const priceUnit = listing.priceUnit ? ` / ${listing.priceUnit}` : '';
            const locationClean = listing.location && !/location to be added|not available/i.test(listing.location)
              ? listing.location.trim()
              : 'Kenya';
            const displayAmenities = (listing.amenities || []).filter(Boolean).slice(0, 3);
            const displayType = listing.sizeOrType || (listing.category ? `${listing.category.charAt(0).toUpperCase() + listing.category.slice(1)} space` : 'Space');

            return (
              <Link
                key={listing.id}
                href={href}
                className="group flex flex-col bg-[#fffefc]/90 rounded-xl sm:rounded-2xl overflow-hidden border border-[#2d2724]/10 hover:border-[#181513]/30 transition-all duration-200 hover:shadow-md no-underline"
                style={{ textDecoration: 'none' }}
              >
                {/* 1. Dominant Card Image (Occupies 60–70% of total card height) */}
                <div className="relative w-full h-36 sm:h-38 lg:h-40 bg-[#eae2d6] overflow-hidden">
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
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#181513]/70 backdrop-blur-xs text-[#faf8f5] text-[10px] font-semibold uppercase tracking-wider">
                      {listing.category}
                    </div>
                  )}

                  {/* Verified Indicator Badge */}
                  {listing.verified && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#fffefc]/90 backdrop-blur-xs text-[#181513] text-[10px] font-medium inline-flex items-center gap-1 shadow-xs">
                      <CheckCircle size={10} className="text-[#bd2337]" />
                      <span>Verified</span>
                    </div>
                  )}
                </div>

                {/* 2. Compact Caption: Location -> Title -> Type/Description -> Amenities + Price */}
                <div className="px-2.5 sm:px-3 pt-2 pb-2 sm:pb-2.5 flex flex-col justify-between">
                  <div>
                    {/* Location */}
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[#786e64] leading-none mb-0.5 truncate max-w-full">
                      <MapPin size={11} className="text-[#bd2337] shrink-0" />
                      <span className="truncate">{locationClean}</span>
                    </div>

                    {/* Listing Title */}
                    <h3 className="font-sans font-semibold text-xs sm:text-sm text-[#181513] line-clamp-1 group-hover:text-[#bd2337] transition-colors leading-tight">
                      {listing.title || 'VaRoom Space'}
                    </h3>

                    {/* Short Description / Type */}
                    <p className="text-[10px] sm:text-[11px] text-[#594f47] line-clamp-1 leading-tight mt-0.5">
                      {displayType}
                    </p>
                  </div>

                  {/* Amenity Icons + Real Price */}
                  <div className="mt-1.5 pt-1.5 border-t border-[#2d2724]/8 flex items-center justify-between gap-1">
                    {/* Amenities chips */}
                    <div className="flex items-center gap-1 min-h-[16px]">
                      {displayAmenities.map((amenity, idx) => (
                        <span
                          key={idx}
                          className="w-4 h-4 rounded-full bg-[#faf7f2] border border-[#2d2724]/10 flex items-center justify-center shrink-0"
                          title={amenity}
                        >
                          {getAmenityIcon(amenity)}
                        </span>
                      ))}
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      {formattedPrice ? (
                        <div className="inline-flex items-baseline gap-0.5">
                          <span className="font-sans font-bold text-xs sm:text-sm text-[#181513]">
                            {formattedPrice}
                          </span>
                          <span className="text-[10px] text-[#786e64] font-medium">{priceUnit}</span>
                        </div>
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

        {/* Fully visible and intentionally positioned Marketplace CTA */}
        <div className="mt-3 sm:mt-4 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-5 py-2 sm:px-6 sm:py-2.5 rounded-full bg-[#181513] hover:bg-black text-[#faf8f5] font-medium text-xs sm:text-sm transition-all duration-200 hover:scale-[1.02] shadow-xs no-underline"
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
