import React, { useEffect, useRef, useState } from 'react';
import { formatPrice, type PlanCard } from '../../lib/billing/pricing';

// The plan cards of /pricing, shared with the listing wizard's plan choice
// (components/listWizard/ListingTierChoice.tsx). Styled by PRICING_STYLES,
// inside a .pricing-page. On phones the cards are a sideways list: the dots
// follow it, and it opens on the current plan (else the recommended one).

function CheckIcon() {
  return (
    <svg className="check" viewBox="0 0 20 20" aria-hidden="true">
      <circle className="pc-ring" cx="10" cy="10" r="9.25" />
      <path className="pc-tick" d="m6.2 10.3 2.5 2.5 5-5.4" />
    </svg>
  );
}

export function PlanCards({ cards, currentId = null, yearly = false, busy = false, onChoose }: {
  /** null while the plans load. */
  cards: PlanCard[] | null;
  currentId?: string | null;
  yearly?: boolean;
  /** A checkout is open: the buttons wait. */
  busy?: boolean;
  onChoose: (card: PlanCard) => void;
}) {
  const plansRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const list = plansRef.current;
    if (!list || !cards || !cards.length || startedAtRef.current) return;
    if (!window.matchMedia('(max-width: 980px)').matches) return;
    const start = Math.max(0, cards.findIndex((card) => card.id === currentId) >= 0
      ? cards.findIndex((card) => card.id === currentId)
      : cards.findIndex((card) => card.featured));
    const target = list.children[start] as HTMLElement | undefined;
    if (target) list.scrollTo({ left: target.offsetLeft - list.offsetLeft, behavior: 'auto' });
    setActiveIndex(start);
    if (currentId || !cards.some((card) => card.featured) || start > 0) startedAtRef.current = true;
  }, [cards, currentId]);

  const onPlansScroll = () => {
    const list = plansRef.current;
    if (!list) return;
    const children = Array.from(list.children) as HTMLElement[];
    const left = list.scrollLeft;
    let best = 0;
    children.forEach((child, index) => {
      if (Math.abs(child.offsetLeft - list.offsetLeft - left) < Math.abs((children[best].offsetLeft - list.offsetLeft) - left)) best = index;
    });
    setActiveIndex(best);
  };
  const goToPlan = (index: number) => {
    const list = plansRef.current;
    const target = list?.children[index] as HTMLElement | undefined;
    if (!list || !target) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ left: target.offsetLeft - list.offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
    setActiveIndex(index);
  };

  return (
    <>
      <div ref={plansRef} onScroll={onPlansScroll} className={`plans${cards && cards.length === 4 ? ' plans--four' : cards && cards.length === 2 ? ' plans--two' : ''}`} aria-busy={cards ? undefined : 'true'}>
        {(cards || []).map((card, index) => {
          const current = card.id === currentId;
          const nameId = `plan-${['basic', 'growth', 'pro'][index] || index}-name`;
          const price = yearly ? card.yearly : card.monthly;
          return (
            <article key={index} className={`plan${card.featured ? ' plan--featured' : ''}`} data-plan={card.id} aria-labelledby={nameId}>
              <p className="plan-price"><span className="cur">KSh</span> <span className="amt">{formatPrice(price || 0)}</span> <span className="per">{card.perListing ? '/listing' : yearly ? '/year' : '/month'}</span></p>
              <h2 className="plan-name" id={nameId}>{card.name}</h2>
              <p className="plan-desc">{card.description}</p>
              <hr className="plan-divider" />
              <ul className="plan-features">
                {card.features.map((feature) => <li key={feature}><CheckIcon /><span>{feature}</span></li>)}
              </ul>
              <button
                type="button"
                className={`plan-cta${card.featured ? ' plan-cta--primary' : ''}`}
                aria-describedby={nameId}
                aria-current={current ? 'true' : undefined}
                disabled={current || busy}
                onClick={() => onChoose(card)}
              >
                {current ? 'Current Plan' : card.cta}
              </button>
            </article>
          );
        })}
      </div>

      {cards && cards.length > 1 && (
        <div className="plan-dots" role="group" aria-label="Choose a plan to view">
          {cards.map((card, index) => (
            <button key={card.id} type="button" aria-label={`Show ${card.name}`} aria-current={activeIndex === index ? 'true' : undefined} onClick={() => goToPlan(index)} />
          ))}
        </div>
      )}
    </>
  );
}
