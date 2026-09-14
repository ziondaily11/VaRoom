import React, { useState } from "react";
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

const HOST = {
  name: "Zion Daily",
  handle: "@ziondaily11",
  tagline: "Find your best stays in Nairobi",
  photo:
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces",
  verified: true,
  rating: 4.9,
  reviewCount: 132,
};

const LISTINGS = [
  {
    id: "l1",
    title: "Cozy Airbnb near CBD",
    type: "AIRBNB",
    price: 4500,
    image:
      "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=500&h=350&fit=crop",
  },
  {
    id: "l2",
    title: "Hillside family property",
    type: "PROPERTY",
    price: 12000,
    image:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500&h=350&fit=crop",
  },
  {
    id: "l3",
    title: "Modern studio, Kilimani",
    type: "AIRBNB",
    price: 3800,
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=500&h=350&fit=crop",
  },
];

const REVIEWS = [
  {
    id: "r1",
    name: "Amina W.",
    rating: 5,
    date: "August 2026",
    text: "Zion was responsive and the place matched the photos exactly. Would book again.",
  },
  {
    id: "r2",
    name: "Brian K.",
    rating: 5,
    date: "July 2026",
    text: "Great location, clean space, smooth check-in. Highly recommend.",
  },
  {
    id: "r3",
    name: "Faith N.",
    rating: 4,
    date: "June 2026",
    text: "Comfortable stay, minor delay on check-in but host sorted it quickly.",
  },
];

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
  const [tab, setTab] = useState("listings");

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
            Sign in to message {HOST.name.split(" ")[0]}
          </h2>
          <p style={{ fontSize: 13.5, color: "#8A8A8A", lineHeight: 1.5, margin: "0 0 20px 0" }}>
            You'll come right back to this profile once you're signed in.
          </p>
          <button
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
            src={HOST.photo}
            alt={HOST.name}
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
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{HOST.name}</h1>
              {HOST.verified && (
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

            <div style={{ fontSize: 12.5, color: "#8A8A8A", marginTop: 2 }}>{HOST.handle}</div>

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
              {HOST.tagline}
              <span style={{ color: "#4A4A4A" }}>·</span>
              <Stars value={HOST.rating} size={11} />
              <span>
                {HOST.rating} ({HOST.reviewCount} reviews)
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
            { key: "listings", label: `Listings · ${LISTINGS.length}` },
            { key: "reviews", label: `Reviews · ${REVIEWS.length}` },
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
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
              marginTop: 24,
            }}
          >
            {LISTINGS.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 8, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
            {REVIEWS.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
