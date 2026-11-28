import Head from 'next/head';
import AdminDashboard from '../components/admin/AdminDashboard';

// The VaRoom admin dashboard (its own sign-in; no app shell). Its font loads
// here, so pages that don't need it never fetch it.
export default function AdminPage() {
  return (
    <>
      <Head>
        <title>VaRoom Admin</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      </Head>
      <AdminDashboard />
    </>
  );
}
