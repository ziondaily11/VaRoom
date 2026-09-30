import React from 'react';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Discover',
      description: "Find spaces that fit what you're looking for—from short stay lofts to event grounds.",
    },
    {
      num: '02',
      title: 'Connect',
      description: 'Connect directly with the people behind the space with assistance from Elie AI.',
    },
    {
      num: '03',
      title: 'Book',
      description: 'Secure your stay or reservation through VaRoom with verified GPS authenticity.',
    },
  ];

  return (
    <section className="relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#f4eee6] border-t border-[#eae2d6]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>How VaRoom Works</span>
          </div>
          <h2 className="font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight">
            Seamless from discovery to stay.
          </h2>
        </div>

        {/* Minimal 3-Step Row (No huge cards, clean editorial minimalism) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14 pt-4 border-t border-[#2d2724]/15">
          {steps.map((step) => (
            <div key={step.num} className="flex flex-col">
              <span className="font-serif text-3xl sm:text-4xl text-[#bd2337] font-bold tracking-tight mb-4">
                {step.num}
              </span>
              <h3 className="font-sans font-bold text-xl sm:text-2xl text-[#181513] mb-3">
                {step.title}
              </h3>
              <p className="text-base text-[#594f47] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
