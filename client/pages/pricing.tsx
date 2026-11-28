import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { loginUrl } from '../lib/safeRedirect';
import {
  applyPlans, cardsForNiche, checkReturnedPayment, currentPlanId, DEFAULT_PLAN_CARDS, fetchEntitlements, fetchPlans,
  RETURN_MAX_ATTEMPTS, RETURN_MESSAGES, RETURN_POLL_MS, startCheckout, startListingTierCheckout, checkListingPayment,
  readCachedPlans, writeCachedPlans, type ListingPayment, type ListingTier, type PaymentState, type PlanCard,
} from '../lib/billing/pricing';
import { CheckoutWindow } from '../components/billing/CheckoutWindow';
import { PRICING_STYLES } from '../components/pricing/pricingStyles';
import { PlanCards } from '../components/pricing/PlanCards';
import { clearHostBillingCache } from '../lib/billing/hostBilling';
import MenuButton from '../components/shell/MenuButton';

// Host plans (migrated from legacy-pages/pricing.html): the plans for the
// host's niche, the current plan, Paystack checkout, and the check after
// Paystack returns here (?billing=return&reference=…). Hosts only; identity
// and role come from AuthProvider.

/** One message box under the title: busy (with a spinner), done, failed, or plans that could not load. */
type Notice = { tone: 'busy' | 'good' | 'bad'; text: string; retry?: boolean } | null;

const queryValue = (value: string | string[] | undefined) => (typeof value === 'string' && value ? value : null);

export default function PricingPage() {
  const router = useRouter();
  const { status, user, session, profile, profileError } = useAuth();
  // No cards until the host's niche is known: showing defaults first flashed
  // Property plans to Airbnb, Hotel and Venue hosts.
  const [cards, setCards] = useState<PlanCard[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [plansAttempt, setPlansAttempt] = useState(0);
  const cardsRef = useRef<PlanCard[] | null>(null);
  /** The plan being paid for in the checkout window. */
  const [checkoutCard, setCheckoutCard] = useState<PlanCard | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token || null;
  cardsRef.current = cards;
  // A plan's name for messages ("Your Pro plan is active."), never its code.
  const planName = (id: string) => (cardsRef.current || []).find((card) => card.id === id)?.name || 'new';

  const isHost = profile?.role === 'host';
  const userId = user?.id || null;
  const hostNiche = Array.isArray(profile?.listing_categories) ? profile.listing_categories[0] || null : null;
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

  // VaRoom's checkout window over the page. Silver / Gold: M-Pesa or card,
  // then on to /list to list the space. Monthly plans: card only (Paystack
  // renews plans on cards), confirmed here.
  const signedInToken = () => {
    const token = tokenRef.current;
    if (!token || !userId) throw new Error('Please log in again to continue.');
    return token;
  };
  const startPayment = (payment: ListingPayment) => {
    const card = checkoutCard as PlanCard;
    return card.perListing ? startListingTierCheckout(signedInToken(), card.id as ListingTier, payment) : startCheckout(signedInToken(), card.id);
  };
  const confirmPayment = async (reference: string, waitingForPin: boolean): Promise<PaymentState> => {
    if (checkoutCard?.perListing) return checkListingPayment(signedInToken(), reference, { waitingForPin });
    const result = await checkReturnedPayment(signedInToken(), reference);
    return result.kind === 'active' ? 'paid' : result.kind === 'failed' ? 'failed' : 'pending';
  };
  const paid = (reference: string) => {
    const card = checkoutCard;
    setCheckoutCard(null);
    if (!card) return;
    if (card.perListing) { void router.push(`/list?payment=verified&reference=${encodeURIComponent(reference)}`); return; }
    // The new plan replaces what Settings and Host Home remembered.
    clearHostBillingCache();
    setCurrentId(card.id);
    setNotice({ tone: 'good', text: `Your ${card.name} plan is active.` });
  };

  return (
    <>
      <Head>
        <title>Pricing — VaRoom</title>
      </Head>
      <style dangerouslySetInnerHTML={{ __html: PRICING_STYLES }} />
      <div className="pricing-page" id="pricing-page" style={isHost ? undefined : { visibility: 'hidden' }}>
        <div className="pricing-bg" aria-hidden="true" />

        <div className="pricing-top">
          <div className="pricing-brand">
            <MenuButton />
            <Link href="/host-home" className="logo"><span className="va">Va</span><span className="room">Room</span></Link>
          </div>
          <Link href="/host-home" className="back-link">← Back to dashboard</Link>
        </div>

        <div className="pricing-wrap">
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
          <PlanCards cards={cards} currentId={currentId} busy={checkoutCard !== null} onChoose={(card) => { setNotice(null); setCheckoutCard(card); }} />

          {perListing && (
            <div className="pricing-msgs">
              <p className="pricing-note">You pay once per listing. After paying you go straight to listing your space, and the 30 days start when you publish it.</p>
            </div>
          )}
        </div>
      </div>
      {checkoutCard && (
        <CheckoutWindow open allowMpesa={Boolean(checkoutCard.perListing)}
          item={{ name: checkoutCard.perListing ? `${checkoutCard.name} listing` : `${checkoutCard.name} plan`, priceKes: checkoutCard.monthly,
            per: checkoutCard.perListing ? '/listing' : '/month', lines: checkoutCard.features }}
          paidText={checkoutCard.perListing ? 'Taking you to list your space…' : `Your ${checkoutCard.name} plan is active.`}
          start={startPayment} confirm={confirmPayment} onPaid={paid} onClose={() => setCheckoutCard(null)} />
      )}
    </>
  );
}

// Phones: the hamburger opens the host sidebar as a drawer (_app mounts it).
PricingPage.phoneMenu = true;
