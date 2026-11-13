import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  isAuthOpen: boolean;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onOpenSignup: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isAuthOpen, onOpenAuth, onCloseAuth, onOpenSignup }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(72);

  const closeMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleSignInClick = useCallback(() => {
    closeMenu();
    onOpenAuth();
  }, [closeMenu, onOpenAuth]);

  const handleCloseAuthClick = useCallback(() => {
    closeMenu();
    onCloseAuth();
  }, [closeMenu, onCloseAuth]);

  const handleGetStartedClick = useCallback(() => {
    closeMenu();
    onOpenSignup();
  }, [closeMenu, onOpenSignup]);

  // Track header height on mount and resize
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        if (height > 0) {
          setHeaderHeight(height);
        }
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  // Lock body scroll and listen for Escape key when mobile menu is open
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        closeMenu();
      } else if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        if (height > 0) {
          setHeaderHeight(height);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileMenuOpen, closeMenu]);

  return (
    <header
      ref={headerRef}
      className={`hero-header relative w-full max-w-full box-border px-5 sm:px-8 md:px-10 lg:px-14 py-5 md:py-7 flex items-center justify-between transition-colors ${
        mobileMenuOpen ? 'z-40 bg-[#faf6f0] md:bg-transparent' : 'z-20'
      }`}
    >
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

      {/* Right Desktop Actions - Fully visible with generous right spacing, shrink-0 */}
      <div className="hero-header-actions hidden md:flex items-center gap-3 shrink-0">
        {isAuthOpen ? (
          <button
            type="button"
            onClick={onCloseAuth}
            className="landing-cta-secondary text-sm font-medium px-5 no-underline whitespace-nowrap"
            aria-label="Close sign in"
          >
            Close
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="landing-cta-secondary text-sm font-medium px-5 no-underline whitespace-nowrap"
          >
            Sign in
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSignup}
          className="landing-cta landing-cta-primary text-sm font-semibold px-5 flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <span>Get started</span>
        </button>
      </div>

      {/* Mobile Controls */}
      <div className="hero-header-mobile flex md:hidden items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onOpenSignup}
          className="landing-cta landing-cta-primary landing-cta-compact text-sm font-semibold px-4 whitespace-nowrap"
        >
          Get started
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-[#181513] rounded-full hover:bg-black/5 transition"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu Overlay / Drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="absolute top-full left-0 w-full bg-[#faf6f0] border-t border-[#2d2724]/10 shadow-2xl md:hidden flex flex-col px-6 py-5 overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-top-2 duration-200 z-50"
          style={{
            height: `calc(100dvh - ${headerHeight}px)`,
            maxHeight: `calc(100dvh - ${headerHeight}px)`,
          }}
        >
          {/* Action CTAs */}
          <div className="pt-4 pb-6 flex flex-col gap-2.5 shrink-0">
            {isAuthOpen ? (
              <button
                type="button"
                onClick={handleCloseAuthClick}
                className="landing-cta-secondary w-full justify-center text-center text-sm font-medium px-4 no-underline"
                aria-label="Close sign in"
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignInClick}
                className="landing-cta-secondary w-full justify-center text-center text-sm font-medium px-4 no-underline"
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              onClick={handleGetStartedClick}
              className="landing-cta landing-cta-primary w-full justify-center text-center text-sm font-semibold px-4"
            >
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};