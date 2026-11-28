import Head from 'next/head';
import AdminDashboard from '../components/admin/AdminDashboard';
import { BRAND_FONT_HREF } from '../lib/brandFont';

// The VaRoom admin dashboard (its own sign-in; no app shell). Text uses the
// system font like the app shell; the "VaRoom" logo's Fraunces loads here,
// under the shell's own key, so it is requested once.
export default function AdminPage() {
  return (
    <>
      <Head>
        <title>VaRoom Admin</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" key="brand-font-preconnect" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" key="brand-font-preconnect-static" />
        <link rel="stylesheet" href={BRAND_FONT_HREF} key="brand-font" />
      </Head>
      <AdminDashboard />
    </>
  );
}
