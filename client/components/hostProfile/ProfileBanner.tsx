import React, { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { bannerFileOk, bannerUrl, removeBanner, uploadBanner } from '../../lib/profile/profilePage';

// A host's banner on their public pages; the host can add, change or remove
// it here. Converted from legacy-pages/ProfileBanner.jsx (same look).

export default function ProfileBanner({ hostId, imageKey, isOwner = false, token = null, viewerId = null, onChange }: {
  hostId: string; imageKey: string | null; isOwner?: boolean; token?: string | null; viewerId?: string | null; onChange?: (key: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!bannerFileOk(file)) {
      setMessage('Choose a JPEG, PNG, WebP, or GIF image under 15 MB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (!token || viewerId !== hostId) { setMessage('Sign in as this host to change the banner.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const key = await uploadBanner(token, file, imageKey);
      onChange?.(key);
      setMessage('Banner updated.');
    } catch (error) {
      setMessage((error as Error).message || 'Banner upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!token || viewerId !== hostId) { setMessage('Sign in as this host to change the banner.'); return; }
    setBusy(true);
    setMessage('');
    try {
      await removeBanner(token);
      onChange?.(null);
      setMessage('Banner removed.');
    } catch (error) {
      setMessage((error as Error).message || 'Could not remove the banner. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const openFilePicker = () => {
    const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;
    input.value = '';
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch (error) { console.warn('Native banner file picker could not open; trying the click fallback.', error); }
    }
    input.click();
  };

  const url = bannerUrl(imageKey);
  return (
    <>
      <header className="profile-banner" style={url ? { backgroundImage: `url("${url}")` } : undefined}>
        {isOwner && (
          <div className="profile-banner-actions">
            <input ref={inputRef} className="profile-banner-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose profile banner image" onChange={(event) => { void handleFile(event.target.files?.[0]); }} />
            <button type="button" disabled={busy} onClick={openFilePicker}><Camera size={15} />{busy ? 'Saving…' : imageKey ? 'Change banner' : 'Add banner'}</button>
            {imageKey && <button type="button" disabled={busy} aria-label="Remove profile banner" onClick={() => { void remove(); }}><X size={15} />Remove</button>}
          </div>
        )}
        {message && <span className="profile-banner-message" role="status">{message}</span>}
      </header>
      <style jsx>{`
        .profile-banner { position:relative; height:350px; overflow:hidden; background:var(--host-profile-avatar-fallback,#d9d3ca); background-position:center 45%; background-size:cover; }
        .profile-banner::after { content:""; position:absolute; inset:0; z-index:1; pointer-events:none; background:linear-gradient(to top,rgba(255,255,255,.96) 0%,rgba(255,255,255,.72) 24%,rgba(255,255,255,.16) 62%,transparent 100%); }
        :global(html[data-theme="dark"]) .profile-banner::after { background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(0,0,0,.68) 27%,rgba(0,0,0,.2) 66%,transparent 100%); }
        .profile-banner-actions { position:absolute; z-index:3; right:22px; top:18px; display:flex; gap:8px; }
        .profile-banner-file-input { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        .profile-banner-actions button { display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid #ffffff88;border-radius:999px;background:#090909b8;color:#fff;font-size:0.75rem;cursor:pointer;backdrop-filter:blur(10px); }
        .profile-banner-actions button:disabled { opacity:.6;cursor:wait; }
        .profile-banner-message { position:absolute; z-index:3; right:22px; top:62px; color:white; background:#101010c9; border-radius:8px; padding:7px 10px; font-size:0.75rem; }
        @media(max-width:760px) { .profile-banner { height:350px; } }
        @media(max-width:700px) { .profile-banner-actions { right:12px;top:12px; } .profile-banner-actions button { padding:8px 10px; } .profile-banner-message { right:12px; top:56px; } }
      `}</style>
    </>
  );
}
