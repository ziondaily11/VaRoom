import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CalendarDays, Mail, MapPin, MoreHorizontal, ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loginUrl } from '../../lib/safeRedirect';
import { loadHostListings, loadHostProfile, loadHostReviews, peek, type HostProfileRow, type HostReview, type ProfileListing } from '../../lib/profile/hostProfile';
import { NICHE_LABELS } from '../../lib/profile/profilePage';
import { hostChatPath } from '../../lib/profile/hostChat';
import { resolveAvatarUrl, resolveStoredPhotoUrl } from '../resolveStoredPhotoUrl';
import VideoMedia from '../media/VideoMedia';
import ProfileBanner from './ProfileBanner';
import ProfileCategoryNav, { type ProfileTab } from './ProfileCategoryNav';
import { useNearVideo } from './useNearVideo';

// The public host profile a shared link lands on (/u/[username]): no app
// shell. Converted from legacy-pages/public-profile.jsx with the same look.
// Signed-out visitors are asked to sign in to message the host (and come
// back here); signed-in visitors can message the host; the host sees a link
// to edit their profile.

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={n <= Math.round(value) ? '#E5384F' : 'none'} stroke={n <= Math.round(value) ? '#E5384F' : '#4A4A4A'} />
      ))}
    </span>
  );
}

function ListingCard({ listing }: { listing: ProfileListing }) {
  const { ref, video } = useNearVideo<HTMLDivElement>(listing.id, null);
  const photo = listing.photo ? resolveStoredPhotoUrl(listing.photo, 'listing-photos', getSupabaseClient()) : null;
  const image = photo || (video && video.thumbnailUrl) || '';
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', background: '#111111', border: '1px solid #232323' }}>
      <div ref={ref} style={{ position: 'relative', aspectRatio: '4 / 3' }}>
        {video && video.videoUrl ? (
          <VideoMedia src={video.videoUrl} muted playsInline preload="metadata" controls title={`${listing.title} video`} style={{ width: '100%', height: '100%', display: 'block' }} />
        ) : (
          image ? <img src={image} alt={listing.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: '#161616' }} />
        )}
        <button aria-label="More options" type="button" style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <MoreHorizontal size={14} />
        </button>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, color: '#E5384F', marginBottom: 4 }}>{(listing.category || 'PROPERTY').toUpperCase()}</div>
        <div style={{ fontSize: 14, color: '#F2F2F2', fontWeight: 500 }}>{listing.title}</div>
        <div style={{ fontSize: 13, color: '#8A8A8A', marginTop: 2 }}>KES {(Number(listing.price_amount) || 0).toLocaleString()} / {listing.price_unit || 'night'}</div>
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: HostReview }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid #1E1E1E' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13.5, color: '#F2F2F2', fontWeight: 500 }}>{(review.client && review.client.full_name) || 'Guest'}</span>
        <span style={{ fontSize: 12, color: '#6E6E6E' }}>{review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}</span>
      </div>
      <div style={{ marginTop: 4, marginBottom: 6 }}><Stars value={Number(review.rating) || 0} size={12} /></div>
      <p style={{ fontSize: 13.5, color: '#B8B8B8', lineHeight: 1.5, margin: 0 }}>{review.comment || ''}</p>
    </div>
  );
}

function PublicProfileSkeleton() {
  return (
    <div className="public-profile-skeleton" role="status" aria-label="Loading host profile" aria-busy="true">
      <span className="public-profile-skeleton-label">Loading host profile</span>
      <aside className="public-profile-skeleton-rail" aria-hidden="true">
        <div className="public-profile-skeleton-logo" />
        <div className="public-profile-skeleton-rail-copy"><div /><div /><div /></div>
        <div className="public-profile-skeleton-rail-button" />
        <div className="public-profile-skeleton-rail-button" />
      </aside>
      <main className="public-profile-skeleton-main" aria-hidden="true">
        <div className="public-profile-skeleton-banner">
          <div className="public-profile-skeleton-identity">
            <div className="public-profile-skeleton-avatar" />
            <div className="public-profile-skeleton-details"><div /><div /><div /><div /></div>
          </div>
        </div>
        <div className="public-profile-skeleton-tabs"><div /><div /><div /><div /></div>
        <div className="public-profile-skeleton-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div className="public-profile-skeleton-card" key={item}>
              <div className="public-profile-skeleton-card-image" />
              <div className="public-profile-skeleton-card-copy"><div /><div /><div /></div>
            </div>
          ))}
        </div>
      </main>
      <style jsx global>{`
        .public-profile-skeleton {
          --public-skeleton-base: #191919;
          --public-skeleton-highlight: #292929;
          display: grid;
          grid-template-columns: 240px minmax(0,1fr);
          min-height: 100vh;
          overflow: hidden;
          background: #000;
          color: #f2f2f2;
          font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        }
        .public-profile-skeleton-label {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0,0,0,0);
          white-space: nowrap;
        }
        .public-profile-skeleton-rail {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 24px 22px;
          border-right: 1px solid #1a1a1a;
        }
        .public-profile-skeleton-logo,
        .public-profile-skeleton-rail-copy div,
        .public-profile-skeleton-rail-button,
        .public-profile-skeleton-tabs div,
        .public-profile-skeleton-avatar,
        .public-profile-skeleton-details div,
        .public-profile-skeleton-card-image,
        .public-profile-skeleton-card-copy div {
          background: linear-gradient(100deg,var(--public-skeleton-base) 20%,var(--public-skeleton-highlight) 42%,var(--public-skeleton-base) 64%);
          background-size: 220% 100%;
          animation: public-profile-shimmer 1.5s ease-in-out infinite;
        }
        .public-profile-skeleton-logo { width: 92px; height: 24px; margin-bottom: 20px; border-radius: 6px; }
        .public-profile-skeleton-rail-copy { display: grid; gap: 10px; margin: 4px 0 10px; }
        .public-profile-skeleton-rail-copy div { width: 100%; height: 14px; border-radius: 999px; }
        .public-profile-skeleton-rail-copy div:first-child { width: 82%; height: 20px; }
        .public-profile-skeleton-rail-button { height: 46px; border: 1px solid #242424; border-radius: 999px; }
        .public-profile-skeleton-main { min-width: 0; padding: 0 32px 48px; }
        .public-profile-skeleton-banner {
          position: relative;
          height: 400px;
          margin: 0 -32px;
          background: linear-gradient(110deg,#171717 20%,#242424 48%,#171717 76%);
          background-size: 220% 100%;
          animation: public-profile-shimmer 1.5s ease-in-out infinite;
        }
        .public-profile-skeleton-identity { position: absolute; inset: auto 36px 24px; display: flex; align-items: center; gap: 18px; }
        .public-profile-skeleton-avatar { width: 72px; height: 72px; flex: 0 0 auto; border: 3px solid #111; border-radius: 50%; }
        .public-profile-skeleton-details { display: grid; width: min(520px,70%); gap: 10px; }
        .public-profile-skeleton-details div { width: 70%; height: 13px; border-radius: 999px; }
        .public-profile-skeleton-details div:first-child { width: 45%; height: 22px; }
        .public-profile-skeleton-details div:nth-child(2) { width: 30%; }
        .public-profile-skeleton-details div:last-child { width: 55%; }
        .public-profile-skeleton-tabs { display: flex; gap: 22px; align-items: center; height: 62px; border-bottom: 1px solid #1a1a1a; }
        .public-profile-skeleton-tabs div { width: 82px; height: 14px; border-radius: 999px; }
        .public-profile-skeleton-tabs div:first-child { width: 52px; }
        .public-profile-skeleton-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 16px; padding-top: 22px; }
        .public-profile-skeleton-card { overflow: hidden; border: 1px solid #232323; border-radius: 12px; background: #101010; }
        .public-profile-skeleton-card-image { aspect-ratio: 4/3; }
        .public-profile-skeleton-card-copy { display: grid; gap: 10px; padding: 13px; }
        .public-profile-skeleton-card-copy div { width: 78%; height: 14px; border-radius: 999px; }
        .public-profile-skeleton-card-copy div:nth-child(2) { width: 48%; height: 11px; }
        .public-profile-skeleton-card-copy div:last-child { width: 58%; height: 12px; }
        @keyframes public-profile-shimmer { to { background-position-x: -220%; } }
        @media (max-width: 1100px) { .public-profile-skeleton-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } }
        @media (max-width: 760px) {
          .public-profile-skeleton { display: block; }
          .public-profile-skeleton-rail { display: none; }
          .public-profile-skeleton-main { padding: 0 16px 36px; }
          .public-profile-skeleton-banner { height: 320px; margin: 0 -16px; }
          .public-profile-skeleton-identity { inset: auto 18px 20px; gap: 12px; }
          .public-profile-skeleton-avatar { width: 60px; height: 60px; }
          .public-profile-skeleton-details { width: min(420px,75%); gap: 8px; }
          .public-profile-skeleton-details div { width: 90%; }
          .public-profile-skeleton-tabs { gap: 16px; height: 54px; }
          .public-profile-skeleton-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; padding-top: 16px; }
        }
        @media (max-width: 380px) { .public-profile-skeleton-grid { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) {
          .public-profile-skeleton-logo,.public-profile-skeleton-rail-copy div,.public-profile-skeleton-rail-button,
          .public-profile-skeleton-tabs div,.public-profile-skeleton-avatar,.public-profile-skeleton-details div,
          .public-profile-skeleton-card-image,.public-profile-skeleton-card-copy div { animation: none; }
        }
      `}</style>
    </div>
  );
}

const railButton: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px 0', borderRadius: 999,
  border: '1px solid #3A3A3A', background: '#0A0A0A', color: '#F2F2F2', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
};

export default function PublicHostProfile() {
  const router = useRouter();
  const { status, user, session } = useAuth();
  const username = typeof router.query.username === 'string' ? router.query.username.replace(/^@/, '') : null;
  const viewerId = user?.id || null;
  const token = session?.access_token || null;
  const authReady = status !== 'loading';

  const [tab, setTab] = useState<ProfileTab>('listings');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryListings, setCategoryListings] = useState<Record<string, string[]>>({});
  const [isSignInPromptOpen, setIsSignInPromptOpen] = useState(false);
  const [profile, setProfile] = useState<HostProfileRow | null>(null);
  const [listings, setListings] = useState<ProfileListing[] | null>(null);
  const [reviews, setReviews] = useState<HostReview[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!router.isReady || !username || !authReady) return undefined;
    const client = getSupabaseClient();
    if (!client) { setLoadError('Public host profiles are unavailable right now.'); return undefined; }
    let cancelled = false;
    setLoadError('');
    const cachedProfile = peek<HostProfileRow | null>(viewerId, `@${username.toLowerCase()}`, 'profile');
    if (cachedProfile) setProfile(cachedProfile);
    (async () => {
      let row: HostProfileRow | null;
      try {
        row = await loadHostProfile(client, viewerId, { username });
      } catch (error) {
        console.error('Unable to load public host profile', error);
        if (!cancelled) setLoadError('Could not load this host profile.');
        return;
      }
      if (cancelled) return;
      if (!row) { setLoadError('This host profile could not be found.'); return; }
      setProfile(row);
      const hostId = row.id;
      const cachedListings = peek<ProfileListing[]>(viewerId, hostId, 'listings');
      if (cachedListings) setListings(cachedListings);
      loadHostListings(client, viewerId, hostId, false).then((rows) => { if (!cancelled) setListings(rows); }).catch((error) => {
        console.error('Unable to load public host listings', error);
        if (!cancelled) setListings([]);
      });
      loadHostReviews(viewerId, hostId).then((result) => { if (!cancelled) setReviews(result.reviews); }).catch((error) => console.error('Unable to load public host reviews', error));
    })();
    return () => { cancelled = true; };
  }, [router.isReady, username, authReady, viewerId]);

  const signIn = () => { void router.push(loginUrl(`/u/${encodeURIComponent(username || '')}`)); };
  const isOwner = Boolean(profile && viewerId === profile.id);
  const signedIn = Boolean(viewerId);

  const startChat = async () => {
    if (!profile || !viewerId) { signIn(); return; }
    const listing = (listings || [])[0];
    void router.push(await hostChatPath(profile.id, listing ? listing.id : null));
  };

  if (loadError) {
    return (
      <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#000', color: '#F2F2F2', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        {loadError}
      </main>
    );
  }
  if (!profile || listings === null) return <PublicProfileSkeleton />;

  const name = profile.full_name || 'Host';
  const firstName = name.split(' ')[0];
  const handle = profile.username ? `@${profile.username.replace(/^@/, '')}` : '';
  const photo = profile.avatar_url ? resolveAvatarUrl(profile.avatar_url, getSupabaseClient()) : '';
  const memberSince = profile.created_at ? `Member since ${new Date(profile.created_at).getFullYear()}` : '';
  const specializations = Array.isArray(profile.listing_categories) ? Array.from(new Set(profile.listing_categories.map((category) => NICHE_LABELS[category] || category))) : [];
  const reviewCount = reviews.length;
  const rating = reviewCount ? reviews.reduce((total, review) => total + (Number(review.rating) || 0), 0) / reviewCount : 0;
  const shown = listings.filter((listing) => !selectedCategory || (categoryListings[selectedCategory] || []).includes(listing.id));

  return (
    <div className="public-profile-shell" style={{ minHeight: '100vh', height: '100vh', background: '#000000', color: '#F2F2F2', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", display: 'flex' }}>
      <aside className="desktop-sign-in-rail" style={{ width: 240, height: '100vh', flexShrink: 0, borderRight: '1px solid #1A1A1A', padding: '24px 22px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
          <span style={{ color: '#E5384F' }}>Va</span><span style={{ color: '#fff' }}>Room</span>
        </div>
        {isOwner ? (
          <div>
            <h2 style={{ fontSize: 19, lineHeight: 1.3, margin: '0 0 8px 0' }}>This is your public profile</h2>
            <p style={{ fontSize: 13.5, color: '#8A8A8A', lineHeight: 1.5, margin: '0 0 20px 0' }}>This is how people see you when you share your profile link.</p>
            <Link href="/profile" style={railButton}>Edit profile</Link>
          </div>
        ) : signedIn ? (
          <div>
            <h2 style={{ fontSize: 19, lineHeight: 1.3, margin: '0 0 8px 0' }}>Message {firstName}</h2>
            <p style={{ fontSize: 13.5, color: '#8A8A8A', lineHeight: 1.5, margin: '0 0 20px 0' }}>Ask about a space or your dates in Chats.</p>
            <button type="button" onClick={() => { void startChat(); }} style={railButton}>Message</button>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: 19, lineHeight: 1.3, margin: '0 0 8px 0' }}>Sign in to message {firstName}</h2>
            <p style={{ fontSize: 13.5, color: '#8A8A8A', lineHeight: 1.5, margin: '0 0 20px 0' }}>You&apos;ll be redirected to this host&apos;s profile once you&apos;re signed in.</p>
            <button type="button" onClick={signIn} style={{ ...railButton, marginBottom: 10 }}><GoogleIcon />Continue with Google</button>
            <button type="button" onClick={signIn} style={railButton}><Mail size={16} />Continue with Email</button>
          </div>
        )}
      </aside>

      <main className="public-profile-main" style={{ flex: 1, padding: '0 32px 64px' }}>
        <section className="public-profile-banner-stage" aria-label="Host profile">
          <ProfileBanner imageKey={profile.banner_image_key} hostId={profile.id} />
          <div className="public-profile-header">
            {photo ? <img src={photo} alt={name} /> : <div className="public-profile-avatar-fallback" aria-hidden="true">{name.charAt(0).toUpperCase()}</div>}
            <div className="public-profile-identity">
              <div className="public-profile-name-row">
                <h1>{name}</h1>
                {profile.verified && <span className="public-profile-verified"><ShieldCheck size={12} aria-hidden="true" /> HOST</span>}
              </div>
              {handle && <div className="public-profile-handle">{handle}</div>}
              <div className="public-profile-meta">
                {profile.city && <span><MapPin size={13} aria-hidden="true" />{profile.city}</span>}
                {memberSince && <span><CalendarDays size={13} aria-hidden="true" />{memberSince}</span>}
                {specializations.map((specialization) => <span key={specialization}><ShieldCheck size={13} aria-hidden="true" />{specialization}</span>)}
              </div>
              {profile.bio && <p className="public-profile-bio">{profile.bio}</p>}
              <div className="public-profile-rating">
                <Stars value={rating} size={12} />
                <span>{rating ? rating.toFixed(1) : 'No ratings'} ({reviewCount} reviews)</span>
              </div>
            </div>
            {isOwner ? (
              <Link href="/profile" className="mobile-message-button">Edit profile</Link>
            ) : (
              <button type="button" className="mobile-message-button" onClick={() => { if (signedIn) void startChat(); else setIsSignInPromptOpen(true); }}>Message</button>
            )}
          </div>
        </section>

        <ProfileCategoryNav
          hostId={profile.id}
          viewerId={viewerId}
          listings={listings}
          value={selectedCategory}
          activeTab={tab}
          onTabChange={setTab}
          onChange={(id) => { setSelectedCategory(id); setTab('listings'); }}
          onCategoryListings={setCategoryListings}
        />

        {tab === 'listings' ? (
          <div className="public-profile-listings" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 24 }}>
            {shown.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
            {shown.length === 0 && <p style={{ color: '#888', gridColumn: '1/-1', textAlign: 'center', padding: 32 }}>{selectedCategory ? 'No listings in this category yet.' : 'No listings available.'}</p>}
          </div>
        ) : (
          <div className="public-profile-reviews" style={{ marginTop: 8, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            {reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
          </div>
        )}
      </main>

      {isSignInPromptOpen && (
        <div className="mobile-sign-in-overlay" role="dialog" aria-modal="true" aria-labelledby="mobile-sign-in-title" onClick={() => setIsSignInPromptOpen(false)}>
          <div className="mobile-sign-in-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="mobile-sign-in-close" aria-label="Close sign-in prompt" onClick={() => setIsSignInPromptOpen(false)}>×</button>
            <h2 id="mobile-sign-in-title">Sign in to message {firstName}</h2>
            <p>You&apos;ll be redirected to this host&apos;s profile once you&apos;re signed in.</p>
            <button type="button" className="mobile-sign-in-option" onClick={signIn}><GoogleIcon /> Continue with Google</button>
            <button type="button" className="mobile-sign-in-option" onClick={signIn}><Mail size={16} /> Continue with Email</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .public-profile-shell { height:100vh; min-height:0 !important; overflow:hidden; overflow-x:hidden; align-items:stretch; }
        .desktop-sign-in-rail { position:sticky; top:0; align-self:flex-start; overflow:hidden; }
        .public-profile-main { height:100vh; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior-y:contain; scrollbar-width:thin; scrollbar-color:#3a3a3a transparent; }
        .public-profile-main::-webkit-scrollbar { width:8px; }
        .public-profile-main::-webkit-scrollbar-thumb { border:2px solid transparent; border-radius:999px; background:#3a3a3a; background-clip:padding-box; }
        .public-profile-banner-stage { position: relative; isolation: isolate; margin: 0 -32px 16px; }
        .public-profile-banner-stage > .profile-banner { height: 400px !important; }
        .public-profile-banner-stage > .profile-banner::after {
          background: linear-gradient(to top,rgba(0,0,0,.96) 0%,rgba(0,0,0,.78) 24%,rgba(0,0,0,.24) 66%,transparent 100%) !important;
        }
        .public-profile-header {
          position: absolute; z-index: 2; left: 36px; right: 36px; bottom: 22px;
          display: flex; align-items: center; gap: 16px; color: #fff;
        }
        .public-profile-header > img, .public-profile-avatar-fallback {
          width: 68px; height: 68px; flex: 0 0 auto; border: 2px solid rgba(255,255,255,.9);
          border-radius: 50%; object-fit: cover;
        }
        .public-profile-avatar-fallback { display: grid; place-items: center; background: #302b29; color: #fff; font-size: 26px; font-weight: 700; }
        .public-profile-identity { min-width: 0; max-width: 850px; }
        .public-profile-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .public-profile-name-row h1 { margin: 0; color: #fff; font-size: clamp(19px,2vw,27px); line-height: 1.2; font-weight: 700; }
        .public-profile-verified { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #e5384f; border-radius: 999px; padding: 3px 8px; color: #ff9eab; font-size: 10px; font-weight: 700; }
        .public-profile-handle { margin-top: 3px; color: rgba(255,255,255,.76); font-size: 13px; }
        .public-profile-meta { display: flex; align-items: center; gap: 7px 16px; flex-wrap: wrap; margin-top: 8px; color: rgba(255,255,255,.86); font-size: 12.5px; }
        .public-profile-meta span { display: inline-flex; align-items: center; gap: 5px; }
        .public-profile-bio { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; margin: 7px 0 0; color: rgba(255,255,255,.86); font-size: 13px; line-height: 1.4; }
        .public-profile-rating { display: flex; align-items: center; gap: 7px; margin-top: 7px; color: #fff; font-size: 12px; }
        .mobile-message-button, .mobile-sign-in-overlay { display: none; }

        @media (max-width: 700px) {
          html, body { max-width: 100%; overflow-x: hidden; }
          .public-profile-shell, .public-profile-shell * { box-sizing: border-box; }
          .public-profile-shell {
            display: block !important;
            width: 100%;
            min-width: 0;
            height: auto;
            min-height: 100dvh !important;
            overflow: visible;
          }
          .desktop-sign-in-rail { display: none !important; }
          .public-profile-main {
            width: 100%;
            min-width: 0;
            height: auto;
            min-height: 100dvh;
            overflow: visible;
            padding: 0 16px 40px !important;
          }
          .public-profile-banner-stage { margin: 0 -16px 12px; }
          .public-profile-banner-stage > .profile-banner { height: 330px !important; }
          .public-profile-header { left: 16px; right: 16px; bottom: 17px; align-items: flex-end; gap: 10px; }
          .public-profile-header > img, .public-profile-avatar-fallback { width: 54px; height: 54px; }
          .public-profile-avatar-fallback { font-size: 20px; }
          .public-profile-identity { flex: 1; }
          .public-profile-name-row h1 { font-size: 17px; }
          .public-profile-meta { gap: 6px 10px; margin-top: 6px; font-size: 11px; }
          .public-profile-bio { font-size: 12px; }
          .public-profile-rating { gap: 5px; margin-top: 6px; font-size: 11px; }
          .mobile-message-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: auto;
            flex-shrink: 0;
            padding: 8px 12px;
            border: 1px solid #3A3A3A;
            border-radius: 999px;
            background: #111;
            color: #F2F2F2;
            font: inherit;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          }
          .public-profile-listings {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 14px !important;
            margin-top: 18px !important;
          }
          .public-profile-listings > * { min-width: 0; width: 100%; }
          .public-profile-listings video, .public-profile-listings img { max-width: 100%; }
          .public-profile-reviews { width: 100%; max-width: none !important; margin-top: 6px !important; }
          .mobile-sign-in-overlay {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: flex-end;
            padding: 16px;
            background: rgba(0, 0, 0, .68);
          }
          .mobile-sign-in-modal {
            position: relative;
            width: 100%;
            max-width: 480px;
            margin: 0 auto;
            padding: 24px 20px 20px;
            border: 1px solid #2A2A2A;
            border-radius: 18px;
            background: #111;
            color: #F2F2F2;
            box-shadow: 0 20px 50px rgba(0, 0, 0, .45);
          }
          .mobile-sign-in-modal h2 { margin: 0 28px 8px 0; font-size: 18px; line-height: 1.3; }
          .mobile-sign-in-modal p { margin: 0 0 18px; color: #A8A8A8; font-size: 13px; line-height: 1.5; }
          .mobile-sign-in-close {
            position: absolute;
            top: 10px;
            right: 12px;
            width: 32px;
            height: 32px;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: #F2F2F2;
            font-size: 26px;
            line-height: 1;
            cursor: pointer;
          }
          .mobile-sign-in-option {
            display: flex;
            width: 100%;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 10px;
            padding: 12px;
            border: 1px solid #3A3A3A;
            border-radius: 999px;
            background: #0A0A0A;
            color: #F2F2F2;
            font: inherit;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          }
        }
        @media (max-width: 430px) {
          .public-profile-banner-stage > .profile-banner { height: 360px !important; }
          .public-profile-header { left: 13px; right: 13px; bottom: 14px; align-items: flex-start; }
          .public-profile-header > img, .public-profile-avatar-fallback { width: 48px; height: 48px; }
          .public-profile-header .mobile-message-button { position: absolute; top: -44px; right: 0; }
          .public-profile-identity { max-width: calc(100% - 58px); }
          .public-profile-meta { gap: 5px 8px; }
        }
      `}</style>
    </div>
  );
}
