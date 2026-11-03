import React, { useEffect, useRef } from 'react';
import Head from 'next/head';
import * as supabaseJs from '@supabase/supabase-js';
import { ThinkingOrb } from 'thinking-orbs';
import { getSupabaseClient } from '../lib/supabase/client';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase/config';
import { GOOGLE_AUTH_CHANNEL, runAuthCallback, type PopupOpener } from '../lib/auth/authCallback';

// Where every Google sign-in, email link, password recovery and Google
// account add finishes (migrated from legacy-pages/auth-callback.html): a
// full-screen loading orb while lib/auth/authCallback.ts decides where to go.

const STYLES = `
  html, body, #__next { width:100%; height:100%; min-height:100%; margin:0; background:#090a0f !important; }
  body { min-height:100vh; overflow:hidden; }
  .auth-callback-screen {
    position:fixed; inset:0; z-index:9999; display:grid; place-items:center;
    width:100vw; height:100vh; height:100dvh; margin:0; padding:0; background:#090a0f !important;
  }
  .auth-callback-screen .orb-slot { width:64px; height:64px; display:grid; place-items:center; }
`;

export default function AuthCallbackPage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // On an account add this is the isolated temporary client (lib/supabase/client.ts).
    const client = getSupabaseClient();
    if (!client) return;
    void runAuthCallback({
      search: window.location.search,
      hash: window.location.hash,
      origin: window.location.origin,
      client,
      createPrimaryClient: () => supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { detectSessionInUrl: false } }),
      accountAuth: window.VaRoomAccountAuth || null,
      accountSwitcher: (() => {
        const link = window.VaRoomAccountSwitcher?.linkAdditionalSession;
        return link ? { linkAdditionalSession: (primary, session) => link.call(window.VaRoomAccountSwitcher, primary, session) } : null;
      })(),
      storage: (() => { try { return window.sessionStorage; } catch { return null; } })(),
      opener: (window.opener as PopupOpener | null) || null,
      broadcast: (message) => {
        if (typeof BroadcastChannel !== 'function') return false;
        const channel = new BroadcastChannel(GOOGLE_AUTH_CHANNEL);
        channel.postMessage(message);
        channel.close();
        return true;
      },
      // Sign-in ends with a full load so the app starts on the new session.
      replace: (url) => window.location.replace(url),
      close: () => window.close(),
    }).catch((error) => {
      console.error('Sign-in callback failed:', error);
      window.location.replace('/?auth=login');
    });
  }, []);

  return (
    <>
      <Head>
        <title>Signing you in — VaRoom</title>
        <meta name="theme-color" content="#090a0f" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <main className="auth-callback-screen">
        <div className="orb-slot" role="img" aria-label="Signing you in">
          <ThinkingOrb state="searching" size={20} theme="dark" aria-label="Signing you in" />
        </div>
      </main>
    </>
  );
}
