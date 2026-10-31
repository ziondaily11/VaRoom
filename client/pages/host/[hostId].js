import Head from 'next/head';
import HostProfileView from '../../legacy-pages/host-profile-view';

export default function HostProfilePage() {
  return (
    <>
      <Head>
        <title>Host profile | VaRoom</title>
        <meta name="description" content="View a VaRoom host profile, listings, and reviews." />
        <style>{`html, body, #__next { margin: 0; min-height: 100%; }`}</style>
      </Head>
      <HostProfileView />
    </>
  );
}
