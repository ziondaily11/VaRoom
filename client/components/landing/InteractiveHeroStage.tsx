import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  MapPin,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Wifi,
  Car,
  Utensils,
  Tv,
  Sparkles,
} from 'lucide-react';
import { Navbar } from './Navbar';
import { Listing } from './types';

interface InteractiveHeroStageProps {
  listings: Listing[];
  onOpenRoleModal: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All Spaces' },
  { id: 'airbnb', label: 'Stays & Airbnbs' },
  { id: 'hotel', label: 'Hotels' },
  { id: 'venue', label: 'Venues' },
  { id: 'property', label: 'Properties' },
];

export const InteractiveHeroStage: React.FC<InteractiveHeroStageProps> = ({
  listings,
  onOpenRoleModal,
  onTryElie,
}) => {
  // activeView: 0 = Hero Viewport, 1 = Listing Grid Viewport
  const [activeView, setActiveView] = useState<0 | 1>(0);
  const activeViewRef = useRef<0 | 1>(0);
  const isAnimatingRef = useRef(false);
  const [activeCategory, setActiveCategory] = useState('all');

  // Keep ref synchronized
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  // Filter listings by active category tab
  const filteredListings = listings.filter((listing) => {
    if (activeCategory === 'all') return true;
    return listing.category?.toLowerCase() === activeCategory.toLowerCase();
  });
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

  const transitionTo = useCallback((nextView: 0 | 1) => {
    if (isAnimatingRef.current || nextView === activeViewRef.current) return;
    isAnimatingRef.current = true;
    activeViewRef.current = nextView;
    setActiveView(nextView);
    // Lock duration matches 700ms transition time
    setTimeout(() => {
      isAnimatingRef.current = false;
    }, 750);
  }, []);

  const proceedToPage3 = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const page3 = document.getElementById('featured-discovery');
    if (page3) {
      page3.scrollIntoView({ behavior: 'smooth' });
    }
    setTimeout(() => {
      isAnimatingRef.current = false;
    }, 800);
  }, []);

  // Stable Wheel listener: intercepts gestures at top of page without unbinding
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const isAtTop = window.scrollY <= 15;

      // When scrolled down into Page 3 or beyond, let standard document scroll operate
      if (!isAtTop) return;

      // In top state, manage the in-place swap
      if (isAnimatingRef.current) {
        e.preventDefault();
        return;
      }

      if (activeViewRef.current === 0) {
        if (e.deltaY > 10) {
          // Scroll down on Hero -> in-place swap to Listing Grid
          e.preventDefault();
          transitionTo(1);
        } else if (e.deltaY < 0) {
          // At top of Hero, prevent window bounce
          e.preventDefault();
        }
      } else if (activeViewRef.current === 1) {
        if (e.deltaY < -10) {
          // Scroll up on Listing Grid -> in-place swap back to Hero
          e.preventDefault();
          transitionTo(0);
        } else if (e.deltaY > 15) {
          // Further scroll down on Listing Grid -> smoothly proceed to Page 3
          e.preventDefault();
          proceedToPage3();
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [transitionTo, proceedToPage3]);

  // Touch gesture listener (swipe up / swipe down)
  useEffect(() => {
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const isAtTop = window.scrollY <= 15;
      if (!isAtTop || isAnimatingRef.current) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY - touchEndY;

      if (Math.abs(deltaY) < 30) return;

      if (activeViewRef.current === 0 && deltaY > 30) {
        // Swiped up (scroll down) -> swap to Listing Grid
        transitionTo(1);
      } else if (activeViewRef.current === 1 && deltaY < -30) {
        // Swiped down (scroll up) -> swap to Hero
        transitionTo(0);
      } else if (activeViewRef.current === 1 && deltaY > 40) {
        // Further swipe up on Listing Grid -> reveal Page 3
        proceedToPage3();
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [transitionTo, proceedToPage3]);

  // Keyboard navigation listener (Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isAtTop = window.scrollY <= 15;
      if (!isAtTop || isAnimatingRef.current) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        if (activeViewRef.current === 0) {
          e.preventDefault();
          transitionTo(1);
        } else if (activeViewRef.current === 1) {
          e.preventDefault();
          proceedToPage3();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (activeViewRef.current === 1) {
          e.preventDefault();
          transitionTo(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transitionTo, proceedToPage3]);

  // Motion styling spec: duration 0.7s, cubic-bezier(0.16, 1, 0.3, 1)
  const motionTransition = 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';

  return (
    <div
      id="hero-stage"
      className="relative w-full h-[100dvh] min-h-[620px] max-h-[1080px] overflow-hidden select-none bg-[#f7f3ec] box-border"
    >
      {/* Layer 0: Fixed Shared Nairobi Illustration Background */}
      <div className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
        <img
          src="/assets/landing.jpg"
          alt="VaRoom Nairobi Skyline and Architecture Illustration"
          // @ts-expect-error fetchpriority is a modern HTML attribute
          fetchpriority="high"
          className="w-full h-full object-cover object-top"
        />
        {/* Responsive contrast wash transitioning smoothly depending on active view */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transition: 'background-color 0.7s cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
            backgroundColor: activeView === 0 ? 'rgba(239, 232, 222, 0.35)' : 'rgba(247, 243, 236, 0.88)',
            backdropFilter: activeView === 0 ? 'blur(0px)' : 'blur(4px)',
            WebkitBackdropFilter: activeView === 0 ? 'blur(0px)' : 'blur(4px)',
          }}
          aria-hidden="true"
        />
      </div>

      {/* Layer 10: Fixed Header Navigation */}
      <div className="relative z-40 w-full">
        <Navbar onOpenRoleModal={onOpenRoleModal} onTryElie={onTryElie} />
      </div>

      {/* Layer 20: In-Place Content Stage Container */}
      <div className="relative z-30 w-full h-[calc(100dvh-72px)] flex items-center justify-center overflow-hidden">
        {/* ========================================================================= */}
        {/* VIEW 0: HERO VIEWPORT (Find your place. & CTA)                           */}
        {/* Opacity: 1 -> 0, Transform: translateY(0) -> translateY(-40px)           */}
        {/* ========================================================================= */}
        <div
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center px-5 sm:px-8 md:px-12 text-center"
          style={{
            transition: motionTransition,
            willChange: 'opacity, transform',
            opacity: activeView === 0 ? 1 : 0,
            transform: activeView === 0 ? 'translateY(0px)' : 'translateY(-40px)',
            pointerEvents: activeView === 0 ? 'auto' : 'none',
          }}
          aria-hidden={activeView !== 0}
        >
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center">
            {/* Main Editorial Headline */}
            <h1 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-[4.75rem] text-[#181513] tracking-tight leading-[1.04] mb-4 sm:mb-5 text-center">
              Find your place.
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg md:text-xl text-[#342e2a] font-normal leading-relaxed max-w-xl mx-auto mb-8 sm:mb-10 text-center">
              Discover stays, spaces and experiences from real people across Kenya.
            </p>

            {/* Primary CTA Button */}
            <div className="flex items-center justify-center mb-8 sm:mb-10">
              <Link
                href="/marketplace"
                className="group inline-flex items-center gap-3 bg-[#181513] hover:bg-black text-[#faf8f5] px-8 py-3.5 sm:py-4 rounded-full font-medium text-sm sm:text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm no-underline"
              >
                <span>Explore VaRoom</span>
                <ArrowRight
                  size={18}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
            </div>

            {/* Trust Indicators */}
            <div
              className="flex flex-wrap items-center justify-center gap-y-2.5 gap-x-4 sm:gap-x-6 text-xs sm:text-sm font-medium text-[#2d2724]/90 select-none"
              aria-label="VaRoom trust highlights"
            >
              <div className="inline-flex items-center gap-1.5">
                <MapPin size={15} className="text-[#bd2337]" />
                <span>GPS verified locations</span>
              </div>

              <span className="hidden sm:inline-block w-px h-3 bg-[#2d2724]/25" aria-hidden="true" />

              <div className="inline-flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-[#bd2337]" />
                <span>Trusted hosts</span>
              </div>

              <span className="hidden sm:inline-block w-px h-3 bg-[#2d2724]/25" aria-hidden="true" />

              <div className="inline-flex items-center gap-1.5">
                <Lock size={14} className="text-[#bd2337]" />
                <span>Secure bookings</span>
              </div>
            </div>

            {/* Interactive Scroll-Down Indicator Button */}
            <button
              type="button"
              onClick={() => transitionTo(1)}
              className="mt-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#181513]/5 hover:bg-[#181513]/10 text-xs font-semibold text-[#594f47] hover:text-[#181513] transition-all cursor-pointer group"
              aria-label="Scroll or click to discover spaces"
            >
              <span>Scroll to discover</span>
              <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: LISTING GRID VIEWPORT (Places worth discovering + 6 cards)        */}
        {/* Opacity: 0 -> 1, Transform: translateY(40px) -> translateY(0)             */}
        {/* ZERO layout height in document flow when inactive (absolute inset-0)      */}
        {/* ========================================================================= */}
        <div
          className="absolute inset-0 w-full h-full flex flex-col justify-center items-center px-4 sm:px-8 md:px-12 lg:px-16"
          style={{
            transition: motionTransition,
            willChange: 'opacity, transform',
            opacity: activeView === 1 ? 1 : 0,
            transform: activeView === 1 ? 'translateY(0px)' : 'translateY(40px)',
            pointerEvents: activeView === 1 ? 'auto' : 'none',
          }}
          aria-hidden={activeView !== 1}
        >
          <div className="w-full max-w-6xl mx-auto flex flex-col justify-center">
            {/* Header: title, return to intro, and link to marketplace */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-3 sm:mb-4 gap-2">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-sans font-bold text-2xl sm:text-3xl text-[#181513] tracking-tight">
                    Places worth discovering.
                  </h2>
                  <button
                    type="button"
                    onClick={() => transitionTo(0)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#786e64] hover:text-[#bd2337] transition-colors cursor-pointer bg-[#faf7f2]/80 px-2.5 py-1 rounded-full border border-[#2d2724]/10 shadow-xs"
                    title="Return to Hero"
                  >
                    <ChevronUp size={12} />
                    <span>Back to intro</span>
                  </button>
                </div>
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

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-2 mb-3 sm:mb-4 no-scrollbar">
              {CATEGORY_TABS.map((tab) => {
                const isActive = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCategory(tab.id)}
                    className={`px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
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

            {/* 6 Real Database Listing Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5 lg:gap-4">
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
                    className="group flex flex-col bg-[#fffefc]/95 rounded-xl sm:rounded-2xl overflow-hidden border border-[#2d2724]/10 hover:border-[#181513]/30 transition-all duration-200 hover:shadow-md no-underline"
                    style={{ textDecoration: 'none' }}
                  >
                    {/* Compact Card Image */}
                    <div className="relative w-full h-28 sm:h-32 lg:h-36 bg-[#eae2d6] overflow-hidden">
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
                    <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between">
                      <div>
                        {/* Location */}
                        {locationClean && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[#786e64] mb-0.5">
                            <MapPin size={11} className="text-[#bd2337] shrink-0" />
                            <span className="truncate">{locationClean}</span>
                          </div>
                        )}

                        {/* Title */}
                        <h3 className="font-sans font-semibold text-xs sm:text-sm text-[#181513] line-clamp-1 group-hover:text-[#bd2337] transition-colors leading-snug">
                          {listing.title || 'VaRoom Space'}
                        </h3>

                        {/* Room / Property details */}
                        {listing.sizeOrType && (
                          <p className="text-[10px] sm:text-[11px] text-[#594f47] line-clamp-1 mt-0.5">
                            {listing.sizeOrType}
                          </p>
                        )}
                      </div>

                      {/* Compact Bottom Row: Amenities & Price */}
                      <div className="mt-2.5 pt-2 border-t border-[#2d2724]/8 flex items-center justify-between">
                        {/* Amenities chips */}
                        <div className="flex items-center gap-1.5 min-h-[18px]">
                          {displayAmenities.map((amenity, idx) => (
                            <span
                              key={idx}
                              className="w-4.5 h-4.5 rounded-full bg-[#faf7f2] border border-[#2d2724]/10 flex items-center justify-center"
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

            {/* Bottom Actions: Marketplace link & Proceed down indicator */}
            <div className="mt-3 sm:mt-4 flex items-center justify-between">
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#181513] hover:text-[#bd2337] transition-colors no-underline"
                style={{ textDecoration: 'none' }}
              >
                <span>Explore all stays & spaces across Kenya</span>
                <ArrowRight size={13} />
              </Link>

              <button
                type="button"
                onClick={proceedToPage3}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#786e64] hover:text-[#181513] transition-colors cursor-pointer"
              >
                <span>Scroll for featured discovery</span>
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Minimal Side Viewport Indicators */}
        <div className="hidden md:flex absolute right-5 top-1/2 -translate-y-1/2 flex-col gap-2.5 z-40">
          <button
            type="button"
            onClick={() => transitionTo(0)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
              activeView === 0
                ? 'bg-[#181513] scale-125'
                : 'bg-[#181513]/30 hover:bg-[#181513]/60'
            }`}
            title="Hero View"
            aria-label="Switch to Hero View"
          />
          <button
            type="button"
            onClick={() => transitionTo(1)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
              activeView === 1
                ? 'bg-[#181513] scale-125'
                : 'bg-[#181513]/30 hover:bg-[#181513]/60'
            }`}
            title="Spaces View"
            aria-label="Switch to Spaces View"
          />
        </div>
      </div>
    </div>
  );
};
