import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { HostProfileRow } from '../../lib/profile/hostProfile';
import {
  bookingDates, bookingNights, bookingTotal, pastDate, pastStatus, profileEdit, saveProfileEdit, shareLinks, type ProfileBooking, type ProfileEdit,
} from '../../lib/profile/profilePage';
import { resolveStoredPhotoUrl, PHOTO_WIDTH } from '../resolveStoredPhotoUrl';
import { ChatIcon, LinkIcon, MailIcon, XIcon } from './ProfileIcons';

// /profile sections: the edit dialog, the share panel, and a client's
// upcoming bookings and past trips (wording from legacy-pages/profile.html).

export function EditProfileModal({ open, profile, isHost, userId, onClose, onSaved }: {
  open: boolean; profile: HostProfileRow; isHost: boolean; userId: string; onClose: () => void; onSaved: (update: ProfileEdit) => void;
}) {
  const [values, setValues] = useState({ bio: '', city: '' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setValues({ bio: isHost ? (profile.bio || '') : '', city: profile.city || '' });
    setMessage('');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // Filled when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    const { update, error } = profileEdit(values, isHost);
    if (!update) { setMessage(error || ''); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true);
    const saveError = await saveProfileEdit(client, userId, update);
    setSaving(false);
    if (saveError) { setMessage(saveError); return; }
    onSaved(update);
  };

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} id="edit-modal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
        <h2 id="edit-profile-title">Edit profile</h2>
        {isHost && (
          <div className="modal-field" id="edit-bio-field">
            <label htmlFor="edit-bio">Bio</label>
            <textarea id="edit-bio" placeholder="Tell people a bit about yourself…" maxLength={200} value={values.bio} onChange={set('bio')} />
          </div>
        )}
        <div className="modal-field">
          <label htmlFor="edit-location">City</label>
          <input type="text" id="edit-location" placeholder="e.g. Nairobi, Kenya" value={values.city} onChange={set('city')} />
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-cancel" id="edit-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="modal-save" id="edit-save" disabled={saving} onClick={() => { void save(); }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
        <p className="modal-msg" id="edit-msg" role="alert">{message}</p>
        <p className="modal-msg" style={{ color: 'inherit', opacity: 0.7 }}>Your name, username and phone number are changed in <Link href="/settings">Settings → Your Account</Link>.</p>
      </div>
    </div>
  );
}

export function SharePanel({ url }: { url: string }) {
  const [label, setLabel] = useState('Copy link');
  const links = shareLinks(url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setLabel('Copied!');
      window.setTimeout(() => setLabel('Copy link'), 2000);
    } catch {
      setLabel("Couldn't copy");
    }
  };
  return (
    <div className="share-panel show" id="share-panel">
      <div className="share-panel-title">Share this profile</div>
      <div className="share-row">
        <span className="share-row-label">Share via</span>
        <button type="button" className="copy-btn" id="copy-link-btn" onClick={() => { void copy(); }}><LinkIcon /><span id="copy-link-text">{label}</span></button>
      </div>
      <div className="share-icons">
        <a className="share-icon" id="share-x" href={links.x} target="_blank" rel="noopener noreferrer" aria-label="Share on X"><XIcon /></a>
        <a className="share-icon" id="share-wa" href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp"><ChatIcon /></a>
        <a className="share-icon" id="share-email" href={links.email} aria-label="Share via email"><MailIcon /></a>
      </div>
    </div>
  );
}

const UPCOMING_FALLBACK = 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80';
const PAST_FALLBACK = 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80';

function thumb(booking: ProfileBooking, fallback: string): string {
  const url = booking.photo ? resolveStoredPhotoUrl(booking.photo, 'listing-photos', getSupabaseClient(), PHOTO_WIDTH.thumb) : null;
  return `url("${url || fallback}")`;
}

export function ClientTrips({ bookings }: { bookings: { upcoming: ProfileBooking[]; past: ProfileBooking[] } | null }) {
  return (
    <>
      <div className="content-section" id="upcoming-bookings-section">
        <div className="section-header">
          <h2>Upcoming Bookings</h2>
          <Link href="/bookings">View all bookings <span>→</span></Link>
        </div>
        <div id="upcoming-bookings" className="booking-list">
          {bookings && !bookings.upcoming.length && <div className="state-msg" style={{ padding: '1rem 0', color: 'var(--muted)' }}>You have no upcoming trips.</div>}
          {bookings && bookings.upcoming.map((booking) => (
            <div className="booking-item" key={booking.id}>
              <div className="booking-thumb" style={{ backgroundImage: thumb(booking, UPCOMING_FALLBACK) }} />
              <div className="booking-main">
                <div className="booking-tag">Upcoming</div>
                <div className="booking-title">{booking.title || 'VaRoom stay'}</div>
                <div className="booking-meta"><span>{booking.location || 'Location available'}</span><span>•</span><span>{bookingDates(booking)}</span></div>
                <div className="booking-meta" style={{ marginTop: 6 }}><span>{booking.guests || 2} Guests</span></div>
              </div>
              <div className="booking-price-box">
                <div className="price-total">{bookingTotal(booking.total_price)}</div>
                <div className="price-nights">{bookingNights(booking)} nights</div>
                <Link className="booking-button" href={`/bookings?booking=${encodeURIComponent(booking.id)}`} style={{ display: 'inline-block' }}>View Details</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="content-section" id="past-trips-section">
        <div className="section-header">
          <h2>Past Trips</h2>
          <Link href="/bookings">View all trips <span>→</span></Link>
        </div>
        <div id="past-trips" className="trip-grid">
          {bookings && !bookings.past.length && <div className="state-msg" style={{ padding: '1rem 0', color: 'var(--muted)' }}>You have no previous trips.</div>}
          {bookings && bookings.past.map((booking) => (
            <div className="trip-card" key={booking.id}>
              <div className="trip-image" style={{ backgroundImage: thumb(booking, PAST_FALLBACK) }} />
              <h3>{booking.title || 'Recent stay'}</h3>
              <div className="trip-meta"><span>{booking.location || 'Location available'}</span><span className="trip-status">{pastStatus(booking)}</span></div>
              <div className="trip-meta" style={{ marginTop: 6, padding: '0 4px' }}><span>{pastDate(booking)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
