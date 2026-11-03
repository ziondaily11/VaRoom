import React, { useEffect, useState } from 'react';
import { takeAddAccountNotice } from '../../lib/auth/authCallback';

// The one-time notice left by /auth-callback when adding a Google account
// failed after a full-page redirect: the user is back where they started and
// still signed in to their current account.

const SHOW_MS = 6000;

const STYLES = `
  .add-account-notice{
    position:fixed; left:50%; bottom:1.5rem; transform:translateX(-50%); z-index:100000;
    max-width:min(92vw, 30rem); padding:.8rem 1.2rem; border-radius:14px;
    background:#0F1419; color:#FFFFFF; font:600 .88rem/1.4 'Helvetica Neue', Arial, sans-serif;
    box-shadow:0 12px 32px rgba(0,0,0,.28); text-align:center;
  }
  html[data-theme="dark"] .add-account-notice{ background:#EFF3F4; color:#0F1419; }
  @media (max-width:860px){ .add-account-notice{ bottom:calc(5.6rem + env(safe-area-inset-bottom)); } }
`;

export default function AddAccountNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Storage unavailable. */ }
    const notice = takeAddAccountNotice(storage);
    if (!notice) return undefined;
    setMessage(notice);
    const timer = window.setTimeout(() => setMessage(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!message) return null;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="add-account-notice" role="alert">{message}</div>
    </>
  );
}
