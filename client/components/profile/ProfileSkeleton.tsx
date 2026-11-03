import React from 'react';

// The profile's loading layout, unchanged from legacy-pages/profile.html
// (without its sidebar: the shell renders the real one). Host or client
// content follows html[data-account-role], set by AuthProvider.

const ListingCard = () => (
  <div className="skeleton-listing-card">
    <div className="skel skeleton-listing-image" />
    <div className="skeleton-listing-body"><div className="skel" /><div className="skel" /><div className="skeleton-listing-footer"><div className="skel" /><div className="skel" /></div></div>
  </div>
);
const Booking = () => (
  <div className="skeleton-booking">
    <div className="skel skeleton-booking-image" />
    <div className="skeleton-booking-lines"><div className="skel" /><div className="skel" /><div className="skel" /></div>
    <div className="skeleton-booking-price"><div className="skel" /><div className="skel" /></div>
  </div>
);
const Trip = () => <div className="skeleton-trip"><div className="skel skeleton-trip-image" /><div className="skel" /><div className="skel" /></div>;

export function ProfileSkeleton() {
  return (
    <div id="loading-state" className="skeleton-shell" role="status" aria-label="Loading profile" aria-live="polite" aria-busy="true">
      <main className="skeleton-main" aria-hidden="true">
        <div className="skel-topbar"><div className="skel skel-circle" /><div className="skel skel-circle" /><div className="skel skel-pill" /></div>
        <section className="skeleton-banner">
          <div className="skeleton-banner-content">
            <div className="skel skel-circle skeleton-avatar" />
            <div className="skeleton-identity"><div className="skel" /><div className="skel" /><div className="skel" /></div>
            <div className="skeleton-header-actions"><div className="skel skel-pill" /><div className="skel skel-pill" /></div>
          </div>
        </section>
        <section className="skeleton-host-content">
          <div className="skeleton-section-heading"><div className="skel" /><div className="skel" /></div>
          <div className="skeleton-tabs"><div className="skel" /><div className="skel" /><div className="skel" /><div className="skel" /></div>
          <div className="skeleton-listings-grid"><ListingCard /><ListingCard /><ListingCard /><ListingCard /></div>
        </section>
        <section className="skeleton-client-content">
          <div className="skeleton-section-heading"><div className="skel" /><div className="skel" /></div>
          <div className="skeleton-booking-list"><Booking /><Booking /></div>
          <div className="skeleton-section-heading" style={{ marginTop: 28 }}><div className="skel" /><div className="skel" /></div>
          <div className="skeleton-trips-grid"><Trip /><Trip /><Trip /></div>
        </section>
      </main>
    </div>
  );
}
