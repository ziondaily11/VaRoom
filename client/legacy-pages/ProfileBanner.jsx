import React, { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

const MAX_BANNER_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function profileBannerUrl(client, key) {
  if (!key) return null;
  return `/api/photos/profile-banners/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export default function ProfileBanner({ hostId, imageKey, isOwner = false, coverHeader = false, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function discard(key, token) {
    if (!key || !token) return;
    try {
      await fetch("/api/photos/upload-discard", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category: "profile-banners", key }),
      });
    } catch { /* orphan cleanup can be retried by account deletion */ }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_BANNER_BYTES) {
      setMessage("Choose a JPEG, PNG, WebP, or GIF image under 15 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const client = typeof window !== "undefined" ? window.supabaseClient : null;
    const { data: { session } = {} } = await client?.auth.getSession() || {};
    if (!session?.access_token || session.user.id !== hostId) { setMessage("Sign in as this host to change the banner."); return; }
    setBusy(true); setMessage("");
    let uploadedKey = null;
    try {
      const initResponse = await fetch("/api/photos/upload-init", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ category: "profile-banners", filename: file.name, mimeType: file.type, fileSize: file.size }),
      });
      const upload = await initResponse.json();
      if (!initResponse.ok) throw new Error(upload.error || "Could not start banner upload.");
      uploadedKey = upload.key;
      const putResponse = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putResponse.ok) throw new Error("Banner upload failed. Please try again.");
      const doneResponse = await fetch("/api/photos/upload-complete", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ category: "profile-banners", key: uploadedKey }),
      });
      const done = await doneResponse.json();
      if (!doneResponse.ok) throw new Error(done.error || "Could not verify the uploaded banner.");
      const saveResponse = await fetch("/api/profile/banner", { method:"PUT", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify({ key:uploadedKey }) });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error || "The banner uploaded, but could not be saved to your profile.");
      const oldKey = saved.previousKey || imageKey;
      onChange?.(uploadedKey);
      await discard(oldKey, session.access_token);
      setMessage("Banner updated.");
    } catch (error) {
      await discard(uploadedKey, session.access_token);
      setMessage(error.message || "Banner upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeBanner() {
    const client = typeof window !== "undefined" ? window.supabaseClient : null;
    const { data: { session } = {} } = await client?.auth.getSession() || {};
    if (!session?.access_token || session.user.id !== hostId) { setMessage("Sign in as this host to change the banner."); return; }
    setBusy(true); setMessage("");
    const response = await fetch("/api/profile/banner", { method:"DELETE", headers:{ Authorization:`Bearer ${session.access_token}` } });
    const result = await response.json();
    if (!response.ok) setMessage(result.error || "Could not remove the banner. Please try again.");
    else {
      const oldKey = result.previousKey || imageKey;
      onChange?.(null);
      await discard(oldKey, session.access_token);
      setMessage("Banner removed.");
    }
    setBusy(false);
  }

  function openFilePicker() {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch (error) {
        console.warn("Native banner file picker could not open; trying the click fallback.", error);
      }
    }
    input.click();
  }

  const url = profileBannerUrl(null, imageKey);
  return <>
    <header
      className={`profile-banner${coverHeader ? " profile-banner-full-header" : ""}`}
      style={url ? { backgroundImage: coverHeader
        ? `linear-gradient(0deg,rgba(0,0,0,.35),transparent 72%),url("${url}")`
        : `url("${url}")` } : undefined}
    >
      {isOwner && <div className="profile-banner-actions">
        <input ref={inputRef} className="profile-banner-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose profile banner image" onChange={(event) => handleFile(event.target.files?.[0])}/>
        <button type="button" disabled={busy} onClick={openFilePicker}><Camera size={15}/>{busy ? "Saving…" : imageKey ? "Change banner" : "Add banner"}</button>
        {imageKey && <button type="button" disabled={busy} aria-label="Remove profile banner" onClick={removeBanner}><X size={15}/>Remove</button>}
      </div>}
      {message && <span className="profile-banner-message" role="status">{message}</span>}
    </header>
    <style jsx>{`
      .profile-banner { position:relative; height:350px; overflow:hidden; background:var(--host-profile-avatar-fallback,#d9d3ca); background-position:center 45%; background-size:cover; }
      .profile-banner.profile-banner-full-header { position:absolute; inset:0; z-index:0; height:auto; min-height:100%; pointer-events:none; background-position:center; }
      .profile-banner-full-header .profile-banner-actions { pointer-events:auto; }
      .profile-banner::after { content:""; position:absolute; inset:0; z-index:1; pointer-events:none; background:linear-gradient(to top,rgba(255,255,255,.96) 0%,rgba(255,255,255,.72) 24%,rgba(255,255,255,.16) 62%,transparent 100%); }
      :global(html[data-theme="dark"]) .profile-banner::after { background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(0,0,0,.68) 27%,rgba(0,0,0,.2) 66%,transparent 100%); }
      .profile-banner-actions { position:absolute; z-index:2; right:22px; top:18px; display:flex; gap:8px; }
      .profile-banner-file-input { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
      .profile-banner-actions button { display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid #ffffff88;border-radius:999px;background:#090909b8;color:#fff;font-size:12px;cursor:pointer;backdrop-filter:blur(10px); }
      .profile-banner-full-header::after { display:none; }
      .profile-banner-actions button:disabled { opacity:.6;cursor:wait; }
      .profile-banner-message { position:absolute; z-index:2; right:22px; bottom:14px; color:white; background:#101010c9; border-radius:8px; padding:7px 10px; font-size:12px; }
      @media(max-width:760px) { .profile-banner { height:350px; } }
      @media(max-width:700px) { .profile-banner-actions { right:12px;top:12px; } .profile-banner-actions button { padding:8px 10px; } }
    `}</style>
  </>;
}
