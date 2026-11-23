import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { loginUrl } from '../lib/safeRedirect';
import {
  applyPlans, cardsForNiche, checkReturnedPayment, currentPlanId, DEFAULT_PLAN_CARDS, fetchEntitlements, fetchPlans, formatPrice,
  RETURN_MAX_ATTEMPTS, RETURN_MESSAGES, RETURN_POLL_MS, startCheckout, startListingTierCheckout,
  readCachedPlans, writeCachedPlans, yearlyReady, type ListingTier, type PlanCard,
} from '../lib/billing/pricing';
import { PRICING_STYLES } from '../components/pricing/pricingStyles';
import { clearHostBillingCache } from '../lib/billing/hostBilling';

// Host plans (migrated from legacy-pages/pricing.html): the plans for the
// host's niche, the current plan, Paystack checkout, and the check after
// Paystack returns here (?billing=return&reference=…). Hosts only; identity
// and role come from AuthProvider.

type Billing = 'monthly' | 'yearly';

/** One message box under the title: busy (with a spinner), done, failed, or plans that could not load. */
type Notice = { tone: 'busy' | 'good' | 'bad'; text: string; retry?: boolean } | null;

function CheckIcon() {
  return (
    <svg className="check" viewBox="0 0 20 20" aria-hidden="true">
      <circle className="pc-ring" cx="10" cy="10" r="9.25" />
      <path className="pc-tick" d="m6.2 10.3 2.5 2.5 5-5.4" />
    </svg>
  );
}

const queryValue = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

export default function PricingPage() {
  const router = useRouter();
  const { status, user, session, profile, profileError } = useAuth();
  // No cards until the host's niche is known: showing defaults first flashed
  // Property plans to Airbnb, Hotel and Venue hosts.
  const [cards, setCards] = useState<PlanCard[] | null>(null);
  const [billing, setBilling] = useState<Billing>('monthly');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [plansAttempt, setPlansAttempt] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const plansRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(false);
  const cardsRef = useRef<PlanCard[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token || null;
  cardsRef.current = cards;
  // A plan's name for messages ("Your Pro plan is active."), never its code.
  const planName = (id: string) => (cardsRef.current || []).find((card) => card.id === id)?.name || 'new';

  const isHost = profile?.role === 'host';
  const userId = user?.id || null;
  const hostNiche = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] || null : null;
  const canToggle = Boolean(cards && cards.length && yearlyReady(cards));
  const perListing = Boolean(cards && cards.length && cards.every((card) => card.perListing));

  // Hosts only: signed out → login, clients → their home.
  useEffect(() => {
    if (!router.isReady || status === 'loading') return;
    if (status === 'signed-out') { router.replace(loginUrl('/pricing')); return; }
    if (profileError) { router.replace(loginUrl('/pricing')); return; }
    if (profile && !isHost) router.replace('/client-home');
  }, [router, router.isReady, status, profile, profileError, isHost]);

  // The host's plans and current plan.
  useEffect(() => {
    const token = tokenRef.current;
    if (!isHost || !userId || !token) return undefined;
    let cancelled = false;
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Storage unavailable. */ }
    // Paint at once: this account's cached plans, else the niche's own cards.
    const cached = readCachedPlans(storage, userId, hostNiche);
    setCards(cached ? applyPlans(DEFAULT_PLAN_CARDS, cached) : cardsForNiche(hostNiche));
    (async () => {
      try {
        const plans = await fetchPlans(token);
        if (cancelled) return;
        writeCachedPlans(storage, userId, hostNiche, plans);
        setCards(applyPlans(DEFAULT_PLAN_CARDS, plans));
        const planId = currentPlanId(await fetchEntitlements(token));
        if (!cancelled && planId) setCurrentId(planId);
      } catch (error) {
        console.warn('Pricing: plans could not load:', error);
        if (!cancelled) setNotice({ tone: 'bad', text: 'Plans could not load. Please check your connection and try again.', retry: true });
      }
    })();
    return () => { cancelled = true; };
  }, [isHost, userId, hostNiche, plansAttempt]);

  // Back from Paystack: poll until the server confirms or rejects the payment.
  useEffect(() => {
    if (!router.isReady || !isHost || !userId || queryValue(router.query.billing) !== 'return') return undefined;
    const reference = queryValue(router.query.reference) || queryValue(router.query.trxref);
    let attempts = 0;
    let timer = 0;
    let stopped = false;
    const check = async () => {
      const token = tokenRef.current;
      if (stopped || !token) return;
      try {
        const result = await checkReturnedPayment(token, reference);
        if (stopped) return;
        if (result.kind === 'active') {
          // The new plan replaces what Settings and Host Home remembered.
          clearHostBillingCache();
          setNotice({ tone: 'good', text: `Your ${planName(result.planId)} plan is active.` });
          setCurrentId(result.planId);
          return;
        }
        if (result.kind === 'failed') { setNotice({ tone: 'bad', text: RETURN_MESSAGES.failed }); return; }
        setNotice({ tone: 'busy', text: RETURN_MESSAGES.verifying });
      } catch {
        if (stopped) return;
        setNotice({ tone: 'busy', text: RETURN_MESSAGES.error });
      }
      attempts += 1;
      if (attempts < RETURN_MAX_ATTEMPTS) timer = window.setTimeout(check, RETURN_POLL_MS);
    };
    check();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [router, router.isReady, router.query.billing, router.query.reference, router.query.trxref, isHost, userId]);

  const toggle = (next?: Billing) => {
    if (!canToggle) return;
    setBilling((current) => next || (current === 'monthly' ? 'yearly' : 'monthly'));
  };

  const choose = async (card: PlanCard) => {
    setBusyId(card.id);
    setNotice({ tone: 'busy', text: `Opening secure checkout for ${card.name}…` });
    try {
      const token = tokenRef.current;
      if (!token || !userId) throw new Error('Please log in again to continue.');
      // Silver / Gold: Paystack returns the host to /list to publish the listing.
      const url = card.perListing
        ? await startListingTierCheckout(token, card.id as ListingTier)
        : await startCheckout(token, card.id);
      // Paystack's hosted checkout is a separate site.
      window.location.assign(url);
    } catch (error) {
      setNotice({ tone: 'bad', text: (error as Error).message || 'Unable to start checkout. Please try again.' });
      setBusyId(null);
    }
  };

  // Phones show the plans as a sideways list: the dots follow it, and it opens
  // on the host's current plan (else the recommended one).
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

  const yearly = billing === 'yearly';
  return (
    <>
      <Head>
        <title>Pricing — VaRoom</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: PRICING_STYLES }} />
      <div className="pricing-page" id="pricing-page" style={isHost ? undefined : { visibility: 'hidden' }}>
        <div className="pricing-bg" aria-hidden="true" />

        <div className="pricing-top">
          <Link href="/host-home" className="logo"><span className="va">Va</span><span className="room">Room</span></Link>
          <Link href="/host-home" className="back-link">← Back to dashboard</Link>
        </div>

        <div className="pricing-wrap">
          <p className="eyebrow">Host plans</p>
          <h1 className="pricing-title">Pricing</h1>

          {notice && (
            <div className={`pricing-notice is-${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'} aria-live="polite" key={notice.text}>
              {notice.tone === 'busy' && <span className="pricing-spinner" aria-hidden="true" />}
              <span>{notice.text}</span>
              {notice.retry && (
                <button type="button" className="pricing-retry" onClick={() => { setNotice(null); setPlansAttempt((n) => n + 1); }}>Try again</button>
              )}
            </div>
          )}
          <div ref={plansRef} onScroll={onPlansScroll} className={`plans${cards && cards.length === 4 ? ' plans--four' : ''}`} aria-busy={cards ? undefined : 'true'}>
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
                    disabled={current || busyId === card.id}
                    onClick={() => choose(card)}
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

          {perListing ? (
            <div className="pricing-msgs">
              <p className="pricing-note">You pay once per listing. After paying you go straight to listing your space, and the 30 days start when you publish it.</p>
            </div>
          ) : (<>
          <div className="billing" role="group" aria-label="Billing period">
            <button type="button" className={`billing-label${yearly ? '' : ' is-active'}`} aria-pressed={!yearly} aria-disabled={canToggle ? undefined : 'true'} onClick={() => toggle('monthly')}>Monthly</button>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={yearly}
              aria-label="Bill yearly"
              aria-describedby="billing-note"
              aria-disabled={canToggle ? undefined : 'true'}
              onClick={() => toggle()}
            >
              <span className="knob" />
            </button>
            <button type="button" className={`billing-label${yearly ? ' is-active' : ''}`} aria-pressed={yearly} aria-disabled={canToggle ? undefined : 'true'} onClick={() => toggle('yearly')}>
              Yearly {!canToggle && <span className="badge-soon">Soon</span>}
            </button>
          </div>
          <div className="pricing-msgs">
            <p className="pricing-note" id="billing-note">{canToggle ? '' : 'Yearly billing is coming soon. Prices shown are per month.'}</p>

          </div>
          </>)}
        </div>
      </div>
    </>
  );
}
