import React from 'react';
import Head from 'next/head';
import HostSidebar from './HostSidebar';
import ClientSidebar from './ClientSidebar';
import { CLIENT_SHELL_STYLES, HOST_SHELL_STYLES, SIDEBAR_EXTRA_STYLES } from './shellStyles';
import { BRAND_FONT_HREF } from '../../lib/brandFont';

// The account's sidebar as a phone drawer on full-screen pages outside the app
// shell (Chats, Help & Support, Pricing, Property News). The wrapper keeps the
// shell's class for the sidebar styles but adds no layout (display: contents)
// and is hidden on laptops and desktops (styles/phoneMenu.css). Loaded by
// LazyPhoneDrawer only on phones, once the browser is idle.

export default function PhoneDrawer({ role }: { role: 'host' | 'client' }) {
  const styles = (role === 'host' ? HOST_SHELL_STYLES : CLIENT_SHELL_STYLES) + SIDEBAR_EXTRA_STYLES;
  return (
    <div className={`${role === 'host' ? 'host-app-layout' : 'client-app-layout'} phone-drawer`}>
      <Head>
        <link rel="stylesheet" href={BRAND_FONT_HREF} key="brand-font" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      {role === 'host' ? <HostSidebar /> : <ClientSidebar />}
    </div>
  );
}
