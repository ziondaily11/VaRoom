import React from 'react';
import Link from 'next/link';
import landing2 from '../../assets/landing2a.jpg';
import {
  LucideIcon,
  ArrowRight,
  MapPin,
  CheckCircle,
  Wifi,
  Car,
  Utensils,
  Tv,
  Zap,
  Flame,
  Briefcase,
  Coffee,
  Mountain,
  Dog,
  Wind,
  Waves,
  Dumbbell,
  Trees,
  Building,
  Camera,
  Bath,
  Shirt,
  ArrowUpDown,
  ShieldAlert,
} from 'lucide-react';
import { Listing } from './types';

interface PlacesSectionProps {
  listings: Listing[];
}

interface AmenityMeta {
  label: string;
  icon: LucideIcon;
}

// Canonical Varoom Amenity Definition & Icon Mapping
const AMENITY_MAP: Record<string, AmenityMeta> = {
  wifi: { label: 'Wi-Fi', icon: Wifi },
  hotel_high_speed_wifi: { label: 'High-speed Wi-Fi', icon: Wifi },
  parking: { label: 'Free Parking', icon: Car },
  hotel_onsite_parking: { label: 'On-site Parking', icon: Car },
  kitchen: { label: 'Kitchen', icon: Utensils },
  tv: { label: 'TV', icon: Tv },
  hotel_smart_tv: { label: 'Smart TV', icon: Tv },
  power: { label: '24/7 Power Backup', icon: Zap },
  heating: { label: 'Heating', icon: Flame },
  bonfire: { label: 'Bonfire Area', icon: Flame },
  bbq_grill: { label: 'BBQ Grill', icon: Flame },
  workspace: { label: 'Dedicated Workspace', icon: Briefcase },
  desk: { label: 'Desk & Chair', icon: Briefcase },
  breakfast: { label: 'Breakfast', icon: Coffee },
  hotel_complimentary_breakfast: { label: 'Breakfast Included', icon: Coffee },
  hotel_coffee_maker: { label: 'Coffee Maker', icon: Coffee },
  mountain: { label: 'Mountain View', icon: Mountain },
  pet: { label: 'Pet Friendly', icon: Dog },
  hotel_pet_friendly: { label: 'Pet Friendly', icon: Dog },
  air_conditioning: { label: 'Air Conditioning', icon: Wind },
  ac: { label: 'Air Conditioning', icon: Wind },
  hotel_climate_control: { label: 'Climate Control', icon: Wind },
  pool: { label: 'Swimming Pool', icon: Waves },
  hotel_swimming_pool: { label: 'Swimming Pool', icon: Waves },
  gym: { label: 'Fitness Center / Gym', icon: Dumbbell },
  hotel_fitness_center: { label: 'Fitness Center', icon: Dumbbell },
  garden: { label: 'Garden', icon: Trees },
  balcony: { label: 'Balcony', icon: Building },
  security_cameras: { label: 'Security Cameras', icon: Camera },
  camera: { label: 'Security Cameras', icon: Camera },
  hot_tub: { label: 'Hot Tub', icon: Bath },
  bath: { label: 'Bathtub', icon: Bath },
  towels_linens: { label: 'Towels & Linens', icon: Bath },
  washing_machine: { label: 'Washing Machine', icon: Shirt },
  elevator: { label: 'Elevator', icon: ArrowUpDown },
  smoke_alarm: { label: 'Smoke Alarm', icon: ShieldAlert },
};

function getAmenityMeta(key: string): AmenityMeta | null {
  if (!key || typeof key !== 'string') return null;
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return AMENITY_MAP[normalized] || null;
}

export const PlacesSection: React.FC<PlacesSectionProps> = ({ listings }) => {
  // Always display up to 6 real listings from the database
  const visibleListings = (listings || []).slice(0, 6);

  return (
    <section
      id="places-section"
      className="places-section relative z-20 w-full max-w-full min-h-screen box-border flex flex-col justify-center items-center px-4 sm:px-8 md:px-12 lg:px-16 snap-page py-8 sm:py-10 overflow-visible places-animated-content"
      style={{
        backgroundImage: `url("${landing2.src}")`,
        backgroundPosition: 'center top',
        backgroundSize: 'cover',
      }}
    >
      <div className="w-full max-w-6xl mx-auto flex flex-col justify-center">
        {/* Compact Header: title & link (moves naturally directly into listing grid) */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-2.5 sm:mb-3 gap-2">
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

        {/* 3-Column Listing Grid — Strict 70% Image / 30% Caption Proportion */}
        <div className="places-listing-grid relative -top-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-3.5">
          {visibleListings.map((listing) => {
            const href = `/booking?listing=${listing.id}`;
            const priceValue = listing.price == null ? null : Number(listing.price);
            const hasPrice = priceValue !== null && Number.isFinite(priceValue);
            const formattedPrice = hasPrice ? `KSh ${Number(listing.price).toLocaleString()}` : null;
            const priceUnit = listing.priceUnit?.trim() || 'night';
            const locationClean = listing.location && !/location to be added|not available/i.test(listing.location)
              ? listing.location.trim()
              : 'Kenya';
            const displayType = listing.sizeOrType || (listing.category ? `${listing.category.charAt(0).toUpperCase() + listing.category.slice(1)} space` : 'Space');

            // Strictly filter and map real stored amenities from the database
            const validAmenities = (listing.amenities || [])
              .map(getAmenityMeta)
              .filter((item): item is AmenityMeta => item !== null)
              .slice(0, 4);

            return (
              <Link
                key={listing.id}
                href={href}
                className="places-listing-card group flex flex-col bg-[#fffefc]/90 rounded-xl sm:rounded-2xl overflow-hidden border border-[#2d2724]/10 hover:border-[#181513]/30 transition-all duration-200 hover:shadow-md no-underline"
                style={{ textDecoration: 'none' }}
              >
                {/* ========================================================= */}
                {/* 1. LARGE LISTING IMAGE — Approx 70% of total card height  */}
                {/* ========================================================= */}
                <div className="relative w-full h-[172px] sm:h-[180px] lg:h-[184px] bg-[#eae2d6] overflow-hidden">
                  {listing.photoUrl ? (
                    <img
                      src={listing.photoUrl}
                      alt={listing.title || 'VaRoom Space'}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300 ease-out"
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

                {/* ========================================================= */}
                {/* 2. COMPACT INFORMATION CAPTION — Approx 30% of card height */}
                {/* ========================================================= */}
                <div className="relative px-2.5 sm:px-3 pt-1 pb-1 h-[74px] sm:h-[78px] box-border">
                  <div className="flex flex-col">
                    {/* Location */}
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[#786e64] leading-none mb-px truncate max-w-full">
                      <MapPin size={10} className="text-[#bd2337] shrink-0" />
                      <span className="truncate">{locationClean}</span>
                    </div>

                    {/* Listing Title */}
                    <h3 className="m-0 font-sans font-semibold text-xs sm:text-sm text-[#181513] truncate group-hover:text-[#bd2337] transition-colors leading-none">
                      {listing.title || 'VaRoom Space'}
                    </h3>

                    {/* Short Description / Type */}
                    <p className="m-0 text-[10px] sm:text-[11px] text-[#594f47] truncate leading-none">
                      {displayType}
                    </p>
                  </div>

                  {/* Real Amenities + Booking Action */}
                  <div className="absolute left-3 right-4 bottom-2 flex items-end justify-between gap-1 leading-none">
                    {validAmenities.length > 0 && (
                      <div className="flex items-center gap-1">
                        {validAmenities.map((amenity, idx) => {
                          const IconComp = amenity.icon;
                          return (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded-full bg-[#faf7f2] border border-[#2d2724]/10 flex items-center justify-center shrink-0"
                              title={amenity.label}
                              aria-label={amenity.label}
                            >
                              <IconComp size={10} className="text-[#594f47]" />
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                      {formattedPrice && (
                        <span className="text-[10px] font-medium leading-none text-[#786e64]">
                          {formattedPrice} / {priceUnit}
                        </span>
                      )}
                      <span className="-translate-y-0.5 inline-flex items-center rounded-full bg-[#bd2337] px-2 py-0.5 text-[11px] sm:text-xs font-semibold leading-none text-white transition-colors group-hover:bg-[#a91f31]">
                        Book
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Fully visible and intentionally positioned Marketplace CTA */}
        <div className="places-marketplace-cta mt-5 sm:mt-6 text-center">
          <Link
            href="/marketplace"
            className="group inline-flex items-center gap-2 px-5 py-2 sm:px-6 sm:py-2.5 rounded-full bg-[#181513] hover:bg-black text-[#faf8f5] font-medium text-xs sm:text-sm transition-colors duration-200 shadow-xs no-underline"
            style={{ textDecoration: 'none' }}
          >
            <span>Explore all stays & spaces across Kenya</span>
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
};
