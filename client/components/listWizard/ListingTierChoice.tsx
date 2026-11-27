import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { PlanCard } from '../../lib/billing/pricing';
import { PlanCards } from '../pricing/PlanCards';
import { PRICING_STYLES } from '../pricing/pricingStyles';

// Before a host can publish: Property and Shops & Offices pick Silver or Gold
// (paid once per listing); Airbnb, Hotel and Venue pick their monthly plan
// (listings stay online while it runs). It is the pricing page laid over the
// step card, without its "Host plans" eyebrow and "Pricing" headline.
// Choosing a plan opens VaRoom's checkout window over the page.

export function ListingTierChoice({ cards, onChoose }: { cards: PlanCard[]; onChoose: (card: PlanCard) => void }) {
  const page = useRef<HTMLDivElement>(null);
  // Focus starts on the recommended plan.
  useEffect(() => { page.current?.querySelector<HTMLButtonElement>('.plan--featured .plan-cta, .plan-cta')?.focus({ preventScroll: true }); }, []);
  const perListing = cards.every((card) => card.perListing);
  return (
    <div className="tier-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="tier-choice-title" aria-describedby="tier-choice-sub">
      <style dangerouslySetInnerHTML={{ __html: PRICING_STYLES }} />
      <div className="pricing-page" ref={page}>
        <div className="pricing-bg" aria-hidden="true" />
        <div className="pricing-wrap">
          <h2 className="tier-choice-title" id="tier-choice-title">{perListing ? 'Choose your listing plan' : 'Choose your plan'}</h2>
          <p className="tier-choice-sub" id="tier-choice-sub">
            {perListing
              ? 'Pay once for this listing, then fill it in. It stays live for 30 days from when you publish it.'
              : 'Your listings stay online while your plan is paid. It renews monthly; cancel anytime in Settings.'}
          </p>
          <PlanCards cards={cards} onChoose={onChoose} />
          <Link href="/host-home" className="tier-choice-back">Not now, back to Home</Link>
        </div>
      </div>
    </div>
  );
}
