import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth/AuthProvider';
import {
  changeListingStatus, deleteConfirmText, deleteLabel, deleteListing, duplicateListing, editHref, editLabel, invalidateListingFeeds,
  isDraft, isStatusPending, ListingActionError, listingShareUrl, publishListingDeleted, STATUS_ACTIONS, type ListingStatus, type MenuListing,
} from '../../lib/listings/hostListingActions';

// The ⋮ menu on a host's own listing card, replacing
// public/js/host-listing-controls.js: the same items, wording, confirmation
// and toasts. The dropdown opens over the page (fixed, kept inside the
// viewport, above the button when there is more room there).

const STYLE_ID = 'vr-listing-menu-styles';
const STYLES = `
  .vr-listing-menu-wrap{ position:relative; }
  .vr-listing-menu-btn{ width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; cursor:pointer; }
  .vr-listing-menu{ position:fixed; z-index:1000; min-width:180px; max-width:calc(100vw - 16px); padding:.4rem; overflow-y:auto; overscroll-behavior:contain;
    background:#fff; color:#24211E; border:1px solid #E4E1DA; border-radius:12px; box-shadow:0 12px 30px rgba(26,18,16,.2); }
  .vr-listing-menu .card-menu-item{ display:block; width:100%; text-align:left; padding:.55rem .7rem; border-radius:8px; color:inherit; font-size:.8rem; background:transparent; border:0; cursor:pointer; font-family:inherit; }
  .vr-listing-menu .card-menu-item:hover{ background:rgba(196,30,58,.08); }
  .vr-listing-menu .card-menu-item:disabled{ opacity:.6; cursor:default; }
  .vr-listing-menu .card-menu-item:disabled:hover{ background:transparent; }
  .vr-listing-menu .card-menu-item.destructive{ border-top:1px solid #E4E1DA; margin-top:.3rem; border-radius:0 0 8px 8px; color:#C41E3A; }
  .vr-listing-menu .card-menu-section{ padding:.45rem .7rem .2rem; opacity:.75; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
  html[data-theme="dark"] .vr-listing-menu{ background:#141212; color:#E7E9EA; border-color:rgba(255,255,255,.11); box-shadow:0 12px 30px rgba(0,0,0,.6); }
  html[data-theme="dark"] .vr-listing-menu .card-menu-item.destructive{ color:#ff7186; border-top-color:rgba(255,255,255,.11); }
  .vr-listing-confirm{ position:fixed; inset:0; z-index:1100; display:flex; align-items:center; justify-content:center; padding:1.5rem; background:rgba(26,18,16,.5); }
  .vr-listing-confirm-card{ background:#F7F6F3; color:#24211E; border-radius:20px; max-width:460px; width:100%; padding:2rem 1.8rem; box-shadow:0 40px 80px -30px rgba(26,18,16,.5); }
  .vr-listing-confirm-card h2{ font-family:'Helvetica Neue', Arial, sans-serif; font-weight:600; font-size:1.3rem; margin:0 0 1.4rem; }
  .vr-listing-confirm-card p{ margin:0; line-height:1.5; }
  .vr-listing-confirm-actions{ display:flex; gap:.8rem; margin-top:1.4rem; }
  .vr-listing-confirm-actions button{ flex:1; padding:.8rem; border-radius:100px; font-weight:600; font-size:.9rem; cursor:pointer; font-family:inherit; }
  .vr-listing-confirm-cancel{ background:transparent; border:1.5px solid #E4E1DA; color:inherit; }
  .vr-listing-confirm-delete{ background:#8F1229; color:#fff; border:0; }
  .vr-listing-confirm-delete:disabled{ opacity:.6; cursor:not-allowed; }
  html[data-theme="dark"] .vr-listing-confirm-card{ background:#000; color:#E7E9EA; }
  html[data-theme="dark"] .vr-listing-confirm-cancel{ border-color:rgba(255,255,255,.12); }
`;

function useStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }, []);
}

const stop = (event: React.SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };

export interface HostListingMenuProps {
  listing: MenuListing;
  notify: (message: string) => void;
  /** The status shown on the card changed (optimistically, then confirmed or rolled back). */
  onStatus?: (id: string, status: string) => void;
  onDeleted?: (id: string) => void;
  /** Class for the ⋮ button (the page styles it). */
  buttonClassName?: string;
}

export default function HostListingMenu({ listing, notify, onStatus, onDeleted, buttonClassName = '' }: HostListingMenuProps) {
  useStyles();
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token || null;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [saving, setSaving] = useState<ListingStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  const setStatus = async (status: ListingStatus) => {
    if (isStatusPending(listing.id)) return;
    setSaving(status);
    onStatus?.(listing.id, status);
    const result = await changeListingStatus(token, listing, status);
    setSaving(null);
    if (!result) return;
    onStatus?.(listing.id, result.status);
    if (result.error) notify(result.error);
  };

  const share = async () => {
    const url = listingShareUrl(window.location.origin, listing.id);
    if (navigator.share) {
      try { await navigator.share({ title: `${listing.title || ''} — VaRoom`, url }); } catch (error) { if ((error as Error).name !== 'AbortError') notify('Unable to share listing'); }
      return;
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) { notify('Sharing is not supported in this browser'); return; }
    try { await navigator.clipboard.writeText(url); notify('Listing link copied'); } catch { notify('Unable to copy listing link'); }
  };

  const copy = async () => {
    if (!navigator.clipboard || !navigator.clipboard.writeText) { notify('Copying is not supported in this browser'); return; }
    try { await navigator.clipboard.writeText(listingShareUrl(window.location.origin, listing.id)); notify('Listing link copied'); } catch { notify('Unable to copy listing link'); }
  };

  const duplicate = async () => {
    try { await duplicateListing(token, listing.id); invalidateListingFeeds(); notify('Listing duplicated'); } catch (error) { notify((error as Error).message); }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteListing(token, listing.id);
      setConfirming(false);
      publishListingDeleted(listing.id);
      onDeleted?.(listing.id);
      notify(isDraft(listing) ? 'Draft listing permanently deleted' : 'Listing deleted');
    } catch (error) {
      setConfirming(false);
      // The listing is gone even though its media cleanup failed (as host-listing-controls.js did).
      if (error instanceof ListingActionError && error.code === 'LISTING_DELETED_MEDIA_CLEANUP_FAILED') {
        publishListingDeleted(listing.id);
        onDeleted?.(listing.id);
      }
      notify((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const act = (run: () => void) => (event: React.MouseEvent) => { stop(event); close(); run(); };
  const current = listing.availability_status || 'available';
  const confirmText = deleteConfirmText(listing);

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
          <button type="button" role="menuitem" className="card-menu-item" onClick={act(() => { void router.push(editHref(listing)); })}>{editLabel(listing)}</button>
          <div className="card-menu-section">Change listing status</div>
          {STATUS_ACTIONS.map(({ status, label }) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              className="card-menu-item"
              disabled={Boolean(saving) || current === status}
              aria-busy={saving === status}
              onClick={act(() => { void setStatus(status); })}
            >{saving === status ? 'Saving...' : label}</button>
          ))}
          <button type="button" role="menuitem" className="card-menu-item" onClick={act(() => { void share(); })}>Share listing</button>
          <button type="button" role="menuitem" className="card-menu-item" onClick={act(() => { void copy(); })}>Copy listing link</button>
          <button type="button" role="menuitem" className="card-menu-item" onClick={act(() => { void router.push(`/bookings?listing=${encodeURIComponent(listing.id)}`); })}>View bookings</button>
          <button type="button" role="menuitem" className="card-menu-item" onClick={act(() => { void router.push(`/analytics?listing=${encodeURIComponent(listing.id)}`); })}>View analytics</button>
          <button type="button" role="menuitem" className="card-menu-item" onClick={act(() => { void duplicate(); })}>Duplicate listing</button>
          <button type="button" role="menuitem" className="card-menu-item destructive" onClick={act(() => setConfirming(true))}>{deleteLabel(listing)}</button>
        </div>,
        document.body,
      )}
      {confirming && typeof document !== 'undefined' && createPortal(
        <div className="vr-listing-confirm" onClick={(event) => { stop(event); if (event.target === event.currentTarget && !deleting) setConfirming(false); }}>
          <div className="vr-listing-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby={`vr-delete-${listing.id}`}>
            <h2 id={`vr-delete-${listing.id}`}>{confirmText.title}</h2>
            <p>{confirmText.body}</p>
            <div className="vr-listing-confirm-actions">
              <button type="button" className="vr-listing-confirm-cancel" disabled={deleting} onClick={(event) => { stop(event); setConfirming(false); }}>Keep listing</button>
              <button type="button" ref={confirmRef} className="vr-listing-confirm-delete" disabled={deleting} onClick={(event) => { stop(event); void remove(); }}>Delete permanently</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
