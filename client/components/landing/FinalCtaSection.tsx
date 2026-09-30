import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const FinalCtaSection: React.FC = () => {
  return (
    <section className="relative w-full py-24 md:py-32 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#181513] text-[#faf8f5] overflow-hidden">
      {/* Subtle warm glow background accent */}
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#bd2337]/10 blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-[#c2a27a]/10 blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/20 bg-white/5 text-xs font-semibold tracking-[0.2em] uppercase text-white/80 mb-6 select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
          <span>Start Your Journey</span>
        </div>

        {/* Headline */}
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white tracking-tight leading-[1.05] mb-5">
          Find somewhere worth going.
        </h2>

        {/* Supporting Copy */}
        <p className="text-lg sm:text-xl text-[#d4ccc4] font-normal leading-relaxed max-w-xl mb-10">
          Discover your next place with VaRoom.
        </p>

        {/* Dual CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/marketplace"
            className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-[#bd2337] hover:bg-[#a51e30] text-white font-medium text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md"
          >
            <span>Explore VaRoom</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/signup-host"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/30 hover:border-white text-white font-medium text-base transition-colors"
          >
            <span>Become a Host</span>
          </Link>
        </div>
      </div>
    </section>
  );
};
