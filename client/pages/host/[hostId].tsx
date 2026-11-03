import React from 'react';
import Head from 'next/head';
import HostProfileView from '../../components/hostProfile/HostProfileView';

export default function HostProfilePage() {
  return (
    <>
      <Head>
        <title>Host profile | VaRoom</title>
        <meta name="description" content="View a VaRoom host profile, listings, and reviews." />
      </Head>
      <HostProfileView />
    </>
  );
}
