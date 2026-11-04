import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { loginUrl } from '../lib/safeRedirect';
import {
  applyPlans, checkoutBody, checkReturnedPayment, currentPlanId, DEFAULT_PLAN_CARDS, fetchEntitlements, fetchPlans, formatPrice,
  LISTING_AFTER_UPGRADE_KEY, pendingListingId, readDraftPointer, RETURN_MAX_ATTEMPTS, RETURN_MESSAGES, RETURN_POLL_MS, startCheckout,
  yearlyReady, type PlanCard,
} from '../lib/billing/pricing';
import { PRICING_STYLES } from '../components/pricing/pricingStyles';

// Host plans (migrated from legacy-pages/pricing.html): the plans for the
// host's niche, the current plan, Paystack checkout, and the check after
// Paystack returns here (?billing=return&reference=…). Hosts only; identity
// and role come from AuthProvider.

type Billing = 'monthly' | 'yearly';

function CheckIcon() {
  return (
    <svg className="check" viewBox="0 0 20 20" aria-hidden="true">
      <circle className="pc-ring" cx="10" cy="10" r="9.25" />
      <path className="pc-tick" d="m6.2 10.3 2.5 2.5 5-5.4" />
    </svg>
  );
}

const queryValue = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

export default function PricingPage() {
  const router = useRouter();
  const { status, user, session, profile, profileError } = useAuth();
  const [cards, setCards] = useState<PlanCard[]>(DEFAULT_PLAN_CARDS);
  const [billing, setBilling] = useState<Billing>('monthly');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token || null;

  const isHost = profile?.role === 'host';
  const userId = user?.id || null;
  const canToggle = yearlyReady(cards);

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
    (async () => {
      try {
        const plans = await fetchPlans(token);
        if (cancelled) return;
        setCards(applyPlans(DEFAULT_PLAN_CARDS, plans));
        const planId = currentPlanId(await fetchEntitlements(token));
        if (!cancelled && planId) setCurrentId(planId);
      } catch (error) {
        if (!cancelled) setMessage((error as Error).message || 'Unable to load plans');
      }
    })();
    return () => { cancelled = true; };
  }, [isHost, userId]);

  // Back from Paystack: poll until the server confirms or rejects the payment.
  useEffect(() => {
    if (!router.isReady || !isHost || !userId || queryValue(router.query.billing) !== 'return') return undefined;
    const reference = queryValue(router.query.reference) || queryValue(router.query.trxref);
    const returnToList = queryValue(router.query.returnTo) === 'list';
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
          setMessage(`Your ${result.planId} plan is active.`);
          setCurrentId(result.planId);
          if (returnToList && reference) {
            try { window.sessionStorage.removeItem(LISTING_AFTER_UPGRADE_KEY); } catch { /* Storage unavailable. */ }
            timer = window.setTimeout(() => {
              router.replace(`/list?subscription=return&reference=${encodeURIComponent(reference)}`);
            }, 700);
          }
          return;
        }
        if (result.kind === 'failed') { setMessage(RETURN_MESSAGES.failed); return; }
        setMessage(RETURN_MESSAGES.verifying);
      } catch {
        if (stopped) return;
        setMessage(RETURN_MESSAGES.error);
      }
      attempts += 1;
      if (attempts < RETURN_MAX_ATTEMPTS) timer = window.setTimeout(check, RETURN_POLL_MS);
    };
    check();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [router, router.isReady, router.query.billing, router.query.reference, router.query.trxref, router.query.returnTo, isHost, userId]);

  const toggle = (next?: Billing) => {
    if (!canToggle) return;
    setBilling((current) => next || (current === 'monthly' ? 'yearly' : 'monthly'));
  };

  const choose = async (card: PlanCard) => {
    setBusyId(card.id);
    setMessage(`Opening secure checkout for ${card.name}…`);
    try {
      const token = tokenRef.current;
      if (!token || !userId) throw new Error('Please log in again to continue.');
      let pointer = null;
      try {
        pointer = readDraftPointer(window.localStorage, userId);
      } catch (error) {
        console.warn('Unable to read the listing draft for subscription checkout:', error);
      }
      const listingId = pendingListingId({ pointer, niche: queryValue(router.query.niche), afterUpgrade: readSession(LISTING_AFTER_UPGRADE_KEY) });
      const url = await startCheckout(token, checkoutBody(card.id, listingId, queryValue(router.query.returnTo)));
      // Paystack's hosted checkout is a separate site.
      window.location.assign(url);
    } catch (error) {
      setMessage((error as Error).message || 'Unable to start checkout. Please try again.');
      setBusyId(null);
    }
  };

  const yearly = billing === 'yearly';
  return (
    <>
      <Head>
        <title>Pricing — VaRoom</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
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

          <div className={`plans${cards.length === 4 ? ' plans--four' : ''}`}>
            {cards.map((card, index) => {
              const current = card.id === currentId;
              const nameId = `plan-${['basic', 'growth', 'pro'][index] || index}-name`;
              const price = yearly ? card.yearly : card.monthly;
              return (
                <article key={index} className={`plan${card.featured ? ' plan--featured' : ''}`} data-plan={card.id} aria-labelledby={nameId}>
                  <p className="plan-price"><span className="cur">KSh</span> <span className="amt">{formatPrice(price || 0)}</span> <span className="per">{yearly ? '/year' : '/month'}</span></p>
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

          <div className="billing" role="group" aria-label="Billing period">
            <span className={`billing-label${yearly ? '' : ' is-active'}`} onClick={() => toggle('monthly')}>Monthly</span>
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
            <span className={`billing-label${yearly ? ' is-active' : ''}`} onClick={() => toggle('yearly')}>
              Yearly {!canToggle && <span className="badge-soon">Soon</span>}
            </span>
          </div>
          <div className="pricing-msgs">
            <p className="pricing-note" id="billing-note">{canToggle ? '' : 'Yearly billing is coming soon. Prices shown are per month.'}</p>
            <p className="pricing-status" role="status" aria-live="polite">{message}</p>
          </div>
        </div>
      </div>
    </>
  );
}
