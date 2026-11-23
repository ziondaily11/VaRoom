import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  CATEGORIES, CITY_SUGGESTIONS, cleanPhoneInput, discoverNameValid, INTERESTS, locationValid, MESSAGES, normalizeUsername, orderedInterests, phoneValid,
  saveClientPreferences, saveHostListing, saveHostProfile, takenMessage, USERNAME_HELP, usernameFormatError, usernameTaken,
  type Category, type Interest,
} from '../../lib/onboarding/onboarding';
import { CheckIcon, LockIcon, PhotoPicker, TileGrid, type PhotoPickerHandle, type PhotoState } from './OnboardingParts';

// The onboarding steps (hosts: profile, then what they list; clients: only
// what they're looking for).

/** The host's photo, uploading behind the scenes during step 2. */
export type PhotoUpload = 'idle' | 'uploading' | 'done' | 'failed';

// ---------- Host step 1: profile ----------

type UsernameStatus = { kind: 'idle' | 'checking' | 'ok' | 'current' | 'taken' | 'invalid' | 'error'; message: string };

export interface ProfileDraft { username: string; phone: string; city: string; photo: PhotoState | null }

export function HostProfileStep({ userId, currentUsername, initial, existingAvatar, initialPhoto, deferSave = false, note, onDraft, onDone }: {
  userId: string;
  currentUsername: string | null;
  initial: { username: string; phone: string; city: string };
  existingAvatar: string | null;
  /** The photo chosen earlier (coming back from step 2). */
  initialPhoto: PhotoState | null;
  /** Check the details but leave saving to the caller (Become a Host saves everything at the end). */
  deferSave?: boolean;
  /** A line above the button. */
  note?: React.ReactNode;
  onDraft: (draft: ProfileDraft) => void;
  /** Step 1 is saved; a new photo's image is handed over to upload in the background. */
  onDone: (newPhoto: { photo: PhotoState; blob: Blob } | null, removedAvatar: boolean) => void;
}) {
  const [username, setUsername] = useState(initial.username);
  const [phone, setPhone] = useState(initial.phone);
  const [city, setCity] = useState(initial.city);
  const [photo, setPhoto] = useState<PhotoState | null>(initialPhoto);
  // The saved photo, until the host removes it.
  const [savedPhoto, setSavedPhoto] = useState<string | null>(existingAvatar);
  const removeSaved = useCallback(() => setSavedPhoto(null), []);
  const [status, setStatus] = useState<UsernameStatus>({ kind: initial.username && initial.username === currentUsername ? 'current' : 'idle', message: '' });
  const [touched, setTouched] = useState({ phone: false, city: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const picker = useRef<PhotoPickerHandle | null>(null);
  const checkSeq = useRef(0);

  useEffect(() => { onDraft({ username, phone, city, photo }); }, [username, phone, city, photo, onDraft]);

  // Availability, 350 ms after typing stops; older answers are ignored.
  useEffect(() => {
    const seq = ++checkSeq.current;
    if (!username) { setStatus({ kind: 'idle', message: '' }); return undefined; }
    const formatError = usernameFormatError(username);
    if (formatError) { setStatus({ kind: 'invalid', message: formatError }); return undefined; }
    if (currentUsername && username === currentUsername) { setStatus({ kind: 'current', message: 'Your current username.' }); return undefined; }
    setStatus({ kind: 'checking', message: 'Checking availability...' });
    const timer = window.setTimeout(() => {
      const client = getSupabaseClient();
      if (!client) return;
      usernameTaken(client, username, userId).then((taken) => {
        if (seq !== checkSeq.current) return;
        setStatus(taken ? { kind: 'taken', message: takenMessage(username) } : { kind: 'ok', message: 'Username is available.' });
      }).catch(() => {
        if (seq === checkSeq.current) setStatus({ kind: 'error', message: "We couldn't check this username right now." });
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [username, currentUsername, userId]);

  const usernameOk = status.kind === 'ok' || status.kind === 'current';
  const valid = usernameOk && phoneValid(phone) && locationValid(city);
  // The button says what is still missing.
  const needs = usernameOk ? (!phoneValid(phone) ? 'Add your phone number to continue' : !locationValid(city) ? 'Add your location to continue' : '')
    : status.kind === 'checking' ? 'Checking your username...' : 'Choose a username to continue';

  const removedAvatar = Boolean(existingAvatar) && !savedPhoto && !photo;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    const client = getSupabaseClient();
    if (!client) return;
    setError('');
    setBusy('Validating...');
    try {
      if (username !== currentUsername && await usernameTaken(client, username, userId)) {
        setStatus({ kind: 'taken', message: takenMessage(username) });
        setBusy('');
        return;
      }
      if (!deferSave) {
        setBusy('Saving details...');
        await saveHostProfile(client, userId, { username, phone, city, removeAvatar: removedAvatar });
      }
    } catch (saveError) {
      console.error('Onboarding profile save failed:', saveError);
      setBusy('');
      setError(MESSAGES.saveProfile);
      return;
    }
    // A new photo uploads behind the scenes while the host carries on.
    let newPhoto: { photo: PhotoState; blob: Blob } | null = null;
    if (photo && photo !== initialPhoto) {
      try {
        const blob = picker.current ? await picker.current.blob() : null;
        if (blob) newPhoto = { photo, blob };
      } catch (photoError) {
        console.error('Onboarding photo could not be prepared:', photoError);
      }
    }
    setBusy('');
    onDone(newPhoto, removedAvatar);
  };

  const helpClass = status.kind === 'ok' || status.kind === 'current' ? ' is-ok' : status.kind === 'taken' || status.kind === 'invalid' || status.kind === 'error' ? ' is-error' : '';
  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>A little more you.</h1>
        <p>Let's set up your profile so people can put a face to your name.</p>
      </div>
      <div className="onb-sheet">
        <PhotoPicker ref={picker} existingUrl={savedPhoto} initialPhoto={initialPhoto} onChange={setPhoto} onRemoveExisting={removeSaved} />
        <div className="onb-field">
          <label htmlFor="onb-username">Username</label>
          <div className={`onb-input${status.kind === 'taken' || status.kind === 'invalid' ? ' is-invalid' : ''}`}>
            <span className="onb-prefix">@</span>
            <input id="onb-username" value={username} maxLength={20} autoComplete="username" placeholder="Choose a username" aria-describedby="onb-username-help"
              onChange={(event) => setUsername(normalizeUsername(event.target.value))} />
            {status.kind === 'checking' && <span className="onb-spinner" aria-hidden="true" />}
            {usernameOk && <span style={{ color: 'var(--ok)', display: 'flex' }}><CheckIcon size={18} /></span>}
          </div>
          <p id="onb-username-help" className={`onb-help${helpClass}`} aria-live="polite">{status.message || USERNAME_HELP}</p>
        </div>
        <div className="onb-field">
          <label htmlFor="onb-phone">Phone number</label>
          <div className={`onb-input${touched.phone && !phoneValid(phone) ? ' is-invalid' : ''}`}>
            <span className="onb-prefix is-strong">+254</span><span className="onb-divider" />
            <input id="onb-phone" value={phone} inputMode="tel" autoComplete="tel-national" maxLength={20} placeholder="712345678"
              onChange={(event) => setPhone(cleanPhoneInput(event.target.value))} onBlur={() => setTouched((current) => ({ ...current, phone: true }))} />
          </div>
          <p className={`onb-help${touched.phone && !phoneValid(phone) ? ' is-error' : ''}`}>{touched.phone && !phoneValid(phone) ? MESSAGES.phone : <><LockIcon /> Your phone number stays private.</>}</p>
        </div>
        <div className="onb-field">
          <label htmlFor="onb-city">Location</label>
          <div className={`onb-input${touched.city && !locationValid(city) ? ' is-invalid' : ''}`}>
            <input id="onb-city" value={city} maxLength={60} list="onb-cities" autoComplete="address-level2" placeholder="City, country"
              onChange={(event) => setCity(event.target.value)} onBlur={() => setTouched((current) => ({ ...current, city: true }))} />
          </div>
          <datalist id="onb-cities">{CITY_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>
          {touched.city && !locationValid(city) && <p className="onb-help is-error">{MESSAGES.location}</p>}
        </div>
      </div>
      <div className="onb-actions">
        {note}
        {error && <p className="onb-alert" role="alert">{error}</p>}
        <button type="submit" className="onb-primary" disabled={!valid || Boolean(busy)} aria-busy={Boolean(busy)}>{busy || needs || 'Continue'}</button>
      </div>
    </form>
  );
}

// ---------- Host step 2: what they list ----------

/** Step 2's line about the photo uploading behind the scenes. */
export function PhotoUploadNotice({ upload, onRetry, onSkip }: { upload: PhotoUpload; onRetry: () => void; onSkip: () => void }) {
  if (upload === 'uploading') return <p className="onb-help onb-upload-note" role="status"><span className="onb-spinner" aria-hidden="true" /> Uploading your photo. You can keep going.</p>;
  if (upload === 'done') return <p className="onb-help is-ok onb-upload-note" role="status"><CheckIcon size={12} /> Photo saved.</p>;
  if (upload !== 'failed') return null;
  return (
    <div className="onb-alert onb-upload-failed" role="alert">
      <span>{MESSAGES.photoUpload}</span>
      <span className="onb-photo-actions">
        <button type="button" className="onb-link-btn" onClick={onRetry}>Try again</button>
        <button type="button" className="onb-link-btn" onClick={onSkip}>Continue without photo</button>
      </span>
    </div>
  );
}

export function HostListingStep({ userId, initialNiche, initialName, photoNotice, deferSave = false, submitLabel = 'Finish setup', onDraft, onDone }: {
  userId: string; initialNiche: Category | null; initialName: string;
  /** Leave saving to the caller (Become a Host saves everything at the end). */
  deferSave?: boolean;
  submitLabel?: string;
  /** The background photo upload's status (shown above the button). */
  photoNotice: React.ReactNode;
  onDraft: (draft: { niche: Category | null; name: string }) => void;
  /** Saved: finish (waits for a photo still uploading); resolves if the host stays here. */
  onDone: () => Promise<void>;
}) {
  const [niche, setNiche] = useState<Category | null>(initialNiche);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { onDraft({ niche, name }); }, [niche, name, onDraft]);
  const valid = Boolean(niche) && discoverNameValid(name);
  const needs = !niche ? 'Pick one to continue' : !discoverNameValid(name) ? 'Add your Discover name to continue' : '';
  const pick = useCallback((value: Category) => setNiche(value), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!valid || busy || !client || !niche) return;
    setBusy(true);
    setError('');
    try {
      if (!deferSave) await saveHostListing(client, userId, niche, name);
    } catch (saveError) {
      console.error('Onboarding listing save failed:', saveError);
      setError(MESSAGES.finish);
      setBusy(false);
      return;
    }
    await onDone();
    if (mounted.current) setBusy(false);
  };

  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>What will you be listing?</h1>
        <p>Pick the one that best describes your place.</p>
      </div>
      <TileGrid tiles={CATEGORIES} picked={niche ? [niche] : []} multiple={false} label="Listing category" onPick={pick} />
      <div className="onb-field">
        <label htmlFor="onb-discover">How you'll appear in VaRoom's Discover</label>
        <div className={`onb-input${touched && !discoverNameValid(name) ? ' is-invalid' : ''}`}>
          <input id="onb-discover" value={name} maxLength={40} placeholder="e.g. Palm View Apartments" onChange={(event) => setName(event.target.value)} onBlur={() => setTouched(true)} />
        </div>
        {touched && !discoverNameValid(name) && <p className="onb-help is-error">{MESSAGES.discoverName}</p>}
      </div>
      <div className="onb-actions">
        {photoNotice}
        {error && <p className="onb-alert" role="alert">{error}</p>}
        <button type="submit" className="onb-primary" disabled={!valid || busy} aria-busy={busy}>{busy ? 'Finishing setup...' : needs || submitLabel}</button>
        <p className="onb-footnote">You can update these listing details anytime.</p>
      </div>
    </form>
  );
}

// ---------- Client: what they're looking for ----------

export function ClientStep({ userId, initialInterests, onDraft, onDone }: {
  userId: string; initialInterests: Interest[];
  onDraft: (interests: Interest[]) => void; onDone: () => void;
}) {
  const [interests, setInterests] = useState<Interest[]>(initialInterests);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onDraft(interests); }, [interests, onDraft]);
  const toggle = useCallback((value: Interest) => setInterests((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value])), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!interests.length) { setError(MESSAGES.categories); return; }
    const client = getSupabaseClient();
    if (busy || !client) return;
    setBusy(true);
    setError('');
    try {
      // Saved in the order shown.
      await saveClientPreferences(client, userId, orderedInterests(interests));
      onDone();
    } catch (saveError) {
      console.error('Onboarding preferences save failed:', saveError);
      setError(MESSAGES.saveClient);
      setBusy(false);
    }
  };

  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>What are you looking for?</h1>
        <p>Pick as many as you like. Marketplace shows these first.</p>
      </div>
      <TileGrid tiles={INTERESTS} picked={interests} multiple label="What you're looking for" onPick={toggle} />
      <div className="onb-actions">
        {error && <p className="onb-alert" role="alert">{error}</p>}
        <button type="submit" className="onb-primary" disabled={!interests.length || busy} aria-busy={busy}>
          {busy ? 'Saving...' : interests.length ? 'Continue' : 'Pick 1 or more to continue'}
        </button>
        <p className="onb-footnote">You can change these anytime.</p>
      </div>
    </form>
  );
}
