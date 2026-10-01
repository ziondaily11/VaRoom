import React, { useEffect, useRef, useState } from 'react';
import styles from './HowItWorksSection.module.css';

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

export const HowItWorksSection: React.FC = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [activeNumbers, setActiveNumbers] = useState([false, false, false]);
  const [revealedSteps, setRevealedSteps] = useState([false, false, false]);
  const [numberValues, setNumberValues] = useState(['01', '02', '03']);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const showFinalState = () => {
      setNumberValues(steps.map((step) => step.num));
      setActiveNumbers([true, true, true]);
      setRevealedSteps([true, true, true]);
      setHasEnteredViewport(true);
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || !('IntersectionObserver' in window)) {
      showFinalState();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNumberValues(['0', '0', '0']);
          setShouldAnimate(true);
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasEnteredViewport || !shouldAnimate) return;

    const timers: number[] = [];
    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };
    let startAt = 1080;

    steps.forEach((step, stepIndex) => {
      const transitions = [
        ...Array.from({ length: stepIndex + 1 }, (_, index) => String(index + 1)),
        step.num,
      ];

      schedule(() => {
        setActiveNumbers((current) => current.map((active, index) => index === stepIndex || active));
        setNumberValues((current) => current.map((value, index) => index === stepIndex ? '0' : value));

        transitions.forEach((value, transitionIndex) => {
          const transitionDelay = transitionIndex * 120;
          schedule(() => {
            setNumberValues((current) => current.map((currentValue, index) => (
              index === stepIndex ? value : currentValue
            )));
            if (transitionIndex === transitions.length - 1) {
              setRevealedSteps((current) => current.map((revealed, index) => index === stepIndex || revealed));
            }
          }, transitionDelay);
        });
      }, startAt);

      startAt += (transitions.length - 1) * 120 + 600;
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hasEnteredViewport, shouldAnimate]);

  return (
    <section
      ref={sectionRef}
      className={`relative w-full py-20 md:py-28 px-6 sm:px-10 md:px-16 lg:px-20 bg-[#f4eee6] border-t border-[#eae2d6] ${styles.section} ${hasEnteredViewport ? styles.isEntered : ''}`}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className={`${styles.label} inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd2337] mb-3`}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#bd2337]" />
            <span>How VaRoom Works</span>
          </div>
          <h2 className={`${styles.headline} font-sans font-bold text-3xl sm:text-4xl md:text-5xl text-[#181513] tracking-tight`}>
            Seamless from discovery to stay.
          </h2>
        </div>

        {/* Minimal 3-Step Row (No huge cards, clean editorial minimalism) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14 pt-4 border-t border-[#2d2724]/15">
          {steps.map((step, index) => (
            <div key={step.num} className={`flex flex-col ${styles.step}`}>
              <span
                className={`${styles.number} ${activeNumbers[index] ? styles.numberActive : ''} font-serif text-3xl sm:text-4xl text-[#bd2337] font-bold tracking-tight mb-4`}
              >
                <span aria-hidden="true" className={styles.numberFrame} key={numberValues[index]}>
                  {numberValues[index]}
                </span>
                <span className="sr-only">{step.num}</span>
              </span>
              <h3 className={`${styles.stepTitle} ${revealedSteps[index] ? styles.contentRevealed : ''} font-sans font-bold text-xl sm:text-2xl text-[#181513] mb-3`}>
                {step.title}
              </h3>
              <p className={`${styles.stepDescription} ${revealedSteps[index] ? styles.contentRevealed : ''} text-base text-[#594f47] leading-relaxed`}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
