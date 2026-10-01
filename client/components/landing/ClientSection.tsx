import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bot, MapPin, Star } from 'lucide-react';

interface ClientSectionProps {
  onTryElie: (e: React.MouseEvent) => void;
}

export const ClientSection: React.FC<ClientSectionProps> = ({ onTryElie }) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduceMotionQuery = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    if (reduceMotionQuery && reduceMotionQuery.matches) {
      setHasEnteredViewport(true);
      return;
    }

    if (hasEnteredViewport) return;

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
  }, [hasEnteredViewport]);

  return (
    <section
      ref={sectionRef}
      id="client-section"
      className={`client-section relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#f4eee6] border-t border-[#eae2d6] ${hasEnteredViewport ? 'is-entered' : ''}`}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Story & CTAs */}
          <div className="lg:col-span-6">
            <div className="client-badge inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
              <span>For Clients</span>
            </div>
            <h2 className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight mb-5 leading-[1.08]">
              <span className="client-title-line block">Find your space.</span>
              <span className="client-title-line client-title-line-2 block">Choose with confidence.</span>
            </h2>
            <p className="client-supporting-copy text-base sm:text-lg text-[#594f47] leading-relaxed mb-8">
              VaRoom makes it easier to discover, compare, and book real spaces across Kenya. Search naturally with Elie AI, explore verified properties, and learn more about the hosts behind the listings before you decide.
            </p>

            <div className="client-cta flex flex-wrap items-center gap-4">
              <Link
                href="/marketplace"
                className="landing-cta client-primary-cta inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#181513] text-[#faf8f5] text-sm font-medium shadow-sm"
              >
                <span>Explore the Marketplace</span>
                <ArrowRight size={16} className="client-cta-arrow" />
              </Link>
              <a
                href="/login"
                onClick={onTryElie}
                className="landing-cta client-elie-button inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-[#2d2724]/25 text-[#181513] text-sm font-medium"
              >
                <Bot size={16} className="client-elie-icon text-[#bd2337]" />
                <span>Try Elie</span>
              </a>
            </div>
          </div>

          {/* Right Column: 3 Pillars */}
          <div className="lg:col-span-6 space-y-5">
            <div className="client-card p-6 sm:p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex items-start gap-5">
              <div className="client-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-lg text-[#181513] mb-1">
                  AI-Powered Search with Elie
                </h3>
                <p className="text-sm text-[#594f47] leading-relaxed">
                  Describe what you need in natural language—location, budget, or vibe—and let Elie surface matching properties instantly.
                </p>
              </div>
            </div>

            <div className="client-card p-6 sm:p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex items-start gap-5">
              <div className="client-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0">
                <MapPin size={20} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-lg text-[#181513] mb-1">
                  GPS-Verified Authenticity
                </h3>
                <p className="text-sm text-[#594f47] leading-relaxed">
                  Every property is verified at its physical location. You know exactly where you are arriving without guesswork or surprises.
                </p>
              </div>
            </div>

            <div className="client-card p-6 sm:p-7 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex items-start gap-5">
              <div className="client-card-icon w-11 h-11 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center text-[#bd2337] shrink-0">
                <Star size={20} />
              </div>
              <div>
                <h3 className="font-sans font-bold text-lg text-[#181513] mb-1">
                  Transparent Hosts & Reviews
                </h3>
                <p className="text-sm text-[#594f47] leading-relaxed">
                  Read genuine guest reviews and explore detailed host profiles to make informed booking decisions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
