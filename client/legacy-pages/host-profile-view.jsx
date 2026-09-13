import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
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
  ShieldCheck,
  Star,
  MapPin,
  MessageCircle,
  BadgeCheck,
  Clock,
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

export default function HostProfileView() {
  const router = useRouter();
  const [tab, setTab] = useState("listings");
  const [visibleReviews, setVisibleReviews] = useState(3);
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState("client");

  useEffect(() => {
    if (!router.isReady || !router.query.hostId) return undefined;

    let cancelled = false;
    async function loadHost() {
      const client = typeof window !== "undefined" ? window.supabaseClient : null;
      if (!client) {
        setLoadError("Host profiles are unavailable right now.");
        setIsLoading(false);
        return;
      }

      const hostId = String(router.query.hostId);
      const sessionResult = await client.auth.getSession();
      if (sessionResult.data.session?.user?.id) {
        const viewerResult = await client
          .from("profiles")
          .select("role")
          .eq("id", sessionResult.data.session.user.id)
          .maybeSingle();
        if (viewerResult.data?.role === "host") setViewerRole("host");
      }
      const [profileResult, listingsResult] = await Promise.all([
        client.from("profiles").select("id,role,full_name,username,bio,avatar_url,verified,city,created_at").eq("id", hostId).eq("role", "host").maybeSingle(),
        client.from("listings").select("id,title,category,location_text,created_at,listing_photos(storage_path),listing_booking_details(price_amount,price_unit)").eq("host_id", hostId).order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;
      if (profileResult.error || !profileResult.data) {
        setLoadError("Could not load this host profile.");
        setIsLoading(false);
        return;
      }
      setProfile(profileResult.data);
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

        // Fetch reviews for host
        try {
          const { data: reviewsResult, error: reviewsError } = await client
            .from('reviews')
            .select('id,rating,comment,created_at, client:profiles(id,full_name,avatar_url)')
            .eq('host_id', hostId)
            .order('created_at', { ascending: false });
          if (!reviewsError && Array.isArray(reviewsResult)) {
            const mapped = reviewsResult.map((r) => {
              const name = r.client?.full_name || 'Guest';
              const initials = (name.split(' ').map(s => s.charAt(0)).join('').slice(0,2) || 'G').toUpperCase();
              return {
                initials,
                name,
                stay: 'Verified stay',
                date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
                rating: Number(r.rating) || 0,
                text: r.comment || ''
              };
            });
            setReviews(mapped);
          }
        } catch (e) {
          // non-fatal
        }
      }
      setIsLoading(false);
    }
    loadHost().catch(() => {
      if (!cancelled) {
        setLoadError("Could not load this host profile.");
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [router.isReady, router.query.hostId]);

  const host = profile || {};
  const reviewCount = reviews.length;
  const averageRating = reviewCount
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
    : null;
  const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    pct: reviewCount
      ? Math.round((reviews.filter((review) => review.rating === star).length / reviewCount) * 100)
      : 0,
  }));
  const avatarUrl = host.avatar_url
    ? (host.avatar_url.startsWith("http")
      ? host.avatar_url
      : (typeof window !== "undefined" && window.supabaseClient
        ? window.supabaseClient.storage.from("avatars").getPublicUrl(host.avatar_url).data.publicUrl
        : host.avatar_url))
    : null;
  const memberSince = host.created_at
    ? `Member since ${new Date(host.created_at).getFullYear()}`
    : "Member date not available";

  function Sidebar() {
    const isHost = viewerRole === "host";
    return (
      <aside className="host-profile-sidebar" aria-label="VaRoom navigation">
        <a href={isHost ? "/host-home" : "/client-home"} className="sidebar-logo">
          <Home size={18} aria-hidden="true" /><span><b>Va</b>Room</span>
        </a>
        <nav className="sidebar-nav">
          <a href={isHost ? "/host-home" : "/client-home"}><Home size={17} aria-hidden="true" /> Home</a>
          <a href="/elie"><Compass size={17} aria-hidden="true" /> Elie <span className="sidebar-pill">Free preview</span></a>
          <a href="/marketplace"><Compass size={17} aria-hidden="true" /> Marketplace</a>
          <a href="/bookings"><CalendarDays size={17} aria-hidden="true" /> Bookings</a>
          <a href="/chats"><MessageSquare size={17} aria-hidden="true" /> Chats</a>
          {isHost && <><a href="/list"><Plus size={17} aria-hidden="true" /> List a space</a><a href="/analytics"><Compass size={17} aria-hidden="true" /> Analytics</a></>}
          {!isHost && <a href="/profile"><UserRound size={17} aria-hidden="true" /> Profile</a>}
          <a href="/transactions"><WalletCards size={17} aria-hidden="true" /> Transactions</a>
          <a href="/settings"><Settings size={17} aria-hidden="true" /> Settings</a>
          <a href="/support"><LifeBuoy size={17} aria-hidden="true" /> Help &amp; Support</a>
        </nav>
        <button type="button" className="sidebar-logout" onClick={async () => {
          await window.supabaseClient?.auth.signOut();
          router.push("/login");
        }}>Log out</button>
      </aside>
    );
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
        html, body, #__next { margin: 0; min-height: 100%; background: #0a0a0a; }
        body { overflow-x: hidden; }
        .host-profile-shell { min-height: 100vh; display: grid; grid-template-columns: 240px minmax(0, 1fr); background: #0a0a0a; color: #f5f5f5; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .host-profile-sidebar { order: -1; display: flex; flex-direction: column; gap: 18px; min-height: 100vh; padding: 24px 18px; border-right: 1px solid #242424; background: #0a0a0a; }
        .sidebar-logo { display: flex; align-items: center; gap: 9px; padding: 0 10px 18px; font-size: 22px; font-weight: 800; color: #f5f5f5; }
        .sidebar-logo b { color: #e5384f; }
        .sidebar-nav { display: flex; flex-direction: column; gap: 4px; }
        .sidebar-nav a { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-radius: 9px; color: #d5d5d5; text-decoration: none; font-size: 14px; }
        .sidebar-nav a:hover, .sidebar-nav a:focus-visible { background: #242424; color: #fff; }
        .sidebar-pill { color: #e5384f; font-size: 10px; }
        .sidebar-logout { margin-top: auto; padding: 10px 12px; color: #e5384f; text-align: left; font-weight: 600; }
        .host-profile-main { min-width: 0; }
        .host-profile-content { width: min(100%, 1320px); margin: 0 auto; padding-bottom: 64px; }
        .host-profile-listing-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        .host-profile-listing-card { color: #f5f5f5; text-decoration: none; }
        @media (max-width: 1100px) { .host-profile-shell { grid-template-columns: 210px minmax(0, 1fr); } .host-profile-listing-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
        @media (max-width: 760px) { .host-profile-shell { display: block; } .host-profile-sidebar { display: none; } .host-profile-content { padding-bottom: 24px; } .host-profile-listing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
        @media (max-width: 480px) { .host-profile-listing-grid { grid-template-columns: 1fr !important; } }
      `}</style>
      <div className="host-profile-shell">
        <main className="host-profile-main">
          <div className="host-profile-content">
        <div style={{ padding: "32px 24px 0" }}>
          {loadError && (
            <p role="alert" style={{ color: "#F2A3AE", fontSize: 14, margin: "0 0 20px" }}>
              {loadError}
            </p>
          )}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={host.full_name || "Host"}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "3px solid #1C1C1C",
                }}
              />
              ) : (
              <div
                aria-label={`${host.full_name || "Host"} profile photo unavailable`}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#232323",
                  color: "#F5F5F5",
                  fontSize: 30,
                  fontWeight: 700,
                  border: "3px solid #1C1C1C",
                }}
              >
                {(host.full_name || "H").charAt(0).toUpperCase()}
              </div>
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  background: "#0A0A0A",
                  borderRadius: "50%",
                  padding: 3,
                }}
              >
                {host.verified && <BadgeCheck size={20} color="#E5384F" fill="#0A0A0A" />}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                  {host.full_name || "Host name not available"}
                </h1>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#E5384F",
                    border: "1px solid #E5384F",
                    borderRadius: 20,
                    padding: "3px 10px",
                  }}
                >
                  <ShieldCheck size={12} />
                  HOST
                </span>
              </div>
              <p style={{ margin: "4px 0 0", color: "#9A9A9A", fontSize: 14 }}>
                {host.username ? `@${host.username}` : "Username not available"}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 10,
                  flexWrap: "wrap",
                  fontSize: 13,
                  color: "#B5B5B5",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={14} /> {host.city || "Location not available"}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <CalendarDays size={14} /> {memberSince}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={startChat}
              aria-label={`Message ${host.full_name || "host"}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#E5384F",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                padding: "10px 18px",
                borderRadius: 10,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <MessageCircle size={16} />
              Message
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid #1C1C1C",
              fontSize: 13,
              color: "#D5D5D5",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Stars count={averageRating ? Math.round(averageRating) : 0} size={13} />
            <span style={{ fontWeight: 600 }}>{averageRating ? averageRating.toFixed(1) : "No ratings yet"}</span>
            <span style={{ color: "#8A8A8A" }}>({reviewCount} reviews)</span>
            </span>
            <span style={{ color: "#3A3A3A" }}>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} color="#8A8A8A" />
              Response rate not available
            </span>
            <span style={{ color: "#3A3A3A" }}>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} color="#8A8A8A" />
              Response time not available
            </span>
          </div>

          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 14, color: "#B5B5B5", lineHeight: 1.6, margin: 0 }}>
              {host.bio || "Bio not available"}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Host profile content"
            style={{
              display: "flex",
              gap: 24,
              marginTop: 28,
              borderBottom: "1px solid #1C1C1C",
            }}
          >
            {[
              { id: "listings", label: `Listings · ${listings.length}` },
              { id: "reviews", label: `Reviews · ${reviews.length}` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`host-profile-${t.id}`}
                onClick={() => setTab(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "0 2px 12px",
                  color: tab === t.id ? "#F5F5F5" : "#7A7A7A",
                  borderBottom:
                    tab === t.id
                      ? "2px solid #E5384F"
                      : "2px solid transparent",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <p role="status" style={{ padding: "24px", color: "#8A8A8A" }}>
            Loading host profile…
          </p>
        )}

        {tab === "listings" && (
          <div id="host-profile-listings" role="tabpanel" aria-label="Listings" style={{ padding: "24px 24px 0" }}>
            <div
              className="host-profile-listing-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {!isLoading && listings.length === 0 && (
                <p style={{ color: "#8A8A8A" }}>No listings available.</p>
              )}
              {listings.map((l) => (
                <a
                  key={l.id}
                  href={`/booking?listing=${encodeURIComponent(l.id)}`}
                  className="host-profile-listing-card"
                  style={{
                    background: "#141414",
                    border: "1px solid #1E1E1E",
                    borderRadius: 14,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ position: "relative", height: 140, background: "#232323" }}>
                    {l.videoUrl ? (
                      <video
                        src={l.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        controls
                        aria-label={`${l.title} video`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : l.img ? (
                      <img src={l.img} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#8A8A8A", fontSize: 12 }}>
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
                    <div style={{ fontSize: 12, color: "#8A8A8A", marginTop: 2 }}>
                      {l.location}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginTop: 8,
                        color: "#F5F5F5",
                      }}
                    >
                      {l.price}
                    </div>
                  </div>
                  </a>
              ))}
            </div>
          </div>
        )}

        {tab === "reviews" && (
          <div id="host-profile-reviews" role="tabpanel" aria-label="Reviews" style={{ padding: "24px 24px 0" }}>
            <div
              style={{
                display: "flex",
                gap: 28,
                flexWrap: "wrap",
                background: "#141414",
                border: "1px solid #1E1E1E",
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
                  borderRight: "1px solid #1E1E1E",
                  paddingRight: 24,
                }}
              >
                <div style={{ fontSize: 34, fontWeight: 700 }}>{averageRating ? averageRating.toFixed(1) : "—"}</div>
                <Stars count={averageRating ? Math.round(averageRating) : 0} size={13} />
                <div style={{ fontSize: 12, color: "#8A8A8A", marginTop: 6 }}>
                  {reviewCount ? `${reviewCount} reviews` : "Reviews not available"}
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
                    <span style={{ fontSize: 12, color: "#8A8A8A", width: 10 }}>
                      {r.star}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: "#232323",
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
                    <span style={{ fontSize: 12, color: "#8A8A8A", width: 30 }}>
                      {r.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {!isLoading && reviews.length === 0 && (
                <p style={{ color: "#8A8A8A" }}>Reviews not available yet.</p>
              )}
              {reviews.slice(0, visibleReviews).map((r, i) => (
                <div
                  key={i}
                  style={{
                    background: "#141414",
                    border: "1px solid #1E1E1E",
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
                        background: "#232323",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#F5F5F5",
                        flexShrink: 0,
                      }}
                    >
                      {r.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A8A8A" }}>
                        {r.stay} · {r.date}
                      </div>
                    </div>
                    <Stars count={r.rating} size={13} />
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#C7C7C7",
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  margin: "18px auto 0",
                  background: "none",
                  border: "1px solid #2A2A2A",
                  color: "#F5F5F5",
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
          </div>
        </main>
        <Sidebar />
      </div>
    </>
  );
}
