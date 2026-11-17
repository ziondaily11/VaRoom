import React from 'react';
import Link from 'next/link';
import { shortDate, type AttentionView } from '../../lib/hostHome/attention';
import { ICONS, Svg } from './hostHomeIcons';

// Host Home's right-rail card: what needs the host now (see
// lib/hostHome/attention.ts for the order). One card, so the rail keeps
// its shape whichever state it shows.

const Arrow = () => <span className="attention-arrow" aria-hidden="true">→</span>;

function requestDates(start: string | null, end: string | null): string {
  const from = shortDate(start);
  const to = shortDate(end);
  return from && to && from !== to ? `${from} – ${to}` : from;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default function AttentionCard({ view, onNotNow }: { view: AttentionView; onNotNow: () => void }) {
  if (view.kind === 'loading') {
    return (
      <section className="sidebar-module attention-card" aria-label="Needs your attention">
        <div className="stats-head"><h2>Needs your attention</h2></div>
        <div className="home-widget-loader attention-loader" role="status" aria-label="Loading what needs your attention"><span className="home-widget-spinner" aria-hidden="true" /></div>
      </section>
    );
  }

  if (view.kind === 'first-listing') {
    return (
      <section className="sidebar-module empty-state-card attention-card" id="no-listings-card" aria-labelledby="attention-first-title">
        <div className="empty-icon"><Svg markup={ICONS.emptyHome} /></div>
        <h3 id="attention-first-title">You haven&apos;t listed a space yet</h3>
        <p>List your first Airbnb, hotel, venue, office, shop, or property to start getting inquiries.</p>
        <Link href="/list" className="list-btn-primary"><Svg markup={ICONS.plus16} />List a space</Link>
      </section>
    );
  }

  if (view.kind === 'upgrade') {
    return (
      <section className="sidebar-module attention-card attention-upgrade" aria-labelledby="attention-upgrade-title">
        <div className="attention-upgrade-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="m19 16 .7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8-1.8-.7L19 16Z" /></svg>
        </div>
        <h3 id="attention-upgrade-title">Grow with a VaRoom plan</h3>
        <p>Choose a plan for your niche to list more spaces and reach more guests on VaRoom.</p>
        <div className="attention-upgrade-actions">
          <Link href="/pricing" className="list-btn-primary">See plans</Link>
          <button type="button" className="attention-not-now" onClick={onNotNow}>Not now</button>
        </div>
      </section>
    );
  }

  if (view.kind === 'caught-up') {
    return (
      <section className="sidebar-module attention-card" aria-labelledby="attention-done-title">
        <div className="stats-head"><h2 id="attention-done-title">You&apos;re all caught up</h2></div>
        <p className="attention-done-text">No booking requests or messages are waiting for you.</p>
        <Link href="/analytics" className="attention-row attention-row--link">
          <span className="attention-row-text">
            <strong>{plural(view.live, 'listing', 'listings')} live</strong>
            <small>See how they&apos;re doing in Analytics</small>
          </span>
          <Arrow />
        </Link>
      </section>
    );
  }

  const { requests, requestCount, chats, expiring } = view;
  return (
    <section className="sidebar-module attention-card" aria-labelledby="attention-title">
      <div className="stats-head"><h2 id="attention-title">Needs your attention</h2></div>
      <div className="attention-list">
        {requestCount > 0 && (
          <div className="attention-group">
            <Link href="/bookings" className="attention-group-head">
              <span className="attention-badge">{requestCount}</span>
              {requestCount === 1 ? 'Booking request waiting' : 'Booking requests waiting'}
              <Arrow />
            </Link>
            {requests.map((request) => (
              <Link key={request.id} href={`/bookings?booking=${encodeURIComponent(request.id)}`} className="attention-row attention-row--link">
                <span className="attention-row-text">
                  <strong>{(request.client && request.client.full_name) || 'A guest'}</strong>
                  <small>{[request.listing && request.listing.title, requestDates(request.start_date, request.end_date)].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="attention-row-action">Review</span>
              </Link>
            ))}
          </div>
        )}
        {chats > 0 && (
          <Link href="/chats" className="attention-group-head attention-group-head--solo">
            <span className="attention-badge">{chats}</span>
            {chats === 1 ? 'Chat waiting for your reply' : 'Chats waiting for your reply'}
            <Arrow />
          </Link>
        )}
        {expiring.length > 0 && (
          <div className="attention-group">
            <div className="attention-group-head attention-group-head--static">
              <span className="attention-badge attention-badge--warn">{expiring.length}</span>
              {expiring.length === 1 ? 'Paid listing ending soon' : 'Paid listings ending soon'}
            </div>
            {expiring.map((listing) => (
              <Link key={listing.id} href="/pricing" className="attention-row attention-row--link">
                <span className="attention-row-text">
                  <strong>{listing.title}</strong>
                  <small>{listing.days === 0 ? 'Goes offline today' : `Goes offline in ${plural(listing.days, 'day', 'days')} · ${shortDate(listing.until)}`}</small>
                </span>
                <span className="attention-row-action">Renew</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
