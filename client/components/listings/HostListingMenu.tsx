import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import {
  changeListingStatus, deleteConfirmText, deleteLabel, deleteListing, duplicateListing, editHref, editLabel, invalidateListingFeeds,
  isDraft, isStatusPending, ListingActionError, listingShareUrl, markListing, publishListingDeleted, publishListingUpdate, relistListing, requestsLabel,
  setUnderOffer, sharesWithSheet, statusControls, undoOutcome, unitsPatch, type ListingPatch, type ListingStatus, type MenuListing, type ToastAction,
} from '../../lib/listings/hostListingActions';
import { isMarkedStatus, unitsLeft, type ListingOutcome } from '../../lib/listings/listingAction';

// The ⋮ menu on a host's own listing card (it replaced
// public/js/host-listing-controls.js). Every niche can edit, pause or make
// available, share, view its requests and analytics, duplicate and delete.
// Property, offices and shops are also marked sold / rented / leased (some
// units, or the whole listing), relisted, and a sale put under offer. The
// dropdown opens over the page (fixed, kept inside the viewport, above the
// button when there is more room there).

const STYLE_ID = 'vr-listing-menu-styles';
const STYLES = `
  .vr-listing-menu-wrap{ position:relative; }
  .vr-listing-menu-btn{ width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; cursor:pointer; }
  .vr-listing-menu{ position:fixed; z-index:1000; min-width:180px; max-width:calc(100vw - 16px); padding:.4rem; overflow-y:auto; overscroll-behavior:contain;
    background:var(--va-light); color:#24211E; border:1px solid #E4E1DA; border-radius:12px; box-shadow:0 12px 30px rgba(26,18,16,.2); }
  .vr-listing-menu .card-menu-item{ display:block; width:100%; text-align:left; padding:.55rem .7rem; border-radius:8px; color:inherit; font-size:.8rem; background:transparent; border:0; cursor:pointer; font-family:inherit; }
  .vr-listing-menu .card-menu-item:hover{ background:rgba(196,30,58,.08); }
  .vr-listing-menu .card-menu-item:disabled{ opacity:.6; cursor:default; }
  .vr-listing-menu .card-menu-item:disabled:hover{ background:transparent; }
  .vr-listing-menu .card-menu-item.destructive{ border-top:1px solid #E4E1DA; margin-top:.3rem; border-radius:0 0 8px 8px; color:#C41E3A; }
  .vr-listing-menu .card-menu-section{ padding:.45rem .7rem .2rem; opacity:.75; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
  html[data-theme="dark"] .vr-listing-menu{ background:#141212; color:#E7E9EA; border-color:rgba(255,255,255,.11); box-shadow:0 12px 30px rgba(0,0,0,.6); }
  html[data-theme="dark"] .vr-listing-menu .card-menu-item.destructive{ color:#ff7186; border-top-color:rgba(255,255,255,.11); }
  .vr-listing-confirm{ position:fixed; inset:0; z-index:1100; display:flex; align-items:center; justify-content:center; padding:1.5rem; background:rgba(26,18,16,.5); }
  .vr-listing-confirm-card{ background:var(--va-light); color:#24211E; border-radius:20px; max-width:460px; width:100%; padding:2rem 1.8rem; box-shadow:0 40px 80px -30px rgba(26,18,16,.5); }
  .vr-listing-confirm-card h2{ font-family:'Helvetica Neue', Arial, sans-serif; font-weight:600; font-size:1.3rem; margin:0 0 1.4rem; }
  .vr-listing-confirm-card p{ margin:0; line-height:1.5; }
  .vr-listing-confirm-actions{ display:flex; gap:.8rem; margin-top:1.4rem; }
  .vr-listing-confirm-actions button{ flex:1; padding:.8rem; border-radius:100px; font-weight:600; font-size:.9rem; cursor:pointer; font-family:inherit; }
  .vr-listing-confirm-cancel{ background:transparent; border:1.5px solid #E4E1DA; color:inherit; }
  .vr-listing-confirm-delete{ background:#8F1229; color:#fff; border:0; }
  .vr-listing-confirm-delete:disabled{ opacity:.6; cursor:not-allowed; }
  .vr-listing-confirm-ok{ background:#24211E; color:#fff; border:0; }
  .vr-listing-confirm-ok:disabled{ opacity:.6; cursor:not-allowed; }
  .vr-listing-field{ display:block; margin-top:1.1rem; font-size:.82rem; font-weight:600; }
  .vr-listing-field small{ font-weight:400; opacity:.7; }
  .vr-listing-field input{ display:block; width:100%; box-sizing:border-box; margin-top:.35rem; padding:.65rem .8rem; border:1.5px solid #E4E1DA; border-radius:12px; font:inherit; font-weight:400; background:transparent; color:inherit; }
  .vr-listing-confirm-error{ margin-top:.9rem !important; color:#C41E3A; font-size:.85rem; }
  html[data-theme="dark"] .vr-listing-confirm-card{ background:#000; color:#E7E9EA; }
  html[data-theme="dark"] .vr-listing-confirm-cancel{ border-color:rgba(255,255,255,.12); }
  html[data-theme="dark"] .vr-listing-confirm-ok{ background:#E7E9EA; color:#000; }
  html[data-theme="dark"] .vr-listing-field input{ border-color:rgba(255,255,255,.15); }
  html[data-theme="dark"] .vr-listing-confirm-error{ color:#ff7186; }
`;

/** The menu and confirmation styles, added once (also used by the draft card's Discard). */
export function useListingMenuStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }, []);
}

const stop = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };

const OUTCOME_COPY: Record<ListingOutcome, { verb: string; price: string }> = {
  sold: { verb: 'sold', price: 'Agreed sale price (KES)' },
  rented: { verb: 'rented', price: 'Agreed rent per month (KES)' },
  leased: { verb: 'leased', price: 'Agreed rent per month (KES)' },
};

type Dialog = { kind: 'delete' } | { kind: 'mark'; outcome: ListingOutcome } | { kind: 'relist' };

export interface HostListingMenuProps {
  listing: MenuListing;
  /** The page's toast; an action (Undo) is shown as a button in it. */
  notify: (message: string, action?: ToastAction) => void;
  /** The listing changed (optimistically, then confirmed or rolled back): its status, offer or units. */
  onChange?: (id: string, patch: ListingPatch) => void;
  onDeleted?: (id: string) => void;
  /** Class for the ⋮ button (the page styles it). */
  buttonClassName?: string;
}

export default function HostListingMenu({ listing, notify, onChange, onDeleted, buttonClassName = '' }: HostListingMenuProps) {
  useListingMenuStyles();
  const router = useRouter();
  const { session, user } = useAuth();
  const token = session?.access_token || null;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [saving, setSaving] = useState<ListingStatus | 'offer' | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [units, setUnits] = useState('1');
  const [amount, setAmount] = useState('');
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => { setOpen(false); setPosition(null); }, []);

  // Place the open menu: below the button, or above when there is more room.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const maxHeight = Math.max(0, window.innerHeight - 16);
    const height = Math.min(menu.height, maxHeight);
    const below = window.innerHeight - button.bottom - 8;
    const above = button.top - 8;
    const openAbove = below < height && above > below;
    const top = openAbove ? button.top - Math.min(height, above) : Math.min(button.bottom + 4, window.innerHeight - height - 8);
    const left = Math.min(Math.max(8, button.right - menu.width), window.innerWidth - menu.width - 8);
    setPosition({ top: Math.max(8, top), left: Math.max(8, left), maxHeight });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocument = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); buttonRef.current?.focus(); } };
    document.addEventListener('click', onDocument);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', onDocument);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  useEffect(() => { if (dialog?.kind === 'delete') confirmRef.current?.focus(); }, [dialog]);

  // A change reaches the feed cache, the pages still listening for it, and this card's page.
  const apply = (patch: ListingPatch) => {
    publishListingUpdate(listing.id, patch);
    onChange?.(listing.id, patch);
  };
  // Analytics counts what was sold, rented or leased: drop this account's cached figures.
  const refreshAnalytics = () => { if (user) void import('../../lib/analytics/analyticsCache').then((cache) => cache.invalidateAnalytics(user.id)); };

  const setStatus = async (status: ListingStatus) => {
    if (isStatusPending(listing.id)) return;
    setSaving(status);
    onChange?.(listing.id, { availability_status: status });
    const result = await changeListingStatus(token, listing, status);
    setSaving(null);
    if (!result) return;
    onChange?.(listing.id, { availability_status: result.status });
    if (result.error) notify(result.error);
  };

  const toggleOffer = async () => {
    const next = !listing.under_offer;
    setSaving('offer');
    try {
      apply({ under_offer: await setUnderOffer(token, listing.id, next) });
      notify(next ? 'Marked under offer' : 'No longer under offer');
    } catch (error) {
      notify(`Could not save the offer status: ${(error as Error).message}`);
    } finally {
      setSaving(null);
    }
  };

  const openDialog = (next: Dialog) => {
    setDialogError('');
    setAmount('');
    setUnits(next.kind === 'relist' ? String(unitsLeft(listing)) : '1');
    setDialog(next);
  };

  const undo = (outcomeId: string) => async () => {
    try {
      const restored = await undoOutcome(token, listing.id, outcomeId);
      apply({ availability_status: restored.availability_status, under_offer: restored.under_offer, ...unitsPatch(listing, restored.units_available) });
      refreshAnalytics();
      notify('Undone');
    } catch (error) {
      notify(`Could not undo: ${(error as Error).message}`);
    }
  };

  const mark = async (outcome: ListingOutcome) => {
    const count = Number(units);
    const price = amount.trim() === '' ? null : Number(amount.replace(/[,\s]/g, ''));
    if (!Number.isInteger(count) || count < 1 || count > unitsLeft(listing)) { setDialogError(`Choose between 1 and ${unitsLeft(listing)} units.`); return; }
    if (price !== null && !(Number.isFinite(price) && price >= 0)) { setDialogError('Enter the price as a number, or leave it empty.'); return; }
    setBusy(true);
    setDialogError('');
    try {
      const result = await markListing(token, listing.id, { outcome, units: count, agreedAmount: price });
      apply({ availability_status: result.listing.availability_status, under_offer: result.listing.under_offer, ...unitsPatch(listing, result.listing.units_available) });
      refreshAnalytics();
      setDialog(null);
      const offline = isMarkedStatus(result.listing.availability_status);
      notify(offline ? `Marked as ${OUTCOME_COPY[outcome].verb}` : `${count} ${count === 1 ? 'unit' : 'units'} marked ${OUTCOME_COPY[outcome].verb} · ${result.listing.units_available} left`,
        { label: 'Undo', run: undo(result.outcome.id) });
    } catch (error) {
      setDialogError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const relist = async () => {
    const count = Number(units);
    if (listing.category === 'property' && (!Number.isInteger(count) || count < 1)) { setDialogError('Enter how many units are available.'); return; }
    setBusy(true);
    setDialogError('');
    try {
      const status = await relistListing(token, listing.id, listing.category === 'property' ? count : null);
      apply({ availability_status: status, ...(listing.category === 'property' ? unitsPatch(listing, count) : {}) });
      refreshAnalytics();
      setDialog(null);
      notify('Back on the marketplace');
    } catch (error) {
      setDialogError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Phones and tablets: the share sheet. Computers: the link is copied.
  const share = async () => {
    const url = listingShareUrl(window.location.origin, listing.id);
    if (sharesWithSheet()) {
      try { await navigator.share({ title: `${listing.title || ''} — VaRoom`, url }); } catch (error) { if ((error as Error).name !== 'AbortError') notify('Unable to share listing'); }
      return;
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) { notify('Sharing is not supported in this browser'); return; }
    try { await navigator.clipboard.writeText(url); notify('Listing link copied'); } catch { notify('Unable to copy listing link'); }
  };

  const duplicate = async () => {
    try { await duplicateListing(token, listing.id); invalidateListingFeeds(); notify('Listing duplicated'); } catch (error) { notify((error as Error).message); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteListing(token, listing.id);
      setDialog(null);
      publishListingDeleted(listing.id);
      onDeleted?.(listing.id);
      notify(isDraft(listing) ? 'Draft listing permanently deleted' : 'Listing deleted');
    } catch (error) {
      setDialog(null);
      // The listing is gone even though its media cleanup failed (as host-listing-controls.js did).
      if (error instanceof ListingActionError && error.code === 'LISTING_DELETED_MEDIA_CLEANUP_FAILED') {
        publishListingDeleted(listing.id);
        onDeleted?.(listing.id);
      }
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const act = (run: () => void) => (event: React.MouseEvent) => { stop(event); close(); run(); };
  const requests = requestsLabel(listing);
  const confirmText = deleteConfirmText(listing);
  const left = unitsLeft(listing);
  const item = (label: React.ReactNode, run: () => void, options: { disabled?: boolean; busy?: boolean; className?: string } = {}) => (
    <button type="button" role="menuitem" className={`card-menu-item${options.className ? ` ${options.className}` : ''}`} disabled={options.disabled} aria-busy={options.busy} onClick={act(run)}>{label}</button>
  );

  let dialogBody: React.ReactNode = null;
  if (dialog?.kind === 'delete') {
    dialogBody = (
      <>
        <h2 id={`vr-dialog-${listing.id}`}>{confirmText.title}</h2>
        <p>{confirmText.body}</p>
        <div className="vr-listing-confirm-actions">
          <button type="button" className="vr-listing-confirm-cancel" disabled={busy} onClick={(event) => { stop(event); setDialog(null); }}>Keep listing</button>
          <button type="button" ref={confirmRef} className="vr-listing-confirm-delete" disabled={busy} onClick={(event) => { stop(event); void remove(); }}>Delete permanently</button>
        </div>
      </>
    );
  } else if (dialog?.kind === 'mark') {
    const copy = OUTCOME_COPY[dialog.outcome];
    const count = Number(units) || 0;
    dialogBody = (
      <form onSubmit={(event) => { stop(event); void mark(dialog.outcome); }}>
        <h2 id={`vr-dialog-${listing.id}`}>Mark {listing.title ? `“${listing.title}”` : 'this listing'} as {copy.verb}?</h2>
        <p>{left > 1 && count < left
          ? `${left - count} of ${left} units stay on the marketplace. These are counted as ${copy.verb} in your analytics.`
          : `It leaves the marketplace and counts as ${copy.verb} in your analytics. You can relist it later.`}</p>
        {left > 1 && (
          <label className="vr-listing-field">How many units? <small>({left} available)</small>
            <input type="number" inputMode="numeric" min={1} max={left} value={units} onChange={(event) => setUnits(event.target.value)} />
          </label>
        )}
        <label className="vr-listing-field">{copy.price} <small>optional</small>
          <input type="text" inputMode="numeric" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Leave empty to skip" />
        </label>
        {dialogError && <p className="vr-listing-confirm-error" role="alert">{dialogError}</p>}
        <div className="vr-listing-confirm-actions">
          <button type="button" className="vr-listing-confirm-cancel" disabled={busy} onClick={(event) => { stop(event); setDialog(null); }}>Cancel</button>
          <button type="submit" className="vr-listing-confirm-ok" disabled={busy}>{busy ? 'Saving…' : `Mark as ${copy.verb}`}</button>
        </div>
      </form>
    );
  } else if (dialog?.kind === 'relist') {
    dialogBody = (
      <form onSubmit={(event) => { stop(event); void relist(); }}>
        <h2 id={`vr-dialog-${listing.id}`}>Relist {listing.title ? `“${listing.title}”` : 'this listing'}?</h2>
        <p>It goes back on the marketplace. If its paid period has ended, you will need a plan or a new listing term first.</p>
        {listing.category === 'property' && (
          <label className="vr-listing-field">Units available
            <input type="number" inputMode="numeric" min={1} value={units} onChange={(event) => setUnits(event.target.value)} />
          </label>
        )}
        {dialogError && <p className="vr-listing-confirm-error" role="alert">{dialogError}</p>}
        <div className="vr-listing-confirm-actions">
          <button type="button" className="vr-listing-confirm-cancel" disabled={busy} onClick={(event) => { stop(event); setDialog(null); }}>Cancel</button>
          <button type="submit" className="vr-listing-confirm-ok" disabled={busy}>{busy ? 'Relisting…' : 'Relist'}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="card-menu-wrap vr-listing-menu-wrap" onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={`card-menu-btn vr-listing-menu-btn ${buttonClassName}`.trim()}
        aria-label="Manage listing"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => { stop(event); if (open) close(); else setOpen(true); }}
      >⋮</button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="card-menu-dropdown vr-listing-menu"
          role="menu"
          style={position ? { top: position.top, left: position.left, maxHeight: position.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
          onClick={(event) => event.stopPropagation()}
        >
          {item(editLabel(listing), () => { void router.push(editHref(listing)); })}
          <div className="card-menu-section">Change listing status</div>
          {statusControls(listing).map((control) => (
            <React.Fragment key={control.kind === 'mark' ? control.outcome : control.kind}>
              {control.kind === 'status' && item(saving === control.status ? 'Saving...' : control.label, () => { void setStatus(control.status); }, { disabled: Boolean(saving), busy: saving === control.status })}
              {control.kind === 'mark' && item(control.label, () => openDialog({ kind: 'mark', outcome: control.outcome }))}
              {control.kind === 'offer' && item(saving === 'offer' ? 'Saving...' : control.label, () => { void toggleOffer(); }, { disabled: Boolean(saving), busy: saving === 'offer' })}
              {control.kind === 'relist' && item(control.label, () => openDialog({ kind: 'relist' }))}
            </React.Fragment>
          ))}
          {item('Share listing', () => { void share(); })}
          {requests && item(requests, () => { void router.push(`/bookings?listing=${encodeURIComponent(listing.id)}`); })}
          {item('View analytics', () => { void router.push(`/analytics?listing=${encodeURIComponent(listing.id)}`); })}
          {item('Duplicate listing', () => { void duplicate(); })}
          {item(deleteLabel(listing), () => openDialog({ kind: 'delete' }), { className: 'destructive' })}
        </div>,
        document.body,
      )}
      {dialog && typeof document !== 'undefined' && createPortal(
        <div className="vr-listing-confirm" onClick={(event) => { stop(event); if (event.target === event.currentTarget && !busy) setDialog(null); }}>
          <div className="vr-listing-confirm-card" role={dialog.kind === 'delete' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={`vr-dialog-${listing.id}`}>
            {dialogBody}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
