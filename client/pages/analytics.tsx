import Head from 'next/head';
import Script from 'next/script';
import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
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

function loadSharedClient(): Promise<SupabaseClient> {
  const browserWindow = sharedClientWindow();
  if (browserWindow.supabaseClient) return Promise.resolve(browserWindow.supabaseClient);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/js/supabase-client.js';
    script.async = false;
    script.onload = () => {
      const client = browserWindow.supabaseClient;
      if (client) resolve(client);
      else reject(new Error('The shared Supabase client did not initialize.'));
    };
    script.onerror = () => reject(new Error('Unable to load the shared Supabase client.'));
    document.head.appendChild(script);
  });
}

export default function AnalyticsPage() {
  const sidebarRef = useRef<HTMLElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdkReady) return;
    let cancelled = false;
    async function authenticateHost() {
      try {
        const sharedClient = await loadSharedClient();
        const { data, error: sessionError } = await sharedClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          window.location.assign('/login');
          return;
        }
        const { data: hostProfile, error: profileError } = await sharedClient
          .from('profiles')
          .select('role,verified')
          .eq('id', data.session.user.id)
          .single();
        if (profileError) throw profileError;
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
  }, [sdkReady]);

  useEffect(() => {
    const sidebar = sharedClientWindow().VaroomSidebar;
    if (!client || !profile || !sidebarReady || !sidebarRef.current || !sidebar) return;
    sidebar.mount({
      container: sidebarRef.current,
      role: 'host',
      activeNav: 'analytics',
      profile,
      supabaseClient: client,
    });
    const itemLabels: Record<string, string> = {
      '/chats?conversation=elie': 'Elie',
      '/host-home': 'Home',
      '/marketplace': 'Marketplace',
      '/host-home?view=saved': 'Saved',
      '/bookings': 'Bookings',
      '/chats': 'Chats',
      '/notifications': 'Notifications',
      '/host-home?view=my-listings': 'My Listings',
      '/analytics': 'Analytics',
      '/profile': 'Profile',
      '/settings': 'Settings',
      '/support': 'Help & Support',
      'pricing.html': 'Upgrade',
      '/list': 'List a space',
    };
    sidebarRef.current.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
      const label = link.classList.contains('logo')
        ? 'VaRoom home'
        : itemLabels[link.getAttribute('href') || ''];
      if (!label) return;
      link.title = label;
      link.setAttribute('aria-label', label);
    });
    const logout = sidebarRef.current.querySelector<HTMLButtonElement>('.logout-btn');
    if (logout) {
      logout.title = 'Log out';
      logout.setAttribute('aria-label', 'Log out');
    }
    void sidebar.initCounts({ supabaseClient: client });
  }, [client, profile, sidebarReady]);

  return (
    <>
      <Head>
        <title>Host Analytics — VaRoom</title>
        <link rel="stylesheet" href="/js/varoom-sidebar.css" />
      </Head>
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
      />
      <Script
        src="/js/varoom-sidebar.js"
        strategy="afterInteractive"
        onReady={() => setSidebarReady(true)}
      />
      <div className={shell.appShell}>
        <aside
          id="sidebar"
          ref={sidebarRef}
          className={`sidebar sidebar-host ${shell.sidebar}`}
        />
        <button id="menu-toggle" className={shell.menuToggle} type="button" aria-label="Open navigation">
          Menu
        </button>
        <div id="sidebar-backdrop" className="sidebar-backdrop" />
        <div className={shell.content}>
          {error && <p className={shell.error} role="alert">{error}</p>}
          {!profile && !error && <p className={shell.loading}>Loading your host account…</p>}
          {profile && client && <HostAnalytics api={supabaseHostAnalyticsApi} />}
        </div>
      </div>
    </>
  );
}
