import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatPrice, LISTING_TIER_CARDS, type ListingTier } from '../../lib/billing/pricing';

// Property and Shops & Offices: before the host fills in a listing they pick
// Silver or Gold. Choosing one opens VaRoom's checkout window (M-Pesa or
// card) over the page. Shown over the step card (the amenities library's
// overlay pattern) until the host has a paid listing to use.

export function ListingTierChoice({ onChoose }: { onChoose: (tier: ListingTier) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <div className="tier-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="tier-choice-title" aria-describedby="tier-choice-sub">
      <div className="tier-choice-dialog">
        <h2 id="tier-choice-title">Choose your listing plan</h2>
        <p id="tier-choice-sub">Pay once for this listing, then fill it in. It stays live for 30 days from when you publish it.</p>
        <div className="tier-choice-options">
          {LISTING_TIER_CARDS.map((card) => (
            <div key={card.id} className={`tier-choice-option${card.featured ? ' featured' : ''}`}>
              <div className="tier-choice-head">
                <span className="tier-choice-name">{card.name}</span>
                <span className="tier-choice-price">KSh {formatPrice(card.monthly)} <small>/listing</small></span>
              </div>
              <ul>
                {card.features.map((feature) => <li key={feature}><span className="check" aria-hidden="true">✓</span>{feature}</li>)}
              </ul>
              <button type="button" ref={card.featured ? first : undefined} onClick={() => onChoose(card.id as ListingTier)}>
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
