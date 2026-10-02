import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, LayoutDashboard, ShieldCheck, Zap } from 'lucide-react';

interface HostSectionProps {
  onOpenSignup: () => void;
  onTryElie: (e: React.MouseEvent) => void;
}

export const HostSection: React.FC<HostSectionProps> = ({ onOpenSignup, onTryElie }) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const headline = 'Your space belongs here.';

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduceMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduceMotionQuery?.matches || !('IntersectionObserver' in window)) {
      setHasEnteredViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="host-section"
      className={`host-section relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#faf7f2] border-t border-[#eae2d6] ${hasEnteredViewport ? 'is-entered' : ''}`}
    >
      <div className="max-w-7xl mx-auto">
        {/* Host Intro Header */}
        <div className="max-w-3xl mb-16">
          <div className="host-badge inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>For Hosts</span>
          </div>
          <h2
            aria-label={headline}
            className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight mb-5"
          >
            {Array.from(headline).map((character, index) => (
              <span
                aria-hidden="true"
                className="host-headline-character"
                key={`${character}-${index}`}
                style={{ animationDelay: `${140 + index * 36}ms` }}
              >
                {character}
              </span>
            ))}
          </h2>
          <p className="host-supporting-copy text-base sm:text-lg md:text-xl text-[#594f47] leading-relaxed">
            Put your property in front of guests and clients looking for their next stay or workspace. VaRoom gives you intuitive tools to manage conversations, bookings, pricing, and your hosting business—all from one connected platform.
          </p>
          <div className="host-cta mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onOpenSignup}
              className="landing-cta landing-cta-primary inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#181513] text-[#faf8f5] text-sm font-medium shadow-sm"
            >
              <span>Become a Host</span>
              <ArrowRight size={16} className="host-cta-arrow" />
            </button>
            <a
              href="/login"
              onClick={onTryElie}
              className="landing-cta-secondary inline-flex items-center gap-2 px-6 py-3.5 rounded-full border text-sm font-medium"
            >
              <Bot size={16} className="text-[#bd2337]" />
              <span>Meet Elie AI Co-Host</span>
            </a>
          </div>
        </div>

        {/* 4 Host Capabilities */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="host-card p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="host-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
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

          <div className="host-card p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="host-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
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

          <div className="host-card p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="host-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
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

          <div className="host-card p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex flex-col justify-between hover:border-[#181513]/30 transition-colors">
            <div>
              <div className="host-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] mb-5">
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
