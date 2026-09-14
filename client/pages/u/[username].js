import Head from 'next/head';
import Script from 'next/script';
import PublicHostProfile from '../../legacy-pages/public-profile';

export default function PublicHostProfilePage() {
  return (
    <>
      <Head>
        <title>Host profile | VaRoom</title>
        <meta name="description" content="View a VaRoom host profile, listings, and reviews." />
      </Head>
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive" />
      <Script src="/js/supabase-client.js" strategy="beforeInteractive" />
      <PublicHostProfile />
    </>
  );
}
