import React from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, LayoutDashboard, ShieldCheck, Zap } from 'lucide-react';

interface HostSectionProps {
  onTryElie: (e: React.MouseEvent) => void;
}

export const HostSection: React.FC<HostSectionProps> = ({ onTryElie }) => {
  return (
    <section id="host-section" className="relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#faf7f2] border-t border-[#eae2d6]">
      <div className="max-w-7xl mx-auto">
        {/* Host Intro Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>For Hosts</span>
          </div>
          <h2 className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight mb-5">
            Your space belongs here.
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-[#594f47] leading-relaxed">
            Put your property in front of guests and clients looking for their next stay or workspace. VaRoom gives you intuitive tools to manage conversations, bookings, pricing, and your hosting business—all from one connected platform.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/signup-host"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#181513] hover:bg-black text-[#faf8f5] text-sm font-medium transition-all duration-200 hover:scale-[1.02] shadow-sm"
            >
              <span>Become a Host</span>
              <ArrowRight size={16} />
            </Link>
            <a
              href="/login"
              onClick={onTryElie}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-[#2d2724]/20 hover:border-[#181513] text-[#181513] text-sm font-medium transition-colors"
            >
              <Bot size={16} className="text-[#bd2337]" />
              <span>Meet Elie AI Co-Host</span>
            </a>
          </div>
        </div>

        {/* 4 Host Capabilities */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
                <Bot size={22} />
              </div>
              <h3 className="font-sans font-bold text-lg text-[#181513] mb-2">
                24/7 AI Co-Host
              </h3>
              <p className="text-sm text-[#594f47] leading-relaxed">
                Elie engages incoming guests, answers amenity questions, and provides booking assistance round the clock.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#eae2d6] text-xs font-semibold text-[#bd2337] uppercase tracking-wider">
              Powered by Elie
            </div>
          </div>

          <div className="p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
                <LayoutDashboard size={22} />
              </div>
              <h3 className="font-sans font-bold text-lg text-[#181513] mb-2">
                Unified Dashboard
              </h3>
              <p className="text-sm text-[#594f47] leading-relaxed">
                Manage listings, calendar availability, dynamic pricing, and guest conversations without app hopping.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#eae2d6] text-xs font-semibold text-[#786e64] uppercase tracking-wider">
              All-In-One Control
            </div>
          </div>

          <div className="p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
                <ShieldCheck size={22} />
              </div>
              <h3 className="font-sans font-bold text-lg text-[#181513] mb-2">
                Two-Way Trust
              </h3>
              <p className="text-sm text-[#594f47] leading-relaxed">
                Review verified guest profiles, ratings, and booking details before accepting inquiries or reservations.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#eae2d6] text-xs font-semibold text-[#786e64] uppercase tracking-wider">
              Verified Profiles
            </div>
          </div>

          <div className="p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
                <Zap size={22} />
              </div>
              <h3 className="font-sans font-bold text-lg text-[#181513] mb-2">
                Host on Your Terms
              </h3>
              <p className="text-sm text-[#594f47] leading-relaxed">
                List any space—short-stay apartments, hotel suites, studios, event grounds, or commercial properties.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#eae2d6] text-xs font-semibold text-[#786e64] uppercase tracking-wider">
              Flexible Spaces
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
