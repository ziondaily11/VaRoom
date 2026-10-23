import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import VideoMedia from "../components/VideoMedia";
import ProfileCategoryNav from "./ProfileCategoryNav";
import ProfileBanner from "./ProfileBanner";
import {
  Home,
  Compass,
  CalendarDays,
  MessageSquare,
  UserRound,
  WalletCards,
  Settings,
  LifeBuoy,
  Plus,
  Bookmark,
  BarChart3,
  CreditCard,
  ShieldCheck,
  Star,
  MapPin,
  MessageCircle,
  BadgeCheck,
  ChevronDown,
} from "lucide-react";

function Stars({ count, size = 14 }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          fill={i < count ? "#E5384F" : "none"}
          color={i < count ? "#E5384F" : "#4A4A4A"}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  const client = typeof window !== "undefined" ? window.supabaseClient : null;
  return client ? client.storage.from("avatars").getPublicUrl(avatarUrl).data.publicUrl : avatarUrl;
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

export default function HostProfileView() {
  const router = useRouter();
  const [tab, setTab] = useState("listings");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryListings, setCategoryListings] = useState({});
  const [visibleReviews, setVisibleReviews] = useState(3);
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ average_rating: null, review_count: 0, distribution: [] });
  const [reviewsError, setReviewsError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState("client");
  const [viewerId, setViewerId] = useState(null);

  useEffect(() => {
    if (!router.isReady || !router.query.hostId) return undefined;

    let cancelled = false;
    let reviewClient = null;
    setIsLoading(true);
    setLoadError("");
    setReviews([]);
    setReviewSummary({ average_rating: null, review_count: 0, distribution: [] });
    setReviewsError("");
    async function loadHost() {
      const client = typeof window !== "undefined" ? window.supabaseClient : null;
      if (!client) {
        setLoadError("Host profiles are unavailable right now.");
        setIsLoading(false);
        return;
      }
      reviewClient = client;

      const hostId = String(router.query.hostId);
      const sessionResult = await client.auth.getSession();
      if (sessionResult.data.session?.user?.id) {
        setViewerId(sessionResult.data.session.user.id);
        const viewerResult = await client
          .from("profiles")
          .select("role")
          .eq("id", sessionResult.data.session.user.id)
          .maybeSingle();
        if (viewerResult.data?.role === "host") setViewerRole("host");
      }
      async function loadReviews() {
        try {
          const response = await fetch(`/api/hosts/${encodeURIComponent(hostId)}/reviews`);
          if (!response.ok) throw new Error("Unable to load host reviews");
          const payload = await response.json();
          if (cancelled) return;
          const rows = Array.isArray(payload.reviews) ? payload.reviews : [];
          setReviews(rows.map((review) => {
            const name = review.client?.full_name || "Guest";
            return {
              id: review.id,
              avatarUrl: resolveAvatarUrl(review.client?.avatar_url),
              initials: (name.split(" ").map((part) => part.charAt(0)).join("").slice(0, 2) || "G").toUpperCase(),
              name,
              date: review.created_at ? new Date(review.created_at).toLocaleDateString() : "",
              rating: Number(review.rating) || 0,
              text: review.comment || "",
            };
          }));
          setReviewSummary(payload.summary || { average_rating: null, review_count: rows.length, distribution: [] });
          setReviewsError("");
        } catch {
          if (!cancelled) setReviewsError("Reviews could not be loaded right now.");
        }
      }

      let listingsQuery = client
        .from("listings")
        .select("id,title,category,location_text,availability_status,created_at,listing_photos(storage_path),listing_booking_details(price_amount,price_unit)")
        .eq("host_id", hostId);
      if (sessionResult.data.session?.user?.id !== hostId) {
        listingsQuery = listingsQuery
          .eq("moderation_status", "active")
          .eq("availability_status", "available");
      }
      const [profileResult, listingsResult] = await Promise.all([
        client.from("profiles").select("id,role,full_name,username,bio,avatar_url,banner_image_key,verified,city,created_at,listing_categories").eq("id", hostId).eq("role", "host").maybeSingle(),
        listingsQuery.order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;
      if (profileResult.error || !profileResult.data) {
        setLoadError("Could not load this host profile.");
        setIsLoading(false);
        return;
      }
      setProfile(profileResult.data);
      const reviewsPromise = loadReviews();
      if (!listingsResult.error && listingsResult.data) {
        const authToken = sessionResult.data.session?.access_token;
        const listingsWithMedia = await Promise.all(listingsResult.data.map(async (listing) => {
          const photo = listing.listing_photos?.[0];
          const details = Array.isArray(listing.listing_booking_details)
            ? listing.listing_booking_details[0]
            : listing.listing_booking_details;
          let videoUrl = null;
          if (authToken) {
            try {
              const mediaResponse = await fetch(`/api/properties/${encodeURIComponent(listing.id)}/media`, {
                headers: { Authorization: `Bearer ${authToken}` },
              });
              if (mediaResponse.ok) {
                const mediaPayload = await mediaResponse.json();
                const video = (mediaPayload.media || []).find((item) => item?.type === "video");
                if (video?.id) {
                  const playbackResponse = await fetch(`/api/media/${encodeURIComponent(video.id)}/playback`, {
                    headers: { Authorization: `Bearer ${authToken}` },
                  });
                  if (playbackResponse.ok) {
                    const playback = await playbackResponse.json();
                    videoUrl = playback.url || null;
                  }
                }
              }
            } catch {
              videoUrl = null;
            }
          }
          return {
            ...listing,
            tag: (listing.category || "PROPERTY").toUpperCase(),
            title: listing.title,
            location: listing.location_text || "Location not provided",
            price: details?.price_amount
              ? `KSh ${Number(details.price_amount).toLocaleString()} / ${details.price_unit || "night"}`
              : "Price on request",
            img: photo?.storage_path
              ? (photo.storage_path.startsWith("http")
                ? photo.storage_path
                : client.storage.from("listing-photos").getPublicUrl(photo.storage_path).data.publicUrl)
              : null,
            videoUrl,
          };
        }));
        setListings(listingsWithMedia);

      }
      await reviewsPromise;
      const reviewChannel = client
        .channel(`host-profile-reviews-${hostId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `host_id=eq.${hostId}` }, loadReviews)
        .subscribe();
      setIsLoading(false);
      return reviewChannel;
    }
    let reviewChannel = null;
    loadHost().then((channel) => { reviewChannel = channel || null; }).catch(() => {
      if (!cancelled) {
        setLoadError("Could not load this host profile.");
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
      if (reviewChannel) reviewClient?.removeChannel(reviewChannel);
    };
  }, [router.isReady, router.query.hostId]);

  const host = profile || {};
  const reviewCount = Number(reviewSummary.review_count || reviews.length);
  const averageRating = reviewSummary.average_rating == null ? null : Number(reviewSummary.average_rating);
  const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    pct: reviewCount ? Math.round((((reviewSummary.distribution || []).find((item) => Number(item.star) === star)?.count || 0) / reviewCount) * 100) : 0,
  }));
  const avatarUrl = resolveAvatarUrl(host.avatar_url);
  const memberSince = host.created_at
    ? `Member since ${new Date(host.created_at).getFullYear()}`
    : null;
  const specializationLabels = {
    airbnb: "Airbnb",
    hotel: "Hotel",
    venue: "Event ground / venue",
    office: "Offices & Shops",
    shop: "Offices & Shops",
    property: "Property",
  };
  const specializations = Array.isArray(host.listing_categories)
    ? [...new Set(host.listing_categories.map((category) => specializationLabels[category] || category))]
    : [];
  const canMessageHost = viewerRole !== "host" && viewerId !== host.id;
  const isOwner = viewerId === host.id;

  function Sidebar() {
    return null;
  }

  function startChat() {
    if (!router.query.hostId) return;
    const listing = listings.find((item) => item.id);
    if (!listing || typeof window === "undefined" || !window.supabaseClient) {
      router.push(`/chats?host=${encodeURIComponent(router.query.hostId)}`);
      return;
    }
    window.supabaseClient.auth.getSession().then(({ data }) => {
      const currentUserId = data.session?.user?.id;
      if (!currentUserId) {
        router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
        return;
      }
      window.supabaseClient.from("conversations")
        .upsert({ listing_id: listing.id, host_id: router.query.hostId, client_id: currentUserId }, { onConflict: "listing_id,client_id" })
        .select("id")
        .single()
        .then(({ data: conversation, error }) => {
          if (error) throw error;
          router.push(`/chats?c=${encodeURIComponent(conversation.id)}`);
        })
        .catch(() => router.push(`/chats?host=${encodeURIComponent(router.query.hostId)}`));
    });
  }

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
          --host-profile-sidebar: #fff;
          --host-profile-sidebar-hover: #f1efeb;
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
          --host-profile-sidebar: #1c1716;
          --host-profile-sidebar-hover: rgba(255,255,255,.1);
          --host-profile-avatar-fallback: #302b29;
          --host-profile-rating-track: #302b29;
          --host-profile-error: #f2a3ae;
          --host-profile-banner-ink: #fff;
          --host-profile-banner-muted: rgba(255,255,255,.82);
        }
        html, body, #__next { margin: 0; min-height: 100%; background: var(--host-profile-page); }
        body { overflow-x: hidden; }
        .host-profile-shell { min-height: 100vh; display: block !important; width: 100% !important; background: var(--host-profile-page); color: var(--host-profile-text); font-family: "Helvetica Neue", Arial, sans-serif; }
        .host-profile-sidebar { display: flex; flex-direction: column; gap: 18px; min-height: 100vh; padding: 18px 12px 14px; border-right: 1px solid var(--host-profile-border); background: var(--host-profile-sidebar); }
        .profile-sidebar-logo { padding: 0 10px; color: var(--host-profile-text); font-family: Fraunces, serif; font-size: 22px; font-weight: 900; letter-spacing: -.04em; text-decoration: none; }
        .profile-sidebar-logo span { color: #c41e3a; }
        .sidebar-nav { display: flex; flex-direction: column; gap: 4px; }
        .profile-nav-label { margin: 4px 0 0; padding: 8px 12px 6px; color: var(--host-profile-subtle); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
        .sidebar-nav a { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; color: var(--host-profile-text); text-decoration: none; font-size: 14px; font-weight: 500; }
        .sidebar-nav a:hover, .sidebar-nav a:focus-visible { background: var(--host-profile-sidebar-hover); color: var(--host-profile-text); }
        .sidebar-logout { margin-top: auto; padding: 8px 10px; border:0; border-radius:8px; background:transparent; color:#c41e3a; text-align:left; font-weight:600; cursor:pointer; }
        .sidebar-logout:hover, .sidebar-logout:focus-visible { background:var(--host-profile-sidebar-hover); }
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
        .host-profile-avatar-fallback { display:grid; place-items:center; background:var(--host-profile-avatar-fallback); color:var(--host-profile-text); font-size:30px; font-weight:700; }
        .host-profile-identity h1 { font-size:clamp(21px,2.2vw,30px); font-weight:700; line-height:1.2; margin:0; color:inherit; }
        .host-profile-username { margin:4px 0 0; color:var(--host-profile-banner-muted); font-size:14px; }
        .host-profile-meta { display:flex; gap:14px 18px; margin-top:10px; flex-wrap:wrap; font-size:13px; color:var(--host-profile-banner-muted); }
        .host-profile-meta-item { display:flex; align-items:center; gap:6px; }
        .host-profile-rating { display:flex; align-items:center; gap:7px; margin-top:9px; font-size:13px; color:var(--host-profile-banner-ink); }
        .host-profile-rating-count { color:var(--host-profile-banner-muted); }
        .host-profile-message { display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px; border:0; border-radius:10px; background:#e5384f; color:#fff; font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap; }
        .host-profile-message:hover { background:#c9233c; }
        .host-profile-body { padding:20px 24px 0; }
        .host-profile-bio { margin:0 0 14px; color:var(--host-profile-muted); font-size:14px; line-height:1.6; }
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
          .host-profile-sidebar { display:none; }
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
          .host-profile-meta { gap:8px 12px; font-size:12px; }
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
          .host-profile-identity h1 { font-size:20px; }
          .host-profile-meta { font-size:11px; gap:7px 10px; }
          .host-profile-listing-grid { grid-template-columns:1fr !important; }
        }
      `}</style>
      <div className="host-profile-shell">
        <Sidebar />
        <main className="host-profile-main">
          <div className="host-profile-content">
            {isLoading ? (
              <ProfileSkeleton />
            ) : !profile ? (
              <p className="host-profile-load-error" role="alert" style={{ padding: 24 }}>
                {loadError || "Could not load this host profile."}
              </p>
            ) : (
              <>
        <div className="host-profile-banner-wrap">
          <ProfileBanner hostId={host.id} imageKey={host.banner_image_key} isOwner={isOwner} coverHeader={isOwner} onChange={(banner_image_key) => setProfile((current) => ({ ...current, banner_image_key }))} />
          <section className="host-profile-identity" aria-label={`${host.full_name || "Host"} profile`}>
            {avatarUrl ? (
              <img className="host-profile-avatar" src={avatarUrl} alt={host.full_name || "Host"} />
            ) : (
              <div className="host-profile-avatar host-profile-avatar-fallback" aria-label={`${host.full_name || "Host"} profile photo unavailable`}>
                {(host.full_name || "H").charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                {host.full_name && <h1>{host.full_name}</h1>}
                {host.verified && <BadgeCheck size={19} color="#E5384F" aria-label="Verified host" />}
              </div>
              {host.username && <p className="host-profile-username">@{host.username}</p>}
              <div className="host-profile-meta">
                {host.city && <span className="host-profile-meta-item">
                  <MapPin size={14} aria-hidden="true" /> {host.city}
                </span>}
                {host.created_at && <span className="host-profile-meta-item">
                  <CalendarDays size={14} aria-hidden="true" /> {memberSince}
                </span>}
                {specializations.map((specialization) => (
                  <span className="host-profile-meta-item" key={specialization}>
                    <ShieldCheck size={14} aria-hidden="true" /> Specializes in {specialization}
                  </span>
                ))}
              </div>
              {(averageRating !== null || reviewCount > 0) && (
                <div className="host-profile-rating" aria-label={`${averageRating !== null ? averageRating.toFixed(1) : ""}, ${reviewCount} reviews`}>
                  <Stars count={averageRating !== null ? Math.round(averageRating) : 0} size={13} />
                  {averageRating !== null && <span style={{ fontWeight: 600 }}>{averageRating.toFixed(1)}</span>}
                  <span className="host-profile-rating-count">({reviewCount} reviews)</span>
                </div>
              )}
            </div>
            {canMessageHost && (
              <button
                type="button"
                className="host-profile-message"
                onClick={startChat}
                aria-label={`Message ${host.full_name || host.username || "host"}`}
              >
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
            listings={listings}
            isOwner={isOwner}
            value={selectedCategory}
            activeTab={tab}
            onTabChange={setTab}
            onChange={(id) => { setSelectedCategory(id); setTab("listings"); }}
            onCategoryListings={setCategoryListings}
          />
        </div>

        {tab === "listings" && (
          <div id="host-profile-listings" role="tabpanel" aria-label="Spaces" className="host-profile-listings-panel">
            <div
              className="host-profile-listing-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {listings.filter((listing) => !selectedCategory || (categoryListings[selectedCategory] || []).includes(listing.id)).map((l) => (
                <a
                  key={l.id}
                  href={`/booking?listing=${encodeURIComponent(l.id)}`}
                  className="host-profile-listing-card"
                  style={{
                    background: "var(--host-profile-surface)",
                    border: "1px solid var(--host-profile-border)",
                    borderRadius: 14,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ position: "relative", height: 140, background: "var(--host-profile-avatar-fallback)" }}>
                    {l.videoUrl ? (
                      <VideoMedia
                        src={l.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        controls
                        title={`${l.title} video`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : l.img ? (
                      <img src={l.img} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div className="host-profile-load-muted" style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 12 }}>
                        Listing photo not available
                      </div>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        top: 10,
                        left: 10,
                        background: "#fff",
                        color: "#0A0A0A",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        letterSpacing: 0.4,
                      }}
                    >
                      {l.tag}
                    </span>
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {l.title}
                    </div>
                    <div className="host-profile-load-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {l.location}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginTop: 8,
                        color: "var(--host-profile-text)",
                      }}
                    >
                      {l.price}
                    </div>
                  </div>
                  </a>
              ))}
              {!isLoading && listings.filter((listing) => !selectedCategory || (categoryListings[selectedCategory] || []).includes(listing.id)).length === 0 && <p className="host-profile-load-muted" style={{ gridColumn:"1/-1" }}>{selectedCategory ? "No listings in this category yet." : "No listings available."}</p>}
            </div>
          </div>
        )}

        {tab === "reviews" && (
          <div id="host-profile-reviews" role="tabpanel" aria-label="Reviews" className="host-profile-listings-panel">
            <div
              style={{
                display: "flex",
                gap: 28,
                flexWrap: "wrap",
                background: "var(--host-profile-surface)",
                border: "1px solid var(--host-profile-border)",
                borderRadius: 14,
                padding: 20,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 100,
                  borderRight: "1px solid var(--host-profile-border)",
                  paddingRight: 24,
                }}
              >
                <div style={{ fontSize: 34, fontWeight: 700 }}>{averageRating ? averageRating.toFixed(1) : "—"}</div>
                <Stars count={averageRating ? Math.round(averageRating) : 0} size={13} />
                <div className="host-profile-load-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {reviewCount ? `${reviewCount} reviews` : "No reviews yet"}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 180,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {ratingBreakdown.map((r) => (
                  <div
                    key={r.star}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span className="host-profile-load-muted" style={{ fontSize: 12, width: 10 }}>
                      {r.star}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "var(--host-profile-rating-track)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${r.pct}%`,
                          height: "100%",
                          background: "#E5384F",
                        }}
                      />
                    </div>
                    <span className="host-profile-load-muted" style={{ fontSize: 12, width: 30 }}>
                      {r.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {reviewsError && (
                <p role="alert" className="host-profile-load-error">{reviewsError}</p>
              )}
              {!isLoading && !reviewsError && reviews.length === 0 && (
                <p className="host-profile-load-muted">No reviews yet.</p>
              )}
              {reviews.slice(0, visibleReviews).map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    background: "var(--host-profile-surface)",
                    border: "1px solid var(--host-profile-border)",
                    borderRadius: 14,
                    padding: 18,
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: "var(--host-profile-avatar-fallback)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--host-profile-text)",
                        flexShrink: 0,
                      }}
                    >
                      {r.avatarUrl ? <img src={r.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : r.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {r.name}
                      </div>
                      <div className="host-profile-load-muted" style={{ fontSize: 12 }}>
                        {r.date}
                      </div>
                    </div>
                    <Stars count={r.rating} size={13} />
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: "var(--host-profile-muted)",
                      lineHeight: 1.6,
                      margin: "12px 0 0",
                    }}
                  >
                    {r.text}
                  </p>
                </div>
              ))}
            </div>

            {visibleReviews < reviews.length && (
              <button
                onClick={() => setVisibleReviews(reviews.length)}
                className="host-profile-more-reviews"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  margin: "18px auto 0",
                  background: "none",
                  border: "1px solid var(--host-profile-border)",
                  color: "var(--host-profile-text)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "10px 20px",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
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
