import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/account-selection.module.css';

const roleOptions = [
  {
    title: 'Register as Host',
    description: 'Here to list and showcase your spaces — Airbnbs, hotels, venues, offices, shops, or property.',
    href: '/signup-host',
  },
  {
    title: 'Register as Client',
    description: 'Here to find suitable places for events and stays.',
    href: '/signup-client',
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : '';

  function roleHref(href) {
    return redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href;
  }

  return (
    <>
      <Head>
        <title>Join VaRoom</title>
        <meta name="description" content="Choose how you are joining VaRoom." />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
      </Head>
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="join-title">
          <Link className={styles.backLink} href="/">← Back to VaRoom</Link>
          <h1 id="join-title">Join VaRoom</h1>
          <p className={styles.subtitle}>How are you using VaRoom?</p>
          <div className={styles.options}>
            {roleOptions.map((option) => (
              <Link className={styles.roleCard} href={roleHref(option.href)} key={option.href}>
                <span className={styles.roleTitle}>{option.title}</span>
                <span className={styles.roleDescription}>{option.description}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
