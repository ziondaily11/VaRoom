import React from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, ShieldCheck, Lock } from 'lucide-react';
import { Navbar } from './Navbar';

interface HeroSectionProps {
  isAuthOpen: boolean;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onOpenSignup: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ isAuthOpen, onOpenAuth, onCloseAuth, onOpenSignup, onTryElie }) => {
  return (
    <>
    <section className="hero-section relative min-h-[100dvh] w-full max-w-full overflow-hidden box-border flex flex-col justify-between snap-page z-10 bg-transparent">
      {!isAuthOpen && (
        <Navbar
          isAuthOpen={isAuthOpen}
          onOpenAuth={onOpenAuth}
          onCloseAuth={onCloseAuth}
          onOpenSignup={onOpenSignup}
          onTryElie={onTryElie}
        />
      )}

      {/* Hero editorial content */}
      {!isAuthOpen && (
        <div className="hero-animated-content relative z-30 mt-auto w-full max-w-full box-border px-[clamp(20px,4.2vw,72px)] pb-[clamp(28px,5vh,48px)] pt-8 sm:pt-10 flex flex-col items-start justify-end text-left">
          <div className="w-full max-w-[580px] flex flex-col items-start text-left max-[639px]:items-center max-[639px]:text-center">
            <h1 className="hero-headline m-0 max-w-full font-serif font-semibold text-[clamp(34px,10vw,42px)] sm:text-[clamp(38px,4vw,60px)] text-[#171717] tracking-[-0.035em] leading-[1.02] max-[639px]:max-w-[360px] max-[639px]:text-[clamp(30px,8.8vw,36px)] max-[639px]:leading-[1.04]">
              Spaces for the<br className="hidden sm:block" /> way you live.
            </h1>

            <p className="hero-subtitle m-0 mt-5 max-w-[520px] text-[15px] sm:text-lg text-white font-normal leading-[1.45] [text-shadow:0_1px_12px_rgba(0,0,0,0.28)] max-[639px]:mt-3.5 max-[639px]:max-w-[340px] max-[639px]:text-[15px] max-[639px]:text-[#292929] max-[639px]:[text-shadow:none]">
              From stays and workspaces to event venues and property, discover spaces that fit your life across Kenya.
            </p>

            <div className="hero-cta mt-6 flex items-center justify-start max-[639px]:mt-5 max-[639px]:justify-center">
              <Link
                href="/marketplace"
                className="landing-cta landing-cta-primary landing-cta-large inline-flex items-center gap-2.5 px-6 font-semibold text-[15px] no-underline max-[639px]:h-12 max-[639px]:w-[200px] max-[639px]:rounded-[4px]"
              >
                <span>Explore VaRoom</span>
                <ArrowRight size={17} className="hero-cta-arrow" />
              </Link>
            </div>

            <div
              className="mt-10 sm:mt-11 flex max-w-full flex-wrap items-center justify-start gap-x-7 gap-y-3 text-[13px] sm:text-sm font-medium text-white/95 select-none max-[639px]:mt-6 max-[639px]:justify-center max-[639px]:gap-x-5 max-[639px]:gap-y-3"
              aria-label="VaRoom trust highlights"
            >
              <div className="hero-trust-location inline-flex items-center gap-1.5">
                <MapPin size={15} className="text-white" />
                <span>GPS verified locations</span>
              </div>

              <div className="hero-trust-hosts inline-flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-white" />
                <span>Trusted hosts</span>
              </div>

              <div className="hero-trust-bookings inline-flex items-center gap-1.5">
                <Lock size={14} className="text-white" />
                <span>Secure booking</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {isAuthOpen && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-1/2 items-end px-7 pb-[12vh] sm:px-10 md:flex lg:px-14">
          <div className="login-visual-message max-w-sm">
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.03em] text-[#221d19] lg:text-5xl">
              Welcome back!
            </h1>
            <p className="mt-2 text-base font-medium tracking-[0.02em] text-[#342e2a]">
              <span className="login-tagline-typing">Find. → Book. → This.</span>
            </p>
          </div>
        </div>
      )}
    </section>
    <style jsx>{`
      .login-tagline-typing {
        display: inline-block;
        width: 0;
        overflow: hidden;
        border-right: 1px solid rgba(52, 46, 42, 0.65);
        white-space: nowrap;
        vertical-align: bottom;
        animation:
          login-tagline-type 5s steps(21, end) infinite,
          login-tagline-caret 0.8s step-end infinite;
      }

      @keyframes login-tagline-type {
        0% {
          width: 0;
        }
        72%, 100% {
          width: 21ch;
        }
      }

      @keyframes login-tagline-caret {
        50% {
          border-color: transparent;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .login-tagline-typing {
          animation: none;
          width: auto;
          border-right: 0;
        }
      }
    `}</style>
    </>
  );
};
