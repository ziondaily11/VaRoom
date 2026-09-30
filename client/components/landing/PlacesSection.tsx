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

  const filteredListings = listings.filter((listing) => {
    if (activeCategory === 'all') return true;
    return listing.category.toLowerCase() === activeCategory.toLowerCase();
  });

  const getAmenityIcon = (amenity: string) => {
    switch (amenity.toLowerCase()) {
      case 'wifi':
        return <Wifi size={13} className="text-[#594f47]" />;
      case 'parking':
        return <Car size={13} className="text-[#594f47]" />;
      case 'kitchen':
        return <Utensils size={13} className="text-[#594f47]" />;
      case 'tv':
        return <Tv size={13} className="text-[#594f47]" />;
      default:
        return <Sparkles size={13} className="text-[#594f47]" />;
    }
  };

  return (
    <section id="places-section" className="relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#faf7f2] border-t border-[#eae2d6]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
              <span>Real VaRoom Places</span>
            </div>
            <h2 className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight">
              Places worth discovering.
            </h2>
            <p className="mt-3 text-base sm:text-lg text-[#594f47] max-w-xl">
              Explore stays, spaces and experiences available on VaRoom.
            </p>
          </div>

          {/* View Marketplace Button */}
          <Link
            href="/marketplace"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#181513] hover:text-[#bd2337] transition-colors py-1"
          >
            <span>Browse full marketplace</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-[#181513] text-[#faf8f5] shadow-xs'
                    : 'bg-[#efe9df] text-[#4a4038] hover:bg-[#e4ddcf] hover:text-[#181513]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Listing Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filteredListings.slice(0, 6).map((listing) => {
            const href = `/booking?listing=${listing.id}`;
            const displayPrice = listing.price ? `KSh ${listing.price.toLocaleString()}` : 'Inquire for price';
            const priceUnit = listing.price ? ` / ${listing.priceUnit}` : '';

            return (
              <Link
                key={listing.id}
                href={href}
                className="group flex flex-col bg-[#fffefc] rounded-2xl overflow-hidden border border-[#eae2d6] hover:border-[#181513]/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              >
                {/* Card Image */}
                <div className="relative w-full h-56 sm:h-64 bg-[#eae2d6] overflow-hidden">
                  {listing.photoUrl ? (
                    <img
                      src={listing.photoUrl}
                      alt={listing.title}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#eae2d6] text-[#786e64] text-sm font-medium">
                      <span>{listing.category.toUpperCase()}</span>
                    </div>
                  )}

                  {/* Category Pill Tag */}
                  <div className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full bg-[#181513]/75 backdrop-blur-xs text-[#faf8f5] text-[11px] font-semibold uppercase tracking-wider">
                    {listing.category}
                  </div>

                  {/* Verified Indicator Badge */}
                  {listing.verified && (
                    <div className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full bg-[#fffefc]/90 backdrop-blur-xs text-[#181513] text-xs font-medium inline-flex items-center gap-1 shadow-xs">
                      <CheckCircle size={13} className="text-[#bd2337]" />
                      <span>Verified</span>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Location */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#786e64] mb-1.5">
                      <MapPin size={13} className="text-[#bd2337]" />
                      <span>{listing.location || 'Kenya'}</span>
                    </div>

                    {/* Title */}
                    <h3 className="font-sans font-bold text-lg text-[#181513] line-clamp-1 group-hover:text-[#bd2337] transition-colors">
                      {listing.title}
                    </h3>

                    {/* Size or Type */}
                    {listing.sizeOrType && (
                      <p className="text-xs text-[#594f47] mt-1 line-clamp-1">
                        {listing.sizeOrType}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom: Amenities & Price */}
                  <div className="mt-5 pt-4 border-t border-[#eae2d6] flex items-center justify-between">
                    {/* Amenities list */}
                    <div className="flex items-center gap-2">
                      {(listing.amenities || []).slice(0, 3).map((amenity, idx) => (
                        <span
                          key={idx}
                          className="w-6 h-6 rounded-full bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center"
                          title={amenity}
                        >
                          {getAmenityIcon(amenity)}
                        </span>
                      ))}
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <span className="font-sans font-bold text-base text-[#181513]">
                        {displayPrice}
                      </span>
                      <span className="text-xs text-[#786e64] font-medium">{priceUnit}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Bottom CTA for Section */}
        <div className="mt-14 text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#181513] hover:bg-black text-[#faf8f5] font-medium text-sm transition-all duration-200 hover:scale-[1.02] shadow-sm"
          >
            <span>Explore all stays & spaces across Kenya</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
};
