import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Navbar } from './Navbar';

interface HeroSectionProps {
  isAuthOpen: boolean;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onOpenSignup: () => void;
}

// One left-aligned editorial block on every screen size: eyebrow, headline,
// support line, then the CTA with a line of reassurance beside it.
export const HeroSection: React.FC<HeroSectionProps> = ({ isAuthOpen, onOpenAuth, onCloseAuth, onOpenSignup }) => (
  <section className="hero-section relative min-h-[100dvh] w-full max-w-full overflow-hidden box-border flex flex-col justify-between snap-page z-10 bg-transparent">
    {!isAuthOpen && (
      <>
        <Navbar
          isAuthOpen={isAuthOpen}
          onOpenAuth={onOpenAuth}
          onCloseAuth={onCloseAuth}
          onOpenSignup={onOpenSignup}
        />

        <div className="hero-animated-content relative z-30 mt-auto w-full max-w-full box-border px-[clamp(20px,4.2vw,72px)] pb-[clamp(36px,8vh,88px)] pt-8 flex flex-col items-start text-left">
          <p className="hero-eyebrow m-0 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
            Stays · Workspaces · Venues
          </p>

          <h1 className="hero-headline m-0 mt-4 max-w-[520px] font-serif font-semibold text-[clamp(30px,8vw,34px)] sm:text-[clamp(36px,3.6vw,54px)] text-white tracking-[-0.035em] leading-[1.03] [text-shadow:0_2px_24px_rgba(0,0,0,0.25)]">
            Every kind of space, <em className="font-normal italic">one</em> place to book&nbsp;it.
          </h1>

          <p className="hero-subtitle m-0 mt-4 sm:mt-5 max-w-[480px] text-[15px] sm:text-lg text-white/90 leading-[1.5] [text-shadow:0_1px_12px_rgba(0,0,0,0.3)]">
            Search, compare and book spaces across Kenya, with locations you can trust.
          </p>

          <div className="hero-cta mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/marketplace"
              className="landing-cta landing-cta-primary landing-cta-large inline-flex items-center gap-2.5 px-6 font-semibold text-[15px] no-underline"
            >
              <span>Find a space</span>
              <ArrowRight size={17} className="hero-cta-arrow" />
            </Link>
            <span className="hero-microcopy text-sm text-white/80">GPS-verified listings, trusted hosts.</span>
          </div>
        </div>
      </>
    )}
  </section>
);
