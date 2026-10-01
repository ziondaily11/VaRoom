import React from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, ShieldCheck, Lock } from 'lucide-react';
import { Navbar } from './Navbar';

interface HeroSectionProps {
  isAuthOpen: boolean;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onOpenRoleModal: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ isAuthOpen, onOpenAuth, onCloseAuth, onOpenRoleModal, onTryElie }) => {
  const heroContentStyle: React.CSSProperties = {
    opacity: isAuthOpen ? 0 : 1,
    transform: isAuthOpen ? 'translateY(-12px)' : 'translateY(0)',
    transition: 'opacity 420ms ease-out, transform 420ms ease-out',
    pointerEvents: isAuthOpen ? 'none' : 'auto',
  };

  return (
    <section className="relative h-screen min-h-screen w-full max-w-full overflow-hidden box-border flex flex-col justify-between snap-page z-10 bg-transparent">
      {/* Layer 20: Floating Minimal Navigation */}
      <Navbar
        isAuthOpen={isAuthOpen}
        onOpenAuth={onOpenAuth}
        onCloseAuth={onCloseAuth}
        onOpenRoleModal={onOpenRoleModal}
        onTryElie={onTryElie}
      />

      {/* Layer 30: Hero Editorial Content (Centered Horizontally and Vertically in Main Hero Area) */}
      <div className="relative z-30 w-full max-w-full box-border px-5 sm:px-8 md:px-12 py-10 sm:py-14 md:py-16 my-auto flex flex-col items-center justify-center text-center hero-animated-content">
        {isAuthOpen ? (
          <div className="w-full max-w-[1200px] mx-auto flex items-center justify-between gap-8 text-left">
            <div className="max-w-[540px] rounded-[28px] border border-[#2d2724]/15 bg-[#f8f4ee]/40 p-6 shadow-[0_12px_40px_rgba(24,21,19,0.08)] backdrop-blur-sm transition-all duration-500" style={{ opacity: 1, transform: 'translateY(0)' }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#2d2724]/65">Explore VaRoom</div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {['Stays', 'Spaces', 'Experiences'].map((item) => (
                  <div key={item} className="rounded-2xl border border-[#2d2724]/10 bg-white/25 px-3 py-3 text-sm font-medium text-[#181513] shadow-sm">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#2d2724]/80">
                <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-[#bd2337]" />GPS verified locations</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#bd2337]" />Trusted hosts</span>
                <span className="inline-flex items-center gap-1.5"><Lock size={14} className="text-[#bd2337]" />Secure bookings</span>
              </div>
            </div>
            <div className="flex-1" />
          </div>
        ) : (
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center" style={heroContentStyle}>
            {/* Large Editorial Headline - Eyebrow completely removed, no empty gap */}
            <h1 className="hero-headline font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-[4.75rem] text-[#181513] tracking-tight leading-[1.04] mb-4 sm:mb-5 text-center">
              Find your place.
            </h1>

            {/* Supporting Copy - Centered */}
            <p className="hero-subtitle text-base sm:text-lg md:text-xl text-[#342e2a] font-normal leading-relaxed max-w-xl mx-auto mb-8 sm:mb-10 text-center">
              Discover stays, spaces and experiences from real people across Kenya.
            </p>

            {/* Primary CTA Button - Centered */}
            <div className="hero-cta flex items-center justify-center mb-8 sm:mb-10">
              <Link
                href="/marketplace"
                className="landing-cta inline-flex items-center gap-3 bg-[#181513] text-[#faf8f5] px-8 py-3.5 sm:py-4 rounded-full font-medium text-sm sm:text-base shadow-sm no-underline"
              >
                <span>Explore VaRoom</span>
                <ArrowRight
                  size={18}
                  className="hero-cta-arrow"
                />
              </Link>
            </div>

            {/* Trust Indicators - Centered */}
            <div
              className="flex flex-wrap items-center justify-center gap-y-2.5 gap-x-4 sm:gap-x-6 text-xs sm:text-sm font-medium text-[#2d2724]/90 select-none"
              aria-label="VaRoom trust highlights"
            >
              <div className="hero-trust-location inline-flex items-center gap-1.5">
                <MapPin size={15} className="text-[#bd2337]" />
                <span>GPS verified locations</span>
              </div>

              <span className="hero-trust-divider hidden sm:inline-block w-px h-3 bg-[#2d2724]/25" aria-hidden="true" />

              <div className="hero-trust-hosts inline-flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-[#bd2337]" />
                <span>Trusted hosts</span>
              </div>

              <span className="hero-trust-divider hidden sm:inline-block w-px h-3 bg-[#2d2724]/25" aria-hidden="true" />

              <div className="hero-trust-bookings inline-flex items-center gap-1.5">
                <Lock size={14} className="text-[#bd2337]" />
                <span>Secure bookings</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
