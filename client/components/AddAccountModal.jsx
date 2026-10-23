import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function AddAccountModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const emailInputRef = useRef(null);
  const cardRef = useRef(null);

  const handleOpen = useCallback(() => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setSuccess(null);
    setIsLoading(false);
    setIsGoogleLoading(false);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    if (isLoading || isGoogleLoading) return;
    setIsOpen(false);
    setError(null);
    setSuccess(null);
  }, [isLoading, isGoogleLoading]);

  // Register window listeners & global trigger
  useEffect(() => {
    window.__varoomAddAccountModalMounted = true;

    const onOpenEvent = () => handleOpen();
    window.addEventListener('varoom:open-add-account', onOpenEvent);

    if (window.VaRoomAccountSwitcher) {
      window.VaRoomAccountSwitcher.openAddAccountModal = handleOpen;
    }

    return () => {
      window.__varoomAddAccountModalMounted = false;
      window.removeEventListener('varoom:open-add-account', onOpenEvent);
      if (window.VaRoomAccountSwitcher && window.VaRoomAccountSwitcher.openAddAccountModal === handleOpen) {
        delete window.VaRoomAccountSwitcher.openAddAccountModal;
      }
    };
  }, [handleOpen]);

  // Focus email input on open & manage body scroll
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      emailInputRef.current?.focus();
    }, 50);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, handleClose]);

  // Listen for OAuth postMessage from auth-callback popup
  useEffect(() => {
    const handleMessage = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'VAROOM_ADD_ACCOUNT_SUCCESS' && e.data?.session) {
        const session = e.data.session;
        setIsGoogleLoading(true);
        setError(null);
        try {
          const linked = await registerAdditionalSession(session);
          setSuccess(linked.session_cached
            ? 'Account added! You can now switch to this account anytime.'
            : 'Account linked. Sign in again on this browser before switching to it.');
          setTimeout(() => {
            setIsOpen(false);
          }, 1200);
        } catch (err) {
          setError(err.message || 'Could not link Google account.');
        } finally {
          setIsGoogleLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Helper to register an authenticated session into linked accounts
  const registerAdditionalSession = async (session) => {
    const switcher = window.VaRoomAccountSwitcher;
    if (!switcher?.linkAdditionalSession || !window.supabaseClient) {
      throw new Error('Secure account linking is not available. Refresh the page and try again.');
    }
    return switcher.linkAdditionalSession(window.supabaseClient, session);
  };

  // Google sign in handler
  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);

    const switcher = window.VaRoomAccountSwitcher;

    // Save current active account info
    try {
      if (!window.supabaseClient?.auth || !switcher) throw new Error('Your current account session is unavailable.');
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) throw new Error('Sign in to your current account before adding another.');
      await switcher.loadLinkedAccounts(window.supabaseClient, session, { force: true });
      if (!switcher.canAddAccount()) throw new Error('Account limit reached (3/3). This group cannot include another account.');
    } catch (e) {
      setError(e.message || 'Unable to verify the linked-account group.');
      return;
    }

    const supabaseUrl = window.VAROOM_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
    const supabaseAnonKey = window.VAROOM_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';

    if (!window.supabase) {
      setError('Authentication client is not available. Please try again.');
      return;
    }

    setIsGoogleLoading(true);

    try {
      const accountAuthFlow = window.VaRoomAccountAuth.createFlowId();
      const tempClient = window.VaRoomAccountAuth.createClient(
        window.supabase, supabaseUrl, supabaseAnonKey, { usesRedirect: true, flowId: accountAuthFlow }
      );

      const callbackUrl = `${window.location.origin}/auth-callback?addAccount=true&account_auth_flow=${encodeURIComponent(accountAuthFlow)}`;
      const { data, error: oauthError } = await tempClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true
        }
      });

      if (oauthError) {
        throw oauthError;
      }

      if (data?.url) {
        // Open Google sign-in in a centered popup window
        const width = 520;
        const height = 640;
        const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
        const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
        const popup = window.open(
          data.url,
          'varoom_add_account_popup',
          `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
        );

        if (!popup || popup.closed) {
          // Popup was blocked by browser; fallback to graceful redirect
          sessionStorage.setItem('varoom_add_account_redirect', window.location.pathname + window.location.search);
          window.location.href = data.url;
          return;
        }

        // Monitor popup closure
        const checkClosedTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosedTimer);
            setIsGoogleLoading((current) => {
              if (current) {
                // If still loading and popup closed without postMessage, it was cancelled
                setError('Google sign-in was cancelled.');
                return false;
              }
              return false;
            });
          }
        }, 800);
      } else {
        throw new Error('Could not initiate Google authentication.');
      }
    } catch (err) {
      setError(err?.message || 'Could not connect to Google. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  // Email / Password submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    const switcher = window.VaRoomAccountSwitcher;

    setIsLoading(true);

    try {
      const supabaseUrl = window.VAROOM_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
      const supabaseAnonKey = window.VAROOM_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';

      if (!window.supabase) {
        throw new Error('Authentication service is initializing. Please try again.');
      }

      // Isolated Supabase client: does NOT alter active session in localStorage!
      const tempClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { data, error: authError } = await tempClient.auth.signInWithPassword({
        email: trimmedEmail,
        password: password
      });

      if (authError) {
        let msg = authError.message || 'Authentication failed.';
        if (msg.toLowerCase().includes('invalid login credentials')) {
          msg = 'Incorrect email or password.';
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          msg = 'Please confirm your email before adding this account.';
        }
        throw new Error(msg);
      }

      if (!data?.session || !data?.user) {
        throw new Error('Failed to retrieve authentication tokens.');
      }

      const linked = await registerAdditionalSession(data.session, tempClient);

      setSuccess(linked.session_cached
        ? 'Account added! You can now switch to this account anytime.'
        : 'Account linked. Sign in again on this browser before switching to it.');
      setTimeout(() => {
        setIsOpen(false);
      }, 1200);
    } catch (err) {
      setError(err?.message || 'Failed to add account. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="add-account-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-account-heading"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .add-account-overlay {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: addAcctFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes addAcctFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .add-account-card {
          position: relative;
          width: 100%;
          max-width: 480px;
          border-radius: 20px;
          padding: 32px 36px 36px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid rgba(0, 0, 0, 0.08);
          box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.04);
          color: #0F1419;
          box-sizing: border-box;
          animation: addAcctCardPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        html[data-theme="dark"] .add-account-card {
          background: rgba(18, 18, 20, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06);
          color: #FFFFFF;
        }

        @keyframes addAcctCardPop {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .add-account-header {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 22px;
        }

        .add-account-close-btn {
          position: absolute;
          left: -12px;
          top: -12px;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.15s;
          padding: 0;
        }

        .add-account-close-btn:hover {
          background: rgba(0, 0, 0, 0.06);
        }

        html[data-theme="dark"] .add-account-close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .add-account-brand {
          font-family: var(--font-body, 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif);
          font-weight: 800;
          font-size: 26px;
          letter-spacing: -0.6px;
          user-select: none;
          line-height: 1;
        }

        .add-account-brand-va {
          color: #bd2337;
        }

        .add-account-brand-room {
          color: currentColor;
        }

        .add-account-title-wrap {
          text-align: center;
          margin-bottom: 24px;
        }

        .add-account-title {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.4px;
          margin: 0 0 6px 0;
          line-height: 1.2;
          color: inherit;
        }

        .add-account-sub {
          font-size: 14px;
          margin: 0;
          line-height: 1.4;
          color: rgba(15, 20, 25, 0.65);
        }

        html[data-theme="dark"] .add-account-sub {
          color: rgba(255, 255, 255, 0.65);
        }

        .add-account-alert {
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13.5px;
          line-height: 1.4;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: addAcctFadeIn 0.2s ease;
        }

        .add-account-alert.error {
          background: rgba(189, 35, 55, 0.08);
          border: 1px solid rgba(189, 35, 55, 0.25);
          color: #bd2337;
        }

        html[data-theme="dark"] .add-account-alert.error {
          background: rgba(224, 36, 36, 0.14);
          border: 1px solid rgba(224, 36, 36, 0.35);
          color: #ff6b6b;
        }

        .add-account-alert.success {
          background: rgba(26, 122, 89, 0.1);
          border: 1px solid rgba(26, 122, 89, 0.3);
          color: #1a7a59;
        }

        html[data-theme="dark"] .add-account-alert.success {
          background: rgba(26, 122, 89, 0.18);
          border: 1px solid rgba(26, 122, 89, 0.4);
          color: #48bb78;
        }

        .add-account-google-btn {
          width: 100%;
          height: 48px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: #FFFFFF;
          color: #0F1419;
          border: 1px solid rgba(0, 0, 0, 0.15);
          font-size: 14.5px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
          outline: none;
        }

        .add-account-google-btn:hover:not(:disabled) {
          background: #F8F9FA;
          border-color: rgba(0, 0, 0, 0.25);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
        }

        html[data-theme="dark"] .add-account-google-btn {
          background: #FFFFFF;
          color: #0F1419;
          border: none;
        }

        html[data-theme="dark"] .add-account-google-btn:hover:not(:disabled) {
          background: #EAEAEA;
        }

        .add-account-google-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .add-account-divider {
          display: flex;
          align-items: center;
          margin: 20px 0;
          color: rgba(15, 20, 25, 0.45);
          font-size: 13px;
        }

        html[data-theme="dark"] .add-account-divider {
          color: rgba(255, 255, 255, 0.45);
        }

        .add-account-divider::before,
        .add-account-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        html[data-theme="dark"] .add-account-divider::before,
        html[data-theme="dark"] .add-account-divider::after {
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }

        .add-account-divider span {
          padding: 0 14px;
          text-transform: lowercase;
        }

        .add-account-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .add-account-input-group {
          position: relative;
          width: 100%;
        }

        .add-account-input {
          width: 100%;
          height: 48px;
          padding: 0 16px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          background: rgba(0, 0, 0, 0.02);
          font-size: 14.5px;
          color: #0F1419;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
          box-sizing: border-box;
          font-family: inherit;
        }

        .add-account-input::placeholder {
          color: rgba(15, 20, 25, 0.45);
        }

        .add-account-input:focus {
          border-color: #0F1419;
          box-shadow: 0 0 0 2px rgba(15, 20, 25, 0.08);
          background: #FFFFFF;
        }

        html[data-theme="dark"] .add-account-input {
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.04);
          color: #FFFFFF;
        }

        html[data-theme="dark"] .add-account-input::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }

        html[data-theme="dark"] .add-account-input:focus {
          border-color: #FFFFFF;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
        }

        .add-account-input.has-toggle {
          padding-right: 46px;
        }

        .add-account-pw-toggle {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: rgba(15, 20, 25, 0.5);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background-color 0.15s;
          padding: 0;
        }

        .add-account-pw-toggle:hover {
          color: #0F1419;
          background: rgba(0, 0, 0, 0.04);
        }

        html[data-theme="dark"] .add-account-pw-toggle {
          color: rgba(255, 255, 255, 0.5);
        }

        html[data-theme="dark"] .add-account-pw-toggle:hover {
          color: #FFFFFF;
          background: rgba(255, 255, 255, 0.08);
        }

        .add-account-submit-btn {
          width: 100%;
          height: 48px;
          border-radius: 9999px;
          background: #0F1419;
          color: #FFFFFF;
          border: none;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 6px;
          transition: background-color 0.15s, opacity 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-sizing: border-box;
          outline: none;
        }

        .add-account-submit-btn:hover:not(:disabled) {
          background: #272C30;
        }

        html[data-theme="dark"] .add-account-submit-btn {
          background: #EFF3F4;
          color: #0F1419;
        }

        html[data-theme="dark"] .add-account-submit-btn:hover:not(:disabled) {
          background: #D7DBDC;
        }

        .add-account-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .add-account-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid currentColor;
          border-right-color: transparent;
          border-radius: 50%;
          animation: addAcctSpin 0.75s linear infinite;
        }

        @keyframes addAcctSpin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .add-account-card {
            padding: 24px 20px 24px;
            border-radius: 16px;
          }
          .add-account-title {
            font-size: 21px;
          }
        }
      `}} />

      <div className="add-account-card" ref={cardRef}>
        <div className="add-account-header">
          <button
            type="button"
            className="add-account-close-btn"
            onClick={handleClose}
            aria-label="Back"
            disabled={isLoading || isGoogleLoading}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          <div className="add-account-brand">
            <span className="add-account-brand-va">Va</span>
            <span className="add-account-brand-room">Room</span>
          </div>
        </div>

        <div className="add-account-title-wrap">
          <h2 id="add-account-heading" className="add-account-title">Add another account</h2>
          <p className="add-account-sub">Sign in to add an existing account to VaRoom.</p>
        </div>

        {error && (
          <div className="add-account-alert error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="add-account-alert success" role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 6L9 17l-5-5"></path>
            </svg>
            <span>{success}</span>
          </div>
        )}

        {/* 1. Continue with Google */}
        <button
          type="button"
          className="add-account-google-btn"
          onClick={handleGoogleSignIn}
          disabled={isLoading || isGoogleLoading}
        >
          {isGoogleLoading ? (
            <div className="add-account-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
        </button>

        {/* 2. Divider with "or" */}
        <div className="add-account-divider">
          <span>or</span>
        </div>

        {/* 3, 4, 5. Email, Password, Add Account Form */}
        <form className="add-account-form" onSubmit={handleSubmit} noValidate>
          <div className="add-account-input-group">
            <input
              ref={emailInputRef}
              type="email"
              className="add-account-input"
              placeholder="Email address"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={isLoading || isGoogleLoading}
              required
            />
          </div>

          <div className="add-account-input-group">
            <input
              type={showPassword ? 'text' : 'password'}
              className="add-account-input has-toggle"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={isLoading || isGoogleLoading}
              required
            />
            <button
              type="button"
              className="add-account-pw-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>

          <button
            type="submit"
            className="add-account-submit-btn"
            disabled={isLoading || isGoogleLoading}
          >
            {isLoading ? (
              <>
                <div className="add-account-spinner" />
                <span>Adding Account...</span>
              </>
            ) : (
              <span>Add Account</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
