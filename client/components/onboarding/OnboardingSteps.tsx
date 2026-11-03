import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  CATEGORIES, CITY_SUGGESTIONS, cleanPhoneInput, discoverNameValid, locationValid, MESSAGES, normalizeUsername, phoneValid, saveAvatar,
  saveClientPreferences, saveHostListing, saveHostProfile, takenMessage, TIMELINES, USERNAME_HELP, usernameFormatError, usernameTaken,
  type Category, type Timeline,
} from '../../lib/onboarding/onboarding';
import { CATEGORY_ICONS, CheckIcon, CroppedImage, LockIcon, PersonIcon, PhotoPicker, PinIcon, type PhotoPickerHandle, type PhotoState } from './OnboardingParts';

// The onboarding steps (hosts: profile, then listing; clients: preferences)
// and the live previews shown in the brand panel.

const categoryTitle = (value: Category | null) => (value ? (CATEGORIES.find((option) => option.value === value) || { title: value }).title : null);

// ---------- Previews ----------

export function HostPreview({ name, username, city, niche, photo, existingAvatar }: {
  name: string; username: string; city: string; niche: Category | null; photo: PhotoState | null; existingAvatar: string | null;
}) {
  return (
    <>
      <p className="onb-eyebrow">Live preview · how guests see you</p>
      <div className="onb-card">
        <div className="onb-card-cover" />
        <div className="onb-card-body">
          <div className="onb-card-avatar">
            {photo ? <CroppedImage photo={photo} size={68} /> : existingAvatar ? <img className="is-whole" src={existingAvatar} alt="" /> : <PersonIcon />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="onb-card-name">{name || 'Your name'}</span>
            <span className="onb-card-handle">{username ? `@${username}` : '@username'}</span>
          </div>
          <div className="onb-chips">
            <span className={`onb-chip${city.trim() ? '' : ' is-empty'}`}>{city.trim() && <PinIcon />}{city.trim() || 'Your location'}</span>
            <span className={`onb-chip${niche ? '' : ' is-empty'}`}>{categoryTitle(niche) || 'Category · next step'}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function ClientPreview({ categories, timeline }: { categories: Category[]; timeline: Timeline | null }) {
  const when = TIMELINES.find((option) => option.value === timeline);
  const ordered = CATEGORIES.map((option) => option.value).filter((value) => categories.includes(value));
  return (
    <>
      <p className="onb-eyebrow">Your picks</p>
      <div className="onb-picks">
        <p className="onb-picks-title">{categories.length ? `${categories.length} type${categories.length === 1 ? '' : 's'} of space` : 'Nothing picked yet'}</p>
        <div className="onb-chips">
          {categories.length
            ? ordered.map((value) => <span className="onb-chip" key={value}>{categoryTitle(value)}</span>)
            : <span className="onb-chip is-empty">Choose what you're looking for</span>}
        </div>
        <div className="onb-chips"><span className={`onb-chip${when ? '' : ' is-empty'}`}>{when ? when.title : 'When are you looking?'}</span></div>
      </div>
    </>
  );
}

// ---------- Host step 1: profile ----------

type UsernameStatus = { kind: 'idle' | 'checking' | 'ok' | 'current' | 'taken' | 'invalid' | 'error'; message: string };

export interface ProfileDraft { username: string; phone: string; city: string; photo: PhotoState | null }

export function HostProfileStep({ userId, currentUsername, initial, existingAvatar, onDraft, onDone }: {
  userId: string;
  currentUsername: string | null;
  initial: { username: string; phone: string; city: string };
  existingAvatar: string | null;
  onDraft: (draft: ProfileDraft) => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(initial.username);
  const [phone, setPhone] = useState(initial.phone);
  const [city, setCity] = useState(initial.city);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [status, setStatus] = useState<UsernameStatus>({ kind: initial.username && initial.username === currentUsername ? 'current' : 'idle', message: '' });
  const [touched, setTouched] = useState({ phone: false, city: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);
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

  const finish = async (withPhoto: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    setError('');
    setPhotoFailed(false);
    if (withPhoto && photo) {
      setBusy('Uploading photo...');
      try {
        const blob = picker.current ? await picker.current.blob() : null;
        if (blob) await saveAvatar(client, userId, blob);
      } catch (uploadError) {
        console.error('Onboarding photo upload failed:', uploadError);
        setBusy('');
        setPhotoFailed(true);
        return;
      }
    }
    setBusy('');
    onDone();
  };

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
      setBusy('Saving details...');
      await saveHostProfile(client, userId, { username, phone, city });
    } catch (saveError) {
      console.error('Onboarding profile save failed:', saveError);
      setBusy('');
      setError(MESSAGES.saveProfile);
      return;
    }
    await finish(true);
  };

  const helpClass = status.kind === 'ok' || status.kind === 'current' ? ' is-ok' : status.kind === 'taken' || status.kind === 'invalid' || status.kind === 'error' ? ' is-error' : '';
  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>A little more you.</h1>
        <p>Let's set up your profile so people can put a face to your name.</p>
      </div>
      <PhotoPicker ref={picker} existingUrl={existingAvatar} onChange={setPhoto} error={photoFailed ? MESSAGES.photoUpload : ''} />
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
      {error && <p className="onb-alert" role="alert">{error}</p>}
      {photoFailed ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button type="button" className="onb-primary" onClick={() => { void finish(true); }}>Try again</button>
          <button type="button" className="onb-primary" style={{ background: 'transparent', color: 'var(--ink)', border: '1.5px solid var(--line)' }} onClick={() => { void finish(false); }}>Continue without photo</button>
        </div>
      ) : (
        <button type="submit" className="onb-primary" disabled={!valid || Boolean(busy)}>{busy || 'Continue'}</button>
      )}
    </form>
  );
}

// ---------- Host step 2: what they list ----------

export function HostListingStep({ userId, initialNiche, initialName, onDraft, onBack, onDone }: {
  userId: string; initialNiche: Category | null; initialName: string;
  onDraft: (draft: { niche: Category | null; name: string }) => void; onBack: () => void; onDone: () => void;
}) {
  const [niche, setNiche] = useState<Category | null>(initialNiche);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { onDraft({ niche, name }); }, [niche, name, onDraft]);
  const valid = Boolean(niche) && discoverNameValid(name);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!valid || busy || !client || !niche) return;
    setBusy(true);
    setError('');
    try {
      await saveHostListing(client, userId, niche, name);
      onDone();
    } catch (saveError) {
      console.error('Onboarding listing save failed:', saveError);
      setError(MESSAGES.finish);
      setBusy(false);
    }
  };

  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>What will you be listing?</h1>
        <p>Choose the category that best describes your place.</p>
      </div>
      <div className="onb-options" role="radiogroup" aria-label="Listing category">
        {CATEGORIES.map((option, index) => (
          <button key={option.value} type="button" role="radio" aria-checked={niche === option.value}
            className={`onb-option${niche === option.value ? ' is-selected' : ''}${index === CATEGORIES.length - 1 ? ' is-wide' : ''}`}
            onClick={() => setNiche(option.value)}>
            <span className="onb-icon">{CATEGORY_ICONS[option.value]}</span>
            <span className="onb-option-copy"><span className="onb-option-title">{option.title}</span></span>
            <span className="onb-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="onb-field">
        <label htmlFor="onb-discover">How you'll appear in VaRoom's Discover</label>
        <div className={`onb-input${touched && !discoverNameValid(name) ? ' is-invalid' : ''}`}>
          <input id="onb-discover" value={name} maxLength={40} placeholder="e.g. Palm View Apartments" onChange={(event) => setName(event.target.value)} onBlur={() => setTouched(true)} />
        </div>
        {touched && !discoverNameValid(name) && <p className="onb-help is-error">{MESSAGES.discoverName}</p>}
      </div>
      {error && <p className="onb-alert" role="alert">{error}</p>}
      <button type="submit" className="onb-primary" disabled={!valid || busy}>{busy ? 'Finishing setup...' : 'Continue'}</button>
      <p className="onb-footnote">You can update these listing details anytime.</p>
      <button type="button" className="onb-link-btn onb-back" onClick={onBack} disabled={busy}>← Back to profile setup</button>
    </form>
  );
}

// ---------- Client: preferences ----------

export function ClientStep({ userId, initialCategories, initialTimeline, onDraft, onDone }: {
  userId: string; initialCategories: Category[]; initialTimeline: Timeline | null;
  onDraft: (draft: { categories: Category[]; timeline: Timeline | null }) => void; onDone: (timeline: Timeline) => void;
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [timeline, setTimeline] = useState<Timeline | null>(initialTimeline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onDraft({ categories, timeline }); }, [categories, timeline, onDraft]);
  const toggle = useCallback((value: Category) => setCategories((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value])), []);
  const valid = categories.length > 0 && Boolean(timeline);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!categories.length) { setError(MESSAGES.categories); return; }
    if (!timeline) { setError(MESSAGES.timeline); return; }
    const client = getSupabaseClient();
    if (busy || !client) return;
    setBusy(true);
    setError('');
    try {
      // Saved in the order shown.
      await saveClientPreferences(client, userId, CATEGORIES.map((option) => option.value).filter((value) => categories.includes(value)), timeline);
      onDone(timeline);
    } catch (saveError) {
      console.error('Onboarding preferences save failed:', saveError);
      setError(MESSAGES.saveClient);
      setBusy(false);
    }
  };

  return (
    <form className="onb-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="onb-heading">
        <h1>What are you hoping to find?</h1>
        <p>Choose the types of spaces you're interested in right now.</p>
      </div>
      <div className="onb-options" role="group" aria-label="Types of spaces">
        {CATEGORIES.map((option, index) => (
          <button key={option.value} type="button" role="checkbox" aria-checked={categories.includes(option.value)}
            className={`onb-option${categories.includes(option.value) ? ' is-selected' : ''}${index === CATEGORIES.length - 1 ? ' is-wide' : ''}`}
            onClick={() => toggle(option.value)}>
            <span className="onb-icon">{CATEGORY_ICONS[option.value]}</span>
            <span className="onb-option-copy"><span className="onb-option-title">{option.title}</span><span className="onb-option-desc">{option.description}</span></span>
            <span className="onb-check" aria-hidden="true">{categories.includes(option.value) && <CheckIcon />}</span>
          </button>
        ))}
      </div>
      <div className="onb-field">
        <span className="onb-label" id="onb-when">When are you looking?</span>
        <div className="onb-options" role="radiogroup" aria-labelledby="onb-when">
          {TIMELINES.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={timeline === option.value}
              className={`onb-option${timeline === option.value ? ' is-selected' : ''}`} onClick={() => setTimeline(option.value)}>
              <span className="onb-radio" aria-hidden="true" />
              <span className="onb-option-copy"><span className="onb-option-title">{option.title}</span><span className="onb-option-desc">{option.description}</span></span>
            </button>
          ))}
        </div>
      </div>
      {error && <p className="onb-alert" role="alert">{error}</p>}
      <button type="submit" className="onb-primary" disabled={!valid || busy}>{busy ? 'Saving...' : 'Continue'}</button>
      <p className="onb-footnote">You can change these preferences anytime.</p>
    </form>
  );
}
