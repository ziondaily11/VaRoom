import React from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, ShieldCheck, Lock } from 'lucide-react';
import { Navbar } from './Navbar';

interface HeroSectionProps {
  onOpenRoleModal: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenRoleModal, onTryElie }) => {
  return (
    <section className="relative min-h-svh w-full overflow-hidden flex flex-col justify-between">
      {/* Layer 0: Nairobi Illustration Background */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none select-none">
        <img
          src="/assets/landing.jpg"
          alt="VaRoom Nairobi Skyline and Architecture Illustration"
          // @ts-expect-error fetchpriority is a modern HTML attribute
          fetchpriority="high"
          className="w-full h-full object-cover object-center"
        />
      </div>

      {/* Layer 10: Subtle Localized Readability Layer */}
      {/* Desktop: Gentle gradient on the left negative space only, leaving the skyline and architecture visible on the right */}
      <div
        className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-[#efe8de]/40 via-transparent to-transparent md:bg-gradient-to-r md:from-[#efe8de]/85 md:via-[#efe8de]/50 md:to-transparent"
        aria-hidden="true"
      />

      {/* Layer 20: Floating Minimal Navigation */}
      <Navbar onOpenRoleModal={onOpenRoleModal} onTryElie={onTryElie} />

      {/* Layer 30: Hero Editorial Content (Positioned on the Left) */}
      <div className="relative z-30 w-full px-6 sm:px-10 md:px-16 lg:px-20 pt-6 pb-14 md:pb-20 lg:pb-24 my-auto">
        <div className="max-w-xl lg:max-w-2xl">
          {/* Eyebrow / Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#2d2724]/25 bg-[#faf6f0]/80 backdrop-blur-xs text-[#2d2724] text-[10px] sm:text-xs font-semibold tracking-[0.22em] uppercase select-none mb-4 md:mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>Real places. Real people. Real spaces.</span>
          </div>

          {/* Large Editorial Headline */}
          <h1 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] text-[#181513] tracking-tight leading-[1.02] mb-4 md:mb-5">
            Find your place.
          </h1>

          {/* Supporting Copy */}
          <p className="text-base sm:text-lg md:text-xl text-[#342e2a] font-normal leading-relaxed max-w-lg mb-8 md:mb-10">
            Discover stays, spaces and experiences from real people across Kenya.
          </p>

          {/* Primary CTA Button */}
          <div className="flex items-center gap-4 mb-10 md:mb-12">
            <Link
              href="/marketplace"
              className="group inline-flex items-center gap-3 bg-[#181513] hover:bg-black text-[#faf8f5] px-7 sm:px-8 py-3.5 sm:py-4 rounded-full font-medium text-sm sm:text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm"
            >
              <span>Explore VaRoom</span>
              <ArrowRight
                size={18}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* Trust Indicators (Understated, integrated, non-card presentation) */}
          <div
            className="flex flex-wrap items-center gap-y-2 gap-x-4 sm:gap-x-6 text-xs sm:text-sm font-medium text-[#2d2724]/90 select-none pt-2"
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
        </div>
      </div>
    </section>
  );
};
