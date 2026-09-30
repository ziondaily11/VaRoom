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
    <section className="relative min-h-svh w-full max-w-full overflow-hidden box-border flex flex-col justify-between">
      {/* Layer 0: Nairobi Illustration Background */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none select-none overflow-hidden">
        <img
          src="/assets/landing.jpg"
          alt="VaRoom Nairobi Skyline and Architecture Illustration"
          // @ts-expect-error fetchpriority is a modern HTML attribute
          fetchpriority="high"
          className="w-full h-full object-cover object-center"
        />
      </div>

      {/* Layer 10: Subtle Localized Readability Layer */}
      {/* Preserves Nairobi skyline & architecture while maintaining clear centered text readability */}
      <div
        className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-[#efe8de]/50 via-[#efe8de]/20 to-transparent"
        aria-hidden="true"
      />

      {/* Layer 20: Floating Minimal Navigation */}
      <Navbar onOpenRoleModal={onOpenRoleModal} onTryElie={onTryElie} />

      {/* Layer 30: Hero Editorial Content (Centered Horizontally and Vertically in Main Hero Area) */}
      <div className="relative z-30 w-full max-w-full box-border px-5 sm:px-8 md:px-12 py-10 sm:py-14 md:py-16 my-auto flex flex-col items-center justify-center text-center">
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center">
          {/* Large Editorial Headline - Eyebrow completely removed, no empty gap */}
          <h1 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-[4.75rem] text-[#181513] tracking-tight leading-[1.04] mb-4 sm:mb-5 text-center">
            Find your place.
          </h1>

          {/* Supporting Copy - Centered */}
          <p className="text-base sm:text-lg md:text-xl text-[#342e2a] font-normal leading-relaxed max-w-xl mx-auto mb-8 sm:mb-10 text-center">
            Discover stays, spaces and experiences from real people across Kenya.
          </p>

          {/* Primary CTA Button - Centered */}
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

          {/* Trust Indicators - Centered */}
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
        </div>
      </div>
    </section>
  );
};
