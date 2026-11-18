import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BadgeCheck, CalendarDays, ChevronDown, Mail, MapPin, MessageCircle, Pencil, ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loginUrl } from '../../lib/safeRedirect';
import {
  hostProfilePath, isPrivateProfileError, loadHostCardListings, loadHostProfile, loadHostReviews, peek, peekHostProfile, toProfileListing,
  type HostProfileRow, type HostReview, type ReviewSummary,
} from '../../lib/profile/hostProfile';
import { NICHE_LABELS } from '../../lib/profile/profilePage';
import { hostChatPath } from '../../lib/profile/hostChat';
import { toggleBookmark } from '../../lib/bookmarks/bookmarks';
import { useSavedListingIds } from '../../lib/bookmarks/useSavedListingIds';
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

/**
 * The Marketplace card's styles for this page, with the page tokens they use.
 * A plain style element (as on Marketplace): styled-jsx drops interpolated CSS.
 */
const CARD_STYLES = `
  .host-profile-cards{ --ink:var(--host-profile-text); --paper:var(--host-profile-page); --font-display:"Helvetica Neue", Arial, sans-serif; }
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

/** Signed-out visitors, wide screens: who to sign in as, then back to this profile. */
function SignInRail({ firstName, onSignIn }: { firstName: string; onSignIn: () => void }) {
  return (
    <aside className="host-profile-sign-in-rail" aria-label="Sign in">
      <div className="host-profile-sign-in-logo"><span>Va</span>Room</div>
      <h2>Sign in to message {firstName}</h2>
      <p>You&apos;ll be redirected to this host&apos;s profile once you&apos;re signed in.</p>
      <button type="button" className="host-profile-sign-in-option" onClick={onSignIn}><GoogleIcon />Continue with Google</button>
      <button type="button" className="host-profile-sign-in-option" onClick={onSignIn}><Mail size={16} aria-hidden="true" />Continue with Email</button>
    </aside>
  );
}

function SignInDialog({ firstName, onSignIn, onClose }: { firstName: string; onSignIn: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="host-profile-sign-in-overlay" role="dialog" aria-modal="true" aria-labelledby="host-profile-sign-in-title" onClick={onClose}>
      <div className="host-profile-sign-in-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="host-profile-sign-in-close" aria-label="Close sign-in prompt" onClick={onClose}>×</button>
        <h2 id="host-profile-sign-in-title">Sign in to message {firstName}</h2>
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
        <div className="host-profile-banner-wrap">
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
            ) : canMessageHost && (
              <button type="button" className="host-profile-message" onClick={() => { void startChat(); }} aria-label={`Message ${host.full_name || host.username || 'host'}`}>
                <MessageCircle size={16} aria-hidden="true" />
                Message
              </button>
            )}
          </section>
        </div>
        {isOwner && <p className="host-profile-owner-note">This is your public profile: how people see you when you share your profile link.</p>}
        <div className="host-profile-body">
          {host.bio && <p className="host-profile-bio">{host.bio}</p>}
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
        :root {
          --host-profile-page: #f7f6f3;
          --host-profile-surface: #fff;
          --host-profile-surface-raised: #f1efeb;
          --host-profile-border: #e2dfd9;
          --host-profile-text: #24211e;
          --host-profile-muted: #68635d;
          --host-profile-subtle: #8a847d;
          --host-profile-avatar-fallback: #e8e4de;
          --host-profile-rating-track: #e7e3dc;
          --host-profile-error: #a82038;
          --host-profile-banner-ink: #241e1b;
          --host-profile-banner-muted: rgba(36,30,27,.82);
        }
        html[data-theme="dark"] {
          --host-profile-page: #0c0b0b;
          --host-profile-surface: #141212;
          --host-profile-surface-raised: #232020;
          --host-profile-border: rgba(255,255,255,.11);
          --host-profile-text: #f5efec;
          --host-profile-muted: #c2b9b5;
          --host-profile-subtle: #958b87;
          --host-profile-avatar-fallback: #302b29;
          --host-profile-rating-track: #302b29;
          --host-profile-error: #f2a3ae;
          --host-profile-banner-ink: #fff;
          --host-profile-banner-muted: rgba(255,255,255,.82);
        }
        html, body, #__next { margin: 0; min-height: 100%; background: var(--host-profile-page); }
        body { overflow-x: hidden; }
        .host-profile-shell { min-height: 100vh; width: 100%; background: var(--host-profile-page); color: var(--host-profile-text); font-family: "Helvetica Neue", Arial, sans-serif; }
        .host-profile-shell.is-public { display: flex; align-items: flex-start; }
        .host-profile-main { flex: 1; min-width: 0; }
        .host-profile-content { width: 100%; margin: 0; padding-bottom: 64px; }

        .host-profile-sign-in-rail { position: sticky; top: 0; width: 240px; height: 100vh; flex-shrink: 0; box-sizing: border-box; padding: 24px 22px; border-right: 1px solid var(--host-profile-border); display: flex; flex-direction: column; overflow: hidden; }
        .host-profile-sign-in-logo { font-size: 1.25rem; font-weight: 700; margin-bottom: 24px; color: var(--host-profile-text); }
        .host-profile-sign-in-logo span { color: #E5384F; }
        .host-profile-sign-in-rail h2 { font-size: 1.1875rem; line-height: 1.3; margin: 0 0 8px; }
        .host-profile-sign-in-rail p { font-size: 0.8438rem; color: var(--host-profile-subtle); line-height: 1.5; margin: 0 0 20px; }
        .host-profile-sign-in-option { display: flex; width: 100%; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; padding: 11px 12px; border: 1px solid var(--host-profile-border); border-radius: 999px; background: var(--host-profile-surface); color: var(--host-profile-text); font: inherit; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .host-profile-sign-in-option:hover { background: var(--host-profile-surface-raised); }
        .host-profile-sign-in-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.68); }
        .host-profile-sign-in-modal { position: relative; width: 100%; max-width: 420px; box-sizing: border-box; padding: 24px 20px 20px; border: 1px solid var(--host-profile-border); border-radius: 18px; background: var(--host-profile-surface); color: var(--host-profile-text); box-shadow: 0 20px 50px rgba(0,0,0,.45); }
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
        .host-profile-skeleton-message { width:130px; height:40px; border-radius:10px; }
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
        .host-profile-message { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px; border:0; border-radius:10px; background:#e5384f; color:#fff; font-size:0.875rem; font-weight:600; cursor:pointer; white-space:nowrap; text-decoration:none; }
        .host-profile-message:hover { background:#c9233c; }
        .host-profile-owner-note { margin:14px 24px 0; color:var(--host-profile-subtle); font-size:0.8125rem; }
        .host-profile-body { padding:20px 24px 0; }
        .host-profile-bio { margin:0 0 14px; color:var(--host-profile-muted); font-size:0.875rem; line-height:1.6; }
        .host-profile-listings-panel { padding:20px 24px 0; }
        .host-profile-load-error { color:var(--host-profile-error); }
        .host-profile-load-muted { color:var(--host-profile-subtle); }
        .host-profile-review-summary { display:flex; gap:28px; flex-wrap:wrap; background:var(--host-profile-surface); border:1px solid var(--host-profile-border); border-radius:14px; padding:20px; margin-bottom:20px; }
        .host-profile-review-score { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:100px; border-right:1px solid var(--host-profile-border); padding-right:24px; }
        .host-profile-review { background:var(--host-profile-surface); border:1px solid var(--host-profile-border); border-radius:14px; padding:18px; }
        .host-profile-reviewer { width:38px; height:38px; border-radius:50%; background:var(--host-profile-avatar-fallback); display:flex; align-items:center; justify-content:center; font-size:0.8125rem; font-weight:600; color:var(--host-profile-text); flex-shrink:0; overflow:hidden; }
        .host-profile-more-reviews { display:flex; align-items:center; gap:6px; margin:18px auto 0; background:none; border:1px solid var(--host-profile-border); color:var(--host-profile-text); font-size:0.8125rem; font-weight:600; padding:10px 20px; border-radius:10px; cursor:pointer; }
        .host-profile-more-reviews:hover { background:var(--host-profile-surface-raised); }


        @media (max-width: 760px) {
          .host-profile-shell.is-public { display:block; }
          .host-profile-sign-in-rail { display:none; }
          .host-profile-sign-in-overlay { align-items:flex-end; }
          .host-profile-sign-in-modal { max-width:480px; }
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
          .host-profile-message { grid-column:2; justify-self:start; padding:8px 14px; }
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
      <div className={`host-profile-shell${signedOut && !isPrivate && !loadError ? ' is-public' : ''}`}>
        {signedOut && !isPrivate && !loadError && <SignInRail firstName={firstName} onSignIn={signIn} />}
        <main className="host-profile-main">
          <div className="host-profile-content">{content}</div>
        </main>
      </div>
      {signInOpen && signedOut && <SignInDialog firstName={firstName} onSignIn={signIn} onClose={() => setSignInOpen(false)} />}
    </>
  );
}
