import React, { useRef } from 'react';
import { useRouter } from 'next/router';
import { FolderCog, FolderPlus, Home, RefreshCw, Star } from 'lucide-react';
import type { MarketplaceListing } from '../../lib/marketplace/marketplace';
import type { HostReview, ListingDraft, ProfileCategory } from '../../lib/profile/hostProfile';
import { listingStatus } from '../../lib/profile/profilePage';
import MarketplaceCard from '../marketplace/MarketplaceCard';
import HostListingMenu from '../listings/HostListingMenu';
import SegmentedTabs from '../ui/SegmentedTabs';
import { CardGrid, CardSkeletons, DraftCard, EmptyState } from './ProfileCards';
import SavedListings, { SavedTab } from './SavedListings';

// A host's listings on their own profile: category tabs (owners manage
// them), the same listing cards as the public profile with the owner's
// controls on each (the ⋮ menu and the status), saved drafts, reviews and
// Saved. Each empty place says what is missing and offers the next step.

export type Tab = { kind: 'all' } | { kind: 'category'; id: string } | { kind: 'reviews' } | { kind: 'saved' };

function Reviews({ reviews }: { reviews: HostReview[] | null }) {
  if (reviews && !reviews.length) {
    return (
      <CardGrid>
        <EmptyState icon={<Star />} title="No reviews yet" text="When guests review a stay at one of your spaces, their reviews appear here and on your public profile." />
      </CardGrid>
    );
  }
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
            <div style={{ color: '#e5384f' }} aria-label={`${rating} out of 5 stars`}>{'★'.repeat(rating) + '☆'.repeat(5 - rating)}</div>
            <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{review.comment || ''}</p>
          </article>
        );
      })}
    </div>
  );
}

export interface HostListingsProps {
  /** The signed-in owner (for the Saved tab). */
  userId: string;
  listings: MarketplaceListing[] | null;
  listingsError: boolean;
  drafts: ListingDraft[];
  categories: ProfileCategory[];
  reviews: HostReview[] | null;
  tab: Tab;
  onTab: (tab: Tab) => void;
  token: string | null;
  notify: (message: string) => void;
  onStatus: (id: string, status: string) => void;
  onDeleted: (id: string) => void;
  onRetry: () => void;
  /** Owner gestures on a category tab. */
  onManage: () => void;
  onSelectListings: (categoryId: string) => void;
  onCategoryMenu: (category: ProfileCategory, x: number, y: number) => void;
}

export default function HostListings(props: HostListingsProps) {
  const { userId, listings, listingsError, drafts, categories, reviews, tab, onTab, token, notify, onStatus, onDeleted, onRetry, onManage, onSelectListings, onCategoryMenu } = props;
  const router = useRouter();
  const longPress = useRef<{ timer: number | null; suppressUntil: number }>({ timer: null, suppressUntil: 0 });
  const rows = listings || [];
  const listed = new Set(rows.map((listing) => listing.id));
  const draftFor = (listingId: string) => drafts.find((draft) => draft.listing_id === listingId) || null;
  // Newest-added first, as the legacy page prepended each draft.
  const looseDrafts = drafts.filter((draft) => !draft.listing_id || !listed.has(draft.listing_id)).reverse();
  const activeCategory = tab.kind === 'category' ? categories.find((category) => category.id === tab.id) || null : null;
  const shown = activeCategory ? rows.filter((listing) => activeCategory.listingIds.includes(listing.id)) : rows;

  const clearLongPress = () => { if (longPress.current.timer) window.clearTimeout(longPress.current.timer); longPress.current.timer = null; };
  const categoryGestures = (category: ProfileCategory): Partial<React.ButtonHTMLAttributes<HTMLButtonElement>> => ({
    title: 'Double-click to choose listings. Right-click or long-press to rename or delete.',
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
      clearLongPress();
      longPress.current.timer = window.setTimeout(() => {
        longPress.current.suppressUntil = Date.now() + 700;
        onCategoryMenu(category, startX, startY);
      }, 500);
      const cancelIfMoved = (move: PointerEvent) => {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) > 10) {
          clearLongPress();
          button.removeEventListener('pointermove', cancelIfMoved);
        }
      };
      button.addEventListener('pointermove', cancelIfMoved);
    },
    onPointerUp: clearLongPress,
    onPointerCancel: clearLongPress,
    onPointerLeave: clearLongPress,
  });

  let empty: React.ReactNode = null;
  if (listings && !shown.length && !(tab.kind === 'all' && looseDrafts.length)) {
    if (activeCategory) {
      empty = (
        <EmptyState icon={<FolderPlus />} title={`No listings in “${activeCategory.name}” yet`}
          text="Choose which of your listings belong in this category. Guests see it as a tab on your public profile."
          action={{ label: 'Add listings', onClick: () => onSelectListings(activeCategory.id) }} />
      );
    } else {
      empty = (
        <EmptyState icon={<Home />} title="No listings yet"
          text="List your first space. It will appear here and on your public profile, where guests can book it."
          action={{ label: 'List a new space', href: '/list' }} />
      );
    }
  }

  const activeKey = `${tab.kind}:${tab.kind === 'category' ? tab.id : ''}:${categories.map((category) => `${category.id}=${category.name}`).join(',')}`;

  return (
    <div id="listings-section" style={{ display: 'block' }}>
      <div className="profile-tabs-bar">
        <SegmentedTabs label="Profile listing categories" id="profile-category-nav" activeKey={activeKey}>
          <button type="button" role="tab" aria-selected={tab.kind === 'all'} onClick={() => onTab({ kind: 'all' })}>All listings</button>
          {categories.map((category) => (
            <button key={category.id} type="button" role="tab" aria-selected={tab.kind === 'category' && tab.id === category.id}
              onClick={() => { if (Date.now() >= longPress.current.suppressUntil) onTab({ kind: 'category', id: category.id }); }}
              {...categoryGestures(category)}>
              {category.name}<span className="vr-seg-count">{category.listingIds.filter((id) => listed.has(id)).length}</span>
            </button>
          ))}
          <button type="button" role="tab" aria-selected={tab.kind === 'reviews'} onClick={() => onTab({ kind: 'reviews' })}>Reviews</button>
          <SavedTab selected={tab.kind === 'saved'} onSelect={() => onTab({ kind: 'saved' })} />
        </SegmentedTabs>
        <button type="button" className="profile-manage-categories category-manage" onClick={onManage}><FolderCog size={15} aria-hidden="true" /> Manage categories</button>
      </div>
      {tab.kind === 'reviews' && <Reviews reviews={reviews} />}
      {tab.kind === 'saved' && <SavedListings userId={userId} notify={notify} />}
      {tab.kind !== 'reviews' && tab.kind !== 'saved' && (listingsError && !listings
        ? (
          <CardGrid id="listings-grid">
            <EmptyState icon={<RefreshCw />} title="Couldn’t load your listings" text="Check your connection, then try again."
              action={{ label: 'Try again', onClick: onRetry, secondary: true }} />
          </CardGrid>
        )
        : !listings
          ? <CardSkeletons />
          : (
            <CardGrid id="listings-grid" label="Your listings">
              {tab.kind === 'all' && looseDrafts.map((draft) => <DraftCard key={draft.id} draft={draft} />)}
              {shown.map((listing) => {
                const draft = draftFor(listing.id);
                return (
                  <MarketplaceCard
                    key={listing.id}
                    listing={listing}
                    saved={false}
                    token={token}
                    onOpen={(href) => { void router.push(href); }}
                    onSave={() => undefined}
                    owner={{
                      href: draft ? `/list?draft=${encodeURIComponent(draft.id)}` : undefined,
                      status: listingStatus(listing.availability_status),
                      menu: (
                        <HostListingMenu
                          listing={{ id: listing.id, title: listing.title, availability_status: listing.availability_status, listing_draft_id: draft ? draft.id : null }}
                          notify={notify}
                          onStatus={onStatus}
                          onDeleted={onDeleted}
                        />
                      ),
                    }}
                  />
                );
              })}
              {empty}
            </CardGrid>
          ))}
    </div>
  );
}
