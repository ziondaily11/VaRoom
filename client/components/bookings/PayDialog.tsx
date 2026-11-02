import React, { useEffect, useRef, useState } from 'react';
import { formatAmount, type Booking } from '../../lib/bookings/format';

// The payment flow preview: method → processing → result. Online payment is
// not connected yet, so nothing is charged and the result points the guest to
// their host. The client never decides that a payment succeeded.

type Step = 'method' | 'processing' | 'result';
type Method = 'mpesa' | 'card';

const PROCESSING_MS = 1400;

export default function PayDialog({ booking, onClose, onMessageHost }: {
  booking: Booking;
  onClose: () => void;
  onMessageHost: () => void;
}) {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<Method>('mpesa');
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (step !== 'processing') return undefined;
    const timer = window.setTimeout(() => setStep('result'), PROCESSING_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  const amount = formatAmount(booking.total_price);
  return (
    <div className="desktop-pay-backdrop show" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="desktop-pay-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-pay-title">
        {step === 'method' && (
          <div>
            <div className="desktop-pay-head">
              <h2 className="desktop-pay-title" id="desktop-pay-title">Choose payment method</h2>
              <button type="button" className="desktop-pay-close" ref={closeRef} onClick={onClose} aria-label="Close payment">&times;</button>
            </div>
            <p className="desktop-pay-summary">{`Paying KSh ${amount} for ${(booking.listing && booking.listing.title) || 'this listing'}`}</p>
            <button type="button" className={`desktop-pay-option${method === 'mpesa' ? ' selected' : ''}`} onClick={() => setMethod('mpesa')}>
              <span><span className="desktop-pay-option-label">M-Pesa</span><span className="desktop-pay-option-sub">Pay with your phone via M-Pesa STK push</span></span>
            </button>
            <button type="button" className={`desktop-pay-option${method === 'card' ? ' selected' : ''}`} onClick={() => setMethod('card')}>
              <span><span className="desktop-pay-option-label">Card</span><span className="desktop-pay-option-sub">Debit or credit card</span></span>
            </button>
            <button type="button" className="desktop-pay-continue" onClick={() => setStep('processing')}>Continue</button>
            <button type="button" className="desktop-pay-cancel" onClick={onClose}>Cancel</button>
          </div>
        )}
        {step === 'processing' && (
          <div className="desktop-pay-processing">
            <div className="desktop-pay-spinner" aria-hidden="true" />
            <h3 id="desktop-pay-title">Processing your payment…</h3>
            <p>{method === 'mpesa'
              ? 'Confirming with M-Pesa. This can take up to a minute — don’t close this window.'
              : 'Confirming your card payment — don’t close this window.'}</p>
          </div>
        )}
        {step === 'result' && (
          <div className="desktop-pay-result">
            <h3 id="desktop-pay-title">Online payment isn&apos;t connected yet</h3>
            <p>This is a preview of the payment flow — nothing was charged. In the meantime, coordinate payment for this booking directly with your host via chat.</p>
            <button type="button" className="desktop-pay-continue" onClick={onMessageHost}>Message host</button>
            <button type="button" className="desktop-pay-cancel" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
