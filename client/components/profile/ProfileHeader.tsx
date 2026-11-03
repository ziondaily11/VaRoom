import React, { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { HostProfileRow } from '../../lib/profile/hostProfile';
import {
  AVATAR_MAX_BYTES, bannerFileOk, bannerUrl, displayName, handleOf, initialOf, memberSince, removeBanner, specialisation, uploadAvatar, uploadBanner,
} from '../../lib/profile/profilePage';
import { AvatarCameraIcon, CalendarIcon, CameraIcon, PinIcon } from './ProfileIcons';

// The profile banner and identity: banner (hosts can add, change or remove
// it), avatar (with upload), name, handle, city, "Member since",
// specialisation, and Edit profile / Share profile.

export interface HeaderProps {
  profile: HostProfileRow;
  avatarUrl: string | null;
  token: string | null;
  sessionUserId: string;
  notify: (message: string) => void;
  onEdit: () => void;
  onShare: () => void;
  onChange: (patch: Partial<HostProfileRow>) => void;
}

export default function ProfileHeader({ profile, avatarUrl, token, sessionUserId, notify, onEdit, onShare, onChange }: HeaderProps) {
  const name = displayName(profile.full_name);
  const isHost = profile.role === 'host';
  const [preview, setPreview] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bannerInput = useRef<HTMLInputElement | null>(null);
  const bannerButton = useRef<HTMLButtonElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const niche = specialisation(profile.role, profile.listing_categories);
  const banner = bannerUrl(profile.banner_image_key);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (event: MouseEvent) => { if (!actionsRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); bannerButton.current?.focus(); } };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const pickBanner = () => {
    const input = bannerInput.current;
    if (!input) return;
    input.value = '';
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') {
      try { picker.showPicker(); return; } catch (error) { console.warn('Native banner file picker could not open; trying the click fallback.', error); }
    }
    input.click();
  };

  const onBannerFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    if (!file) return;
    if (!bannerFileOk(file)) { notify('Choose a JPEG, PNG, WebP, or GIF image under 15 MB.'); input.value = ''; return; }
    if (!token || sessionUserId !== profile.id) { notify('Sign in as this host to change the banner.'); return; }
    setBannerBusy(true);
    try {
      const key = await uploadBanner(token, file, profile.banner_image_key);
      onChange({ banner_image_key: key });
      notify('Banner updated ✓');
    } catch (error) {
      notify((error as Error).message || 'Banner upload failed.');
    } finally {
      setBannerBusy(false);
      input.value = '';
    }
  };

  const onRemoveBanner = async () => {
    setMenuOpen(false);
    if (!token || sessionUserId !== profile.id) { notify('Sign in as this host to change the banner.'); return; }
    setBannerBusy(true);
    try {
      await removeBanner(token);
      onChange({ banner_image_key: null });
      notify('Banner removed ✓');
    } catch (error) {
      notify((error as Error).message || 'Could not remove banner.');
    } finally {
      setBannerBusy(false);
    }
  };

  const onAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) { notify('Image over 3MB — pick a smaller file.'); input.value = ''; return; }
    const client = getSupabaseClient();
    if (!client) return;
    notify('Uploading…');
    const local = URL.createObjectURL(file);
    setPreview(local);
    try {
      const path = await uploadAvatar(client, sessionUserId, file);
      onChange({ avatar_url: path });
      notify('Photo updated ✓');
    } catch (error) {
      setPreview(null);
      notify(`Upload failed: ${(error as Error).message}`);
    } finally {
      input.value = '';
    }
  };

  const shownAvatar = preview || avatarUrl;
  const bannerLabel = bannerBusy ? 'Uploading banner' : (profile.banner_image_key ? 'Banner options' : 'Add profile banner');

  return (
    <section className="profile-header">
      <div className="profile-banner" id="profile-banner" style={banner ? { backgroundImage: `url("${banner}")` } : undefined}>
        {isHost && (
          <div className="profile-banner-actions" id="profile-banner-actions" ref={actionsRef} style={{ display: 'flex' }}>
            <input ref={bannerInput} type="file" id="banner-input" className="banner-file-input" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose profile banner image" onChange={(event) => { void onBannerFile(event); }} />
            <button
              ref={bannerButton}
              type="button"
              id="banner-change-btn"
              className="banner-camera-btn"
              aria-label={bannerLabel}
              title={profile.banner_image_key ? 'Banner options' : 'Add profile banner'}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls="banner-options-menu"
              disabled={bannerBusy}
              onClick={() => { if (profile.banner_image_key) setMenuOpen((open) => !open); else pickBanner(); }}
            ><CameraIcon /></button>
            <div className="profile-banner-options" id="banner-options-menu" role="menu" aria-label="Banner options" hidden={!menuOpen}>
              <button type="button" className="banner-option" id="banner-menu-change" role="menuitem" onClick={() => { setMenuOpen(false); pickBanner(); }}>Change banner</button>
              {profile.banner_image_key && (
                <button type="button" className="banner-option banner-option-danger" id="banner-remove-btn" role="menuitem" disabled={bannerBusy} onClick={() => { void onRemoveBanner(); }}>Remove banner</button>
              )}
            </div>
          </div>
        )}
        <div className="profile-header-body">
          <div className="profile-personal">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar" id="profile-avatar">{shownAvatar ? <img src={shownAvatar} alt={name} /> : initialOf(name)}</div>
              <label className="avatar-upload-btn" id="avatar-upload-label" htmlFor="avatar-input" aria-label="Change photo" style={{ display: 'flex' }}>
                <AvatarCameraIcon />
                <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void onAvatarFile(event); }} />
              </label>
            </div>
            <div className="profile-details">
              <h1 id="profile-header-name">{name}</h1>
              <div className="profile-handle" id="profile-username">{handleOf(profile.username)}</div>
              <div className="profile-meta-row">
                <span className="meta-item" id="profile-location"><PinIcon /><span id="profile-location-text">{profile.city || 'Unknown location'}</span></span>
                <span className="meta-item" id="profile-since"><CalendarIcon /><span id="profile-since-text">{memberSince(profile.created_at)}</span></span>
                {niche && <span className="meta-item" id="profile-niches">{niche}</span>}
              </div>
            </div>
          </div>
          <div className="profile-header-actions">
            <div className="profile-actions" id="owner-actions" style={{ display: 'flex' }}>
              <button type="button" className="btn-outline" id="edit-profile-btn" onClick={onEdit}>Edit profile</button>
              <button type="button" className="btn-outline" id="share-profile-btn" onClick={onShare}>Share profile</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
