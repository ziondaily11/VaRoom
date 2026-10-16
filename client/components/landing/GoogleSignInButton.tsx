import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

interface GoogleSignInButtonProps {
  client: SupabaseClient | null;
  redirectTo: string;
  intendedRole?: 'host' | 'client';
  clearIntendedRole?: boolean;
  active: boolean;
  theme?: 'outline' | 'filled_black';
  text?: 'continue_with' | 'signin_with' | 'signup_with';
}

interface GoogleSignInMountOptions {
  client: SupabaseClient;
  redirectTo: string;
  intendedRole?: 'host' | 'client';
  clearIntendedRole?: boolean;
  theme?: 'outline' | 'filled_black';
  text?: 'continue_with' | 'signin_with' | 'signup_with';
  onLoading: (loading: boolean) => void;
  onError: (message: string) => void;
}

declare global {
  interface Window {
    VaRoomGoogleSignIn?: {
      mount: (container: HTMLElement, options: GoogleSignInMountOptions) => () => void;
    };
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  client,
  redirectTo,
  intendedRole,
  clearIntendedRole = false,
  active,
  theme = 'filled_black',
  text = 'continue_with',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active || !client || !containerRef.current) return;
    const googleSignIn = window.VaRoomGoogleSignIn;
    if (!googleSignIn) {
      setError('Google sign-in could not load. Refresh the page and try again.');
      return;
    }

    setError('');
    const unmount = googleSignIn.mount(containerRef.current, {
      client,
      redirectTo,
      intendedRole,
      clearIntendedRole,
      theme,
      text,
      onLoading: setIsLoading,
      onError: setError,
    });

    return () => {
      unmount();
    };
  }, [active, client, redirectTo, intendedRole, clearIntendedRole, theme, text]);

  const continueWithRedirect = async () => {
    if (!client || isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      const { error: authError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (authError) throw authError;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not connect to Google. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="google-signin-control">
      <div ref={containerRef} aria-label="Continue with Google" />
      <button
        type="button"
        onClick={continueWithRedirect}
        disabled={!active || isLoading}
        className="mt-2 w-full border-0 bg-transparent p-1 text-center text-xs text-[#d9d2c9]/70 underline-offset-2 hover:text-[#f4efe9] hover:underline disabled:cursor-wait"
      >
        If Google doesn&apos;t open, use the full-page sign-in
      </button>
      {isLoading && (
        <p className="mt-2 text-center text-xs text-[#d9d2c9]/80" role="status">
          Connecting to Google...
        </p>
      )}
      {error && (
        <p className="mt-2 text-center text-xs text-[#f9d3ce]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
