import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  cachedHostBilling, cancelSubscription, cardUpdateLink, formatDate, formatKes, invalidateHostBilling, listingAllowance, loadHostBilling,
  methodLabel, PAYMENT_STATUS_LABELS, planSummary, type BillingPayment, type HostBilling,
} from '../../lib/billing/hostBilling';
import { ChevronRight, DetailHead, INFO_ICONS } from './SettingsIcons';

// Settings → Plans & Billing (hosts): the current plan or pay-as-you-list,
// plan listings left, the payment method, billing history with receipts, and
// cancelling the subscription.

type Notify = (message: string) => void;

export const PLANS_STYLES = `
  .settings-page .plan-card{ padding:1.2rem; display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
  .settings-page .plan-name{ font-size:1.25rem; font-weight:700; letter-spacing:-.01em; }
  .settings-page .plan-badge{ display:inline-block; margin-left:.55rem; vertical-align:middle; font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:.18rem .5rem; border-radius:100px; border:1px solid var(--line); color:var(--muted); }
  .settings-page .plan-badge.warn{ color:var(--red-deep); border-color:rgba(196,30,58,.45); }
  .settings-page .plan-line{ color:var(--muted); font-size:.86rem; margin-top:.35rem; line-height:1.45; max-width:36rem; }
  .settings-page .plan-price{ font-size:.9rem; font-weight:600; margin-top:.5rem; }
  .settings-page .plan-upgrade{ display:inline-flex; align-items:center; gap:.45rem; }
  .settings-page .allowance{ padding:1.1rem 1.2rem 1.2rem; }
  .settings-page .allowance-head{ display:flex; justify-content:space-between; align-items:baseline; gap:1rem; font-size:.86rem; }
  .settings-page .allowance-head strong{ font-size:1.5rem; font-weight:700; display:block; margin-top:.15rem; }
  .settings-page .allowance-bar{ height:6px; border-radius:100px; background:var(--line); margin-top:.9rem; overflow:hidden; }
  .settings-page .allowance-bar span{ display:block; height:100%; border-radius:inherit; background:var(--ink); }
  .settings-page .allowance-bar.full span{ background:var(--red); }
  .settings-page .allowance-note{ color:var(--muted); font-size:.78rem; margin-top:.6rem; }
  .settings-page .row-action{ flex-shrink:0; }
  .settings-page .history{ list-style:none; margin:0; padding:0; }
  .settings-page .history li{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.25rem 1rem; padding:.85rem 0; border-top:1px solid var(--line); }
  .settings-page .history li:first-child{ border-top:none; }
  .settings-page .history-desc{ font-size:.88rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .settings-page .history-meta{ color:var(--muted); font-size:.78rem; }
  .settings-page .history-amount{ font-size:.88rem; font-weight:600; text-align:right; }
  .settings-page .history-status{ font-size:.72rem; font-weight:700; text-align:right; color:var(--muted); }
  .settings-page .history-status.failed{ color:var(--red-deep); }
  .settings-page .history-receipt{ grid-column:1 / -1; justify-self:start; font-size:.78rem; font-weight:700; color:var(--ink); text-decoration:underline; text-underline-offset:2px; }
  .settings-page .history-empty{ color:var(--muted); font-size:.85rem; padding:.2rem 0; }
  .settings-page .danger-card .info-row .info-label{ color:var(--red-deep); font-weight:600; }
  .settings-page .danger-chevron{ transition:transform .2s ease; display:flex; }
  .settings-page .danger-chevron.open{ transform:rotate(90deg); }
  .settings-page .cancel-actions{ display:flex; gap:.7rem; margin-top:.9rem; flex-wrap:wrap; }
  .settings-page .plans-skeleton{ height:6.5rem; border-radius:10px; border:1px solid var(--line); margin-bottom:2.2rem; background:linear-gradient(90deg, transparent, var(--line), transparent); background-size:200% 100%; animation:plans-shimmer 1.4s ease infinite; }
  @keyframes plans-shimmer{ from{ background-position:100% 0; } to{ background-position:-100% 0; } }
  .settings-page .receipt-dialog{ width:min(480px, calc(100vw - 2rem)); border:1px solid var(--line); border-radius:14px; padding:1.6rem; background:var(--paper); color:var(--ink); box-shadow:0 20px 70px rgba(0,0,0,.6); }
  .settings-page .receipt-dialog::backdrop{ background:rgba(0,0,0,.72); }
  .settings-page .receipt-brand{ font-family:var(--font-brand); font-weight:900; font-size:1.4rem; }
  .settings-page .receipt-brand .va{ color:var(--red); }
  .settings-page .receipt-title{ font-size:1rem; font-weight:700; margin:1rem 0 .2rem; }
  .settings-page .receipt-amount{ font-size:1.8rem; font-weight:700; margin:.2rem 0 1.1rem; }
  .settings-page .receipt-rows{ margin:0; border-top:1px solid var(--line); }
  .settings-page .receipt-rows div{ display:flex; justify-content:space-between; gap:1rem; padding:.6rem 0; border-bottom:1px solid var(--line); font-size:.84rem; }
  .settings-page .receipt-rows dt{ color:var(--muted); }
  .settings-page .receipt-rows dd{ margin:0; text-align:right; font-weight:600; word-break:break-all; }
  .settings-page .receipt-foot{ color:var(--muted); font-size:.74rem; margin-top:1rem; line-height:1.45; }
  .settings-page .receipt-actions{ display:flex; justify-content:flex-end; gap:.7rem; margin-top:1.2rem; }
  @media print{
    body.printing-receipt *{ visibility:hidden !important; }
    body.printing-receipt .receipt-dialog, body.printing-receipt .receipt-dialog *{ visibility:visible !important; }
    body.printing-receipt .receipt-dialog{ position:absolute; inset:0 auto auto 0; margin:0; width:100%; max-width:none; border:none; box-shadow:none; background:#fff; color:#000; }
    body.printing-receipt .receipt-dialog .receipt-rows dt, body.printing-receipt .receipt-dialog .receipt-foot{ color:#555; }
    body.printing-receipt .receipt-dialog::backdrop{ background:none; }
    body.printing-receipt .receipt-actions{ display:none !important; }
  }
`;

function ReceiptDialog({ payment, billedTo, email, onClose }: { payment: BillingPayment | null; billedTo: string; email: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (payment && !dialog.open) dialog.showModal();
    if (!payment && dialog.open) dialog.close();
  }, [payment]);
  useEffect(() => {
    const done = () => document.body.classList.remove('printing-receipt');
    window.addEventListener('afterprint', done);
    return () => { window.removeEventListener('afterprint', done); done(); };
  }, []);
  const print = () => {
    document.body.classList.add('printing-receipt');
    window.print();
  };
  const method = payment ? methodLabel(payment.method) : null;
  return (
    <dialog className="receipt-dialog" ref={ref} aria-labelledby="receipt-title" onClose={onClose}>
      {payment && (
        <>
          <div className="receipt-brand"><span className="va">Va</span><span className="room">Room</span></div>
          <p className="receipt-title" id="receipt-title">Payment receipt</p>
          <p className="receipt-amount">{formatKes(payment.amount_minor)}</p>
          <dl className="receipt-rows">
            <div><dt>Billed to</dt><dd>{billedTo}{email ? <><br />{email}</> : null}</dd></div>
            <div><dt>Description</dt><dd>{payment.description}</dd></div>
            <div><dt>Date paid</dt><dd>{formatDate(payment.paid_at || payment.created_at)}</dd></div>
            {method && <div><dt>Payment method</dt><dd>{method.detail ? `${method.title} — ${method.detail}` : method.title}</dd></div>}
            <div><dt>Reference</dt><dd>{payment.reference}</dd></div>
            <div><dt>Status</dt><dd>{PAYMENT_STATUS_LABELS[payment.status]}</dd></div>
          </dl>
          <p className="receipt-foot">Paid to VaRoom through Paystack. Keep this receipt for your records; quote the reference if you contact support.</p>
          <div className="receipt-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn" onClick={print}>Print or save as PDF</button>
          </div>
        </>
      )}
    </dialog>
  );
}

export default function PlansSection({ userId, token, billedTo, email, onBack, notify }: {
  userId: string; token: string | null; billedTo: string; email: string; onBack: () => void; notify: Notify;
}) {
  const [billing, setBilling] = useState<HostBilling | null>(() => cachedHostBilling(userId));
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [openingCard, setOpeningCard] = useState(false);
  const [receipt, setReceipt] = useState<BillingPayment | null>(null);

  const load = useCallback((force = false) => {
    if (!token) return () => undefined;
    let cancelled = false;
    loadHostBilling(userId, token, { force }).then((value) => {
      if (!cancelled) { setBilling(value); setError(''); }
    }).catch((loadError: Error) => {
      console.error('Plans & Billing could not load:', loadError);
      if (!cancelled) setError('Your plan couldn’t be loaded. Check your connection and try again.');
    });
    return () => { cancelled = true; };
  }, [userId, token]);
  useEffect(() => load(), [load]);

  const summary = billing ? planSummary(billing) : null;
  const allowance = billing ? listingAllowance(billing) : null;
  const method = billing ? methodLabel(billing.paymentMethod) : null;
  const payments = billing ? billing.payments : null;

  const updateCard = async () => {
    if (!token || openingCard) return;
    // Opened at once (keeps the click's popup permission), then pointed at Paystack.
    const tab = window.open('', '_blank');
    setOpeningCard(true);
    try {
      const link = await cardUpdateLink(token);
      if (tab) { tab.opener = null; tab.location.href = link; } else window.location.href = link;
    } catch (cardError) {
      if (tab) tab.close();
      notify((cardError as Error).message || 'Unable to open the card update page');
    } finally {
      setOpeningCard(false);
    }
  };

  const cancel = async () => {
    if (!token || cancelling) return;
    setCancelling(true);
    try {
      const subscription = await cancelSubscription(token);
      invalidateHostBilling(userId);
      setConfirmCancel(false);
      setDangerOpen(false);
      notify(`Subscription cancelled. ${summary?.name || 'Your plan'} stays active until ${formatDate(subscription?.current_period_end)}.`);
      load(true);
    } catch (cancelError) {
      notify((cancelError as Error).message || 'Unable to cancel your subscription');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div id="view-plans">
      <DetailHead title="Plans & Billing" onBack={onBack} />
      <p className="detail-sub">Your plan, listings, payment method and billing history.</p>

      {!billing && !error && <><div className="plans-skeleton" /><div className="plans-skeleton" /></>}
      {!billing && error && (
        <div className="settings-section">
          <p className="inline-msg error">{error}</p>
          <button type="button" className="btn btn-ghost" style={{ marginTop: '.8rem' }} onClick={() => { setError(''); load(true); }}>Try again</button>
        </div>
      )}

      {billing && summary && (
        <>
          <div className="settings-section">
            <p className="section-title">Current plan</p>
            <div className="card plan-card" id="current-plan">
              <div>
                <div className="plan-name">
                  {summary.name}
                  {summary.status === 'past_due' && <span className="plan-badge warn">Payment due</span>}
                  {summary.status === 'cancel_requested' && <span className="plan-badge">Cancelled</span>}
                </div>
                <p className="plan-line">{summary.line}</p>
                {summary.price && <p className="plan-price">{summary.price}</p>}
              </div>
              {summary.canUpgrade && (
                <Link href="/pricing" className="btn btn-danger plan-upgrade">{INFO_ICONS.sparkle} Upgrade</Link>
              )}
            </div>
          </div>

          {allowance && (
            <div className="settings-section">
              <p className="section-title">Listings</p>
              <div className="card allowance" id="listing-allowance">
                {allowance.limit ? (
                  <>
                    <div className="allowance-head">
                      <span>Remaining listings<strong>{allowance.remaining}</strong></span>
                      <span style={{ color: 'var(--muted)' }}>{allowance.active} of {allowance.limit} active</span>
                    </div>
                    <div className={`allowance-bar${allowance.remaining === 0 ? ' full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={allowance.limit} aria-valuenow={allowance.active} aria-label="Plan listings in use">
                      <span style={{ width: `${allowance.percent}%` }} />
                    </div>
                    <p className="allowance-note">{allowance.remaining === 0 ? 'You’ve used every listing on your plan. Upgrade, or pay for extra listings one at a time.' : 'Listings you pay for one at a time aren’t counted here.'}</p>
                  </>
                ) : (
                  <div className="allowance-head"><span>{allowance.active} active listings</span><span style={{ color: 'var(--muted)' }}>No listing limit on this plan</span></div>
                )}
              </div>
            </div>
          )}

          <div className="settings-section">
            <p className="section-title">Payment method</p>
            <div className="card">
              <div className="info-row" id="payment-method">
                <span className="info-icon">{INFO_ICONS.card}</span>
                <span className="info-main">
                  <span className="info-label">{method ? method.title : 'No payment method yet'}</span>
                  <span className="info-value" style={{ fontWeight: method ? 600 : 500 }}>{method ? method.detail || method.title : 'You choose how to pay at checkout.'}</span>
                </span>
                {summary.canUpdateCard && billing.paymentMethod?.channel === 'card' && (
                  <button type="button" className="btn btn-ghost row-action" onClick={() => { void updateCard(); }} disabled={openingCard}>{openingCard ? 'Opening...' : 'Update card'}</button>
                )}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <p className="section-title">Billing information</p>
            <div className="card">
              <div className="info-row">
                <span className="info-icon">{INFO_ICONS.receipt}</span>
                <span className="info-main">
                  <span className="info-label">Billing history</span>
                  <span className="info-value" style={{ fontWeight: 500 }}>Plan and pay-as-you-list payments, with receipts.</span>
                </span>
                <button type="button" className="btn btn-ghost row-action" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? 'Hide' : 'Invoices'}</button>
              </div>
              <div className={`expand-panel${historyOpen ? ' show' : ''}`} id="billing-history">
                {payments === null && <p className="history-empty">Your billing history couldn’t be loaded. Try again later.</p>}
                {payments && !payments.length && <p className="history-empty">No payments yet.</p>}
                {payments && payments.length > 0 && (
                  <ul className="history">
                    {payments.map((payment) => (
                      <li key={payment.id}>
                        <span className="history-desc" title={payment.description}>{payment.description}</span>
                        <span className="history-amount">{formatKes(payment.amount_minor)}</span>
                        <span className="history-meta">{formatDate(payment.paid_at || payment.created_at)}</span>
                        <span className={`history-status ${payment.status}`}>{PAYMENT_STATUS_LABELS[payment.status]}</span>
                        {payment.status === 'succeeded' && (
                          <button type="button" className="history-receipt" onClick={() => setReceipt(payment)}>View receipt</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {summary.canCancel && (
            <div className="settings-section">
              <p className="section-title">Danger zone</p>
              <div className="card danger-card">
                <div className="info-row clickable" id="danger-zone" role="button" tabIndex={0} aria-expanded={dangerOpen}
                  onClick={() => { setDangerOpen((open) => !open); setConfirmCancel(false); }}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDangerOpen((open) => !open); setConfirmCancel(false); } }}>
                  <span className="info-icon" style={{ color: 'var(--red-deep)' }}>{INFO_ICONS.warning}</span>
                  <span className="info-main">
                    <span className="info-label">Cancel subscription</span>
                    <span className="info-value" style={{ fontWeight: 500 }}>Stop your {summary.name} plan from renewing.</span>
                  </span>
                  <span className={`danger-chevron${dangerOpen ? ' open' : ''}`}><ChevronRight size={16} /></span>
                </div>
                <div className={`expand-panel${dangerOpen ? ' show' : ''}`} id="cancel-panel">
                  {!confirmCancel ? (
                    <>
                      <p className="inline-msg neutral">You won’t be charged again. Your {summary.name} plan and its listings stay active until {formatDate(billing.entitlements.subscription?.current_period_end)}.</p>
                      <button type="button" className="btn btn-danger" style={{ marginTop: '.9rem' }} onClick={() => setConfirmCancel(true)}>Cancel subscription</button>
                    </>
                  ) : (
                    <>
                      <p className="inline-msg neutral">Are you sure you want to cancel your {summary.name} subscription?</p>
                      <div className="cancel-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Keep my plan</button>
                        <button type="button" className="btn btn-danger" onClick={() => { void cancel(); }} disabled={cancelling}>{cancelling ? 'Cancelling...' : 'Yes, cancel subscription'}</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <ReceiptDialog payment={receipt} billedTo={billedTo} email={email} onClose={() => setReceipt(null)} />
    </div>
  );
}
