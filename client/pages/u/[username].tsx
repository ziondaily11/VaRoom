import React from 'react';
import Head from 'next/head';
import PublicHostProfile from '../../components/hostProfile/PublicHostProfile';

export default function PublicHostProfilePage() {
  return (
    <>
      <Head>
        <title>Host profile | VaRoom</title>
        <meta name="description" content="View a VaRoom host profile, listings, and reviews." />
      </Head>
      <PublicHostProfile />
    </>
  );
}
