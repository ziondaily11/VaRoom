import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import HostProfile from '../../components/hostProfile/HostProfile';
import { isUuid } from '../../lib/profile/hostProfile';
import { profileAddress, profileUsernameFromPath } from '../../lib/profile/usernames';
import NotFound from '../404';

// Older profile addresses. /host/<id> shows the same public profile as
// /<username> (and moves to that address once the host's username is known;
// a host without one stays here). /host/<username> moves to /<username> at once.

export default function HostProfileByIdPage() {
  const router = useRouter();
  const key = typeof router.query.hostId === 'string' ? router.query.hostId : '';
  const id = router.isReady && isUuid(key) ? key : null;
  const username = router.isReady && !id ? profileUsernameFromPath(`/${encodeURIComponent(key)}`) : null;

  useEffect(() => {
    if (username) void router.replace(profileAddress(username), undefined, { scroll: false });
  }, [username, router]);

  if (router.isReady && !id && !username) return <NotFound />;
  return (
    <>
      <Head>
        <title>Host profile | VaRoom</title>
        <meta name="description" content="View a VaRoom host profile, listings, and reviews." />
      </Head>
      <HostProfile hostKey={id ? { id } : null} />
    </>
  );
}
