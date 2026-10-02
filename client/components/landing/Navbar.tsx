import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';

interface NavbarProps {
  isAuthOpen: boolean;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onOpenSignup: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isAuthOpen, onOpenAuth, onCloseAuth, onOpenSignup, onTryElie }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="hero-header relative z-20 w-full max-w-full box-border px-5 sm:px-8 md:px-10 lg:px-14 py-5 md:py-7 flex items-center justify-between">
      {/* Brand Wordmark - completely free of any underline or text decoration */}
      <Link
        href="/"
        className="hero-header-logo varoom-logo no-underline hover:no-underline focus:no-underline group inline-flex items-baseline text-2xl md:text-3xl font-serif font-bold tracking-tight select-none shrink-0"
        style={{ textDecoration: 'none', borderBottom: 'none' }}
      >
        <span
          className="text-[#bd2337] transition-transform group-hover:scale-105 inline-block"
          style={{ textDecoration: 'none' }}
        >
          Va
        </span>
        <span
          className="text-[#181513]"
          style={{ textDecoration: 'none' }}
        >
          Room
        </span>
      </Link>

      {/* Desktop Navigation Links */}
      <nav className="hero-header-nav hidden md:flex items-center gap-5 lg:gap-8 shrink" aria-label="Main navigation">
        <a
          href="#host-section"
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors relative py-1 no-underline after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          For Hosts
        </a>
        <a
          href="#client-section"
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors relative py-1 no-underline after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          For Clients
        </a>
        <a
          href="/login"
          onClick={onTryElie}
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors inline-flex items-center gap-1.5 relative py-1 no-underline after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          <span>Elie</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337] inline-block animate-pulse" />
        </a>
        <a
          href="#why-us"
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors relative py-1 no-underline after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          Why VaRoom
        </a>
      </nav>

      {/* Right Desktop Actions - Fully visible with generous right spacing, shrink-0 */}
      <div className="hero-header-actions hidden md:flex items-center gap-3 sm:gap-4 shrink-0">
        {isAuthOpen ? (
          <button
            type="button"
            onClick={onCloseAuth}
            className="landing-cta text-sm font-medium text-[#2d2724] px-4 py-2 rounded-full border border-[#2d2724]/20 no-underline whitespace-nowrap bg-white/40 backdrop-blur-sm"
            aria-label="Close sign in"
          >
            Close
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="landing-cta-secondary text-sm font-medium px-4 py-2 rounded-full border no-underline whitespace-nowrap"
          >
            Sign in
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSignup}
          className="landing-cta landing-cta-primary text-sm font-medium bg-[#181513] text-[#faf8f5] px-5 py-2.5 rounded-full shadow-sm flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <span>Get started</span>
        </button>
      </div>

      {/* Mobile Controls */}
      <div className="hero-header-mobile flex md:hidden items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onOpenSignup}
          className="landing-cta landing-cta-primary text-xs font-medium bg-[#181513] text-[#faf8f5] px-3.5 py-2 rounded-full whitespace-nowrap"
        >
          Get started
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-[#181513] rounded-full hover:bg-black/5 transition"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 w-full px-6 py-5 bg-[#faf6f0]/95 backdrop-blur-md border-b border-[#2d2724]/10 shadow-lg md:hidden flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <a
            href="#host-section"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between no-underline"
          >
            <span>For Hosts</span>
            <ArrowRight size={16} className="text-[#2d2724]/40" />
          </a>
          <a
            href="#client-section"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between no-underline"
          >
            <span>For Clients</span>
            <ArrowRight size={16} className="text-[#2d2724]/40" />
          </a>
          <a
            href="/login"
            onClick={(e) => {
              setMobileMenuOpen(false);
              onTryElie(e);
            }}
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between no-underline"
          >
            <span className="flex items-center gap-2">
              Elie AI Assistant
              <span className="w-2 h-2 rounded-full bg-[#bd2337] inline-block" />
            </span>
            <ArrowRight size={16} className="text-[#2d2724]/40" />
          </a>
          <a
            href="#why-us"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between no-underline"
          >
            <span>Why VaRoom</span>
            <ArrowRight size={16} className="text-[#2d2724]/40" />
          </a>
          <div className="pt-2 flex flex-col gap-2.5">
            {isAuthOpen ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onCloseAuth();
                }}
                className="landing-cta text-center text-sm font-medium text-[#181513] py-2.5 rounded-full border border-[#2d2724]/20 no-underline bg-white/40"
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="landing-cta-secondary text-center text-sm font-medium py-2.5 rounded-full border no-underline"
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSignup();
              }}
              className="landing-cta landing-cta-primary text-center text-sm font-medium bg-[#181513] text-[#faf8f5] py-2.5 rounded-full"
            >
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
