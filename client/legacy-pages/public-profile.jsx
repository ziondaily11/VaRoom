import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  MapPin,
  Star,
  MoreHorizontal,
  Mail,
  ShieldCheck,
} from "lucide-react";

function GoogleIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Public, no-login host profile — the page a shared link (Instagram/TikTok
// bio, etc.) lands on. Visitors are NOT members: no app nav, no VaRoom
// tools. The only account-related affordance is "Continue with Google",
// which should redirect to sign-in and, on success, return the visitor to
// this same host profile.
// ---------------------------------------------------------------------------

function Stars({ value, size = 13 }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= Math.round(value) ? "#E5384F" : "none"}
          stroke={n <= Math.round(value) ? "#E5384F" : "#4A4A4A"}
        />
      ))}
    </span>
  );
}

function ListingCard({ listing }) {
  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        background: "#111111",
        border: "1px solid #232323",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "4 / 3" }}>
        <img
          src={listing.image}
          alt={listing.title}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <button
          aria-label="More options"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: "#E5384F",
            marginBottom: 4,
          }}
        >
          {listing.type}
        </div>
        <div style={{ fontSize: 14, color: "#F2F2F2", fontWeight: 500 }}>
          {listing.title}
        </div>
        <div style={{ fontSize: 13, color: "#8A8A8A", marginTop: 2 }}>
          KES {listing.price.toLocaleString()} / night
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ review }) {
  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: "1px solid #1E1E1E",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13.5, color: "#F2F2F2", fontWeight: 500 }}>
          {review.name}
        </span>
        <span style={{ fontSize: 12, color: "#6E6E6E" }}>{review.date}</span>
      </div>
      <div style={{ marginTop: 4, marginBottom: 6 }}>
        <Stars value={review.rating} size={12} />
      </div>
      <p style={{ fontSize: 13.5, color: "#B8B8B8", lineHeight: 1.5, margin: 0 }}>
        {review.text}
      </p>
    </div>
  );
}

export default function PublicHostProfile() {
  const router = useRouter();
  const [tab, setTab] = useState("listings");
  const [host, setHost] = useState({
    name: "",
    handle: "",
    tagline: "",
    photo: "",
    verified: false,
    rating: 0,
    reviewCount: 0,
  });
  const [listings, setListings] = useState([]);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (!router.isReady || !router.query.hostId) return undefined;

    let cancelled = false;
    const loadProfile = async () => {
      const client = typeof window !== "undefined" ? window.supabaseClient : null;
      if (!client) return;

      const hostId = String(router.query.hostId);
      const [profileResult, listingsResult, reviewsResult] = await Promise.all([
        client
          .from("profiles")
          .select("full_name,username,bio,avatar_url,verified,city")
          .eq("id", hostId)
          .eq("role", "host")
          .maybeSingle(),
        client
          .from("listings")
          .select("id,title,category,availability_status,listing_photos(storage_path),listing_booking_details(price_amount,price_unit)")
          .eq("host_id", hostId)
          .eq("availability_status", "available")
          .order("created_at", { ascending: false }),
        client
          .from("reviews")
          .select("id,rating,comment,created_at,client:profiles(full_name)")
          .eq("host_id", hostId)
          .eq("status", "published")
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled || profileResult.error || !profileResult.data) return;

      const profile = profileResult.data;
      const mappedReviews = !reviewsResult.error && Array.isArray(reviewsResult.data)
        ? reviewsResult.data.map((review) => ({
          id: review.id,
          name: review.client?.full_name || "Guest",
          rating: Number(review.rating) || 0,
          date: review.created_at ? new Date(review.created_at).toLocaleDateString() : "",
          text: review.comment || "",
        }))
        : [];
      const reviewCount = mappedReviews.length;
      const rating = reviewCount
        ? mappedReviews.reduce((total, review) => total + review.rating, 0) / reviewCount
        : 0;
      const avatarUrl = profile.avatar_url
        ? (profile.avatar_url.startsWith("http")
          ? profile.avatar_url
          : client.storage.from("avatars").getPublicUrl(profile.avatar_url).data.publicUrl)
        : "";
      const mappedListings = !listingsResult.error && Array.isArray(listingsResult.data)
        ? listingsResult.data.map((listing) => {
          const photo = listing.listing_photos?.[0];
          const details = Array.isArray(listing.listing_booking_details)
            ? listing.listing_booking_details[0]
            : listing.listing_booking_details;
          return {
            id: listing.id,
            title: listing.title,
            type: (listing.category || "PROPERTY").toUpperCase(),
            price: Number(details?.price_amount) || 0,
            image: photo?.storage_path
              ? (photo.storage_path.startsWith("http")
                ? photo.storage_path
                : client.storage.from("listing-photos").getPublicUrl(photo.storage_path).data.publicUrl)
              : "",
          };
        })
        : [];

      setHost({
        name: profile.full_name || "Host",
        handle: profile.username ? `@${profile.username.replace(/^@/, "")}` : "",
        tagline: profile.bio || profile.city || "",
        photo: avatarUrl,
        verified: Boolean(profile.verified),
        rating,
        reviewCount,
      });
      setListings(mappedListings);
      setReviews(mappedReviews);
    };

    loadProfile().catch(() => {
      if (!cancelled) {
        setHost((current) => ({ ...current, name: "Host" }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.hostId]);

  const signIn = () => {
    router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000000",
        color: "#F2F2F2",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* Sidebar — sign-in only. No account creation, no app tools.    */}
      {/* ------------------------------------------------------------- */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid #1A1A1A",
          padding: "24px 22px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
          <span style={{ color: "#E5384F" }}>Va</span>
          <span style={{ color: "#fff" }}>Room</span>
        </div>

        <div>
          <h2 style={{ fontSize: 19, lineHeight: 1.3, margin: "0 0 8px 0" }}>
            Sign in to message {host.name.split(" ")[0]}
          </h2>
          <p style={{ fontSize: 13.5, color: "#8A8A8A", lineHeight: 1.5, margin: "0 0 20px 0" }}>
            You'll come right back to this profile once you're signed in.
          </p>
          <button
            onClick={signIn}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "11px 0",
              borderRadius: 999,
              border: "1px solid #3A3A3A",
              background: "#0A0A0A",
              color: "#F2F2F2",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <button
            onClick={signIn}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "11px 0",
              borderRadius: 999,
              border: "1px solid #3A3A3A",
              background: "#0A0A0A",
              color: "#F2F2F2",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Mail size={16} />
            Continue with Email
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* Main profile                                                   */}
      {/* ------------------------------------------------------------- */}
      <main style={{ flex: 1, padding: "24px 32px 64px" }}>
        {/* Header — compact, single row, no dashboard-style padding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            paddingBottom: 16,
            borderBottom: "1px solid #1A1A1A",
          }}
        >
          <img
            src={host.photo}
            alt={host.name}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #1A1A1A",
              flexShrink: 0,
            }}
          />

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{host.name}</h1>
              {host.verified && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "#E5384F",
                    border: "1px solid #E5384F",
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  <ShieldCheck size={11} /> HOST
                </span>
              )}
            </div>

            <div style={{ fontSize: 12.5, color: "#8A8A8A", marginTop: 2 }}>{host.handle}</div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                color: "#B8B8B8",
                marginTop: 5,
                flexWrap: "wrap",
              }}
            >
              <MapPin size={12} />
              {host.tagline}
              <span style={{ color: "#4A4A4A" }}>·</span>
              <Stars value={host.rating} size={11} />
              <span>
                {host.rating ? host.rating.toFixed(1) : "No ratings"} ({host.reviewCount} reviews)
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 20,
            borderBottom: "1px solid #1A1A1A",
          }}
        >
          {[
            { key: "listings", label: `Listings · ${listings.length}` },
            { key: "reviews", label: `Reviews · ${reviews.length}` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "10px 2px 12px",
                fontSize: 13.5,
                fontWeight: 500,
                color: tab === t.key ? "#F2F2F2" : "#6E6E6E",
                borderBottom: tab === t.key ? "2px solid #E5384F" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "listings" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginTop: 24,
            }}
          >
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 8, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
