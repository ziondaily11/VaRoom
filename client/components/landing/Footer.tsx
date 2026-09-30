import React from 'react';
import Link from 'next/link';

interface FooterProps {
  onTryElie: (e: React.MouseEvent) => void;
}

export const Footer: React.FC<FooterProps> = ({ onTryElie }) => {
  return (
    <footer className="relative w-full py-16 md:py-20 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#120f0e] text-[#faf8f5] border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-14 border-b border-white/10">
          {/* Brand Column */}
          <div className="md:col-span-4">
            <Link href="/" className="inline-flex items-baseline text-2xl md:text-3xl font-serif font-bold tracking-tight mb-3">
              <span className="text-[#bd2337]">Va</span>
              <span className="text-white">Room</span>
            </Link>
            <p className="text-sm text-[#b0a79e] leading-relaxed max-w-sm">
              Kenya's marketplace for verified stays, spaces, and authentic hosting.
            </p>
            <div className="mt-4 text-xs font-semibold tracking-wider text-[#bd2337] uppercase">
              Real places. Real people. Real spaces.
            </div>
          </div>

          {/* Links Column 1: Discovery */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-4">
              Explore & Stays
            </h4>
            <ul className="space-y-2.5 text-sm text-[#d4ccc4]">
              <li>
                <Link href="/marketplace" className="hover:text-white transition-colors">
                  Discover
                </Link>
              </li>
              <li>
                <Link href="/marketplace" className="hover:text-white transition-colors">
                  Marketplace
                </Link>
              </li>
              <li>
                <a href="#client-section" className="hover:text-white transition-colors">
                  For Clients
                </a>
              </li>
              <li>
                <a href="/login" onClick={onTryElie} className="hover:text-white transition-colors inline-flex items-center gap-1.5">
                  <span>Elie AI Assistant</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
                </a>
              </li>
            </ul>
          </div>

          {/* Links Column 2: Hosts & Platform */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-4">
              Hosting & About
            </h4>
            <ul className="space-y-2.5 text-sm text-[#d4ccc4]">
              <li>
                <Link href="/signup-host" className="hover:text-white transition-colors">
                  For Hosts
                </Link>
              </li>
              <li>
                <a href="#why-us" className="hover:text-white transition-colors">
                  Why VaRoom
                </a>
              </li>
              <li>
                <Link href="/support" className="hover:text-white transition-colors">
                  Help & FAQs
                </Link>
              </li>
              <li>
                <Link href="/support" className="hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Links Column 3: Legal */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-4">
              Legal & Safety
            </h4>
            <ul className="space-y-2.5 text-sm text-[#d4ccc4]">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#877d73] gap-4">
          <p>© {new Date().getFullYear()} VaRoom Inc. All rights reserved.</p>
          <p>Nairobi, Kenya • Verified GPS Locations</p>
        </div>
      </div>
    </footer>
  );
};
