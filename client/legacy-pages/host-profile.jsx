import React, { useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Star,
  MapPin,
  CalendarDays,
  MessageCircle,
  BadgeCheck,
  Clock,
  ChevronDown,
} from "lucide-react";

const listings = [
  {
    tag: "AIRBNB",
    title: "Deluxe AirBnB",
    location: "Kilimani, Nairobi",
    price: "KSh 3,799 / night",
    img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=600&auto=format&fit=crop",
  },
  {
    tag: "PROPERTY",
    title: "A rental near you",
    location: "Karen, Nairobi",
    price: "KSh 70,000 / month",
    img: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?q=80&w=600&auto=format&fit=crop",
  },
  {
    tag: "AIRBNB",
    title: "airbvb",
    location: "Westlands, Nairobi",
    price: "KSh 2,000 / night",
    img: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=600&auto=format&fit=crop",
  },
];

const reviews = [
  {
    name: "Wanjiru K.",
    initials: "WK",
    rating: 5,
    date: "3 weeks ago",
    stay: "Stayed at Deluxe AirBnB",
    text: "Zion responded within minutes and the place matched the photos exactly. Would book again without a second thought.",
  },
  {
    name: "Brian O.",
    initials: "BO",
    rating: 4,
    date: "1 month ago",
    stay: "Stayed at A rental near you",
    text: "Great location and very clean. Check-in took a little longer than expected but the host sorted it out quickly.",
  },
  {
    name: "Amina S.",
    initials: "AS",
    rating: 5,
    date: "2 months ago",
    stay: "Stayed at airbvb",
    text: "One of the best hosts I've dealt with on VaRoom. Clear instructions, fast replies, spotless space.",
  },
  {
    name: "Peter M.",
    initials: "PM",
    rating: 5,
    date: "2 months ago",
    stay: "Stayed at Deluxe AirBnB",
    text: "Everything as described. Zion even helped arrange airport pickup for us.",
  },
];

const ratingBreakdown = [
  { star: 5, pct: 82 },
  { star: 4, pct: 13 },
  { star: 3, pct: 3 },
  { star: 2, pct: 1 },
  { star: 1, pct: 1 },
];

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
  const [tab, setTab] = useState("listings");
  const [visibleReviews, setVisibleReviews] = useState(3);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#F5F5F5",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "0 0 64px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #1C1C1C",
            position: "sticky",
            top: 0,
            background: "#0A0A0A",
            zIndex: 10,
          }}
        >
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              color: "#F5F5F5",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: "#E5384F" }}>Va</span>Room
          </div>
          <div style={{ width: 52 }} />
        </div>

        <div style={{ padding: "32px 24px 0" }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <img
                src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=300&auto=format&fit=crop"
                alt="Zion Daily"
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "3px solid #1C1C1C",
                }}
              />
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
                <BadgeCheck size={20} color="#2FBF71" fill="#0A0A0A" />
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
                  Zion Daily
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
                @ziondaily11
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
                  <MapPin size={14} /> Nairobi
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <CalendarDays size={14} /> Member since 2026
                </span>
              </div>
            </div>

            <button
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
              <Stars count={5} size={13} />
              <span style={{ fontWeight: 600 }}>4.8</span>
              <span style={{ color: "#8A8A8A" }}>(128 reviews)</span>
            </span>
            <span style={{ color: "#3A3A3A" }}>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} color="#8A8A8A" />
              98% response rate
            </span>
            <span style={{ color: "#3A3A3A" }}>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} color="#8A8A8A" />
              Usually responds in an hour
            </span>
          </div>

          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 14, color: "#B5B5B5", lineHeight: 1.6, margin: 0 }}>
              Hosting comfortable, well-located stays around Nairobi since
              2026. Quick to respond and happy to help with anything you need
              during your stay.
            </p>
          </div>

          <div
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

        {tab === "listings" && (
          <div style={{ padding: "24px 24px 0" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {listings.map((l, i) => (
                <div
                  key={i}
                  style={{
                    background: "#141414",
                    border: "1px solid #1E1E1E",
                    borderRadius: 14,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <img
                      src={l.img}
                      alt={l.title}
                      style={{ width: "100%", height: 140, objectFit: "cover" }}
                    />
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
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "reviews" && (
          <div style={{ padding: "24px 24px 0" }}>
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
                <div style={{ fontSize: 34, fontWeight: 700 }}>4.8</div>
                <Stars count={5} size={13} />
                <div style={{ fontSize: 12, color: "#8A8A8A", marginTop: 6 }}>
                  128 reviews
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
    </div>
  );
}
