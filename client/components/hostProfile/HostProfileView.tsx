import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { BadgeCheck, CalendarDays, ChevronDown, MapPin, MessageCircle, ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loginUrl } from '../../lib/safeRedirect';
import {
  hostProfilePath, isPrivateProfileError, isUuid, loadHostListings, loadHostProfile, loadHostReviews, peek, peekHostProfile, type HostProfileRow, type HostReview, type ProfileListing, type ReviewSummary,
} from '../../lib/profile/hostProfile';
import { NICHE_LABELS } from '../../lib/profile/profilePage';
import { hostChatPath } from '../../lib/profile/hostChat';
import { resolveAvatarUrl, resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import VideoMedia from '../media/VideoMedia';
import PrivateProfileNotice from './PrivateProfileNotice';
import ProfileBanner from './ProfileBanner';
import ProfileCategoryNav, { type ProfileTab } from './ProfileCategoryNav';
import { useNearVideo } from './useNearVideo';

// A host's profile as others see it (/host/[hostId]), inside the app shell.
// Converted from legacy-pages/host-profile-view.jsx with the same look. The
// viewer comes from AuthProvider; profile, listings and reviews load in
// parallel and are reused when navigating back; listing videos load as
// their cards near the screen.

function Stars({ count, size = 14 }: { count: number; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < count ? '#E5384F' : 'none'} color={i < count ? '#E5384F' : '#4A4A4A'} strokeWidth={1.5} />
      ))}
    </div>
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
          {[0, 1, 2, 3].map((item) => (
            <div className="host-profile-skeleton-card" key={item}>
              <div className="host-profile-skeleton-card-image" />
              <div className="host-profile-skeleton-card-copy">
                <div className="host-profile-skeleton-line" />
                <div className="host-profile-skeleton-line" />
                <div className="host-profile-skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListingCard({ listing, token }: { listing: ProfileListing; token: string | null }) {
  // As before: videos only for signed-in viewers.
  const { ref, video } = useNearVideo<HTMLDivElement>(listing.id, token, Boolean(token));
  const img = listing.photo ? resolveStoredPhotoUrl(listing.photo, 'listing-photos', getSupabaseClient(), PHOTO_WIDTH.card) : null;
  const price = listing.price_amount ? `KSh ${Number(listing.price_amount).toLocaleString()} / ${listing.price_unit || 'night'}` : 'Price on request';
  return (
    <a
      href={`/booking?listing=${encodeURIComponent(listing.id)}`}
      className="host-profile-listing-card"
      style={{ background: 'var(--host-profile-surface)', border: '1px solid var(--host-profile-border)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer' }}
    >
      <div ref={ref} style={{ position: 'relative', height: 140, background: 'var(--host-profile-avatar-fallback)' }}>
        {video && video.videoUrl ? (
          <VideoMedia src={video.videoUrl} muted playsInline preload="metadata" controls title={`${listing.title} video`} style={{ width: '100%', height: '100%' }} />
        ) : img ? (
          <img src={img} alt={listing.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div className="host-profile-load-muted" style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: '0.75rem' }}>Listing photo not available</div>
        )}
        <span style={{ position: 'absolute', top: 10, left: 10, background: '#fff', color: '#0A0A0A', fontSize: '0.625rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, letterSpacing: 0.4 }}>
          {(listing.category || 'PROPERTY').toUpperCase()}
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{listing.title}</div>
        <div className="host-profile-load-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>{listing.location_text || 'Location not provided'}</div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: 8, color: 'var(--host-profile-text)' }}>{price}</div>
      </div>
    </a>
  );
}

export default function HostProfileView() {
  const router = useRouter();
  const { status, user, session, profile: viewerProfile } = useAuth();
  // /host/<username> or /host/<id>; opened by id, the address shows the username.
  const hostKey = typeof router.query.hostId === 'string' ? router.query.hostId : null;
  const keyIsId = Boolean(hostKey && isUuid(hostKey));
  const viewerId = user?.id || null;
  const token = session?.access_token || null;
  const authReady = status !== 'loading';

  const [tab, setTab] = useState<ProfileTab>('listings');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryListings, setCategoryListings] = useState<Record<string, string[]>>({});
  const [visibleReviews, setVisibleReviews] = useState(3);
  const [profile, setProfile] = useState<HostProfileRow | null>(null);
  const [listings, setListings] = useState<ProfileListing[] | null>(null);
  const [reviews, setReviews] = useState<HostReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({ average_rating: null, review_count: 0, distribution: [] });
  const [reviewsError, setReviewsError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  // The profile, by id or username.
  useEffect(() => {
    if (!router.isReady || !hostKey || !authReady) return undefined;
    const client = getSupabaseClient();
    if (!client) { setLoadError('Host profiles are unavailable right now.'); return undefined; }
    let cancelled = false;
    const by = keyIsId ? { id: hostKey } : { username: hostKey };
    setLoadError('');
    setIsPrivate(false);
    setProfile(peekHostProfile(viewerId, by) || null);
    loadHostProfile(token, viewerId, by).then((row) => {
      if (cancelled) return;
      if (row) setProfile(row); else setLoadError('Could not load this host profile.');
    }).catch((error) => {
      if (cancelled) return;
      // A private profile (Settings → Privacy) replaces anything shown from the cache.
      if (isPrivateProfileError(error)) { setProfile(null); setLoadError('This profile is private.'); setIsPrivate(true); } else setLoadError('Could not load this host profile.');
    });
    return () => { cancelled = true; };
  }, [router.isReady, hostKey, keyIsId, authReady, viewerId, token]);

  // Opened by id: show the username in the address (no reload; the data stays).
  useEffect(() => {
    if (!keyIsId || !profile || !profile.username || profile.id !== hostKey) return;
    void router.replace(hostProfilePath(profile.id, profile.username), undefined, { shallow: true, scroll: false });
  }, [keyIsId, profile, hostKey, router]);

  // Listings and reviews, keyed by the host's id (an id address starts them at once).
  const hostId = keyIsId ? hostKey : (profile ? profile.id : null);
  const isOwner = Boolean(viewerId && hostId && viewerId === hostId);
  useEffect(() => {
    if (!router.isReady || !hostId || !authReady) return undefined;
    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    setReviewsError('');
    setListings(peek<ProfileListing[]>(viewerId, hostId, isOwner ? 'listings:owner' : 'listings') || null);
    loadHostListings(client, viewerId, hostId, isOwner).then((rows) => { if (!cancelled) setListings(rows); }).catch(() => { if (!cancelled) setListings([]); });

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
  }, [router.isReady, hostId, authReady, viewerId, isOwner]);

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
  const viewerRole = viewerProfile?.role === 'host' ? 'host' : 'client';
  const canMessageHost = Boolean(host) && viewerRole !== 'host' && viewerId !== (host && host.id);
  const shownListings = (listings || []).filter((listing) => !selectedCategory || (categoryListings[selectedCategory] || []).includes(listing.id));
  const isLoading = !loadError && (!profile || listings === null);

  const startChat = async () => {
    if (!hostId) return;
    if (!viewerId) { void router.push(loginUrl(router.asPath)); return; }
    const listing = (listings || [])[0];
    try {
      void router.push(await hostChatPath(hostId, listing ? listing.id : null));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
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
        .host-profile-shell { min-height: 100vh; display: block !important; width: 100% !important; background: var(--host-profile-page); color: var(--host-profile-text); font-family: "Helvetica Neue", Arial, sans-serif; }
        .host-profile-main { min-width: 0; }
        .host-profile-content { width: 100%; margin: 0; padding-bottom: 64px; }

        .host-profile-skeleton-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .host-profile-skeleton-banner { position:relative; height:350px; overflow:hidden; background:var(--host-profile-surface-raised); }
        .host-profile-skeleton-identity { position:absolute; inset:auto 24px 24px; display:grid; grid-template-columns:88px minmax(0,1fr) 150px; align-items:center; gap:18px; }
        .host-profile-skeleton-avatar, .host-profile-skeleton-line, .host-profile-skeleton-message, .host-profile-skeleton-card-image { background:linear-gradient(100deg,var(--host-profile-surface-raised) 20%,var(--host-profile-border) 38%,var(--host-profile-surface-raised) 58%); background-size:220% 100%; animation:host-profile-shimmer 1.4s ease-in-out infinite; }
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
        .host-profile-skeleton-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; padding-top:20px; }
        .host-profile-skeleton-card { overflow:hidden; border:1px solid var(--host-profile-border); border-radius:14px; background:var(--host-profile-surface); }
        .host-profile-skeleton-card-image { height:160px; }
        .host-profile-skeleton-card-copy { display:grid; gap:10px; padding:14px; }
        .host-profile-skeleton-card-copy .host-profile-skeleton-line:first-child { width:75%; }
        .host-profile-skeleton-card-copy .host-profile-skeleton-line:nth-child(2) { width:48%; height:10px; }
        .host-profile-skeleton-card-copy .host-profile-skeleton-line:last-child { width:58%; }
        @keyframes host-profile-shimmer { to { background-position-x:-220%; } }
        @media(prefers-reduced-motion:reduce) { .host-profile-skeleton-avatar,.host-profile-skeleton-line,.host-profile-skeleton-message,.host-profile-skeleton-card-image { animation:none; } }
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
        .host-profile-message { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px; border:0; border-radius:10px; background:#e5384f; color:#fff; font-size:0.875rem; font-weight:600; cursor:pointer; white-space:nowrap; }
        .host-profile-message:hover { background:#c9233c; }
        .host-profile-body { padding:20px 24px 0; }
        .host-profile-bio { margin:0 0 14px; color:var(--host-profile-muted); font-size:0.875rem; line-height:1.6; }
        .host-profile-listings-panel { padding:20px 24px 0; }
        .host-profile-listing-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        .host-profile-listing-card { color: var(--host-profile-text); text-decoration: none; }
        .host-profile-load-error { color:var(--host-profile-error); }
        .host-profile-load-muted { color:var(--host-profile-subtle); }
        .host-profile-more-reviews { border:1px solid var(--host-profile-border); color:var(--host-profile-text); }
        .host-profile-more-reviews:hover { background:var(--host-profile-surface-raised); }
        @media (max-width: 1100px) { .host-profile-listing-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } .host-profile-skeleton-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 760px) {
          .host-profile-shell { display:block; }
          .host-profile-content { padding-bottom:24px; }
          .host-profile-skeleton-identity { inset:auto 16px 18px; grid-template-columns:68px minmax(0,1fr); gap:12px; }
          .host-profile-skeleton-avatar { width:68px; height:68px; }
          .host-profile-skeleton-message { display:none; }
          .host-profile-skeleton-meta { flex-wrap:wrap; }
          .host-profile-skeleton-meta .host-profile-skeleton-line { width:92px; }
          .host-profile-skeleton-meta .host-profile-skeleton-line:last-child { width:122px; }
          .host-profile-skeleton-body { padding:16px 16px 0; }
          .host-profile-skeleton-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .host-profile-identity { left:16px; right:16px; bottom:18px; grid-template-columns:68px minmax(0,1fr); gap:12px; }
          .host-profile-avatar { width:68px; height:68px; }
          .host-profile-message { grid-column:2; justify-self:start; padding:8px 14px; }
          .host-profile-meta { gap:8px 12px; font-size:0.75rem; }
          .host-profile-body { padding:16px 16px 0; }
          .host-profile-listings-panel { padding:16px 16px 0; }
          .host-profile-listing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 480px) {
          .host-profile-skeleton-identity { inset:auto 12px 18px; grid-template-columns:56px minmax(0,1fr); gap:10px; }
          .host-profile-skeleton-avatar { width:56px; height:56px; }
          .host-profile-skeleton-meta .host-profile-skeleton-line:nth-child(3) { display:none; }
          .host-profile-skeleton-grid { grid-template-columns:1fr; }
          .host-profile-identity { grid-template-columns:56px minmax(0,1fr); left:12px; right:12px; gap:10px; }
          .host-profile-avatar { width:56px; height:56px; }
          .host-profile-identity h1 { font-size:1.25rem; }
          .host-profile-meta { font-size:0.6875rem; gap:7px 10px; }
          .host-profile-listing-grid { grid-template-columns:1fr !important; }
        }
      `}</style>
      <div className="host-profile-shell">
        <main className="host-profile-main">
          <div className="host-profile-content">
            {isLoading ? (
              <ProfileSkeleton />
            ) : !host && isPrivate ? (
              <PrivateProfileNotice handle={keyIsId ? null : hostKey} signedIn={Boolean(viewerId)} />
            ) : !host ? (
              <p className="host-profile-load-error" role="alert" style={{ padding: 24 }}>{loadError || 'Could not load this host profile.'}</p>
            ) : (
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
                      {(averageRating !== null || reviewCount > 0) && (
                        <div className="host-profile-rating" aria-label={`${averageRating !== null ? averageRating.toFixed(1) : ''}, ${reviewCount} reviews`}>
                          <Stars count={averageRating !== null ? Math.round(averageRating) : 0} size={13} />
                          {averageRating !== null && <span style={{ fontWeight: 600 }}>{averageRating.toFixed(1)}</span>}
                          <span className="host-profile-rating-count">({reviewCount} reviews)</span>
                        </div>
                      )}
                    </div>
                    {canMessageHost && (
                      <button type="button" className="host-profile-message" onClick={() => { void startChat(); }} aria-label={`Message ${host.full_name || host.username || 'host'}`}>
                        <MessageCircle size={16} aria-hidden="true" />
                        Message
                      </button>
                    )}
                  </section>
                </div>
                <div className="host-profile-body">
                  {host.bio && <p className="host-profile-bio">{host.bio}</p>}
                  <ProfileCategoryNav
                    hostId={host.id}
                    viewerId={viewerId}
                    listings={listings || []}
                    isOwner={isOwner}
                    value={selectedCategory}
                    activeTab={tab}
                    onTabChange={setTab}
                    onChange={(id) => { setSelectedCategory(id); setTab('listings'); }}
                    onCategoryListings={setCategoryListings}
                  />
                </div>

                {tab === 'listings' && (
                  <div id="host-profile-listings" role="tabpanel" aria-label="Spaces" className="host-profile-listings-panel">
                    <div className="host-profile-listing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                      {shownListings.map((listing) => <ListingCard key={listing.id} listing={listing} token={token} />)}
                      {shownListings.length === 0 && <p className="host-profile-load-muted" style={{ gridColumn: '1/-1' }}>{selectedCategory ? 'No listings in this category yet.' : 'No listings available.'}</p>}
                    </div>
                  </div>
                )}

                {tab === 'reviews' && (
                  <div id="host-profile-reviews" role="tabpanel" aria-label="Reviews" className="host-profile-listings-panel">
                    <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', background: 'var(--host-profile-surface)', border: '1px solid var(--host-profile-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 100, borderRight: '1px solid var(--host-profile-border)', paddingRight: 24 }}>
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
                          <div key={review.id} style={{ background: 'var(--host-profile-surface)', border: '1px solid var(--host-profile-border)', borderRadius: 14, padding: 18 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--host-profile-avatar-fallback)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--host-profile-text)', flexShrink: 0, overflow: 'hidden' }}>
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
                      <button
                        type="button"
                        onClick={() => setVisibleReviews(reviews.length)}
                        className="host-profile-more-reviews"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '18px auto 0', background: 'none', border: '1px solid var(--host-profile-border)', color: 'var(--host-profile-text)', fontSize: '0.8125rem', fontWeight: 600, padding: '10px 20px', borderRadius: 10, cursor: 'pointer' }}
                      >
                        Show all {reviews.length} reviews
                        <ChevronDown size={14} />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
