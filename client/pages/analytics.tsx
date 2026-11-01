import Head from 'next/head';
import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';
import { loginUrl } from '../lib/safeRedirect';
import { profileStore } from '../lib/auth/session';
import HostAnalytics from '../legacy-pages/Analytics';
import { supabaseHostAnalyticsApi } from '../legacy-pages/analyticsApi';
import shell from '../legacy-pages/AnalyticsShell.module.css';

interface HostProfile {
  role: string;
  verified: boolean;
}

interface AnalyticsWindow extends Window {
  supabaseClient?: SupabaseClient;
  VaroomSidebar?: {
    mount(options: {
      container: HTMLElement;
      role: 'host';
      activeNav: 'analytics';
      profile: HostProfile;
      supabaseClient: SupabaseClient;
    }): void;
    initCounts(options: { supabaseClient: SupabaseClient }): Promise<void>;
  };
}

function sharedClientWindow() {
  return window as AnalyticsWindow;
}

export default function AnalyticsPage() {
  const sidebarRef = useRef<HTMLElement>(null);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function authenticateHost() {
      try {
        const sharedClient = getSupabaseClient();
        if (!sharedClient) throw new Error('The shared Supabase client did not initialize.');
        const { data, error: sessionError } = await sharedClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          window.location.assign(loginUrl('/analytics'));
          return;
        }
        const { data: hostProfile, error: profileError } = await profileStore().get(data.session.user.id);
        if (profileError) throw profileError;
        if (!hostProfile) throw new Error('Unable to verify your host account.');
        if (!hostProfile || hostProfile.role !== 'host') {
          window.location.assign('/');
          return;
        }
        if (!cancelled) {
          setClient(sharedClient);
          setProfile({ role: hostProfile.role, verified: Boolean(hostProfile.verified) });
        }
      } catch (authError) {
        if (!cancelled) {
          setError(authError instanceof Error ? authError.message : 'Unable to verify your host account.');
        }
      }
    }
    void authenticateHost();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Host Analytics — VaRoom</title>
      </Head>
      <div className={shell.content} style={{ width: '100%', maxWidth: '100%', height: '100vh', overflowY: 'auto' }}>
        {error && <p className={shell.error} role="alert">{error}</p>}
        {!profile && !error && <p className={shell.loading}>Loading your host account…</p>}
        {profile && client && <HostAnalytics api={supabaseHostAnalyticsApi} />}
      </div>
    </>
  );
}
