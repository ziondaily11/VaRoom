import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { originOf, useTriggerReveal } from '../../lib/landing/useTriggerReveal';
import type { RevealOrigin } from '../../lib/landing/useTriggerReveal';

interface NavbarProps {
  /** Each receives the control that was pressed, so the panel can open from it. */
  onOpenAuth: (trigger: HTMLElement) => void;
  onOpenSignup: (trigger: HTMLElement) => void;
}

// The menu shares the auth panel's dark surface; its buttons are light on dark.
const menuButton = 'flex h-12 w-full items-center justify-center rounded-[18px] px-4 text-sm font-semibold';

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, onOpenSignup }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuOrigin, setMenuOrigin] = useState<RevealOrigin>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuShown = useTriggerReveal(menuRef, mobileMenuOpen, menuOrigin);

  const closeMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleSignInClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    closeMenu();
    onOpenAuth(e.currentTarget);
  }, [closeMenu, onOpenAuth]);

  const handleGetStartedClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    closeMenu();
    onOpenSignup(e.currentTarget);
  }, [closeMenu, onOpenSignup]);

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
      if (window.innerWidth >= 768) closeMenu();
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
      className={`hero-header relative w-full max-w-full box-border px-5 sm:px-8 md:px-10 lg:px-14 py-5 md:py-7 flex items-center justify-between ${
        menuShown ? 'z-40' : 'z-20'
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
        <button
          type="button"
          onClick={(e) => onOpenAuth(e.currentTarget)}
          className="landing-cta-secondary text-sm font-medium px-5 no-underline whitespace-nowrap"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={(e) => onOpenSignup(e.currentTarget)}
          className="landing-cta landing-cta-primary text-sm font-semibold px-5 flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <span>Get started</span>
        </button>
      </div>

      {/* Mobile Controls */}
      <div className="hero-header-mobile flex md:hidden items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={(e) => onOpenSignup(e.currentTarget)}
          className="landing-cta landing-cta-primary landing-cta-compact text-sm font-semibold px-4 whitespace-nowrap"
        >
          Get started
        </button>
        <button
          type="button"
          onClick={(e) => {
            setMenuOrigin(originOf(e.currentTarget));
            setMobileMenuOpen(true);
          }}
          className="p-2 text-[#181513] rounded-full hover:bg-black/5 transition"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile menu: a full-screen panel that grows out of the menu button and folds back into it */}
      {menuShown && (
        <div
          ref={menuRef}
          id="mobile-navigation-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-[#1c1b1a] px-5 py-5 text-[#f5efe7] sm:px-8 md:hidden"
        >
          <div className="flex items-center justify-between">
            <span className="font-serif text-2xl font-bold tracking-tight">
              <span className="text-[#bd2337]">Va</span>Room
            </span>
            <button
              type="button"
              onClick={closeMenu}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[#f4efe9] transition-colors hover:bg-white/10"
              aria-label="Close navigation menu"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-auto flex flex-col gap-3 pb-4">
            <button type="button" onClick={handleSignInClick} className={`${menuButton} border border-white/20 bg-transparent text-[#f5efe7] hover:bg-white/5`}>
              Sign in
            </button>
            <button type="button" onClick={handleGetStartedClick} className={`${menuButton} border border-[#f5efe7] bg-[#f5efe7] text-[#151310] hover:bg-white`}>
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
