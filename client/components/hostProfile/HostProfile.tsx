import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BadgeCheck, CalendarDays, ChevronDown, Mail, MapPin, MessageCircle, MessagesSquare, Pencil, ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loginUrl } from '../../lib/safeRedirect';
import {
  hostProfilePath, isPrivateProfileError, loadHostCardListings, loadHostContact, loadHostProfile, loadHostReviews, peek, peekHostProfile, toProfileListing,
  type HostProfileRow, type HostReview, type ReviewSummary,
} from '../../lib/profile/hostProfile';
import { NICHE_LABELS } from '../../lib/profile/profilePage';
import { hostChatPath } from '../../lib/profile/hostChat';
import { toggleBookmark } from '../../lib/bookmarks/bookmarks';
import { useSavedListingIds } from '../../lib/bookmarks/useSavedListingIds';
import { NO_CONTACT, profileMailtoHref, profileWhatsappHref, type ListingContact } from '../../lib/reachOut/reachOut';
import { usePresence } from '../../lib/motion/usePresence';
import { DURATION, exitMs } from '../../lib/motion/tokens';
import type { MarketplaceListing } from '../../lib/marketplace/marketplace';
import { resolveAvatarUrl } from '../resolveStoredPhotoUrl';
import MarketplaceCard from '../marketplace/MarketplaceCard';
import { useCardGrid } from '../marketplace/useCardGrid';
import { listingCardStyles } from '../listings/listingCardStyles';
import PrivateProfileNotice from './PrivateProfileNotice';
import ProfileBanner from './ProfileBanner';
import ProfileCategoryNav, { type ProfileTab } from './ProfileCategoryNav';

// A host's public profile: varoom.co.ke/<username> (or /host/<id> for a host
// without a username). One page for every visitor, merged from the in-app
// host view and the shared-link public page:
// - Signed in: the account's own shell (host or client sidebar) from _app,
//   which stays mounted while moving between pages.
// - Signed out: no app sidebar; a sign-in rail (desktop) and a sign-in sheet
//   (phones) bring the visitor back here once signed in.
// - The host: an Edit profile link, the banner editor and the category manager.
// Listings use the Marketplace card: about 280px wide on larger screens, one
// full-width card per row on phones (useCardGrid's one ResizeObserver).
// Profile, listings and reviews are cached per viewer and reused when the
// visitor comes back; reviews update live while the page is open.

/** Phones: one card per row and the compact header (same width as the header's own rules). */
const MOBILE_QUERY = '(max-width: 760px)';

/** The sign-in sheet opens in 250 ms and closes about 20% faster. */
const SHEET_EXIT_MS = exitMs(DURATION.standard);

/**
 * The Marketplace card's styles for this page, with the page tokens they use.
 * A plain style element (as on Marketplace): styled-jsx drops interpolated CSS.
 */
const CARD_STYLES = `
  .host-profile-cards{ --ink:var(--host-profile-text); --paper:var(--host-profile-page); --font-display:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .host-profile-cards .card, .host-profile-cards .card *{ margin:0; padding:0; box-sizing:border-box; }
  .host-profile-cards .card button{ font-family:inherit; }
  ${listingCardStyles('.host-profile-cards')}
  @media ${MOBILE_QUERY}{
    /* One full-width card per row (useCardGrid sets one column too). */
    .host-profile-cards .grid{ grid-template-columns:minmax(0,1fr); }
  }
`;

function Stars({ count, size = 14 }: { count: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < count ? '#E5384F' : 'none'} color={i < count ? '#E5384F' : '#4A4A4A'} strokeWidth={1.5} />
      ))}
    </div>
  );
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function ProfileSkeleton() {
  return (
    <div className="host-profile-skeleton" role="status" aria-label="Loading host profile" aria-busy="true">
      <span className="host-profile-skeleton-sr">Loading host profile</span>
      <div className="host-profile-skeleton-banner" aria-hidden="true">
        <div className="host-profile-skeleton-identity">
          <div className="host-profile-skeleton-avatar" />
          <div className="host-profile-skeleton-details">
            <div className="host-profile-skeleton-line host-profile-skeleton-name" />
            <div className="host-profile-skeleton-line host-profile-skeleton-username" />
            <div className="host-profile-skeleton-meta">
              <div className="host-profile-skeleton-line" />
              <div className="host-profile-skeleton-line" />
              <div className="host-profile-skeleton-line" />
            </div>
            <div className="host-profile-skeleton-line host-profile-skeleton-rating" />
          </div>
          <div className="host-profile-skeleton-message" />
        </div>
      </div>
      <div className="host-profile-skeleton-body" aria-hidden="true">
        <div className="host-profile-skeleton-line host-profile-skeleton-bio" />
        <div className="host-profile-skeleton-line host-profile-skeleton-bio-short" />
        <div className="host-profile-skeleton-tabs">
          <div className="host-profile-skeleton-line" />
          <div className="host-profile-skeleton-line" />
          <div className="host-profile-skeleton-line" />
        </div>
        <div className="host-profile-skeleton-grid">
          {[0, 1, 2, 3].map((item) => <div className="host-profile-skeleton-card" key={item} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * The listing cards. Its own component so the grid's size observer starts
 * when the grid appears (after loading, and when returning from Reviews).
 */
function ListingGrid({ listings, empty, saved, token, onOpen, onSave }: {
  listings: MarketplaceListing[];
  empty: string;
  saved: ReadonlySet<string>;
  token: string | null;
  onOpen: (href: string) => void;
  onSave: (listingId: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  useCardGrid(gridRef, { minColumns: 1, singleColumnQuery: MOBILE_QUERY });
  return (
    <div className="grid" ref={gridRef}>
      {listings.map((listing) => (
        <MarketplaceCard key={listing.id} listing={listing} saved={saved.has(listing.id)} token={token} onOpen={onOpen} onSave={onSave} />
      ))}
      {listings.length === 0 && <p className="host-profile-load-muted" style={{ gridColumn: '1/-1' }}>{empty}</p>}
    </div>
  );
}

/**
 * One "Get in touch" button in place of Message, WhatsApp and email. It opens
 * the ways this visitor can reach the host: Message (not for other hosts, as
 * before) and the channels the host left on in Reach Out. A signed-out
 * visitor is asked to sign in (the channels are only read for signed-in
 * people). Nothing to offer: no button. A menu under the button on wide
 * screens, a sheet from the bottom on phones; Escape or a click outside closes it.
 */
function GetInTouch({ canMessage, contact, signedOut, enquiry, onMessage, onSignIn, onOpenChange }: {
  canMessage: boolean;
  contact: ListingContact;
  signedOut: boolean;
  enquiry: { name: string; url: string };
  onMessage: () => void;
  onSignIn: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const setMenu = useCallback((next: boolean) => { setOpen(next); onOpenChange(next); }, [onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDocument = (event: MouseEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setMenu(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); buttonRef.current?.focus(); } };
    document.addEventListener('click', onDocument);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDocument); document.removeEventListener('keydown', onKey); };
  }, [open, setMenu]);

  const options: React.ReactNode[] = [];
  if (!signedOut) {
    if (canMessage) {
      options.push(<button key="message" type="button" role="menuitem" className="host-profile-touch-option" onClick={() => { setMenu(false); onMessage(); }}><span className="host-profile-touch-icon"><MessageCircle size={18} aria-hidden="true" /></span>Message</button>);
    }
    if (contact.whatsapp) {
      options.push(<a key="whatsapp" role="menuitem" className="host-profile-touch-option" href={profileWhatsappHref(contact.whatsapp, enquiry)} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}><span className="host-profile-touch-icon"><img src="/assets/whatsapp.svg" alt="" aria-hidden="true" /></span>WhatsApp</a>);
    }
    if (contact.email) {
      options.push(<a key="email" role="menuitem" className="host-profile-touch-option" href={profileMailtoHref(contact.email, enquiry)} onClick={() => setMenu(false)}><span className="host-profile-touch-icon"><img src="/assets/gmail.svg" alt="" aria-hidden="true" /></span>Email</a>);
    }
    if (!options.length) return null;
  }

  return (
    <div className="host-profile-touch" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="host-profile-message"
        aria-haspopup={signedOut ? 'dialog' : 'menu'}
        aria-expanded={signedOut ? undefined : open}
        aria-controls={signedOut ? undefined : 'host-profile-touch-menu'}
        onClick={() => { if (signedOut) onSignIn(); else setMenu(!open); }}
      >
        <MessagesSquare size={16} aria-hidden="true" />
        Get in touch
      </button>
      {open && (
        <>
          <div className="host-profile-touch-scrim" aria-hidden="true" onClick={() => setMenu(false)} />
          <div className="host-profile-touch-menu" id="host-profile-touch-menu" role="menu" aria-label={`Ways to reach ${enquiry.name}`} ref={menuRef}>
            <p className="host-profile-touch-title" aria-hidden="true">Get in touch with {enquiry.name}</p>
            {options}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Signed-out visitors: who to sign in as, then back to this profile. A
 * centred dialog on wide screens and a bottom sheet on phones; both play
 * their exit (animation.md §8.3) and give focus back to the button that
 * opened them.
 */
function SignInDialog({ open, firstName, onSignIn, onClose }: { open: boolean; firstName: string; onSignIn: () => void; onClose: () => void }) {
  const { mounted, closing } = usePresence(open, SHEET_EXIT_MS);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('.host-profile-sign-in-option')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); returnFocus.current?.focus(); };
  }, [open, onClose]);
  if (!mounted) return null;
  return (
    <div className={`host-profile-sign-in-overlay${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="host-profile-sign-in-title" onClick={onClose}>
      <div className="host-profile-sign-in-modal" ref={panelRef} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="host-profile-sign-in-close" aria-label="Close sign-in prompt" onClick={onClose}>×</button>
        <h2 id="host-profile-sign-in-title">Sign in to contact {firstName}</h2>
        <p>You&apos;ll be redirected to this host&apos;s profile once you&apos;re signed in.</p>
        <button type="button" className="host-profile-sign-in-option" onClick={onSignIn}><GoogleIcon /> Continue with Google</button>
        <button type="button" className="host-profile-sign-in-option" onClick={onSignIn}><Mail size={16} aria-hidden="true" /> Continue with Email</button>
      </div>
    </div>
  );
}

export default function HostProfile({ hostKey }: {
  /** The host to show: { username } from /<username>, { id } from /host/<id>; null until the route is ready. */
  hostKey: { id: string } | { username: string } | null;
}) {
  const router = useRouter();
  const { status, user, session, profile: viewerProfile } = useAuth();
  const viewerId = user?.id || null;
  const token = session?.access_token || null;
  const authReady = status !== 'loading';
  const signedOut = status === 'signed-out';
  const byId = hostKey && 'id' in hostKey ? hostKey.id : null;
  const byUsername = hostKey && 'username' in hostKey ? hostKey.username : null;

  const [tab, setTab] = useState<ProfileTab>('listings');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryListings, setCategoryListings] = useState<Record<string, string[]>>({});
  const [visibleReviews, setVisibleReviews] = useState(3);
  const [profile, setProfile] = useState<HostProfileRow | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [reviews, setReviews] = useState<HostReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({ average_rating: null, review_count: 0, distribution: [] });
  const [reviewsError, setReviewsError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [contact, setContact] = useState<ListingContact>(NO_CONTACT);
  const saved = useSavedListingIds(viewerId);

  // The profile, by username or id; a cached copy shows at once.
  useEffect(() => {
    if (!byId && !byUsername) return undefined;
    if (!authReady) return undefined;
    const by = byId ? { id: byId } : { username: byUsername as string };
    let cancelled = false;
    setLoadError('');
    setIsPrivate(false);
    setProfile(peekHostProfile(viewerId, by) || null);
    loadHostProfile(token, viewerId, by).then((row) => {
      if (cancelled) return;
      if (row) setProfile(row); else setLoadError('This host profile could not be found.');
    }).catch((error) => {
      if (cancelled) return;
      // A private profile (Settings → Privacy) replaces anything shown from the cache.
      if (isPrivateProfileError(error)) { setProfile(null); setLoadError('This profile is private.'); setIsPrivate(true); return; }
      console.error('Unable to load host profile', error);
      setLoadError('Could not load this host profile.');
    });
    return () => { cancelled = true; };
  }, [byId, byUsername, authReady, viewerId, token]);

  // One address per host: /<username> (an id address or another letter case
  // becomes it, without reloading the data).
  useEffect(() => {
    if (!profile) return;
    const target = hostProfilePath(profile.id, profile.username);
    const current = (router.asPath || '').split(/[?#]/)[0];
    // Shallow only within /<username> (another letter case); from /host/<id> it is a page change, served from the cache.
    if (current && current !== target) void router.replace(target, undefined, { shallow: router.pathname === '/[username]', scroll: false });
  }, [profile, router]);

  // Listings and reviews, keyed by the host's id (an id address starts them at once).
  const hostId = byId || (profile ? profile.id : null);
  const isOwner = Boolean(viewerId && hostId && viewerId === hostId);
  useEffect(() => {
    if (!hostId || !authReady) return undefined;
    const client = getSupabaseClient();
    if (!client) { setLoadError('Host profiles are unavailable right now.'); return undefined; }
    let cancelled = false;
    setReviewsError('');
    setListings(peek<MarketplaceListing[]>(viewerId, hostId, isOwner ? 'cards:owner' : 'cards') || null);
    loadHostCardListings(client, viewerId, hostId, isOwner).then((rows) => { if (!cancelled) setListings(rows); }).catch((error) => {
      console.error('Unable to load host listings', error);
      if (!cancelled) setListings([]);
    });

    const loadReviews = (force = false) => loadHostReviews(viewerId, hostId, force).then((result) => {
      if (cancelled) return;
      setReviews(result.reviews);
      setReviewSummary(result.summary);
      setReviewsError('');
    }).catch(() => { if (!cancelled) setReviewsError('Reviews could not be loaded right now.'); });
    void loadReviews();

    // New and changed reviews appear while the page is open.
    const channel = client.channel(`host-profile-reviews-${hostId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `host_id=eq.${hostId}` }, () => { void loadReviews(true); })
      .subscribe();
    return () => { cancelled = true; void client.removeChannel(channel); };
  }, [hostId, authReady, viewerId, isOwner]);

  // Reach Out (WhatsApp, email) next to Message: signed-in visitors only, as on the booking page.
  useEffect(() => {
    setContact(NO_CONTACT);
    if (!hostId || !viewerId || isOwner || !authReady) return undefined;
    let cancelled = false;
    void loadHostContact(viewerId, hostId, token).then((value) => { if (!cancelled) setContact(value); });
    return () => { cancelled = true; };
  }, [hostId, viewerId, isOwner, authReady, token]);

  // The category tabs work on ids; the cards need the full rows.
  const navListings = useMemo(() => (listings || []).map((listing) => toProfileListing(listing as unknown as Record<string, unknown>)), [listings]);

  const host = profile;
  const reviewCount = Number(reviewSummary.review_count || reviews.length);
  const averageRating = reviewSummary.average_rating == null ? null : Number(reviewSummary.average_rating);
  const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    pct: reviewCount ? Math.round((((reviewSummary.distribution || []).find((item) => Number(item.star) === star)?.count || 0) / reviewCount) * 100) : 0,
  }));
  const client = getSupabaseClient();
  const avatarUrl = host && host.avatar_url ? resolveAvatarUrl(host.avatar_url, client) : null;
  const memberSince = host && host.created_at ? `Member since ${new Date(host.created_at).getFullYear()}` : null;
  const specializations = host && Array.isArray(host.listing_categories)
    ? Array.from(new Set(host.listing_categories.map((category) => NICHE_LABELS[category] || category)))
    : [];
  const firstName = host ? (host.full_name || 'Host').split(' ')[0] : 'this host';
  // Hosts don't message other hosts from here (as before); signed-out visitors are asked to sign in.
  const viewerRole = viewerProfile?.role === 'host' ? 'host' : 'client';
  const canMessageHost = Boolean(host) && !isOwner && (signedOut || viewerRole !== 'host');
  const shownListings = (listings || []).filter((listing) => !selectedCategory || (categoryListings[selectedCategory] || []).includes(listing.id));
  const isLoading = !loadError && (!authReady || !profile || listings === null);
  const handle = byUsername || null;

  const here = () => (host ? hostProfilePath(host.id, host.username) : (router.asPath || '/'));
  const signIn = () => { void router.push(loginUrl(here())); };
  const askToSignIn = useCallback(() => setSignInOpen(true), []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  const startChat = async () => {
    if (!hostId) return;
    if (!viewerId) { setSignInOpen(true); return; }
    const listing = (listings || [])[0];
    try {
      void router.push(await hostChatPath(hostId, listing ? listing.id : null));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  const openListing = (href: string) => { void router.push(viewerId ? href : loginUrl(href)); };
  const saveListing = (listingId: string) => {
    if (!viewerId || !client) { void router.push(loginUrl(here())); return; }
    toggleBookmark(client, viewerId, listingId).catch((error) => console.error('Listing bookmark could not be updated:', error));
  };

  let content: React.ReactNode;
  if (isPrivate) {
    content = <PrivateProfileNotice handle={handle} signedIn={Boolean(viewerId)} />;
  } else if (loadError) {
    content = <p className="host-profile-load-error" role="alert" style={{ padding: 24 }}>{loadError}</p>;
  } else if (isLoading || !host) {
    content = <ProfileSkeleton />;
  } else {
    content = (
      <>
        <div className={`host-profile-banner-wrap${touchOpen ? ' is-touch-open' : ''}`}>
          <ProfileBanner
            hostId={host.id}
            imageKey={host.banner_image_key}
            isOwner={isOwner}
            token={token}
            viewerId={viewerId}
            onChange={(banner_image_key) => setProfile((current) => (current ? { ...current, banner_image_key } : current))}
          />
          <section className="host-profile-identity" aria-label={`${host.full_name || 'Host'} profile`}>
            {avatarUrl ? (
              <img className="host-profile-avatar" src={avatarUrl} alt={host.full_name || 'Host'} />
            ) : (
              <div className="host-profile-avatar host-profile-avatar-fallback" aria-label={`${host.full_name || 'Host'} profile photo unavailable`}>
                {(host.full_name || 'H').charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                {host.full_name && <h1>{host.full_name}</h1>}
                {host.verified && <BadgeCheck size={19} color="#E5384F" aria-label="Verified host" />}
              </div>
              {host.username && <p className="host-profile-username">@{host.username}</p>}
              <div className="host-profile-meta">
                {host.city && <span className="host-profile-meta-item"><MapPin size={14} aria-hidden="true" /> {host.city}</span>}
                {host.created_at && <span className="host-profile-meta-item"><CalendarDays size={14} aria-hidden="true" /> {memberSince}</span>}
                {specializations.map((specialization) => (
                  <span className="host-profile-meta-item" key={specialization}><ShieldCheck size={14} aria-hidden="true" /> Specializes in {specialization}</span>
                ))}
              </div>
              {host.bio && <p className="host-profile-bio">{host.bio}</p>}
              <div className="host-profile-rating" aria-label={`${averageRating !== null ? averageRating.toFixed(1) : 'No ratings'}, ${reviewCount} reviews`}>
                <Stars count={averageRating !== null ? Math.round(averageRating) : 0} size={13} />
                <span style={{ fontWeight: 600 }}>{averageRating !== null ? averageRating.toFixed(1) : 'No ratings'}</span>
                <span className="host-profile-rating-count">({reviewCount} reviews)</span>
              </div>
            </div>
            {isOwner ? (
              <Link href="/profile" className="host-profile-message" aria-label="Edit profile">
                <Pencil size={15} aria-hidden="true" />
                Edit profile
              </Link>
            ) : (
              <div className="host-profile-actions" role="group" aria-label={`Contact ${host.full_name || 'host'}`}>
                <GetInTouch
                  canMessage={canMessageHost}
                  contact={contact}
                  signedOut={signedOut}
                  enquiry={{ name: firstName, url: typeof window !== 'undefined' ? `${window.location.origin}${hostProfilePath(host.id, host.username)}` : '' }}
                  onMessage={() => { void startChat(); }}
                  onSignIn={askToSignIn}
                  onOpenChange={setTouchOpen}
                />
              </div>
            )}
          </section>
        </div>
        {isOwner && <p className="host-profile-owner-note">This is your public profile: how people see you when you share your profile link.</p>}
        <div className="host-profile-body">
          <ProfileCategoryNav
            hostId={host.id}
            viewerId={viewerId}
            listings={navListings}
            isOwner={isOwner}
            value={selectedCategory}
            activeTab={tab}
            onTabChange={setTab}
            onChange={(id) => { setSelectedCategory(id); setTab('listings'); }}
            onCategoryListings={setCategoryListings}
          />
        </div>

        {tab === 'listings' && (
          <div id="host-profile-listings" role="tabpanel" aria-label="Spaces" className="host-profile-listings-panel host-profile-cards">
            <ListingGrid
              listings={shownListings}
              empty={selectedCategory ? 'No listings in this category yet.' : 'No listings available.'}
              saved={saved}
              token={token}
              onOpen={openListing}
              onSave={saveListing}
            />
          </div>
        )}

        {tab === 'reviews' && (
          <div id="host-profile-reviews" role="tabpanel" aria-label="Reviews" className="host-profile-listings-panel">
            <div className="host-profile-review-summary">
              <div className="host-profile-review-score">
                <div style={{ fontSize: '2.125rem', fontWeight: 700 }}>{averageRating ? averageRating.toFixed(1) : '—'}</div>
                <Stars count={averageRating ? Math.round(averageRating) : 0} size={13} />
                <div className="host-profile-load-muted" style={{ fontSize: '0.75rem', marginTop: 6 }}>{reviewCount ? `${reviewCount} reviews` : 'No reviews yet'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                {ratingBreakdown.map((row) => (
                  <div key={row.star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="host-profile-load-muted" style={{ fontSize: '0.75rem', width: 10 }}>{row.star}</span>
                    <div style={{ flex: 1, height: 6, background: 'var(--host-profile-rating-track)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${row.pct}%`, height: '100%', background: '#E5384F' }} />
                    </div>
                    <span className="host-profile-load-muted" style={{ fontSize: '0.75rem', width: 30 }}>{row.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {reviewsError && <p role="alert" className="host-profile-load-error">{reviewsError}</p>}
              {!reviewsError && reviews.length === 0 && <p className="host-profile-load-muted">No reviews yet.</p>}
              {reviews.slice(0, visibleReviews).map((review) => {
                const name = (review.client && review.client.full_name) || 'Guest';
                const initials = (name.split(' ').map((part) => part.charAt(0)).join('').slice(0, 2) || 'G').toUpperCase();
                const reviewer = review.client && review.client.avatar_url ? resolveAvatarUrl(review.client.avatar_url, client) : null;
                return (
                  <div key={review.id} className="host-profile-review">
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div className="host-profile-reviewer">
                        {reviewer ? <img src={reviewer} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{name}</div>
                        <div className="host-profile-load-muted" style={{ fontSize: '0.75rem' }}>{review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}</div>
                      </div>
                      <Stars count={Number(review.rating) || 0} size={13} />
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--host-profile-muted)', lineHeight: 1.6, margin: '12px 0 0' }}>{review.comment || ''}</p>
                  </div>
                );
              })}
            </div>
            {visibleReviews < reviews.length && (
              <button type="button" onClick={() => setVisibleReviews(reviews.length)} className="host-profile-more-reviews">
                Show all {reviews.length} reviews
                <ChevronDown size={14} />
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CARD_STYLES }} />
      <style jsx global>{`
        /* Apple-style neutrals, matching client home and host home. */
        :root {
          --host-profile-page: var(--va-light);
          --host-profile-surface: #f5f5f7;
          --host-profile-surface-raised: #e8e8ed;
          --host-profile-border: #d2d2d7;
          --host-profile-text: #1d1d1f;
          --host-profile-muted: #6e6e73;
          --host-profile-subtle: #86868b;
          --host-profile-avatar-fallback: #e8e8ed;
          --host-profile-rating-track: #e8e8ed;
          --host-profile-error: #a82038;
          --host-profile-banner-ink: #1d1d1f;
          --host-profile-banner-muted: rgba(29,29,31,.78);
          --host-profile-fill: rgba(118,118,128,.12);
          --host-profile-selected: var(--va-light);
          --host-profile-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
        }
        html[data-theme="dark"] {
          --host-profile-page: #000;
          --host-profile-surface: #1c1c1e;
          --host-profile-surface-raised: #2c2c2e;
          --host-profile-border: rgba(255,255,255,.12);
          --host-profile-text: #f5f5f7;
          --host-profile-muted: #a1a1a6;
          --host-profile-subtle: #86868b;
          --host-profile-avatar-fallback: #2c2c2e;
          --host-profile-rating-track: #2c2c2e;
          --host-profile-error: #f2a3ae;
          --host-profile-banner-ink: #fff;
          --host-profile-banner-muted: rgba(255,255,255,.82);
          --host-profile-fill: rgba(118,118,128,.24);
          --host-profile-selected: #2c2c2e;
          --host-profile-shadow: none;
        }
        html, body, #__next { margin: 0; min-height: 100%; background: var(--host-profile-page); }
        body { overflow-x: hidden; }
        .host-profile-shell { min-height: 100vh; width: 100%; background: var(--host-profile-page); color: var(--host-profile-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
        .host-profile-main { flex: 1; min-width: 0; }
        .host-profile-content { width: 100%; margin: 0; padding-bottom: 64px; }

        .host-profile-sign-in-option { display: flex; width: 100%; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; padding: 11px 12px; border: 0; border-radius: 999px; background: var(--host-profile-fill); color: var(--host-profile-text); font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
        .host-profile-sign-in-option:active { transform: scale(var(--press-scale)); }
        @media (hover: hover) { .host-profile-sign-in-option:hover { background: var(--host-profile-surface-raised); } }
        /* Sign-in sheet (animation.md §8.3): the scrim fades; the panel grows from .95 on wide screens and rises from the bottom on phones; exits are shorter. */
        .host-profile-sign-in-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.4); backdrop-filter: blur(12px) saturate(140%); -webkit-backdrop-filter: blur(12px) saturate(140%); animation: hp-scrim-in var(--motion-quick) var(--ease-out) both; }
        .host-profile-sign-in-overlay.is-closing { animation: hp-scrim-out var(--motion-micro) var(--ease-in) both; pointer-events: none; }
        .host-profile-sign-in-modal { position: relative; width: 100%; max-width: 420px; box-sizing: border-box; padding: 24px 20px 20px; border: 0; border-radius: 22px; background: var(--host-profile-page); color: var(--host-profile-text); box-shadow: 0 24px 60px rgba(0,0,0,.25); animation: hp-panel-in var(--motion-standard) var(--ease-out) both; }
        .host-profile-sign-in-overlay.is-closing .host-profile-sign-in-modal { animation: hp-panel-out var(--motion-quick) var(--ease-in) both; }
        @keyframes hp-scrim-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes hp-scrim-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes hp-panel-in { from { opacity: 0; transform: scale(.95); } to { opacity: 1; transform: none; } }
        @keyframes hp-panel-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(.95); } }
        @keyframes hp-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes hp-sheet-out { from { transform: none; } to { transform: translateY(100%); } }
        html[data-theme="dark"] .host-profile-sign-in-modal { background: var(--host-profile-surface); }
        .host-profile-sign-in-modal h2 { margin: 0 28px 8px 0; font-size: 1.125rem; line-height: 1.3; }
        .host-profile-sign-in-modal p { margin: 0 0 8px; color: var(--host-profile-subtle); font-size: 0.8125rem; line-height: 1.5; }
        .host-profile-sign-in-close { position: absolute; top: 10px; right: 12px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: var(--host-profile-text); font-size: 1.625rem; line-height: 1; cursor: pointer; }

        .host-profile-skeleton-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .host-profile-skeleton-banner { position:relative; height:350px; overflow:hidden; background:var(--host-profile-surface-raised); }
        .host-profile-skeleton-identity { position:absolute; inset:auto 24px 24px; display:grid; grid-template-columns:88px minmax(0,1fr) 150px; align-items:center; gap:18px; }
        .host-profile-skeleton-avatar, .host-profile-skeleton-line, .host-profile-skeleton-message, .host-profile-skeleton-card { background:linear-gradient(100deg,var(--host-profile-surface-raised) 20%,var(--host-profile-border) 38%,var(--host-profile-surface-raised) 58%); background-size:220% 100%; animation:host-profile-shimmer 1.4s ease-in-out infinite; }
        .host-profile-skeleton-avatar { width:88px; height:88px; border-radius:50%; }
        .host-profile-skeleton-details { display:grid; gap:10px; max-width:560px; }
        .host-profile-skeleton-line { height:12px; border-radius:999px; }
        .host-profile-skeleton-name { width:min(250px,65%); height:24px; }
        .host-profile-skeleton-username { width:140px; }
        .host-profile-skeleton-meta { display:flex; gap:10px; }
        .host-profile-skeleton-meta .host-profile-skeleton-line { width:120px; }
        .host-profile-skeleton-meta .host-profile-skeleton-line:last-child { width:160px; }
        .host-profile-skeleton-rating { width:170px; margin-top:2px; }
        .host-profile-skeleton-message { width:130px; height:40px; border-radius:999px; }
        .host-profile-skeleton-body { padding:20px 24px 0; }
        .host-profile-skeleton-bio { width:min(780px,90%); }
        .host-profile-skeleton-bio-short { width:min(520px,62%); margin-top:8px; }
        .host-profile-skeleton-tabs { display:flex; gap:18px; height:52px; align-items:center; border-bottom:1px solid var(--host-profile-border); margin-top:14px; }
        .host-profile-skeleton-tabs .host-profile-skeleton-line { width:72px; height:14px; }
        /* The same sizes as the cards: about 280px, one per row on phones. */
        .host-profile-skeleton-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; padding-top:20px; }
        .host-profile-skeleton-card { aspect-ratio:1 / 0.95; border-radius:24px; }
        @keyframes host-profile-shimmer { to { background-position-x:-220%; } }
        @media(prefers-reduced-motion:reduce) { .host-profile-skeleton-avatar,.host-profile-skeleton-line,.host-profile-skeleton-message,.host-profile-skeleton-card { animation:none; } }
        .host-profile-banner-wrap { position: relative; isolation: isolate; }
        .host-profile-identity { position:absolute; z-index:2; left:24px; right:24px; bottom:24px; display:grid; grid-template-columns:88px minmax(0,1fr) auto; align-items:center; gap:18px; color:var(--host-profile-banner-ink); }
        .host-profile-avatar { width:88px; height:88px; border:3px solid rgba(255,255,255,.9); border-radius:50%; object-fit:cover; }
        .host-profile-avatar-fallback { display:grid; place-items:center; background:var(--host-profile-avatar-fallback); color:var(--host-profile-text); font-size:1.875rem; font-weight:700; }
        .host-profile-identity h1 { font-size:clamp(21px,2.2vw,30px); font-weight:700; line-height:1.2; margin:0; color:inherit; }
        .host-profile-username { margin:4px 0 0; color:var(--host-profile-banner-muted); font-size:0.875rem; }
        .host-profile-meta { display:flex; gap:14px 18px; margin-top:10px; flex-wrap:wrap; font-size:0.8125rem; color:var(--host-profile-banner-muted); }
        .host-profile-meta-item { display:flex; align-items:center; gap:6px; }
        .host-profile-rating { display:flex; align-items:center; gap:7px; margin-top:9px; font-size:0.8125rem; color:var(--host-profile-banner-ink); }
        .host-profile-rating-count { color:var(--host-profile-banner-muted); }
        .host-profile-message { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 20px; border:0; border-radius:999px; background:#e5384f; color:#fff; font-size:0.875rem; font-weight:600; cursor:pointer; white-space:nowrap; text-decoration:none; transition:background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
        .host-profile-message:active { transform:scale(var(--press-scale)); }
        @media (hover: hover) { .host-profile-message:hover { background:#c9233c; } }
        .host-profile-actions { display:flex; align-items:center; gap:8px; }
        .host-profile-message:focus-visible, .host-profile-touch-option:focus-visible { outline:2px solid #e5384f; outline-offset:2px; }
        /* Get in touch: a menu under the button; on phones a sheet from the bottom (below). */
        /* While Get in touch is open, the banner (and its menu or sheet) sits above the page. */
        .host-profile-banner-wrap.is-touch-open { z-index:200; }
        .host-profile-touch { position:relative; }
        .host-profile-touch-scrim { display:none; }
        .host-profile-touch-menu { position:absolute; z-index:30; top:calc(100% + 8px); right:0; min-width:220px; padding:6px; border-radius:16px; background:var(--host-profile-surface); color:var(--host-profile-text); box-shadow:0 12px 32px rgba(0,0,0,.18), 0 0 0 1px var(--host-profile-border); animation:hp-touch-in var(--motion-quick) var(--ease-out) both; }
        .host-profile-touch-title { display:none; margin:4px 8px 8px; font-size:0.9375rem; font-weight:700; }
        .host-profile-touch-option { display:flex; align-items:center; gap:12px; width:100%; padding:10px; border:0; border-radius:10px; background:transparent; color:inherit; font:inherit; font-size:0.875rem; font-weight:500; text-align:left; text-decoration:none; cursor:pointer; box-sizing:border-box; }
        .host-profile-touch-icon { display:grid; place-items:center; width:32px; height:32px; flex:0 0 auto; border-radius:50%; background:var(--host-profile-fill); color:#e5384f; }
        .host-profile-touch-icon img { width:18px; height:18px; display:block; }
        @media (hover: hover) { .host-profile-touch-option:hover { background:var(--host-profile-fill); } }
        @keyframes hp-touch-in { from { opacity:0; transform:translateY(-4px) scale(.98); } to { opacity:1; transform:none; } }
        .host-profile-owner-note { margin:14px 24px 0; color:var(--host-profile-subtle); font-size:0.8125rem; }
        .host-profile-body { padding:20px 24px 0; }
        /* The host's bio: in the banner under the details, at most two lines (as on /profile). */
        .host-profile-bio { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; max-width:560px; margin:8px 0 0; color:var(--host-profile-banner-ink); opacity:.86; font-size:0.8125rem; line-height:1.45; }
        .host-profile-listings-panel { padding:20px 24px 0; }
        .host-profile-load-error { color:var(--host-profile-error); }
        .host-profile-load-muted { color:var(--host-profile-subtle); }
        .host-profile-review-summary { display:flex; gap:28px; flex-wrap:wrap; background:var(--host-profile-surface); border:0; border-radius:20px; box-shadow:var(--host-profile-shadow); padding:20px; margin-bottom:20px; }
        .host-profile-review-score { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:100px; border-right:1px solid var(--host-profile-border); padding-right:24px; }
        .host-profile-review { background:var(--host-profile-surface); border:0; border-radius:20px; box-shadow:var(--host-profile-shadow); padding:18px; }
        .host-profile-reviewer { width:38px; height:38px; border-radius:50%; background:var(--host-profile-avatar-fallback); display:flex; align-items:center; justify-content:center; font-size:0.8125rem; font-weight:600; color:var(--host-profile-text); flex-shrink:0; overflow:hidden; }
        .host-profile-more-reviews { display:flex; align-items:center; gap:6px; margin:18px auto 0; background:var(--host-profile-fill); border:0; color:var(--host-profile-text); font-size:0.8125rem; font-weight:600; padding:10px 20px; border-radius:999px; cursor:pointer; transition:background-color var(--motion-micro) var(--ease-out), transform var(--motion-press) var(--ease-out); }
        @media (hover: hover) { .host-profile-more-reviews:hover { background:var(--host-profile-surface-raised); } }
        .host-profile-more-reviews:active { transform:scale(var(--press-scale)); }
        @media (prefers-reduced-motion: reduce) {
          .host-profile-message, .host-profile-more-reviews, .host-profile-sign-in-option { transition:none; }
          .host-profile-touch-menu { animation:none; }
          .host-profile-message:active, .host-profile-more-reviews:active, .host-profile-sign-in-option:active { transform:none; }
          .host-profile-sign-in-overlay, .host-profile-sign-in-overlay.is-closing, .host-profile-sign-in-modal, .host-profile-sign-in-overlay.is-closing .host-profile-sign-in-modal { animation-duration:1ms; }
        }


        @media (max-width: 760px) {
          .host-profile-sign-in-overlay { align-items:flex-end; padding:0; }
          .host-profile-sign-in-modal { max-width:none; border-radius:22px 22px 0 0; padding-bottom:calc(20px + env(safe-area-inset-bottom)); animation-name:hp-sheet-in; }
          .host-profile-sign-in-overlay.is-closing .host-profile-sign-in-modal { animation-name:hp-sheet-out; }
          .host-profile-content { padding-bottom:24px; }
          .host-profile-skeleton-identity { inset:auto 16px 18px; grid-template-columns:68px minmax(0,1fr); gap:12px; }
          .host-profile-skeleton-avatar { width:68px; height:68px; }
          .host-profile-skeleton-message { display:none; }
          .host-profile-skeleton-meta { flex-wrap:wrap; }
          .host-profile-skeleton-meta .host-profile-skeleton-line { width:92px; }
          .host-profile-skeleton-meta .host-profile-skeleton-line:last-child { width:122px; }
          .host-profile-skeleton-body { padding:16px 16px 0; }
          .host-profile-skeleton-grid { grid-template-columns:minmax(0,1fr); }
          .host-profile-identity { left:16px; right:16px; bottom:18px; grid-template-columns:68px minmax(0,1fr); gap:12px; }
          .host-profile-avatar { width:68px; height:68px; }
          .host-profile-actions { grid-column:2; justify-self:start; }
          .host-profile-message { padding:8px 14px; }
          .host-profile-touch-scrim { display:block; position:fixed; inset:0; z-index:29; background:rgba(0,0,0,.4); animation:hp-scrim-in var(--motion-quick) var(--ease-out) both; }
          .host-profile-touch-menu { position:fixed; top:auto; left:0; right:0; bottom:0; min-width:0; padding:16px 12px calc(16px + env(safe-area-inset-bottom)); border-radius:22px 22px 0 0; box-shadow:0 -12px 40px rgba(0,0,0,.25); animation:hp-sheet-in var(--motion-standard) var(--ease-out) both; }
          .host-profile-touch-title { display:block; }
          .host-profile-touch-option { padding:12px 10px; font-size:0.9375rem; }
          .host-profile-meta { gap:8px 12px; font-size:0.75rem; }
          .host-profile-owner-note { margin:12px 16px 0; }
          .host-profile-body { padding:16px 16px 0; }
          .host-profile-listings-panel { padding:16px 16px 0; }
        }
        @media (max-width: 480px) {
          .host-profile-skeleton-identity { inset:auto 12px 18px; grid-template-columns:56px minmax(0,1fr); gap:10px; }
          .host-profile-skeleton-avatar { width:56px; height:56px; }
          .host-profile-skeleton-meta .host-profile-skeleton-line:nth-child(3) { display:none; }
          .host-profile-identity { grid-template-columns:56px minmax(0,1fr); left:12px; right:12px; gap:10px; }
          .host-profile-avatar { width:56px; height:56px; }
          .host-profile-identity h1 { font-size:1.25rem; }
          .host-profile-meta { font-size:0.6875rem; gap:7px 10px; }
        }
      `}</style>
      <div className="host-profile-shell">
        <main className="host-profile-main">
          <div className="host-profile-content">{content}</div>
        </main>
      </div>
      {signedOut && <SignInDialog open={signInOpen} firstName={firstName} onSignIn={signIn} onClose={closeSignIn} />}
    </>
  );
}
