import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatPrice, isMpesaPhone, MPESA_WINDOW_MS, type CheckoutStart, type ListingPayment, type PaymentState } from '../../lib/billing/pricing';
import { payByCard } from '../../lib/billing/paystackPopup';
import { CardMark, MpesaMark } from './PaymentMarks';

// VaRoom's checkout window (styled like the landing page's auth panel): a
// summary on the left, the payment on the right, over the page the host is
// on. M-Pesa happens entirely here: the server asks Paystack to send the PIN
// prompt to the phone and this window waits for the server to confirm it.
// Cards open Paystack's popup on top. Nothing unlocks until the server has
// verified the payment.

export interface CheckoutItem {
  /** e.g. "Gold listing". */
  name: string;
  priceKes: number;
  /** e.g. "/listing" or "/month". */
  per: string;
  lines: string[];
}

type Stage = 'choose' | 'starting' | 'waiting' | 'card' | 'confirming' | 'paid' | 'failed';
type Method = 'mpesa' | 'card';

const POLL_MS = 3000;
// Paystack's card window normally shows within a second or two.
const POPUP_SHOW_MS = 8000;
const BLOCKED_TEXT = 'The Paystack card window did not open. A browser privacy setting or an ad blocker may be stopping it. Open Paystack in this tab instead, or pay with M-Pesa where it is offered.';
const CARD_CONFIRM_TRIES = 30;
// The M-Pesa prompt lasts 180 s; the server's last word may come a little after.
const MPESA_GRACE_MS = 30 * 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback;

export function CheckoutWindow({ open, item, allowMpesa, paidText, start, confirm, onPaid, onClose, onFallback }: {
  open: boolean;
  item: CheckoutItem;
  /** One-off payments (Silver, Gold); Paystack renews monthly plans on cards only. */
  allowMpesa: boolean;
  /** Shown once the server has confirmed the payment. */
  paidText: string;
  start: (payment: ListingPayment) => Promise<CheckoutStart>;
  /** One server check of the payment. */
  confirm: (reference: string, waitingForPin: boolean) => Promise<PaymentState>;
  onPaid: (reference: string) => void;
  onClose: () => void;
  /** Before leaving for Paystack's own page (when its popup can't load). */
  onFallback?: () => Promise<void> | void;
}) {
  const [method, setMethod] = useState<Method>(allowMpesa ? 'mpesa' : 'card');
  const [stage, setStage] = useState<Stage>('choose');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [left, setLeft] = useState(MPESA_WINDOW_MS);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  // Each attempt has its own number; closing or starting again ends the older one's polling.
  const attempt = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const price = `KSh ${formatPrice(item.priceKes)}`;

  const reset = useCallback(() => {
    attempt.current += 1;
    setStage('choose'); setError(null); setPrompt(''); setFallbackUrl(null); setLeft(MPESA_WINDOW_MS);
  }, []);

  // Always closable: when Paystack's card window is really open it sits on top of this one anyway.
  const close = useCallback(() => { attempt.current += 1; onClose(); }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    reset();
    setMethod(allowMpesa ? 'mpesa' : 'card');
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { attempt.current += 1; document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [open, allowMpesa, reset]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const finish = (mine: number, reference: string) => {
    if (attempt.current !== mine) return;
    setStage('paid');
    setTimeout(() => { if (attempt.current === mine) onPaid(reference); }, 1200);
  };

  const payMpesa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isMpesaPhone(phone)) { setError('Enter a Safaricom number, for example 0712 345 678.'); return; }
    const mine = ++attempt.current;
    setError(null); setStage('starting');
    let started: CheckoutStart;
    try { started = await start({ channel: 'mpesa', phone }); } catch (startError) {
      if (attempt.current !== mine) return;
      setStage('choose'); setError(errorText(startError, 'M-Pesa could not be reached. Please try again.'));
      return;
    }
    if (attempt.current !== mine) return;
    setPrompt(started.channel === 'mpesa' ? started.displayText : 'Check your phone and enter your M-Pesa PIN.');
    setStage('waiting');
    const startedAt = Date.now();
    for (;;) {
      await wait(POLL_MS);
      if (attempt.current !== mine) return;
      const elapsed = Date.now() - startedAt;
      setLeft(MPESA_WINDOW_MS - elapsed);
      let state: PaymentState = 'pending';
      try { state = await confirm(started.reference, elapsed < MPESA_WINDOW_MS + MPESA_GRACE_MS); } catch { /* A missed check is retried. */ }
      if (attempt.current !== mine) return;
      if (state === 'paid') { finish(mine, started.reference); return; }
      if (state === 'failed') { setStage('failed'); setError('The M-Pesa payment was not completed. You have not been charged; you can try again.'); return; }
      if (elapsed >= MPESA_WINDOW_MS + MPESA_GRACE_MS) {
        setStage('failed');
        setError('We have not had a confirmation from M-Pesa yet. If you entered your PIN, the payment still counts once it arrives; check again in a minute before paying again.');
        return;
      }
    }
  };

  const confirmCard = async (mine: number, reference: string) => {
    setStage('confirming');
    for (let tries = 0; tries < CARD_CONFIRM_TRIES; tries += 1) {
      let state: PaymentState = 'pending';
      try { state = await confirm(reference, false); } catch { /* Retried below. */ }
      if (attempt.current !== mine) return;
      if (state === 'paid') { finish(mine, reference); return; }
      if (state === 'failed') { setStage('failed'); setError('The card payment was not completed. You have not been charged; you can try again.'); return; }
      await wait(POLL_MS);
      if (attempt.current !== mine) return;
    }
    setStage('failed');
    setError('Your payment is still being confirmed. It will count once Paystack confirms it; check again shortly before paying again.');
  };

  const payCard = async () => {
    const mine = ++attempt.current;
    setError(null); setFallbackUrl(null); setStage('starting');
    let started: CheckoutStart;
    try { started = await start({ channel: 'card' }); } catch (startError) {
      if (attempt.current !== mine) return;
      setStage('choose'); setError(errorText(startError, 'Unable to start the card payment. Please try again.'));
      return;
    }
    if (attempt.current !== mine || started.channel !== 'card') return;
    if (!started.accessCode) { setStage('choose'); setFallbackUrl(started.authorizationUrl); setError('The card window could not open here.'); return; }
    setStage('card');
    // Paystack's own page is always one click away while its card window is up:
    // a blocker can stop the window from showing without any error reaching us.
    setFallbackUrl(started.authorizationUrl);
    let shown = false;
    const notShown = window.setTimeout(() => {
      if (!shown && attempt.current === mine) setError(BLOCKED_TEXT);
    }, POPUP_SHOW_MS);
    let result;
    try {
      result = await payByCard(started.accessCode, () => { shown = true; window.clearTimeout(notShown); if (attempt.current === mine) setError(null); });
    } catch {
      window.clearTimeout(notShown);
      if (attempt.current !== mine) return;
      // The script itself was blocked or offline: Paystack's own page still works.
      setStage('choose');
      setError(BLOCKED_TEXT);
      return;
    }
    window.clearTimeout(notShown);
    if (attempt.current !== mine) return;
    setFallbackUrl(null);
    if (result.outcome === 'success') { await confirmCard(mine, started.reference); return; }
    setStage('choose');
    if (result.outcome === 'error') { setFallbackUrl(started.authorizationUrl); setError('The Paystack card window had a problem.'); }
    else setError('Card payment cancelled. You have not been charged.');
  };

  const leaveForPaystack = async () => {
    if (!fallbackUrl) return;
    try { await onFallback?.(); } catch (fallbackError) { setError(errorText(fallbackError, 'Your listing could not be saved first. Please try again.')); return; }
    window.location.assign(fallbackUrl);
  };

  if (!open) return null;
  const busy = stage === 'starting' || stage === 'card';
  const showMethods = allowMpesa && (stage === 'choose' || stage === 'failed' || stage === 'starting');

  const layer = (
    <div className="vr-checkout" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <style dangerouslySetInnerHTML={{ __html: CHECKOUT_STYLES }} />
      <div className="vr-checkout-card" role="dialog" aria-modal="true" aria-labelledby="vr-checkout-title" aria-describedby="vr-checkout-summary">
        <section className="vr-checkout-summary" id="vr-checkout-summary">
          <p className="vr-checkout-eyebrow"><span className="va">Va</span>Room checkout</p>
          <p className="vr-checkout-item">{item.name}</p>
          <p className="vr-checkout-price"><span className="amt">{price}</span> <span className="per">{item.per}</span></p>
          <ul>{item.lines.map((line) => <li key={line}><span aria-hidden="true">✓</span>{line}</li>)}</ul>
          <p className="vr-checkout-secure">Payments are processed securely by Paystack.</p>
        </section>

        <section className="vr-checkout-pay">
          <button type="button" className="vr-checkout-close" aria-label="Close" ref={closeButton} onClick={close}>×</button>
          <h2 id="vr-checkout-title">Pay {price}</h2>

          {showMethods && (
            <div className="vr-checkout-methods" role="tablist" aria-label="Payment method">
              {(['mpesa', 'card'] as Method[]).map((option) => (
                <button key={option} type="button" role="tab" aria-selected={method === option} disabled={busy}
                  onClick={() => { setMethod(option); setError(null); setFallbackUrl(null); if (stage === 'failed') setStage('choose'); }}>
                  {option === 'mpesa' ? <><MpesaMark />M-Pesa</> : <><CardMark />Card</>}
                </button>
              ))}
            </div>
          )}

          {(stage === 'choose' || stage === 'starting' || stage === 'failed') && method === 'mpesa' && (
            <form className="vr-checkout-form" onSubmit={(event) => { void payMpesa(event); }} noValidate>
              <label htmlFor="vr-checkout-phone">M-Pesa number</label>
              <input id="vr-checkout-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} autoFocus
                aria-invalid={Boolean(error) || undefined} aria-describedby="vr-checkout-hint"
                onChange={(event) => { setPhone(event.target.value); if (error) setError(null); }} disabled={stage === 'starting'} />
              <p id="vr-checkout-hint" className="vr-checkout-hint">You&apos;ll get a prompt on your phone to enter your M-Pesa PIN.</p>
              <button type="submit" className="vr-checkout-primary" disabled={stage === 'starting'}>
                {stage === 'starting' ? 'Sending request…' : `Pay ${price} with M-Pesa`}
              </button>
            </form>
          )}

          {(stage === 'choose' || stage === 'starting' || stage === 'failed' || stage === 'card') && method === 'card' && (
            <div className="vr-checkout-form">
              <p className="vr-checkout-hint">A secure Paystack card window opens on top of this one. You stay on VaRoom.</p>
              <button type="button" className="vr-checkout-primary" disabled={busy} onClick={() => { void payCard(); }}>
                {stage === 'starting' ? 'Preparing…' : stage === 'card' ? 'Waiting for the Paystack card window…' : `Pay ${price} by card`}
              </button>
            </div>
          )}

          {stage === 'waiting' && (
            <div className="vr-checkout-status" aria-live="polite">
              <span className="vr-checkout-spinner" aria-hidden="true" />
              <p className="vr-checkout-status-title">Check your phone</p>
              <p>{prompt}</p>
              <p className="vr-checkout-hint">Waiting for your PIN · {clock(left)}</p>
              <button type="button" className="vr-checkout-link" onClick={reset}>Wrong number? Start again</button>
            </div>
          )}

          {stage === 'confirming' && (
            <div className="vr-checkout-status" aria-live="polite">
              <span className="vr-checkout-spinner" aria-hidden="true" />
              <p className="vr-checkout-status-title">Confirming your payment…</p>
            </div>
          )}

          {stage === 'paid' && (
            <div className="vr-checkout-status is-paid" aria-live="polite">
              <span className="vr-checkout-tick" aria-hidden="true">✓</span>
              <p className="vr-checkout-status-title">Payment confirmed</p>
              <p>{paidText}</p>
            </div>
          )}

          {error && <p className="vr-checkout-error" role="alert">{error}</p>}
          {fallbackUrl && (
            <button type="button" className="vr-checkout-link" onClick={() => { void leaveForPaystack(); }}>Open Paystack in this tab instead</button>
          )}
        </section>
      </div>
    </div>
  );
  // Over everything on the page (the wizard's overlays included). Without a document (tests) it renders in place.
  return typeof document === 'undefined' ? layer : createPortal(layer, document.body);
}

// Always dark, like the auth panel; above the page's own layers, below Paystack's card popup.
export const CHECKOUT_STYLES = `
  .vr-checkout{ position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center; padding:1rem;
    background:rgba(0,0,0,.55); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); font-family:inherit;
    animation:vr-checkout-fade 200ms ease-out both; }
  .vr-checkout-card{ position:relative; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); width:min(920px,100%); min-height:min(540px, calc(100dvh - 2rem));
    max-height:calc(100dvh - 2rem); overflow:hidden; border:1px solid rgba(255,255,255,.12); border-radius:28px; color:#f5efe7;
    box-shadow:0 40px 120px -40px rgba(0,0,0,.75); animation:vr-checkout-pop 250ms ease-out both; }
  .vr-checkout-summary{ display:flex; flex-direction:column; justify-content:center; gap:.2rem; padding:clamp(1.6rem,4vw,3rem);
    background:radial-gradient(120% 90% at 0% 0%, rgba(196,30,58,.55), transparent 60%), linear-gradient(160deg, rgba(60,18,26,.92), rgba(14,10,11,.96)); }
  .vr-checkout-eyebrow{ margin:0 0 1.6rem; font-size:.78rem; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.7); }
  .vr-checkout-eyebrow .va{ color:#e8394f; letter-spacing:0; text-transform:none; font-family:Georgia, serif; font-weight:700; font-size:1rem; }
  .vr-checkout-item{ margin:0; font-size:1.05rem; font-weight:600; color:rgba(255,255,255,.85); }
  .vr-checkout-price{ margin:.2rem 0 1.4rem; }
  .vr-checkout-price .amt{ font-size:clamp(2.2rem,4.5vw,3rem); font-weight:700; letter-spacing:-.03em; color:#fff; }
  .vr-checkout-price .per{ color:rgba(255,255,255,.6); }
  .vr-checkout-summary ul{ display:grid; gap:.55rem; margin:0; padding:0; list-style:none; font-size:.92rem; color:rgba(255,255,255,.85); }
  .vr-checkout-summary li{ display:flex; gap:.6rem; }
  .vr-checkout-summary li span{ color:#ff8a9b; font-weight:700; }
  .vr-checkout-secure{ margin:auto 0 0; padding-top:1.6rem; font-size:.78rem; color:rgba(255,255,255,.5); }
  .vr-checkout-pay{ position:relative; display:flex; flex-direction:column; justify-content:center; gap:1rem; overflow-y:auto; overscroll-behavior:contain;
    padding:clamp(1.6rem,4vw,3rem); background:rgba(17,18,18,.96); border-left:1px solid rgba(255,255,255,.08); }
  .vr-checkout-pay h2{ margin:0; font-size:1.7rem; font-weight:700; letter-spacing:-.03em; color:#f4efe9; }
  .vr-checkout-close{ position:absolute; top:1rem; right:1rem; width:40px; height:40px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.12);
    border-radius:999px; background:rgba(0,0,0,.2); color:#f4efe9; font-size:1.4rem; line-height:1; cursor:pointer; }
  .vr-checkout-close:hover:not(:disabled){ background:rgba(255,255,255,.1); }
  .vr-checkout-methods{ display:grid; grid-template-columns:1fr 1fr; gap:.3rem; padding:.3rem; border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(255,255,255,.04); }
  .vr-checkout-methods button{ display:flex; align-items:center; justify-content:center; gap:.55rem; min-height:42px; border:0; border-radius:999px; background:transparent; color:rgba(244,239,233,.7); font:inherit; font-weight:600; cursor:pointer; }
  .vr-pay-mark{ flex:0 0 auto; display:block; }
  .vr-checkout-methods button[aria-selected="true"]{ background:#f4efe9; color:#141414; }
  .vr-checkout-form{ display:grid; gap:.6rem; }
  .vr-checkout-form label{ font-size:.72rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:rgba(212,205,189,.75); }
  .vr-checkout-form input{ height:56px; padding:0 1rem; border:1px solid rgba(255,255,255,.14); border-radius:16px; background:rgba(245,239,232,.06); color:#f5efe8;
    font:inherit; font-size:1.05rem; outline:none; }
  .vr-checkout-form input:focus{ border-color:rgba(232,57,79,.8); box-shadow:0 0 0 3px rgba(232,57,79,.25); }
  .vr-checkout-form input[aria-invalid="true"]{ border-color:#f3a3ae; }
  .vr-checkout-hint{ margin:0; font-size:.86rem; line-height:1.5; color:rgba(217,210,201,.75); }
  .vr-checkout-primary{ min-height:54px; margin-top:.4rem; border:0; border-radius:999px; background:#C41E3A; color:#fff; font:inherit; font-size:1rem; font-weight:700; cursor:pointer;
    transition:background-color 150ms ease-out, transform 120ms ease-out; }
  .vr-checkout-primary:hover:not(:disabled){ background:#8F1229; }
  .vr-checkout-primary:active:not(:disabled){ transform:scale(.97); }
  .vr-checkout-primary:disabled{ opacity:.6; cursor:wait; }
  .vr-checkout-status{ display:grid; justify-items:center; gap:.5rem; text-align:center; padding:1rem 0; }
  .vr-checkout-status p{ margin:0; color:rgba(244,239,233,.8); line-height:1.5; }
  .vr-checkout-status .vr-checkout-status-title{ font-size:1.15rem; font-weight:700; color:#f4efe9; }
  .vr-checkout-spinner{ width:44px; height:44px; border-radius:50%; border:3px solid rgba(255,255,255,.15); border-top-color:#e8394f; animation:vr-checkout-spin 900ms linear infinite; }
  .vr-checkout-tick{ width:52px; height:52px; display:grid; place-items:center; border-radius:50%; background:#1e7a4a; color:#fff; font-size:1.5rem; font-weight:700; }
  .vr-checkout-error{ margin:0; padding:.7rem .9rem; border:1px solid rgba(243,163,174,.35); border-radius:12px; background:rgba(196,30,58,.12); color:#f6c4cb; font-size:.88rem; line-height:1.45; }
  .vr-checkout-link{ justify-self:center; align-self:center; padding:.3rem; border:0; background:none; color:rgba(244,239,233,.75); font:inherit; font-size:.88rem; font-weight:600;
    text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
  .vr-checkout :focus-visible{ outline:3px solid rgba(232,57,79,.55); outline-offset:2px; }
  @keyframes vr-checkout-fade{ from{ opacity:0; } to{ opacity:1; } }
  @keyframes vr-checkout-pop{ from{ opacity:0; transform:translateY(12px) scale(.98); } to{ opacity:1; transform:none; } }
  @keyframes vr-checkout-spin{ to{ transform:rotate(360deg); } }
  @media (max-width:760px){
    .vr-checkout{ padding:0; align-items:stretch; }
    .vr-checkout-card{ grid-template-columns:minmax(0,1fr); grid-template-rows:auto 1fr; width:100%; max-height:none; min-height:100dvh; border-radius:0; border:0; overflow-y:auto; }
    .vr-checkout-summary{ padding:1.4rem 1.4rem 1.2rem; }
    .vr-checkout-summary ul, .vr-checkout-secure{ display:none; }
    .vr-checkout-eyebrow{ margin-bottom:.8rem; }
    .vr-checkout-price{ margin-bottom:0; }
    .vr-checkout-pay{ justify-content:flex-start; border-left:0; border-top:1px solid rgba(255,255,255,.08); overflow:visible; }
  }
  @media (prefers-reduced-motion:reduce){ .vr-checkout, .vr-checkout-card{ animation:none; } .vr-checkout-spinner{ animation-duration:2.5s; } }
`;
