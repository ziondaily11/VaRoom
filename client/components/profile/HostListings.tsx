import React, { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadListingVideo, setCachedVideo, type ListingVideo } from '../../lib/media/listingVideo';
import type { HostReview, ListingDraft, ProfileCategory, ProfileListing } from '../../lib/profile/hostProfile';
import { CATEGORY_LABELS, draftTitle, listingPrice, listingStatus } from '../../lib/profile/profilePage';
import { resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import VideoPlayer, { type VideoDetails } from '../media/VideoPlayer';
import HostListingMenu from '../listings/HostListingMenu';
import { EmptyListingsIcon } from './ProfileIcons';

// A host's listings on their own profile: category tabs (owners manage
// them), listing cards (video when the listing has one, loaded as the card
// nears the screen), saved drafts, and reviews.

export type Tab = { kind: 'all' } | { kind: 'category'; id: string } | { kind: 'reviews' };

function ListingMedia({ listing, token, details }: { listing: ProfileListing; token: string | null; details: VideoDetails }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [video, setVideo] = useState<ListingVideo | null>(null);
  const photo = listing.photo ? resolveStoredPhotoUrl(listing.photo, 'listing-photos', getSupabaseClient(), PHOTO_WIDTH.card) : null;

  useEffect(() => {
    const node = ref.current;
    if (!node || !token) return undefined;
    let cancelled = false;
    const load = () => { loadListingVideo(listing.id, token).then((value) => { if (!cancelled) setVideo(value); }); };
    if (typeof IntersectionObserver === 'undefined') { load(); return () => { cancelled = true; }; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); };
  }, [listing.id, token]);

  const refresh = async () => {
    setCachedVideo(listing.id, null, 0);
    const next = await loadListingVideo(listing.id, token);
    return next ? next.videoUrl : null;
  };

  const pill = <span className="listing-cat-pill">{(listing.category && CATEGORY_LABELS[listing.category]) || listing.category}</span>;
  return (
    <div className="listing-thumb" ref={ref}>
      {video && video.videoUrl
        ? <VideoPlayer src={video.videoUrl} poster={video.thumbnailUrl} listingId={listing.id} details={{ ...details, caption: listing.title }} refreshSrc={refresh} />
        : (photo || (video && video.thumbnailUrl)) && <img src={photo || (video && video.thumbnailUrl) || ''} alt={listing.title || ''} loading="lazy" />}
      {pill}
    </div>
  );
}

function ListingCard({ listing, draftId, token, details, notify, onStatus, onDeleted }: {
  listing: ProfileListing; draftId: string | null; token: string | null; details: VideoDetails;
  notify: (message: string) => void; onStatus: (id: string, status: string) => void; onDeleted: (id: string) => void;
}) {
  const status = listingStatus(listing.availability_status);
  const href = draftId ? `/list?draft=${encodeURIComponent(draftId)}` : `/booking?listing=${encodeURIComponent(listing.id)}`;
  return (
    <a className="listing-card" data-listing-card={listing.id} href={href}>
      <ListingMedia listing={listing} token={token} details={details} />
      <div className="listing-card-menu">
        <HostListingMenu
          listing={{ id: listing.id, title: listing.title, availability_status: listing.availability_status, listing_draft_id: draftId }}
          notify={notify}
          onStatus={onStatus}
          onDeleted={onDeleted}
        />
      </div>
      <div className="listing-card-body">
        <div className="listing-card-title" data-listing-title>{listing.title}</div>
        <div className="listing-card-loc">{listing.location_text || ''}</div>
        <div className="listing-card-footer">
          <span className="listing-card-price">{listingPrice(listing.price_amount, listing.price_unit)}</span>
          <span className={`listing-card-status ${status.className}`.trim()} data-listing-status style={status.style}>{status.label}</span>
        </div>
      </div>
    </a>
  );
}

function DraftCard({ draft }: { draft: ListingDraft }) {
  return (
    <a className="listing-card" href={`/list?draft=${encodeURIComponent(draft.id)}`} data-saved-listing-draft={draft.id} aria-label="Continue draft listing">
      <div className="listing-thumb" style={{ background: 'linear-gradient(135deg, rgba(198, 25, 55, .22), rgba(30, 20, 18, .92))' }}>
        <span className="listing-cat-pill">Draft</span>
      </div>
      <div className="listing-card-body">
        <div className="listing-card-title">{draftTitle(draft.title, draft.category)}</div>
        <div className="listing-card-loc">Saved privately · {draft.category || 'listing'}</div>
        <div className="listing-card-loc">{draft.mediaNames.length ? `Saved media: ${draft.mediaNames.join(', ')}` : 'No media selected'}</div>
        <div className="listing-card-footer"><span className="listing-card-status paused">Continue Listing →</span></div>
      </div>
    </a>
  );
}

function Reviews({ reviews }: { reviews: HostReview[] | null }) {
  return (
    <div className="profile-review-section" id="profile-review-section" aria-label="Host reviews" style={{ display: 'block' }}>
      {reviews && reviews.map((review) => {
        const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));
        return (
          <article className="profile-review-card" key={review.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{(review.client && review.client.full_name) || 'Guest'}</strong>
              <time>{review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}</time>
            </div>
            <div style={{ color: '#e5384f' }}>{'★'.repeat(rating) + '☆'.repeat(5 - rating)}</div>
            <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{review.comment || ''}</p>
          </article>
        );
      })}
      {reviews && !reviews.length && <p>No reviews yet.</p>}
    </div>
  );
}

const SkeletonGrid = () => (
  <div className="skeleton-listings-grid" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <div className="skeleton-listing-card" key={index}>
        <div className="skel skeleton-listing-image" />
        <div className="skeleton-listing-body"><div className="skel" /><div className="skel" /><div className="skeleton-listing-footer"><div className="skel" /><div className="skel" /></div></div>
      </div>
    ))}
  </div>
);

export interface HostListingsProps {
  listings: ProfileListing[] | null;
  listingsError: boolean;
  drafts: ListingDraft[];
  categories: ProfileCategory[];
  reviews: HostReview[] | null;
  tab: Tab;
  onTab: (tab: Tab) => void;
  token: string | null;
  details: VideoDetails;
  notify: (message: string) => void;
  onStatus: (id: string, status: string) => void;
  onDeleted: (id: string) => void;
  /** Owner gestures on a category tab. */
  onManage: () => void;
  onSelectListings: (categoryId: string) => void;
  onCategoryMenu: (category: ProfileCategory, x: number, y: number) => void;
}

export default function HostListings(props: HostListingsProps) {
  const { listings, listingsError, drafts, categories, reviews, tab, onTab, token, details, notify, onStatus, onDeleted, onManage, onSelectListings, onCategoryMenu } = props;
  const longPress = useRef<{ timer: number | null; suppressUntil: number }>({ timer: null, suppressUntil: 0 });
  const rows = listings || [];
  const listed = new Set(rows.map((listing) => listing.id));
  const draftFor = (listingId: string) => drafts.find((draft) => draft.listing_id === listingId) || null;
  // Newest-added first, as the legacy page prepended each draft.
  const looseDrafts = drafts.filter((draft) => !draft.listing_id || !listed.has(draft.listing_id)).reverse();
  const activeCategory = tab.kind === 'category' ? categories.find((category) => category.id === tab.id) || null : null;
  const shown = activeCategory ? rows.filter((listing) => activeCategory.listingIds.includes(listing.id)) : rows;

  const tabButton = (label: string, selected: boolean, onClick: () => void, extra: Partial<React.ButtonHTMLAttributes<HTMLButtonElement>> = {}, className?: string) => (
    <button type="button" role="tab" aria-selected={selected} className={className} onClick={onClick} {...extra}>{label}</button>
  );

  const categoryGestures = (category: ProfileCategory): Partial<React.ButtonHTMLAttributes<HTMLButtonElement>> => ({
    title: 'Double-click to select listings. Right-click or long-press to manage.',
    onDoubleClick: (event) => { event.preventDefault(); onSelectListings(category.id); },
    onContextMenu: (event) => { event.preventDefault(); onCategoryMenu(category, event.clientX, event.clientY); },
    onKeyDown: (event) => {
      if (event.shiftKey && event.key === 'F10') {
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        onCategoryMenu(category, box.left, box.bottom);
      }
    },
    onPointerDown: (event) => {
      if (event.pointerType !== 'touch') return;
      const startX = event.clientX;
      const startY = event.clientY;
      const button = event.currentTarget;
      if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
      longPress.current.timer = window.setTimeout(() => {
        longPress.current.suppressUntil = Date.now() + 700;
        onCategoryMenu(category, startX, startY);
      }, 500);
      const cancelIfMoved = (move: PointerEvent) => {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) > 10) {
          if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
          longPress.current.timer = null;
          button.removeEventListener('pointermove', cancelIfMoved);
        }
      };
      button.addEventListener('pointermove', cancelIfMoved);
    },
    onPointerUp: () => { if (longPress.current.timer) window.clearTimeout(longPress.current.timer); longPress.current.timer = null; },
    onPointerCancel: () => { if (longPress.current.timer) window.clearTimeout(longPress.current.timer); longPress.current.timer = null; },
    onPointerLeave: () => { if (longPress.current.timer) window.clearTimeout(longPress.current.timer); longPress.current.timer = null; },
  });

  let empty: React.ReactNode = null;
  if (listings && !shown.length && !(tab.kind === 'all' && looseDrafts.length)) {
    if (activeCategory) empty = 'No listings in this category yet.';
    else if (!rows.length) empty = <>No listings yet. <a href="/list" style={{ color: 'var(--red)', fontWeight: 600 }}>List your first space →</a></>;
    else empty = 'No listings available.';
  }

  return (
    <div id="listings-section" style={{ display: 'block' }}>
      <div className="profile-category-row" id="profile-category-nav" role="tablist" aria-label="Profile listing categories" style={{ display: 'flex' }}>
        {tabButton('All listings', tab.kind === 'all', () => onTab({ kind: 'all' }))}
        {categories.map((category) => {
          const count = category.listingIds.filter((id) => listed.has(id)).length;
          return (
            <React.Fragment key={category.id}>
              {tabButton(`${category.name} · ${count}`, tab.kind === 'category' && tab.id === category.id, () => {
                if (Date.now() >= longPress.current.suppressUntil) onTab({ kind: 'category', id: category.id });
              }, categoryGestures(category))}
            </React.Fragment>
          );
        })}
        {tabButton('Reviews', tab.kind === 'reviews', () => onTab({ kind: 'reviews' }))}
        {tabButton('+ Manage categories', false, onManage, {}, 'category-manage')}
      </div>
      {tab.kind === 'reviews' && <Reviews reviews={reviews} />}
      {tab.kind !== 'reviews' && (listingsError
        ? <div className="listings-grid" id="listings-grid"><div className="listings-empty">Couldn&apos;t load your listings right now. Please refresh and try again.</div></div>
        : !listings
          ? <SkeletonGrid />
          : (
            <div className="listings-grid" id="listings-grid">
              {tab.kind === 'all' && looseDrafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)}
              {shown.map((listing) => {
                const draft = draftFor(listing.id);
                return <ListingCard key={listing.id} listing={listing} draftId={draft ? draft.id : null} token={token} details={details} notify={notify} onStatus={onStatus} onDeleted={onDeleted} />;
              })}
              {empty && (
                <div className="listings-empty">
                  {!rows.length && !activeCategory && <div className="listings-empty-icon"><EmptyListingsIcon /></div>}
                  {empty}
                </div>
              )}
            </div>
          ))}
    </div>
  );
}
