import React, { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

interface GoogleSignInButtonProps {
  client: SupabaseClient | null;
  redirectTo: string;
  intendedRole?: 'host' | 'client';
  clearIntendedRole?: boolean;
  active: boolean;
  text?: 'continue_with' | 'signin_with' | 'signup_with';
}

interface GoogleSignInOAuthOptions {
  client: SupabaseClient;
  redirectTo: string;
  intendedRole?: 'host' | 'client';
  clearIntendedRole?: boolean;
  onLoading: (loading: boolean) => void;
  onPopupChange: (open: boolean) => void;
  onError: (message: string) => void;
}

declare global {
  interface Window {
    VaRoomGoogleSignIn?: {
      oauth: (options: GoogleSignInOAuthOptions) => Promise<void>;
      cancel: () => void;
    };
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  client,
  redirectTo,
  intendedRole,
  clearIntendedRole = false,
  active,
  text = 'continue_with',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [error, setError] = useState('');

  const startGoogleSignIn = async () => {
    if (!client || !active || isLoading) return;
    const googleSignIn = window.VaRoomGoogleSignIn;
    if (!googleSignIn) {
      setError('Google sign-in is unavailable right now. Please refresh and try again.');
      return;
    }

    setError('');
    await googleSignIn.oauth({
      client,
      redirectTo,
      intendedRole,
      clearIntendedRole,
      onLoading: setIsLoading,
      onPopupChange: setPopupOpen,
      onError: setError,
    });
  };

  const cancelGoogleSignIn = () => {
    window.VaRoomGoogleSignIn?.cancel();
  };

  const label = text === 'signup_with'
    ? 'Sign up with Google'
    : text === 'signin_with'
      ? 'Sign in with Google'
      : 'Continue with Google';

  return (
    <div className="google-signin-control flex w-full flex-col items-center">
      <button
        type="button"
        onClick={startGoogleSignIn}
        disabled={!active || !client || isLoading}
        aria-label={label}
        aria-busy={isLoading}
        className="flex h-12 w-full max-w-[400px] items-center justify-center gap-3 rounded-md border border-[#111111] bg-[#111111] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:cursor-wait disabled:opacity-70"
      >
        {isLoading && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
        )}
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        <span>{isLoading ? 'Connecting to Google...' : label}</span>
      </button>
      {error && (
        <div className="mt-2 text-center">
          <p className="text-xs text-[#f9d3ce]" role="alert">{error}</p>
        </div>
      )}
      {popupOpen && (
        <button
          type="button"
          onClick={cancelGoogleSignIn}
          className="mt-2 text-xs text-white/70 underline underline-offset-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          Cancel Google sign-in
        </button>
      )}
    </div>
  );
};
