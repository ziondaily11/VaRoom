import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useListingMenuStyles } from '../listings/HostListingMenu';
import { discardListingDraft } from '../../lib/listings/hostListingActions';
import { useCardGrid } from '../marketplace/useCardGrid';
import { listingCardStyles } from '../listings/listingCardStyles';
import type { ListingDraft } from '../../lib/profile/hostProfile';
import { draftTitle } from '../../lib/profile/profilePage';

// /profile's listing cards: the same Marketplace card as the host's public
// profile (about 280px wide, one full-width card per row on phones), the
// owner's draft card in the same shape, the loading cards, and the page's
// empty states (an icon, a title, one sentence and one action).
//
// Motion (animation.md): cards lift on hover (pointer devices only) and
// press to .97 (listingCardStyles); empty states fade and rise 8px once,
// 250 ms; the loading cards shimmer. Reduced motion: no movement, no
// shimmer.

const MOBILE_QUERY = '(max-width: 760px)';
const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const PROFILE_CARD_STYLES = `
  .profile-cards{ --font-display:${SYSTEM_FONT}; }
  .profile-cards .card, .profile-cards .card *{ margin:0; padding:0; box-sizing:border-box; }
  .profile-cards .card button{ font-family:inherit; }
  ${listingCardStyles('.profile-cards')}
  @media ${MOBILE_QUERY}{ .profile-cards .grid{ grid-template-columns:minmax(0,1fr); } }

  .profile-cards a.card{ display:block; color:inherit; text-decoration:none; }
  .profile-cards .draft-card-link{ position:absolute; inset:0; display:block; color:inherit; text-decoration:none; border-radius:inherit; }
  .profile-cards .draft-card-link:focus-visible{ outline:2px solid #e5384f; outline-offset:2px; }
  .profile-cards .draft-card .draft-discard-btn{ display:grid; place-items:center; cursor:pointer; }
  .profile-cards .draft-card .draft-discard-btn svg{ width:46%; height:46%; }
  @media (hover:hover){ .profile-cards .draft-card .draft-discard-btn:hover{ color:#C41E3A; } }
  .profile-cards .draft-card .card-media{ display:grid; place-items:center; background:linear-gradient(135deg, rgba(198,25,55,.28), rgba(30,20,18,.92)); color:rgba(255,255,255,.85); }
  .profile-cards .draft-card .card-media svg{ width:34px; height:34px; }
  .profile-cards .draft-card .card-category{ color:#C41E3A; }
  .profile-cards .draft-card .card-status{ color:#C41E3A; }

  .profile-cards .pc-skeleton{ aspect-ratio:1 / .95; border-radius:24px; background:linear-gradient(100deg, var(--mkt-card-placeholder) 20%, rgba(127,127,127,.18) 38%, var(--mkt-card-placeholder) 58%); background-size:220% 100%; animation:pc-shimmer 1.4s linear infinite; }
  @keyframes pc-shimmer{ to{ background-position-x:-220%; } }

  .pc-empty{
    grid-column:1 / -1; display:flex; flex-direction:column; align-items:center; gap:6px; margin:8px 0; padding:40px 20px;
    border-radius:22px; background:var(--pc-empty-bg, #f5f5f7); text-align:center; color:var(--ink);
    animation:pc-empty-in var(--motion-standard) var(--ease-out) both;
  }
  html[data-theme="dark"] .pc-empty{ --pc-empty-bg:#1c1c1e; }
  .pc-empty-icon{ display:grid; place-items:center; width:52px; height:52px; margin-bottom:6px; border-radius:50%; background:var(--pc-icon-bg, #fff); color:var(--muted); box-shadow:0 1px 2px rgba(0,0,0,.06); }
  html[data-theme="dark"] .pc-empty-icon{ --pc-icon-bg:#2c2c2e; }
  .pc-empty-icon svg{ width:24px; height:24px; }
  .pc-empty-title{ margin:0; font-size:1.0625rem; font-weight:700; letter-spacing:-.01em; }
  .pc-empty-text{ margin:0; max-width:360px; color:var(--muted); font-size:.875rem; line-height:1.5; }
  .pc-empty-action{
    display:inline-flex; align-items:center; gap:6px; margin-top:10px; padding:10px 18px; border:0; border-radius:999px;
    background:#e5384f; color:#fff; font:inherit; font-size:.875rem; font-weight:600; text-decoration:none; cursor:pointer;
    transition:background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out);
  }
  .pc-empty-action.is-secondary{ background:var(--pc-icon-bg, #fff); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.08); }
  .pc-empty-action:active{ transform:scale(var(--press-scale)); }
  .pc-empty-action:focus-visible{ outline:2px solid #e5384f; outline-offset:2px; }
  @media (hover:hover){ .pc-empty-action:hover{ background:#c9233c; } .pc-empty-action.is-secondary:hover{ background:var(--pc-empty-bg, #f5f5f7); } }
  @keyframes pc-empty-in{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }
  @media (prefers-reduced-motion:reduce){
    .pc-empty{ animation:none; }
    .profile-cards .pc-skeleton{ animation:none; }
    .pc-empty-action{ transition:none; }
    .pc-empty-action:active{ transform:none; }
  }
`;

/** The styles above, once on the page. */
export function ProfileCardStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PROFILE_CARD_STYLES }} />;
}

/** The card grid; its own component so the size observer starts when the grid appears. */
export function CardGrid({ id, label, children }: { id?: string; label?: string; children: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useCardGrid(gridRef, { minColumns: 1, singleColumnQuery: MOBILE_QUERY });
  return (
    <div className="profile-cards">
      <div className="grid" id={id} aria-label={label} ref={gridRef}>{children}</div>
    </div>
  );
}

export function CardSkeletons() {
  return (
    <div className="profile-cards" aria-hidden="true">
      <div className="grid">{[0, 1, 2, 3].map((index) => <div className="pc-skeleton" key={index} />)}</div>
    </div>
  );
}

const DraftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** A listing saved privately before publishing: the same card shape, leading back to the listing form, with Discard draft. */
export function DraftCard({ draft, token, notify, onDiscarded }: {
  draft: ListingDraft;
  token: string | null;
  notify: (message: string) => void;
  onDiscarded: (draftId: string) => void;
}) {
  useListingMenuStyles();
  const title = draftTitle(draft.title, draft.category);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);
  useEffect(() => {
    if (!confirming) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setConfirming(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirming, busy]);

  const discard = async () => {
    setBusy(true);
    try {
      await discardListingDraft(token, draft.id);
      setConfirming(false);
      onDiscarded(draft.id);
      notify('Draft discarded');
    } catch (error) {
      setConfirming(false);
      notify((error as Error).message || 'Could not discard this draft. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card draft-card has-owner" data-saved-listing-draft={draft.id}>
      <Link className="draft-card-link" href={`/list?draft=${encodeURIComponent(draft.id)}`} aria-label={`Continue draft listing: ${title}`}>
        <div className="card-media"><DraftIcon /></div>
        <span className="card-category">Draft</span>
        <div className="card-body">
          <div className="card-text">
            <div className="card-title">{title}</div>
            <div className="card-loc"><span className="card-loc-text">{draft.mediaNames.length ? `${draft.mediaNames.length} media file${draft.mediaNames.length === 1 ? '' : 's'} saved` : 'Saved privately'}</span></div>
          </div>
          <span className="card-status">Continue Listing →</span>
        </div>
      </Link>
      <div className="card-owner">
        <button type="button" className="card-menu-btn draft-discard-btn" aria-label={`Discard draft: ${title}`} title="Discard draft" onClick={() => setConfirming(true)}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
      {confirming && typeof document !== 'undefined' && createPortal(
        <div className="vr-listing-confirm" onClick={(event) => { if (event.target === event.currentTarget && !busy) setConfirming(false); }}>
          <div className="vr-listing-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby={`vr-discard-${draft.id}`} aria-describedby={`vr-discard-text-${draft.id}`}>
            <h2 id={`vr-discard-${draft.id}`}>Discard this draft?</h2>
            <p id={`vr-discard-text-${draft.id}`}>This permanently removes “{title}”, its saved details and its uploaded photos and videos. This cannot be undone.</p>
            <div className="vr-listing-confirm-actions">
              <button type="button" className="vr-listing-confirm-cancel" disabled={busy} onClick={() => setConfirming(false)}>Keep draft</button>
              <button type="button" ref={confirmRef} className="vr-listing-confirm-delete" disabled={busy} onClick={() => { void discard(); }}>{busy ? 'Discarding…' : 'Discard draft'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** One empty state: what is missing, why it matters, and the one thing to do next. */
export function EmptyState({ icon, title, text, action }: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void; secondary?: boolean };
}) {
  const className = `pc-empty-action${action && action.secondary ? ' is-secondary' : ''}`;
  return (
    <div className="pc-empty" role="status">
      <span className="pc-empty-icon" aria-hidden="true">{icon}</span>
      <h3 className="pc-empty-title">{title}</h3>
      <p className="pc-empty-text">{text}</p>
      {action && (action.href
        ? <Link className={className} href={action.href}>{action.label}</Link>
        : <button type="button" className={className} onClick={action.onClick}>{action.label}</button>)}
    </div>
  );
}
