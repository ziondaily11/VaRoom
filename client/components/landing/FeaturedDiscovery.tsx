import React from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, Sparkles, CheckCircle2 } from 'lucide-react';
import { Listing } from './types';

interface FeaturedDiscoveryProps {
  featuredListing?: Listing;
  supportingListings?: Listing[];
}

export const FeaturedDiscovery: React.FC<FeaturedDiscoveryProps> = ({
  featuredListing,
  supportingListings = [],
}) => {
  if (!featuredListing && supportingListings.length === 0) return null;

  return (
    <section id="featured-discovery" className="relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#f4eee6] border-t border-[#eae2d6] snap-page">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="max-w-2xl mb-12">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3">
            <Sparkles size={14} />
            <span>Featured Discovery</span>
          </div>
          <h2 className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight">
            Spaces designed for inspiration.
          </h2>
          <p className="mt-3 text-base sm:text-lg text-[#594f47]">
            Handpicked environments across Kenya—from coastal oceanfront retreats to serene event grounds and skyline lofts.
          </p>
        </div>

        {/* Editorial Composition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Main Large Featured Property (7 cols on desktop) */}
          {featuredListing && (
            <div className="lg:col-span-7 flex flex-col">
              <Link
                href={`/booking?listing=${featuredListing.id}`}
                className="group relative flex-1 min-h-[440px] sm:min-h-[520px] rounded-3xl overflow-hidden bg-[#181513] flex flex-col justify-end p-6 sm:p-10 shadow-md hover:shadow-xl transition-all duration-300"
              >
                {/* Background Image */}
                {featuredListing.photoUrl ? (
                  <img
                    src={featuredListing.photoUrl}
                    alt={featuredListing.title}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                ) : null}

                {/* Ambient Overlay for text contrast */}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none"
                  aria-hidden="true"
                />

                {/* Content inside hero card */}
                <div className="relative z-10 text-white">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold uppercase tracking-wider">
                      Featured • {featuredListing.category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-white/80">
                      <MapPin size={13} className="text-[#bd2337]" />
                      <span>{featuredListing.location}</span>
                    </span>
                  </div>

                  <h3 className="font-sans font-bold text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight mb-2">
                    {featuredListing.title}
                  </h3>

                  {featuredListing.sizeOrType && (
                    <p className="text-sm text-white/80 max-w-lg mb-4 line-clamp-2">
                      {featuredListing.sizeOrType}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/20">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-white/60 block">Price</span>
                      <span className="text-xl sm:text-2xl font-bold font-sans text-white">
                        {featuredListing.price ? `KSh ${featuredListing.price.toLocaleString()}` : 'Inquire'}
                      </span>
                      <span className="text-xs text-white/70"> / {featuredListing.priceUnit}</span>
                    </div>

                    <div className="inline-flex items-center gap-2 bg-white text-[#181513] px-5 py-2.5 rounded-full font-medium text-xs sm:text-sm group-hover:bg-[#faf7f2] transition-colors">
                      <span>Explore this space</span>
                      <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Supporting Properties Column (5 cols on desktop) */}
          <div className="lg:col-span-5 flex flex-col gap-6 justify-between">
            {supportingListings.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                href={`/booking?listing=${item.id}`}
                className="group flex-1 flex flex-col sm:flex-row bg-[#fffefc] rounded-2xl overflow-hidden border border-[#eae2d6] hover:border-[#181513]/30 transition-all duration-300 hover:shadow-md"
              >
                {/* Image */}
                <div className="sm:w-5/12 h-48 sm:h-auto min-h-[180px] relative bg-[#eae2d6] overflow-hidden">
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-[#786e64]">
                      {item.category.toUpperCase()}
                    </div>
                  )}
                  <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#181513]/70 backdrop-blur-xs text-[10px] uppercase font-bold text-white tracking-wider">
                    {item.category}
                  </span>
                </div>

                {/* Details */}
                <div className="sm:w-7/12 p-5 flex flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1 text-xs text-[#786e64] mb-1">
                      <MapPin size={12} className="text-[#bd2337]" />
                      <span>{item.location}</span>
                    </div>
                    <h4 className="font-sans font-bold text-base text-[#181513] line-clamp-1 group-hover:text-[#bd2337] transition-colors">
                      {item.title}
                    </h4>
                    {item.sizeOrType && (
                      <p className="text-xs text-[#594f47] mt-1 line-clamp-1">
                        {item.sizeOrType}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#eae2d6] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-[#181513]">
                        {item.price ? `KSh ${item.price.toLocaleString()}` : 'Price on request'}
                      </span>
                      {item.price && (
                        <span className="text-[11px] text-[#786e64]"> / {item.priceUnit}</span>
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-full bg-[#faf7f2] flex items-center justify-center text-[#181513] group-hover:bg-[#181513] group-hover:text-white transition-colors">
                      <ArrowRight size={13} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {/* Editorial quote badge */}
            <div className="p-6 rounded-2xl bg-[#efe8de] border border-[#eae2d6] flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-[#bd2337]/10 flex items-center justify-center text-[#bd2337] shrink-0 mt-0.5">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-[#3a3530] font-medium leading-relaxed">
                  Every property on VaRoom is reviewed for location accuracy and verified hosting authenticity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
