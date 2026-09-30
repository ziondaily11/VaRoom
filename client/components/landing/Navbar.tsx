import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';

interface NavbarProps {
  onOpenRoleModal: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenRoleModal, onTryElie }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="relative z-20 w-full px-6 sm:px-10 md:px-16 lg:px-20 py-6 md:py-8 flex items-center justify-between">
      {/* Brand Wordmark */}
      <Link href="/" className="group inline-flex items-baseline text-2xl md:text-3xl font-serif font-bold tracking-tight select-none">
        <span className="text-[#bd2337] transition-transform group-hover:scale-105 inline-block">Va</span>
        <span className="text-[#181513]">Room</span>
      </Link>

      {/* Desktop Navigation Links */}
      <nav className="hidden md:flex items-center gap-8 lg:gap-11" aria-label="Main navigation">
        <a
          href="#host-section"
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          For Hosts
        </a>
        <a
          href="#client-section"
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          For Clients
        </a>
        <a
          href="/login"
          onClick={onTryElie}
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors inline-flex items-center gap-1.5 relative py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          Elie
          <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337] inline-block animate-pulse" />
        </a>
        <a
          href="#why-us"
          className="text-sm font-medium text-[#2d2724]/80 hover:text-[#181513] transition-colors relative py-1 after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[#181513] after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:origin-left"
        >
          Why VaRoom
        </a>
      </nav>

      {/* Right Desktop Actions */}
      <div className="hidden md:flex items-center gap-4">
        <Link
          href="/login"
          className="text-sm font-medium text-[#2d2724] hover:text-[#181513] px-4 py-2 rounded-full border border-[#2d2724]/20 hover:border-[#181513]/60 transition-all duration-200"
        >
          Sign in
        </Link>
        <button
          type="button"
          onClick={onOpenRoleModal}
          className="text-sm font-medium bg-[#181513] hover:bg-black text-[#faf8f5] px-5 py-2.5 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm flex items-center gap-1.5"
        >
          <span>Get started</span>
        </button>
      </div>

      {/* Mobile Controls */}
      <div className="flex md:hidden items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenRoleModal}
          className="text-xs font-medium bg-[#181513] text-[#faf8f5] px-3.5 py-2 rounded-full"
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
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between"
          >
            <span>For Hosts</span>
            <ArrowRight size={16} className="text-[#2d2724]/40" />
          </a>
          <a
            href="#client-section"
            onClick={() => setMobileMenuOpen(false)}
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between"
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
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between"
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
            className="text-base font-medium text-[#181513] py-2 border-b border-[#2d2724]/10 flex items-center justify-between"
          >
            <span>Why VaRoom</span>
            <ArrowRight size={16} className="text-[#2d2724]/40" />
          </a>
          <div className="pt-2 flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="text-center text-sm font-medium text-[#181513] py-2.5 rounded-full border border-[#2d2724]/20"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenRoleModal();
              }}
              className="text-center text-sm font-medium bg-[#181513] text-[#faf8f5] py-2.5 rounded-full"
            >
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
