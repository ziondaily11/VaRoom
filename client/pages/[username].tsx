import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import HostProfile from '../components/hostProfile/HostProfile';
import { profileUsernameFromPath } from '../lib/profile/usernames';
import NotFound from './404';

// A host's public profile: varoom.co.ke/<username>. The site's own pages
// (/profile, /settings ...) are separate routes and always win; usernames
// can never take their names (lib/profile/usernames.ts and the database).
// Any other single-segment address that is not a usable username is the
// not-found page. Signed-in visitors see it inside their app shell (_app,
// lib/accountRoleLayout.ts); signed-out visitors see it on its own.

export default function PublicProfilePage() {
  const router = useRouter();
  const raw = typeof router.query.username === 'string' ? router.query.username : '';
  const username = router.isReady ? profileUsernameFromPath(`/${encodeURIComponent(raw)}`) : null;
  if (router.isReady && !username) return <NotFound />;
  return (
    <>
      <Head>
        <title>Host profile | VaRoom</title>
        <meta name="description" content="View a VaRoom host profile, listings, and reviews." />
      </Head>
      <HostProfile hostKey={username ? { username } : null} />
    </>
  );
}
