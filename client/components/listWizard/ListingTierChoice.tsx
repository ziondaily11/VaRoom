import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { PlanCard } from '../../lib/billing/pricing';
import { PlanCards } from '../pricing/PlanCards';
import { PRICING_STYLES } from '../pricing/pricingStyles';

// Before a host can publish: Property and Shops & Offices pick Silver or Gold
// (paid once per listing); Airbnb, Hotel and Venue pick their monthly plan
// (listings stay online while it runs). When every listing an Airbnb or Venue
// plan includes is online (`limit`), it offers that plan's upgrades instead.
// It is the pricing page laid over the step card, without its "Host plans"
// eyebrow and "Pricing" headline. Choosing a plan opens VaRoom's checkout
// window over the page.

export function ListingTierChoice({ cards, onChoose, limit = null }: {
  cards: PlanCard[];
  onChoose: (card: PlanCard) => void;
  /** The host's plan and how many listings it includes online, all in use. */
  limit?: { planId: string; limit: number } | null;
}) {
  const page = useRef<HTMLDivElement>(null);
  // Focus starts on the recommended plan (the first upgrade when the host is on it).
  useEffect(() => { page.current?.querySelector<HTMLButtonElement>('.plan--featured .plan-cta:not(:disabled), .plan-cta:not(:disabled)')?.focus({ preventScroll: true }); }, []);
  const perListing = cards.every((card) => card.perListing);
  const current = limit ? cards.find((card) => card.id === limit.planId) : undefined;
  const upgrades = cards.filter((card) => card !== current).length;
  const title = limit ? 'Upgrade to list more' : perListing ? 'Choose your listing plan' : 'Choose your plan';
  const sub = limit
    ? `Your ${current ? current.name : 'current'} plan includes ${limit.limit} listing${limit.limit === 1 ? '' : 's'} online, and all are in use. ${upgrades ? 'Upgrade for more, or pause a listing to publish this one.' : 'Pause a listing to publish this one.'}`
    : perListing
      ? 'Pay once for this listing, then fill it in. It stays live for 30 days from when you publish it.'
      : 'Your listings stay online while your plan is paid. It renews monthly; cancel anytime in Settings.';
  return (
    <div className="tier-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="tier-choice-title" aria-describedby="tier-choice-sub">
      <style dangerouslySetInnerHTML={{ __html: PRICING_STYLES }} />
      <div className="pricing-page" ref={page}>
        <div className="pricing-bg" aria-hidden="true" />
        <div className="pricing-wrap">
          <h2 className="tier-choice-title" id="tier-choice-title">{title}</h2>
          <p className="tier-choice-sub" id="tier-choice-sub">{sub}</p>
          <PlanCards cards={cards} currentId={limit ? limit.planId : null} onChoose={onChoose} />
          <Link href="/host-home" className="tier-choice-back">Not now, back to Home</Link>
        </div>
      </div>
    </div>
  );
}
