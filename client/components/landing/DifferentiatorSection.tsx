import React, { useEffect, useRef, useState } from 'react';
import { MapPin, MessageSquare, ShieldCheck, Layers } from 'lucide-react';
import styles from './DifferentiatorSection.module.css';

export const DifferentiatorSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  const differentiators = [
    {
      icon: <MapPin size={22} className="text-[#bd2337]" />,
      title: 'GPS-Verified Authenticity',
      description: 'Know that the space you view is where it says it is. Every listing is tied to verified Kenyan GPS coordinates, preventing misrepresentation.',
    },
    {
      icon: <MessageSquare size={22} className="text-[#bd2337]" />,
      title: 'Conversational Elie AI',
      description: 'Search naturally, ask about amenities or house rules, and receive 24/7 assistance tailored specifically to VaRoom listings.',
    },
    {
      icon: <ShieldCheck size={22} className="text-[#bd2337]" />,
      title: 'Two-Way Trust & Reputation',
      description: 'Accountability works both ways. Transparent host profiles, verified guest records, and authentic reviews build confidence for every reservation.',
    },
    {
      icon: <Layers size={22} className="text-[#bd2337]" />,
      title: 'One Space for Every Need',
      description: 'From weekend Airbnb getaways and coastal beach hotels to Nairobi co-working studios, wedding venues, and residential rentals.',
    },
  ];

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || !('IntersectionObserver' in window)) {
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
      { threshold: 0.15 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="why-us"
      className={`relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#faf7f2] border-t border-[#eae2d6] ${styles.section} ${hasEnteredViewport ? styles.isEntered : ''}`}
    >
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl mb-16">
          <div className={`${styles.label} inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3`}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>Why VaRoom</span>
          </div>
          <h2 className={`${styles.headline} font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight mb-4`}>
            More than a marketplace.
          </h2>
          <p className={`${styles.supportingCopy} text-base sm:text-lg md:text-xl text-[#594f47] leading-relaxed`}>
            Discover places, connect with hosts and manage your experience in one connected space.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
          {differentiators.map((diff, index) => (
            <div
              key={index}
              className={`${styles.card} p-8 rounded-2xl bg-[#fffefc] border border-[#eae2d6] flex items-start gap-5 hover:border-[#181513]/30 transition-all duration-200`}
            >
              <div className={`${styles.cardIcon} w-12 h-12 rounded-xl bg-[#faf7f2] border border-[#eae2d6] flex items-center justify-center shrink-0`}>
                {diff.icon}
              </div>
              <div>
                <h3 className={`${styles.cardTitle} font-sans font-bold text-lg sm:text-xl text-[#181513] mb-2`}>
                  {diff.title}
                </h3>
                <p className={`${styles.cardDescription} text-sm sm:text-base text-[#594f47] leading-relaxed`}>
                  {diff.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
