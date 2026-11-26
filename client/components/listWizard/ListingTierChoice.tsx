import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatPrice, type PlanCard } from '../../lib/billing/pricing';

// Before a host can publish: Property and Shops & Offices pick Silver or Gold
// (paid once per listing); Airbnb, Hotel and Venue pick their monthly plan
// (listings stay online while it runs). Choosing one opens VaRoom's checkout
// window over the page. Shown over the step card (the amenities library's
// overlay pattern) until the host can publish.

export function ListingTierChoice({ cards, onChoose }: { cards: PlanCard[]; onChoose: (card: PlanCard) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const perListing = cards.every((card) => card.perListing);
  return (
    <div className="tier-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="tier-choice-title" aria-describedby="tier-choice-sub">
      <div className="tier-choice-dialog">
        <h2 id="tier-choice-title">{perListing ? 'Choose your listing plan' : 'Choose your plan'}</h2>
        <p id="tier-choice-sub">
          {perListing
            ? 'Pay once for this listing, then fill it in. It stays live for 30 days from when you publish it.'
            : 'Your listings stay online while your plan is paid. It renews monthly; cancel anytime in Settings.'}
        </p>
        <div className="tier-choice-options">
          {cards.map((card) => (
            <div key={card.id} className={`tier-choice-option${card.featured ? ' featured' : ''}`}>
              <div className="tier-choice-head">
                <span className="tier-choice-name">{card.name}</span>
                <span className="tier-choice-price">KSh {formatPrice(card.monthly)} <small>{perListing ? '/listing' : '/month'}</small></span>
              </div>
              <ul>
                {card.features.map((feature) => <li key={feature}><span className="check" aria-hidden="true">✓</span>{feature}</li>)}
              </ul>
              <button type="button" ref={card.featured ? first : undefined} onClick={() => onChoose(card)}>
                Pay KSh {formatPrice(card.monthly)}
              </button>
            </div>
          ))}
        </div>
        <Link href="/host-home" className="tier-choice-back">Not now, back to Home</Link>
      </div>
    </div>
  );
}
