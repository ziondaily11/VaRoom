import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { originOf, useTriggerReveal } from '../../lib/landing/useTriggerReveal';
import type { RevealOrigin } from '../../lib/landing/useTriggerReveal';
import { jumpToSection, type LandingSection } from '../../lib/landing/sections';

interface NavbarProps {
  /** Each receives the control that was pressed, so the panel can open from it. */
  onOpenAuth: (trigger: HTMLElement) => void;
  onOpenSignup: (trigger: HTMLElement) => void;
  /** The pages below the hero that the links jump to. */
  sections: LandingSection[];
}

// The menu shares the auth panel's dark surface; its buttons are light on dark.
const menuButton = 'flex h-12 w-full items-center justify-center rounded-[18px] px-4 text-sm font-semibold';

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, onOpenSignup, sections }) => {
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

  // A link jumps to its page in place (no reload). From the menu, the menu
  // closes first; the jump starts a frame later, once the page can scroll again.
  const handleSectionClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, id: string, fromMenu: boolean) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!document.getElementById(id)) return;
    event.preventDefault();
    if (!fromMenu) { jumpToSection(id); return; }
    closeMenu();
    window.requestAnimationFrame(() => { jumpToSection(id); });
  }, [closeMenu]);

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
      className={`hero-header relative w-full max-w-full box-border px-[clamp(12px,2.2vw,32px)] pt-3 md:pt-4 ${
        menuShown ? 'z-40' : 'z-20'
      }`}
    >
      {/* A floating frosted bar in the search's style. The phone menu stays
          outside it: its blur would otherwise hold the full-screen menu inside the bar. */}
      <div className="hero-header-bar relative flex items-center justify-between rounded-full border border-white/15 bg-[rgba(14,15,20,0.5)] py-1.5 pl-5 pr-1.5 shadow-[0_18px_44px_-26px_rgba(0,0,0,0.85)] backdrop-blur-md md:py-2 md:pl-6 md:pr-2">
      {/* Brand Wordmark - completely free of any underline or text decoration */}
      <Link
        href="/"
        className="hero-header-logo varoom-logo no-underline hover:no-underline focus:no-underline group inline-flex items-baseline text-xl md:text-2xl font-serif font-bold tracking-tight select-none shrink-0"
        style={{ textDecoration: 'none', borderBottom: 'none' }}
      >
        <span
          className="text-[#bd2337] transition-transform group-hover:scale-105 inline-block"
          style={{ textDecoration: 'none' }}
        >
          Va
        </span>
        <span
          className="text-[#f5efe7]"
          style={{ textDecoration: 'none' }}
        >
          Room
        </span>
      </Link>

      {/* Links to the pages below (desktop and tablets); phones have them in the menu. */}
      {sections.length > 0 && (
        <nav className="hero-header-nav hidden md:flex" aria-label="On this page">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="hero-nav-link" onClick={(event) => handleSectionClick(event, section.id, false)}>
              {section.label}
            </a>
          ))}
        </nav>
      )}

      {/* Right Desktop Actions - Fully visible with generous right spacing, shrink-0 */}
      <div className="hero-header-actions hidden md:flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={(e) => onOpenAuth(e.currentTarget)}
          className="landing-cta-secondary landing-cta-compact text-[13px] font-medium px-4 no-underline whitespace-nowrap"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={(e) => onOpenSignup(e.currentTarget)}
          className="landing-cta landing-cta-primary landing-cta-compact text-[13px] font-semibold px-4 flex items-center gap-1.5 whitespace-nowrap shrink-0"
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
          // Preflight is off: without its own background the browser paints a light
          // button behind the light icon, which then shows only on hover.
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 p-0 text-[#f5efe7] transition-[background-color,transform] duration-150 ease-out hover:bg-white/10 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
        >
          <Menu size={20} />
        </button>
      </div>
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
          <div data-reveal-content className="flex items-center justify-between">
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

          {sections.length > 0 && (
            <nav data-reveal-content className="mt-10 flex flex-col" aria-label="On this page">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={(event) => handleSectionClick(event, section.id, true)}
                  className="menu-nav-link flex items-center justify-between border-b border-white/10 py-4 font-serif text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-[#f5efe7] no-underline"
                >
                  {section.label}
                  <ArrowRight size={20} aria-hidden="true" className="text-white/50" />
                </a>
              ))}
            </nav>
          )}

          <div data-reveal-content className="mt-auto flex flex-col gap-3 pb-4">
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
