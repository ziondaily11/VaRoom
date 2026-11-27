import React, { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addFeed, calendarErrorText, exportUrl, feedProblem, loadSync, removeFeed, resetExport, syncNow,
  type CalendarFeed, type CalendarListing,
} from '../../lib/calendar/hostCalendar';

// "Sync with other sites" for one listing: its own calendar link to paste into
// Airbnb.com, Booking.com or Google Calendar, and the links of those sites
// that VaRoom reads every 30 minutes. Their bookings take their days here.

const ago = (iso: string | null) => {
  if (!iso) return null;
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

interface Props {
  client: SupabaseClient; hostId: string; listing: CalendarListing;
  onChanged: () => void; showToast: (message: string) => void;
}

export default function SyncPanel({ client, hostId, listing, onChanged, showToast }: Props) {
  const [feeds, setFeeds] = useState<CalendarFeed[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let active = true;
    loadSync(client, listing.id).then((result) => {
      if (!active) return;
      setFeeds(result.feeds);
      setToken(result.token);
    }, (error: unknown) => {
      console.error('Calendar sync: links could not be loaded:', error);
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [client, listing.id]);

  const link = token && typeof window !== 'undefined' ? exportUrl(window.location.origin, token) : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); showToast('Link copied. Paste it into the other site’s “Import calendar”.'); } catch { showToast('Copy the link from the box.'); }
  };

  const reset = async () => {
    setBusy('reset');
    try {
      setToken(await resetExport(client, listing.id));
      setConfirmReset(false);
      showToast('New link made. Paste it into the other sites again.');
    } catch (error) {
      showToast(calendarErrorText(error, 'That didn’t work. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const runSync = async (feed: CalendarFeed) => {
    setBusy(feed.id);
    try {
      const result = await syncNow(feed.id);
      setFeeds((list) => (list || []).map((f) => (f.id === feed.id
        ? { ...f, last_synced_at: result.ok ? new Date().toISOString() : f.last_synced_at, last_error: result.ok ? null : result.error || null, last_count: result.ok ? result.count : f.last_count }
        : f)));
      showToast(!result.ok ? result.error || 'The link couldn’t be read.'
        : result.clashes.length ? `Synced. Possible double booking on ${result.clashes.slice(0, 3).join(', ')}.` : `Synced: ${result.count} booking${result.count === 1 ? '' : 's'} from ${feed.name}.`);
      onChanged();
    } catch (error) {
      showToast(calendarErrorText(error, (error as Error)?.message || 'The link couldn’t be synced.'));
    } finally {
      setBusy(null);
    }
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const why = feedProblem(name, url, feeds || []);
    setProblem(why);
    if (why) return;
    setBusy('add');
    try {
      const feed = await addFeed(client, hostId, listing.id, name.trim(), url.trim());
      setFeeds((list) => [...(list || []), feed]);
      setName('');
      setUrl('');
      setBusy(null);
      await runSync(feed);
    } catch (error) {
      setProblem(calendarErrorText(error, 'That link couldn’t be added.'));
      setBusy(null);
    }
  };

  const remove = async (feed: CalendarFeed) => {
    setBusy(feed.id);
    try {
      await removeFeed(client, feed.id);
      setFeeds((list) => (list || []).filter((f) => f.id !== feed.id));
      showToast(`Removed. ${feed.name}’s bookings no longer block days here.`);
      onChanged();
    } catch (error) {
      showToast(calendarErrorText(error, 'That didn’t remove. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="vc-weekly vc-sync" aria-label="Sync with other sites">
      <h3>Sync with other sites</h3>
      {failed && <p className="vc-error">The sync settings couldn’t load.</p>}
      <p className="vc-muted">Paste this link into Airbnb.com, Booking.com or Google Calendar (“Import calendar”), so they see when {listing.title} is taken here. It shows dates only.</p>
      <div className="vc-copy">
        <input readOnly value={link} aria-label="This listing's calendar link" onFocus={(event) => event.target.select()} placeholder="Loading…" />
        <button type="button" className="vc-btn" disabled={!link} onClick={() => { void copy(); }}>Copy</button>
      </div>
      {confirmReset ? (
        <p className="vc-muted">The old link stops working on every site. <button type="button" className="vc-textbtn" disabled={busy === 'reset'} onClick={() => { void reset(); }}>Make a new link</button> · <button type="button" className="vc-textbtn" onClick={() => setConfirmReset(false)}>Keep it</button></p>
      ) : (
        <button type="button" className="vc-textbtn" disabled={!link} onClick={() => setConfirmReset(true)}>Get a new link…</button>
      )}

      <h3>Bookings from other sites</h3>
      {feeds && feeds.length > 0 && (
        <ul className="vc-feeds">
          {feeds.map((feed) => (
            <li key={feed.id}>
              <div>
                <strong>{feed.name}</strong>
                <span className={feed.last_error ? 'vc-error' : 'vc-muted'}>
                  {feed.last_error || (feed.last_synced_at ? `Synced ${ago(feed.last_synced_at)} · ${feed.last_count ?? 0} booking${feed.last_count === 1 ? '' : 's'}` : 'Not synced yet')}
                </span>
              </div>
              <div className="vc-place-actions">
                <button type="button" className="vc-pill" disabled={Boolean(busy)} onClick={() => { void runSync(feed); }}>{busy === feed.id ? 'Syncing…' : 'Sync now'}</button>
                <button type="button" className="vc-pill" disabled={Boolean(busy)} onClick={() => { void remove(feed); }}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {feeds && feeds.length < 5 && (
        <form className="vc-feed-form" onSubmit={add}>
          <div className="vc-row">
            <label className="vc-field">Site<input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Airbnb.com" list="vc-sites" /></label>
            <label className="vc-field">Its calendar link<input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…/calendar.ics" /></label>
          </div>
          <datalist id="vc-sites"><option value="Airbnb.com" /><option value="Booking.com" /><option value="Vrbo" /><option value="Google Calendar" /></datalist>
          {problem && <p className="vc-error" role="alert">{problem}</p>}
          <button type="submit" className="vc-btn" disabled={Boolean(busy)}>{busy === 'add' ? 'Adding…' : 'Add link'}</button>
        </form>
      )}
      <p className="vc-muted">VaRoom reads these links every 30 minutes. Other sites read VaRoom’s link on their own schedule, often every few hours, so a guest elsewhere can still book in between. You’ll be told about any double booking.</p>
    </section>
  );
}
