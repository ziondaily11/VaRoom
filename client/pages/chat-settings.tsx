import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth/AuthProvider';
import { accountRole } from '../lib/types/profile';
import { backDestination } from '../lib/chat/chatSettings';
import ChatSettings, { ChatSettingsStyles } from '../components/chat/ChatSettings';

// Chat Settings on phones (migrated from legacy-pages/chat-settings.html):
// /chat-settings?returnTo=…, opened from the Chats gear. Desktop Chats shows
// the same settings in its information column.

const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);

export default function ChatSettingsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  // The account's role; before it is known (or signed out) the ?role hint, as before.
  const role = accountRole(profile) || (router.query.role === 'client' ? 'client' : 'host');

  const goBack = () => {
    const origin = window.location.origin;
    router.push(backDestination(router.query.returnTo, origin));
  };

  return (
    <>
      <Head>
        <title>Chat Settings · VaRoom</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <ChatSettingsStyles />
      <div className="cs-page">
        <header className="cs-header">
          <button type="button" className="cs-header__back" aria-label="Back" onClick={goBack}><BackIcon /></button>
          <h1 className="cs-header__title">Chat Settings</h1>
        </header>
        <main className="cs-page__body">
          <ChatSettings key={role} role={role} onOpenArchived={() => router.push('/chats')} />
        </main>
      </div>
    </>
  );
}

// Mobile navigation stays hidden here (MobileNav), as before.
(ChatSettingsPage as unknown as { appNavigation: boolean }).appNavigation = true;
